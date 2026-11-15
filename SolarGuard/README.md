# SolarGuard — Autonomous Multi-Panel Monitoring, Weather Intelligence & Selective EDS

SolarGuard is an intelligent solar panel monitoring and selective electrostatic cleaning system combining:
1. **Multi-Panel OpenCV Detection & Tracking** (`vision/panel_detector.py` + `vision/zone_analysis.py`): Detects multiple individual solar panels in a single frame, applies perspective correction, tracks Panel IDs across frames, and divides **each detected panel** into 4 independent zones (e.g., 3 panels = 12 independent dust readings).
2. **Weather-Based Intelligent Decision Engine** (`control/weather_decision.py`): Evaluates 8 atmospheric & soiling conditions using **DHT22** (humidity + ambient temp), **Rain sensor**, **LDR** (light intensity), **DS18B20** (panel & cooling temperatures), and **INA219** (power loss).
3. **Four-Channel Travelling-Wave EDS Controller Interface** (`control/eds_controller.py`): Supports `CH1–CH4` selective zone dispatch, hardware interlock gating, safe LED-only demo mode (never falsely claiming HV electrostatic cleaning occurred), and post-cleaning camera verification (`Cleaning Efficiency %`).
4. **Continuous Autonomous Monitoring Worker** (`control/monitoring_loop.py`): Single-instance camera/serial ownership with multi-frame dust persistence, hysteresis, cooldown periods, session attempt limits, pause/resume/stop, and fault recovery.
5. **Append-Only Per-Panel CSV Logging & Energy Analysis** (`analysis/performance_analysis.py` + `analysis/energy_balance.py`).

---

## Additional Hardware Dependencies (Weather & Interlock Expansion)

| Component | ESP32 Pin | Purpose |
| :--- | :--- | :--- |
| **DHT22** | `GPIO 15` (10kΩ pull-up) | Relative humidity (%) & ambient temperature (°C) |
| **Rain Sensor** | `GPIO 34` (ADC) | Surface rain / wetness detection (suspends EDS) |
| **LDR + 10kΩ Divider** | `GPIO 35` (ADC) | Light intensity / irradiance proxy |
| **DS18B20 ×2** | `GPIO 4` & `GPIO 5` | Solar panel surface & cooling assembly temperatures |
| **INA219** | `GPIO 21` (SDA), `GPIO 22` (SCL) | Bus voltage, load current, instantaneous power |
| **Zone Indicator LEDs ×4** | `GPIO 13, 12, 14, 27` | Safe low-voltage demonstration indicators |
| **Isolated EDS Interlock / Fault** | `GPIO 32` / `GPIO 33` | External opto-isolated HV driver status inputs |

> **High-Voltage Safety Note**: The ESP32 never directly switches or generates kilovolt EDS outputs. Actual electrostatic dust removal requires an external, opto-isolated, hardware-interlocked 4-phase EDS driver.

---

## Running & Testing on Windows

```bash
cd SolarGuard
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m unittest discover -s tests -v
python main.py
```
