"""PySerial communication handler for SolarGuard ESP32 weather, power, and EDS interface."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Tuple

try:
    import serial
    import serial.tools.list_ports

    PYSERIAL_AVAILABLE = True
except ImportError:  # pragma: no cover
    serial = None  # type: ignore
    PYSERIAL_AVAILABLE = False


@dataclass
class SensorPacket:
    """Validated electrical, thermal, and weather packet emitted by the ESP32."""

    timestamp: str
    voltage_v: float
    current_a: float
    power_w: float
    panel_temp_c: float
    cooling_temp_c: float
    panel_sensor_valid: bool = True
    cooling_sensor_valid: bool = True
    humidity_pct: Optional[float] = None
    ambient_temp_c: Optional[float] = None
    rain_detected: Optional[bool] = None
    ldr_pct: Optional[float] = None
    dht22_valid: bool = False
    rain_sensor_valid: bool = False
    ldr_valid: bool = False
    raw_line: str = ""


def parse_sensor_line(line: str, timestamp: Optional[str] = None) -> Tuple[Optional[SensorPacket], Optional[str]]:
    """
    Parse and validate an incoming CSV-style ESP32 serial message.

    Supports both legacy 6-field packets and upgraded 11-field weather packets:
      Legacy  : DATA,<V>,<I>,<P>,<T_panel>,<T_cool>
      Upgraded: DATA,<V>,<I>,<P>,<T_panel>,<T_cool>,<Hum%>,<T_amb>,<Rain01>,<LDR%>,<Mask>
    """
    if not line or not isinstance(line, str):
        return None, "Empty or non-string serial line."

    cleaned = line.strip()
    if not cleaned.startswith("DATA,"):
        return None, f"Non-telemetry frame ignored: {cleaned}"

    parts = cleaned.split(",")
    if len(parts) not in (6, 11):
        return None, f"Malformed DATA packet (expected 6 or 11 fields, got {len(parts)}): {cleaned}"

    try:
        voltage_v = float(parts[1])
        current_a = float(parts[2])
        power_w = float(parts[3])
        panel_temp_c = float(parts[4])
        cooling_temp_c = float(parts[5])
    except ValueError as exc:
        return None, f"Non-numeric sensor field in packet '{cleaned}': {exc}"

    if not (0.0 <= voltage_v <= 36.0):
        return None, f"Voltage out of valid sensor bounds (0-36 V): {voltage_v}"
    if not (0.0 <= current_a <= 10.0):
        return None, f"Current out of valid sensor bounds (0-10 A): {current_a}"
    if power_w < 0.0:
        return None, f"Negative power reading rejected: {power_w}"

    panel_valid = -20.0 <= panel_temp_c <= 120.0
    cooling_valid = -20.0 <= cooling_temp_c <= 120.0

    humidity_pct: Optional[float] = None
    ambient_temp_c: Optional[float] = None
    rain_detected: Optional[bool] = None
    ldr_pct: Optional[float] = None
    dht22_valid = False
    rain_valid = False
    ldr_valid = False

    if len(parts) == 11:
        try:
            raw_hum = float(parts[6])
            raw_amb = float(parts[7])
            raw_rain = int(float(parts[8]))
            raw_ldr = float(parts[9])
            sensor_mask = int(float(parts[10]))

            if (sensor_mask & 8) != 0 and 0.0 <= raw_hum <= 100.0 and -40.0 <= raw_amb <= 85.0:
                humidity_pct = round(raw_hum, 1)
                ambient_temp_c = round(raw_amb, 2)
                dht22_valid = True

            if raw_rain in (0, 1):
                rain_detected = raw_rain == 1
                rain_valid = True

            if 0.0 <= raw_ldr <= 100.0:
                ldr_pct = round(raw_ldr, 1)
                ldr_valid = True
        except ValueError as exc:
            return None, f"Malformed weather field in packet '{cleaned}': {exc}"

    packet = SensorPacket(
        timestamp=timestamp or datetime.now().isoformat(timespec="seconds"),
        voltage_v=round(voltage_v, 3),
        current_a=round(current_a, 3),
        power_w=round(power_w, 4),
        panel_temp_c=round(panel_temp_c, 2),
        cooling_temp_c=round(cooling_temp_c, 2),
        panel_sensor_valid=panel_valid,
        cooling_sensor_valid=cooling_valid,
        humidity_pct=humidity_pct,
        ambient_temp_c=ambient_temp_c,
        rain_detected=rain_detected,
        ldr_pct=ldr_pct,
        dht22_valid=dht22_valid,
        rain_sensor_valid=rain_valid,
        ldr_valid=ldr_valid,
        raw_line=cleaned,
    )
    return packet, None


class SerialHandler:
    """Manages Windows/Linux COM port discovery, recovery, telemetry, and LED/EDS commands."""

    def __init__(self, baudrate: int = 115200, timeout: float = 1.0) -> None:
        self.baudrate = baudrate
        self.timeout = timeout
        self._conn = None
        self.port: Optional[str] = None
        self.last_port: Optional[str] = None
        self.last_error: Optional[str] = None
        self.last_ack: Optional[str] = None

    @staticmethod
    def list_available_ports() -> List[str]:
        if not PYSERIAL_AVAILABLE:
            return []
        try:
            return [p.device for p in serial.tools.list_ports.comports()]
        except Exception:
            return []

    @property
    def is_connected(self) -> bool:
        return self._conn is not None and getattr(self._conn, "is_open", False)

    def connect(self, port: str) -> Tuple[bool, str]:
        if not PYSERIAL_AVAILABLE:
            self.last_error = "PySerial is not installed. Run: pip install pyserial"
            return False, self.last_error

        if not port:
            self.last_error = "No COM port selected."
            return False, self.last_error

        self.disconnect()
        try:
            self._conn = serial.Serial(port=port, baudrate=self.baudrate, timeout=self.timeout)
            self.port = port
            self.last_port = port
            self.last_error = None
            return True, f"Connected to ESP32 on {port} @ {self.baudrate} baud."
        except Exception as exc:
            self._conn = None
            self.port = None
            self.last_error = f"Failed to open {port}: {exc}"
            return False, self.last_error

    def attempt_reconnect(self) -> Tuple[bool, str]:
        """Attempt automatic serial recovery using the last active port."""
        if self.is_connected:
            return True, f"Already connected on {self.port}."
        if not self.last_port:
            return False, "No previous COM port recorded for recovery."
        available = self.list_available_ports()
        if self.last_port not in available:
            return False, f"Port {self.last_port} not currently present."
        return self.connect(self.last_port)

    def disconnect(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
            finally:
                self._conn = None
                self.port = None

    def read_sensor_packet(self) -> Tuple[Optional[SensorPacket], Optional[str]]:
        if not self.is_connected:
            return None, "ESP32 not connected."

        try:
            waiting = getattr(self._conn, "in_waiting", 0)
            if waiting == 0:
                raw_bytes = self._conn.readline()
                if not raw_bytes:
                    return None, None
                line = raw_bytes.decode("utf-8", errors="replace").strip()
                if line.startswith(("ACK:", "STATUS:", "ERR:", "WARN:", "INIT:", "EDS_STATUS:")):
                    self.last_ack = line
                    return None, line if line.startswith("ERR:") else None
                return parse_sensor_line(line)

            latest_packet: Optional[SensorPacket] = None
            latest_err: Optional[str] = None
            while self._conn.in_waiting > 0:
                raw_bytes = self._conn.readline()
                line = raw_bytes.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                if line.startswith(("ACK:", "STATUS:", "ERR:", "WARN:", "INIT:", "EDS_STATUS:")):
                    self.last_ack = line
                    if line.startswith("ERR:"):
                        latest_err = line
                    continue
                pkt, err = parse_sensor_line(line)
                if pkt is not None:
                    latest_packet = pkt
                    latest_err = None
                elif err is not None:
                    latest_err = err
            return latest_packet, latest_err
        except Exception as exc:
            self.last_error = f"Serial read error (ESP32 disconnected?): {exc}"
            self.disconnect()
            return None, self.last_error

    def send_command(self, command: str) -> Tuple[bool, str]:
        if not self.is_connected:
            return False, "Cannot send command: ESP32 is disconnected."

        cleaned = command.strip()
        if not cleaned:
            return False, "Cannot send an empty command."

        try:
            payload = (cleaned + "\n").encode("utf-8")
            self._conn.write(payload)
            self._conn.flush()
            return True, f"Sent command '{cleaned}' to {self.port}."
        except Exception as exc:
            self.last_error = f"Serial write error: {exc}"
            self.disconnect()
            return False, self.last_error

    def send_zone_command(self, zone_command: str) -> Tuple[bool, str]:
        cleaned = zone_command.strip().upper()
        if not cleaned.startswith("ZONE:") or len(cleaned) != 9:
            return False, f"Invalid zone command format '{zone_command}'. Expected ZONE:XXXX."
        mask = cleaned[5:]
        if any(ch not in ("0", "1") for ch in mask):
            return False, f"Invalid zone mask '{mask}'. Expected 4 binary digits."
        return self.send_command(cleaned)

    def send_eds_request(self, panel_id: int, zone_mask: str) -> Tuple[bool, str]:
        if len(zone_mask) != 4 or any(c not in ("0", "1") for c in zone_mask):
            return False, f"Invalid zone mask '{zone_mask}'."
        return self.send_command(f"EDS_REQ:P{panel_id}:{zone_mask}")

    def send_emergency_stop(self) -> Tuple[bool, str]:
        return self.send_command("ESTOP")

    def send_reset(self) -> Tuple[bool, str]:
        return self.send_command("RESET")
