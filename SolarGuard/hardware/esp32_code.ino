/*
 * SolarGuard — Upgraded ESP32 Firmware
 * Multi-Sensor Weather Telemetry + Selective Zone LED Demo + Isolated EDS Interface
 * ---------------------------------------------------------------------------------
 * Hardware Connections:
 *   - INA219 I2C Current/Voltage Sensor : SDA = GPIO 21, SCL = GPIO 22 (addr 0x40)
 *   - DS18B20 #1 Panel Surface Probe    : GPIO 4  (4.7k pull-up to 3.3V)
 *   - DS18B20 #2 Cooling Assembly Probe : GPIO 5  (4.7k pull-up to 3.3V)
 *   - DHT22 Humidity & Ambient Temp     : GPIO 15 (10k pull-up to 3.3V)
 *   - Rain Sensor Digital / Analog Out  : GPIO 34 (input-only ADC; active-low or threshold)
 *   - LDR Photoresistor Divider         : GPIO 35 (input-only ADC 0..4095)
 *   - 4x Zone Indicator LEDs            : GPIO 13, 12, 14, 27 (220 Ohm resistors)
 *   - Isolated EDS Driver Interlock In  : GPIO 32 (INPUT_PULLUP; LOW = external driver ready)
 *   - Isolated EDS Fault Feedback In    : GPIO 33 (INPUT_PULLUP; LOW = external fault)
 *
 * CRITICAL SAFETY BOUNDARY:
 *   The ESP32 MUST NOT directly generate or switch kilovolt-level HV EDS waveforms.
 *   High-voltage electrode excitation requires an external, opto-isolated, hardware-
 *   interlocked EDS power stage. Without an approved driver asserting READY on GPIO 32,
 *   the ESP32 refuses HV EDS dispatch and runs in safe LED-only demonstration or
 *   simulation reporting mode.
 *
 * Outgoing Telemetry Format (every 1000 ms @ 115200 baud):
 *   DATA,<voltage_v>,<current_a>,<power_w>,<panel_temp_c>,<cooling_temp_c>,
 *        <humidity_pct>,<ambient_temp_c>,<rain_detected>,<ldr_pct>,<sensor_mask>
 *
 * Incoming Serial Commands:
 *   ZONE:XXXX         -> Drive 4 low-voltage indicator LEDs only (demonstration)
 *   EDS_REQ:P<n>:XXXX -> Request isolated EDS cycle if hardware interlocks permit
 *   EDS_STATUS        -> Report EDS interlock & fault pin state
 *   ESTOP             -> Force all outputs OFF and lock controller in safe state
 *   RESET             -> Clear ESTOP lock
 *   PING              -> Health check
 */

#include <Wire.h>
#include <Adafruit_INA219.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <DHT.h>

// --- Pin Definitions ---
#define PIN_I2C_SDA           21
#define PIN_I2C_SCL           22
#define PIN_TEMP_PANEL        4
#define PIN_TEMP_COOLING      5
#define PIN_DHT22             15
#define PIN_RAIN_ANALOG       34
#define PIN_LDR_ANALOG        35
#define PIN_EDS_INTERLOCK_OK  32
#define PIN_EDS_FAULT_IN      33

#define DHTTYPE DHT22
const int ZONE_LED_PINS[4] = {13, 12, 14, 27};

// --- Timing & Validation Constants ---
const unsigned long TELEMETRY_INTERVAL_MS = 1000;
const float MIN_VALID_TEMP_C = -20.0f;
const float MAX_VALID_TEMP_C = 120.0f;
const float MIN_VALID_VOLT_V = 0.0f;
const float MAX_VALID_VOLT_V = 32.0f;
const int RAIN_ADC_WET_THRESHOLD = 2200; // Lower ADC value on common resistive rain boards = wet

// --- Sensor Objects ---
Adafruit_INA219 ina219;
OneWire oneWirePanel(PIN_TEMP_PANEL);
OneWire oneWireCooling(PIN_TEMP_COOLING);
DallasTemperature sensorPanel(&oneWirePanel);
DallasTemperature sensorCooling(&oneWireCooling);
DHT dht(PIN_DHT22, DHTTYPE);

// --- Runtime State ---
bool ina219Ready = false;
bool panelTempReady = false;
bool coolingTempReady = false;
bool dhtReady = false;
bool emergencyStopActive = false;
bool zoneStates[4] = {false, false, false, false};

unsigned long lastTelemetryMs = 0;
String serialInputBuffer = "";

bool isEdsHardwareInterlockReady() {
  // Requires an external isolated driver pulling GPIO 32 LOW with no fault on GPIO 33
  bool interlockClosed = (digitalRead(PIN_EDS_INTERLOCK_OK) == LOW);
  bool faultClear = (digitalRead(PIN_EDS_FAULT_IN) == HIGH);
  return interlockClosed && faultClear && !emergencyStopActive;
}

void applyLedStates() {
  for (int i = 0; i < 4; i++) {
    if (emergencyStopActive) {
      zoneStates[i] = false;
      digitalWrite(ZONE_LED_PINS[i], LOW);
    } else {
      digitalWrite(ZONE_LED_PINS[i], zoneStates[i] ? HIGH : LOW);
    }
  }
}

void triggerEmergencyStop(const char* reason) {
  emergencyStopActive = true;
  applyLedStates();
  Serial.print("ERR:ESTOP_ENGAGED,");
  Serial.println(reason);
}

void handleSerialCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;

  if (cmd.equalsIgnoreCase("ESTOP")) {
    triggerEmergencyStop("HOST_REQUEST");
    return;
  }

  if (cmd.equalsIgnoreCase("RESET")) {
    emergencyStopActive = false;
    for (int i = 0; i < 4; i++) zoneStates[i] = false;
    applyLedStates();
    Serial.println("ACK:RESET_OK");
    return;
  }

  if (cmd.equalsIgnoreCase("PING")) {
    Serial.println(emergencyStopActive ? "STATUS:ESTOP" : "STATUS:OK");
    return;
  }

  if (cmd.equalsIgnoreCase("EDS_STATUS")) {
    if (emergencyStopActive) {
      Serial.println("EDS_STATUS:SAFETY_DISABLED_ESTOP");
    } else if (digitalRead(PIN_EDS_FAULT_IN) == LOW) {
      Serial.println("EDS_STATUS:FAULT_DETECTED");
    } else if (isEdsHardwareInterlockReady()) {
      Serial.println("EDS_STATUS:DRIVER_READY");
    } else {
      Serial.println("EDS_STATUS:NO_ISOLATED_DRIVER_LED_ONLY");
    }
    return;
  }

  if (cmd.startsWith("EDS_REQ:")) {
    if (emergencyStopActive) {
      Serial.println("ERR:EDS_REJECTED_ESTOP");
      return;
    }
    if (!isEdsHardwareInterlockReady()) {
      // Do NOT falsely report electrostatic cleaning occurred without isolated driver interlock
      Serial.println("WARN:EDS_INTERLOCK_OPEN_LED_DEMO_ONLY");
      return;
    }
    // Note: External isolated controller handles HV 4-phase switching; ESP32 logs request only
    Serial.print("ACK:EDS_REQUEST_ACCEPTED,");
    Serial.println(cmd);
    return;
  }

  if (cmd.startsWith("ZONE:")) {
    if (emergencyStopActive) {
      Serial.println("ERR:REJECTED_IN_ESTOP");
      return;
    }
    String mask = cmd.substring(5);
    mask.trim();
    if (mask.length() != 4) {
      Serial.println("ERR:INVALID_ZONE_LENGTH");
      return;
    }
    for (int i = 0; i < 4; i++) {
      char c = mask.charAt(i);
      if (c != '0' && c != '1') {
        Serial.println("ERR:INVALID_ZONE_CHAR");
        return;
      }
      zoneStates[i] = (c == '1');
    }
    applyLedStates();
    Serial.print("ACK:ZONE:");
    Serial.println(mask);
    return;
  }

  Serial.print("ERR:UNKNOWN_CMD,");
  Serial.println(cmd);
}

void readSerialCommands() {
  while (Serial.available() > 0) {
    char incoming = (char)Serial.read();
    if (incoming == '\n' || incoming == '\r') {
      if (serialInputBuffer.length() > 0) {
        handleSerialCommand(serialInputBuffer);
        serialInputBuffer = "";
      }
    } else if (serialInputBuffer.length() < 96) {
      serialInputBuffer += incoming;
    } else {
      serialInputBuffer = "";
      Serial.println("ERR:CMD_BUFFER_OVERFLOW");
    }
  }
}

void publishTelemetry() {
  float voltageV = 0.0f;
  float currentA = 0.0f;
  float powerW = 0.0f;
  float panelTempC = -99.9f;
  float coolingTempC = -99.9f;
  float humidityPct = -1.0f;
  float ambientTempC = -99.9f;
  int rainDetected = -1; // -1 = sensor unavailable/unverified, 0 = dry, 1 = wet
  float ldrPct = -1.0f;

  if (ina219Ready) {
    float busV = ina219.getBusVoltage_V();
    float shuntMv = ina219.getShuntVoltage_mV();
    float loadV = busV + (shuntMv / 1000.0f);
    float currentMa = ina219.getCurrent_mA();
    if (!isnan(loadV) && loadV >= MIN_VALID_VOLT_V && loadV <= MAX_VALID_VOLT_V) voltageV = loadV;
    if (!isnan(currentMa)) currentA = max(0.0f, currentMa / 1000.0f);
    powerW = voltageV * currentA;
  }

  sensorPanel.requestTemperatures();
  sensorCooling.requestTemperatures();
  float rawPanelC = sensorPanel.getTempCByIndex(0);
  float rawCoolingC = sensorCooling.getTempCByIndex(0);

  if (rawPanelC != DEVICE_DISCONNECTED_C && rawPanelC >= MIN_VALID_TEMP_C && rawPanelC <= MAX_VALID_TEMP_C) {
    panelTempC = rawPanelC;
    panelTempReady = true;
  } else {
    panelTempReady = false;
  }

  if (rawCoolingC != DEVICE_DISCONNECTED_C && rawCoolingC >= MIN_VALID_TEMP_C && rawCoolingC <= MAX_VALID_TEMP_C) {
    coolingTempC = rawCoolingC;
    coolingTempReady = true;
  } else {
    coolingTempReady = false;
  }

  float rawHum = dht.readHumidity();
  float rawAmb = dht.readTemperature();
  if (!isnan(rawHum) && !isnan(rawAmb) && rawHum >= 0.0f && rawHum <= 100.0f) {
    humidityPct = rawHum;
    ambientTempC = rawAmb;
    dhtReady = true;
  } else {
    dhtReady = false;
  }

  int rainAdc = analogRead(PIN_RAIN_ANALOG);
  // Open floating ADC check can be refined with pull-up; report 1 if below wet threshold
  rainDetected = (rainAdc < RAIN_ADC_WET_THRESHOLD) ? 1 : 0;

  int ldrAdc = analogRead(PIN_LDR_ANALOG);
  ldrPct = constrain((ldrAdc / 4095.0f) * 100.0f, 0.0f, 100.0f);

  // Bitmask of validated sensors: bit0=INA219, bit1=PanelTemp, bit2=CoolTemp, bit3=DHT22
  int sensorMask = (ina219Ready ? 1 : 0)
                 | (panelTempReady ? 2 : 0)
                 | (coolingTempReady ? 4 : 0)
                 | (dhtReady ? 8 : 0);

  Serial.print("DATA,");
  Serial.print(voltageV, 2); Serial.print(",");
  Serial.print(currentA, 3); Serial.print(",");
  Serial.print(powerW, 3); Serial.print(",");
  Serial.print(panelTempC, 2); Serial.print(",");
  Serial.print(coolingTempC, 2); Serial.print(",");
  Serial.print(humidityPct, 1); Serial.print(",");
  Serial.print(ambientTempC, 2); Serial.print(",");
  Serial.print(rainDetected); Serial.print(",");
  Serial.print(ldrPct, 1); Serial.print(",");
  Serial.println(sensorMask);
}

void setup() {
  Serial.begin(115200);
  delay(200);

  for (int i = 0; i < 4; i++) {
    pinMode(ZONE_LED_PINS[i], OUTPUT);
    digitalWrite(ZONE_LED_PINS[i], LOW);
  }
  pinMode(PIN_EDS_INTERLOCK_OK, INPUT_PULLUP);
  pinMode(PIN_EDS_FAULT_IN, INPUT_PULLUP);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  ina219Ready = ina219.begin();
  if (ina219Ready) ina219.setCalibration_32V_2A();

  sensorPanel.begin();
  sensorCooling.begin();
  dht.begin();

  Serial.println("INIT:SOLARGUARD_WEATHER_READY");
}

void loop() {
  readSerialCommands();
  unsigned long now = millis();
  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    publishTelemetry();
  }
}
