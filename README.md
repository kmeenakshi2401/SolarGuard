# SolarGuard - An Integrated Self-Cleaning and Self-Cooling Solar Panel System
###
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-F47B3A)](https://opensource.org/licenses/MIT)

**SolarGuard — Autonomous Multi-Panel Monitoring, Weather Intelligence & Selective Electrostatic Dust Removal**

SolarGuard is an intelligent solar panel monitoring and maintenance system that integrates computer vision, environmental sensing, autonomous decision-making, selective electrostatic cleaning, and thermal management.

The system is designed to monitor multiple solar panels, detect dust accumulation, evaluate weather conditions, identify cleaning requirements, and support intelligent panel maintenance.

---

## Key Features

### 1. Multi-Panel OpenCV Detection & Tracking

**Files:** `vision/panel_detector.py` · `vision/zone_analysis.py`

- Detects multiple individual solar panels within a single camera frame.
- Applies perspective correction for accurate panel analysis.
- Tracks individual Panel IDs across consecutive frames.
- Divides each detected panel into **4 independent zones**.
- Provides independent dust-level readings for every zone.

**Example:** 3 detected panels = 12 independent dust readings.

### 2. Weather-Based Intelligent Decision Engine

**File:** `control/weather_decision.py`

Evaluates 8 atmospheric and soiling conditions using the following sensors:

- **DHT22:** Relative humidity and ambient temperature.
- **Rain Sensor:** Surface rain and wetness detection.
- **LDR:** Light intensity monitoring.
- **DS18B20:** Solar panel and cooling assembly temperatures.
- **INA219:** Electrical measurements and power-loss monitoring.

The decision engine evaluates environmental conditions before authorizing a cleaning operation.

### 3. Four-Channel Travelling-Wave EDS Controller Interface

**File:** `control/eds_controller.py`

- Supports selective zone dispatch through four independent channels (`CH1–CH4`).
- Implements hardware interlock gating.
- Provides a safe LED-only demonstration mode.
- Prevents false reporting of high-voltage electrostatic cleaning.
- Supports post-cleaning camera verification.
- Calculates cleaning efficiency (%).

### 4. Continuous Autonomous Monitoring Worker

**File:** `control/monitoring_loop.py`

Provides continuous autonomous monitoring with:

- Single-instance camera and serial-port ownership.
- Multi-frame dust persistence detection.
- Hysteresis-based decision control.
- Configurable cooldown periods.
- Cleaning session attempt limits.
- Pause, resume, and stop functionality.
- Fault detection and recovery mechanisms.

### 5. Append-Only Per-Panel CSV Logging & Energy Analysis

**Files:** `analysis/performance_analysis.py` · `analysis/energy_balance.py`

- Append-only CSV logging for individual solar panels.
- Per-panel performance tracking.
- Cleaning efficiency analysis.
- Energy consumption monitoring.
- Energy balance and performance evaluation.

---

## Additional Hardware Dependencies
### Weather & Interlock Expansion

The following hardware components support environmental monitoring, weather intelligence, and safety interlock functionality.

### Hardware Pin Configuration

| Component | ESP32 Pin / Interface | Purpose |
|:---|:---|:---|
| **DHT22** | `GPIO 15` (10kΩ pull-up) | Relative humidity (%) and ambient temperature (°C) |
| **Rain Sensor** | `GPIO 34` (ADC) | Surface rain / wetness detection (suspends EDS) |
| **LDR + 10kΩ Divider** | `GPIO 35` (ADC) | Light intensity / irradiance proxy |
| **DS18B20 ×2** | `GPIO 4` and `GPIO 5` | Solar panel surface and cooling assembly temperatures |
| **INA219** | `GPIO 21` (SDA), `GPIO 22` (SCL) | Bus voltage, load current, and instantaneous power |
| **Zone Indicator LEDs ×4** | `GPIO 13, 12, 14, 27` | Safe low-voltage demonstration indicators |
| **Isolated EDS Interlock / Fault** | `GPIO 32` / `GPIO 33` | External opto-isolated HV driver status inputs |

---

## High-Voltage Safety Notice

> **Important Safety Information**
>
> The ESP32 never directly switches or generates kilovolt EDS outputs.
>
> Actual electrostatic dust removal requires an external, opto-isolated, hardware-interlocked, four-phase EDS driver.
>
> The LED-only demonstration mode is strictly a low-voltage simulation of zone activation. It does not perform actual electrostatic cleaning.

---

## Running & Testing on Windows

Follow the steps below to configure and run SolarGuard on a Windows system.

```bash
cd SolarGuard
```
```bash
python -m venv venv
```
```bash
venv\Scripts\activate
```
```bash
pip install -r requirements.txt
```
```bash
python -m unittest discover -s tests -v
```
```bash
python main.py
```

---

## Project Objective

SolarGuard aims to develop an integrated intelligent solar panel monitoring, self-cleaning, and self-cooling system.

By combining computer vision, weather intelligence, multi-zone dust detection, selective electrostatic cleaning, and thermal monitoring, the system aims to:

- Detect dust accumulation across multiple solar panels.
- Monitor environmental conditions before initiating cleaning.
- Identify specific zones that require cleaning.
- Support selective four-channel EDS operation.
- Verify cleaning performance through camera feedback.
- Monitor electrical energy consumption and system performance.
- Support intelligent solar panel maintenance and cooling.

---

## Project Summary

| Feature | Technology / Module |
|:---|:---|
| Multi-Panel Detection | OpenCV |
| Panel Zone Analysis | Computer Vision |
| Weather Monitoring | DHT22, Rain Sensor, LDR |
| Temperature Monitoring | DS18B20 |
| Power Monitoring | INA219 |
| Selective Cleaning | Four-Channel EDS Interface |
| Autonomous Operation | Python Monitoring Worker |
| Performance Logging | CSV |
| Energy Analysis | Python |

---

### SolarGuard

**Intelligent Solar Monitoring • Weather-Aware Decision Making • Selective Electrostatic Cleaning • Integrated Cooling**
