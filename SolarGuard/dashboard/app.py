"""SolarGuard Streamlit Dashboard — Combined Live Camera & Dust Calibration, Text Reports, and Efficiency Forecasts."""

from __future__ import annotations

import math
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from analysis.energy_balance import calculate_net_energy_benefit
from analysis.performance_analysis import CSVDataLogger
from analysis.power_calculation import (
    calculate_accumulated_energy_wh,
    calculate_instantaneous_power,
    calculate_panel_efficiency_pct,
    evaluate_power_efficiency_and_runtime,
)
from analysis.thermal_analysis import calculate_temperature_reduction, summarize_cooling_configurations
from control.eds_controller import EDSController, EDSDriverMode
from control.monitoring_loop import ContinuousMonitorService, MonitorConfig, MonitorState
from control.weather_decision import WeatherDecisionConfig, WeatherInputs, evaluate_panel_weather_decision
from control.zone_control import ZoneController
from hardware.serial_handler import SerialHandler
from vision.camera import CameraManager
from vision.dust_detection import DustDetectionConfig
from vision.panel_detector import ContourPanelDetector, PanelTracker
from vision.zone_analysis import analyze_multi_panel_frame

try:
    import cv2
    import numpy as np

    CV2_READY = True
except ImportError:
    cv2 = None  # type: ignore
    np = None  # type: ignore
    CV2_READY = False


st.set_page_config(
    page_title="SOLARGUARD — Autonomous Multi-Panel Monitoring & Selective EDS",
    page_icon="☀️",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
    <style>
        .stApp { background-color: #070B14; color: #E2E8F0; }
        section[data-testid="stSidebar"] { background-color: #0B1221; border-right: 1px solid #1B2942; }
        div[data-testid="metric-container"] {
            background-color: #0E1628;
            border: 1px solid #1B2942;
            border-radius: 10px;
            padding: 14px 16px;
        }
    </style>
    """,
    unsafe_allow_html=True,
)


def init_session_state() -> None:
    if "mode" not in st.session_state:
        st.session_state.mode = "SIMULATION"
    if "serial_handler" not in st.session_state:
        st.session_state.serial_handler = SerialHandler()
    if "zone_controller" not in st.session_state:
        st.session_state.zone_controller = ZoneController(threshold_pct=25.0)
    if "eds_controller" not in st.session_state:
        st.session_state.eds_controller = EDSController(driver_mode=EDSDriverMode.SIMULATION)
    if "weather_config" not in st.session_state:
        st.session_state.weather_config = WeatherDecisionConfig()
    if "monitor_config" not in st.session_state:
        st.session_state.monitor_config = MonitorConfig()
    if "monitor_service" not in st.session_state:
        st.session_state.monitor_service = ContinuousMonitorService(
            st.session_state.eds_controller,
            st.session_state.weather_config,
            st.session_state.monitor_config,
        )
    if "panel_detector" not in st.session_state:
        st.session_state.panel_detector = ContourPanelDetector()
    if "panel_tracker" not in st.session_state:
        st.session_state.panel_tracker = PanelTracker()
    if "logger" not in st.session_state:
        st.session_state.logger = CSVDataLogger(str(PROJECT_ROOT / "data"))
    if "camera_mgr" not in st.session_state:
        st.session_state.camera_mgr = CameraManager(reference_path=str(PROJECT_ROOT / "data" / "clean_reference.jpg"))
    if "zone_dust" not in st.session_state:
        st.session_state.zone_dust = [5.0, 32.0, 8.0, 45.0]
    if "multi_panel_dust" not in st.session_state:
        st.session_state.multi_panel_dust = {
            1: [5.0, 32.0, 8.0, 45.0],
            2: [10.0, 12.0, 38.0, 6.0],
            3: [4.0, 7.0, 9.0, 11.0],
        }
    if "sim_weather" not in st.session_state:
        st.session_state.sim_weather = {
            "humidity_pct": 54.0,
            "ambient_temp_c": 32.4,
            "rain_detected": False,
            "ldr_pct": 82.0,
        }
    if "clean_threshold" not in st.session_state:
        st.session_state.clean_threshold = 10.0
    if "moderate_threshold" not in st.session_state:
        st.session_state.moderate_threshold = 25.0
    if "analysis_mode" not in st.session_state:
        st.session_state.analysis_mode = "AUTO"
    if "sim_step" not in st.session_state:
        st.session_state.sim_step = 0
    if "telemetry_history" not in st.session_state:
        st.session_state.telemetry_history = [
            {
                "timestamp": "2026-11-14T09:30:00",
                "voltage_v": 5.82,
                "current_a": 0.64,
                "power_w": 3.7248,
                "panel_temp_c": 46.2,
                "cooling_temp_c": 39.4,
                "reference_temp_c": 51.4,
                "humidity_pct": 55.0,
                "ambient_temp_c": 32.0,
                "rain_detected": False,
                "ldr_pct": 80.0,
                "dht22_valid": True,
                "rain_valid": True,
                "ldr_valid": True,
                "source": "SIMULATION",
            },
            {
                "timestamp": "2026-11-14T09:35:00",
                "voltage_v": 6.18,
                "current_a": 0.72,
                "power_w": 4.4496,
                "panel_temp_c": 44.8,
                "cooling_temp_c": 38.5,
                "reference_temp_c": 51.4,
                "humidity_pct": 54.0,
                "ambient_temp_c": 32.2,
                "rain_detected": False,
                "ldr_pct": 82.0,
                "dht22_valid": True,
                "rain_valid": True,
                "ldr_valid": True,
                "source": "SIMULATION",
            },
        ]
    if "last_multipanel_rgb" not in st.session_state:
        st.session_state.last_multipanel_rgb = None
    if "latest_energy_report" not in st.session_state:
        st.session_state.latest_energy_report = calculate_net_energy_benefit(
            reference_energy_wh=3.6200,
            improved_energy_wh=4.4805,
            eds_cleaning_energy_wh=0.0820,
            controller_energy_wh=0.1450,
            data_source="SIMULATION",
            observation_period_min=60.0,
            irradiance_wm2=820.0,
        )


def build_current_weather_inputs(latest: dict) -> WeatherInputs:
    if st.session_state.mode == "SIMULATION":
        w = st.session_state.sim_weather
        return WeatherInputs(
            humidity_pct=float(w["humidity_pct"]),
            rain_detected=bool(w["rain_detected"]),
            ambient_temp_c=float(w["ambient_temp_c"]),
            panel_temp_c=float(latest["panel_temp_c"]),
            cooling_temp_c=float(latest["cooling_temp_c"]),
            ldr_pct=float(w["ldr_pct"]),
            power_w=float(latest["power_w"]),
            reference_power_w=4.6,
            dht22_connected=True,
            rain_sensor_connected=True,
            ldr_connected=True,
            is_simulated=True,
        )
    return WeatherInputs(
        humidity_pct=latest.get("humidity_pct"),
        rain_detected=latest.get("rain_detected"),
        ambient_temp_c=latest.get("ambient_temp_c"),
        panel_temp_c=float(latest["panel_temp_c"]),
        cooling_temp_c=float(latest["cooling_temp_c"]),
        ldr_pct=latest.get("ldr_pct"),
        power_w=float(latest["power_w"]),
        reference_power_w=4.6,
        dht22_connected=bool(latest.get("dht22_valid", False)),
        rain_sensor_connected=bool(latest.get("rain_valid", False)),
        ldr_connected=bool(latest.get("ldr_valid", False)),
        is_simulated=False,
    )


def generate_simulated_sample() -> dict:
    st.session_state.sim_step += 1
    t = st.session_state.sim_step
    avg_dust = sum(st.session_state.zone_dust) / 4.0
    dust_factor = max(0.55, 1.0 - (avg_dust / 140.0))
    voltage = round(6.15 + 0.18 * math.sin(t * 0.45) * dust_factor, 2)
    current = round((0.76 + 0.06 * math.cos(t * 0.35)) * dust_factor, 3)
    power = calculate_instantaneous_power(voltage, current)
    panel_temp = round(46.8 + 1.4 * math.sin(t * 0.25), 2)
    cooling_temp = round(38.2 + 0.9 * math.sin(t * 0.25), 2)
    w = st.session_state.sim_weather
    return {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "voltage_v": voltage,
        "current_a": current,
        "power_w": power,
        "panel_temp_c": panel_temp,
        "cooling_temp_c": cooling_temp,
        "reference_temp_c": 51.4,
        "humidity_pct": w["humidity_pct"],
        "ambient_temp_c": w["ambient_temp_c"],
        "rain_detected": w["rain_detected"],
        "ldr_pct": w["ldr_pct"],
        "dht22_valid": True,
        "rain_valid": True,
        "ldr_valid": True,
        "source": "SIMULATION",
    }


def render_text_report(title: str, body: str) -> None:
    st.markdown(f"#### {title}")
    st.info(body)


def main() -> None:
    init_session_state()
    controller: ZoneController = st.session_state.zone_controller
    eds_ctrl: EDSController = st.session_state.eds_controller
    monitor: ContinuousMonitorService = st.session_state.monitor_service
    serial_mgr: SerialHandler = st.session_state.serial_handler
    logger: CSVDataLogger = st.session_state.logger
    cam: CameraManager = st.session_state.camera_mgr

    with st.sidebar:
        st.markdown("## ☀️ SOLARGUARD")
        st.caption("Autonomous Multi-Panel Monitoring & Selective EDS")
        st.divider()

        mode_choice = st.radio(
            "Operating Mode",
            ["SIMULATION", "HARDWARE"],
            index=0 if st.session_state.mode == "SIMULATION" else 1,
        )
        st.session_state.mode = mode_choice

        if mode_choice == "HARDWARE":
            ports = SerialHandler.list_available_ports()
            selected_port = st.selectbox("ESP32 COM Port", ports if ports else ["No COM ports detected"])
            c1, c2 = st.columns(2)
            with c1:
                if st.button("Connect", use_container_width=True, disabled=not ports):
                    ok, msg = serial_mgr.connect(selected_port)
                    st.success(msg) if ok else st.error(msg)
            with c2:
                if st.button("Disconnect", use_container_width=True):
                    serial_mgr.disconnect()
            if serial_mgr.is_connected:
                st.success(f"ESP32 Connected: {serial_mgr.port}")
                if st.button("Poll ESP32 Telemetry", use_container_width=True):
                    pkt, err = serial_mgr.read_sensor_packet()
                    if pkt:
                        st.session_state.telemetry_history.append(
                            {
                                "timestamp": pkt.timestamp,
                                "voltage_v": pkt.voltage_v,
                                "current_a": pkt.current_a,
                                "power_w": pkt.power_w,
                                "panel_temp_c": pkt.panel_temp_c,
                                "cooling_temp_c": pkt.cooling_temp_c,
                                "reference_temp_c": 51.4,
                                "humidity_pct": pkt.humidity_pct,
                                "ambient_temp_c": pkt.ambient_temp_c,
                                "rain_detected": pkt.rain_detected,
                                "ldr_pct": pkt.ldr_pct,
                                "dht22_valid": pkt.dht22_valid,
                                "rain_valid": pkt.rain_sensor_valid,
                                "ldr_valid": pkt.ldr_valid,
                                "source": "HARDWARE_ESP32",
                            }
                        )
                    elif err:
                        st.warning(err)
            else:
                st.warning("ESP32 Disconnected (Safe Fallback Active)")
        else:
            st.info("Simulation Mode Active — values labeled [SIMULATED]")
            if st.button("Sample Simulated Telemetry", use_container_width=True):
                st.session_state.telemetry_history.append(generate_simulated_sample())

        st.divider()
        page = st.radio(
            "Navigation",
            [
                "1. Home Dashboard",
                "2. Live Camera & Dust Calibration",
                "3. Weather Monitoring",
                "4. Intelligent Decisions",
                "5. EDS Control & Verification",
                "6. LED Zone Control",
                "7. Thermal Monitoring",
                "8. Power & Efficiency Monitoring",
                "9. Energy Analysis",
                "10. Data and Reports",
            ],
        )

    st.title("☀️ SOLARGUARD")
    st.caption("INTELLIGENT MULTI-PANEL MONITORING, WEATHER DECISION ENGINE & SELECTIVE EDS")

    latest = st.session_state.telemetry_history[-1]
    weather_inputs = build_current_weather_inputs(latest)
    accumulated_wh = calculate_accumulated_energy_wh(
        [(row["timestamp"], row["power_w"]) for row in st.session_state.telemetry_history]
    )
    overall_dust = round(sum(st.session_state.zone_dust) / 4.0, 2)
    energy_report = st.session_state.latest_energy_report

    with st.expander("Continuous Monitoring Controls", expanded=page.startswith(("2.", "4.", "5."))):
        mc1, mc2, mc3, mc4, mc5, mc6 = st.columns(6)
        with mc1:
            if st.button("Start Monitoring", use_container_width=True):
                monitor.state = MonitorState.RUNNING
        with mc2:
            if st.button("Pause Monitoring", use_container_width=True):
                monitor.pause()
        with mc3:
            if st.button("Resume Monitoring", use_container_width=True):
                monitor.resume()
        with mc4:
            if st.button("Stop Monitoring", use_container_width=True):
                monitor.stop()
        with mc5:
            st.session_state.monitor_config.auto_cleaning_enabled = st.toggle(
                "Auto-Clean", value=st.session_state.monitor_config.auto_cleaning_enabled
            )
        with mc6:
            if st.button("E-STOP ALL", type="primary", use_container_width=True):
                controller.trigger_emergency_stop(serial_mgr, st.session_state.mode)
                eds_ctrl.trigger_emergency_stop(serial_mgr)

    if page.startswith("1."):
        st.subheader("System Overview")
        conn_label = (
            f"CONNECTED ({serial_mgr.port})"
            if (st.session_state.mode == "HARDWARE" and serial_mgr.is_connected)
            else ("DISCONNECTED" if st.session_state.mode == "HARDWARE" else "SIMULATION MODE")
        )
        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("Connection Status", conn_label)
        c2.metric("Panel Temp", f"{latest['panel_temp_c']:.1f} °C")
        c3.metric("Cooling Assembly Temp", f"{latest['cooling_temp_c']:.1f} °C")
        c4.metric("Voltage", f"{latest['voltage_v']:.2f} V")
        c5.metric("Output Power", f"{latest['power_w']:.3f} W")
        render_text_report(
            "System Status Text Report",
            f"SolarGuard is operating in {st.session_state.mode} mode tracking {len(st.session_state.multi_panel_dust)} solar panel(s) "
            f"({len(st.session_state.multi_panel_dust) * 4} independent zones). Instantaneous output is {latest['power_w']:.3f} W "
            f"with accumulated yield {accumulated_wh:.4f} Wh and net energy benefit {energy_report.net_energy_benefit_wh:+.4f} Wh.",
        )

    elif page.startswith("2."):
        st.subheader("Combined Live Camera & Multi-Panel Dust Calibration")
        st.warning(
            "Auto analysis detects structural panel mismatch and switches to Intrinsic PV Surface Inspection "
            "so uploading any clean solar panel photo will not falsely report high dust from busbar misalignment."
        )
        s1, s2, s3 = st.columns(3)
        st.session_state.clean_threshold = s1.slider("Clean Max (%)", 2.0, 20.0, float(st.session_state.clean_threshold), 0.5)
        st.session_state.moderate_threshold = s2.slider("Cleaning Trigger (%)", 12.0, 50.0, float(st.session_state.moderate_threshold), 0.5)
        st.session_state.analysis_mode = s3.selectbox("Analysis Mode", ["AUTO", "INTRINSIC_SURFACE", "REFERENCE_DIFF"])

        uploaded = st.file_uploader("Upload Any Solar Panel Image (Clean, Dusty, or Multi-Panel)", type=["jpg", "jpeg", "png"])
        b1, b2, b3 = st.columns(3)
        target_bgr = None
        if uploaded is not None and CV2_READY:
            file_bytes = np.asarray(bytearray(uploaded.read()), dtype=np.uint8)
            target_bgr = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        with b1:
            if st.button("Scan 3-Panel Lab Array", use_container_width=True) and CV2_READY:
                target_bgr, _ = cam.load_image_from_path(str(PROJECT_ROOT / "data" / "sample_multipanel.jpg"))
        with b2:
            if st.button("Capture Live Webcam Frame", use_container_width=True) and CV2_READY:
                target_bgr, err = cam.capture_frame()
                if err:
                    st.error(err)
        with b3:
            if st.button("Capture Clean Reference", use_container_width=True) and CV2_READY:
                frame, err = cam.capture_frame()
                if frame is not None:
                    cam.save_clean_reference(frame)
                    st.success("Saved clean reference image.")
                else:
                    st.error(err or "Camera unavailable.")

        if target_bgr is not None and CV2_READY:
            ref_img, _ = cam.load_clean_reference()
            cfg = DustDetectionConfig(
                clean_max_pct=st.session_state.clean_threshold,
                moderate_max_pct=st.session_state.moderate_threshold,
                analysis_mode=st.session_state.analysis_mode,
            )
            res = analyze_multi_panel_frame(
                target_bgr,
                ref_img,
                st.session_state.panel_detector,
                st.session_state.panel_tracker,
                cfg,
            )
            st.session_state.last_multipanel_rgb = cv2.cvtColor(res.annotated_frame, cv2.COLOR_BGR2RGB)
            if res.panels:
                st.session_state.multi_panel_dust = {p.panel_id: p.zone_percentages for p in res.panels}
                st.session_state.zone_dust = res.panels[0].zone_percentages

        if st.session_state.last_multipanel_rgb is not None:
            st.image(st.session_state.last_multipanel_rgb, use_container_width=True)

        summary_lines = [
            f"Panel {pid}: Z1={pcts[0]:.1f}%, Z2={pcts[1]:.1f}%, Z3={pcts[2]:.1f}%, Z4={pcts[3]:.1f}%"
            for pid, pcts in st.session_state.multi_panel_dust.items()
        ]
        render_text_report("Vision & Dust Calibration Text Report", " | ".join(summary_lines))

    elif page.startswith("3."):
        st.subheader("Weather Sensor Monitoring (DHT22, Rain Sensor, LDR, DS18B20)")
        if st.session_state.mode == "SIMULATION":
            sw1, sw2, sw3, sw4 = st.columns(4)
            st.session_state.sim_weather["humidity_pct"] = sw1.slider("DHT22 Humidity (%)", 15.0, 99.0, float(st.session_state.sim_weather["humidity_pct"]))
            st.session_state.sim_weather["ambient_temp_c"] = sw2.slider("Ambient Temp (°C)", 15.0, 50.0, float(st.session_state.sim_weather["ambient_temp_c"]))
            st.session_state.sim_weather["ldr_pct"] = sw3.slider("LDR Intensity (%)", 0.0, 100.0, float(st.session_state.sim_weather["ldr_pct"]))
            st.session_state.sim_weather["rain_detected"] = sw4.checkbox("Rain Detected", value=bool(st.session_state.sim_weather["rain_detected"]))
            weather_inputs = build_current_weather_inputs(latest)

        dec = evaluate_panel_weather_decision(1, st.session_state.multi_panel_dust.get(1, [5, 32, 8, 45]), weather_inputs, st.session_state.weather_config, eds_ctrl.emergency_stop)
        render_text_report(
            "Weather & Atmospheric Text Report",
            f"Atmospheric condition is {dec.atmosphericCondition if hasattr(dec, 'atmosphericCondition') else dec.atmospheric_condition}. "
            f"Humidity: {dec.humidity_status}; Rain: {dec.rain_status}; Panel Temp: {dec.panel_temp_status}. {dec.reason}",
        )

    elif page.startswith("4."):
        st.subheader("Per-Panel Weather-Aware Intelligent Decision Matrix")
        wcfg = st.session_state.weather_config
        rows = []
        reasons = []
        for pid, pcts in st.session_state.multi_panel_dust.items():
            dec = evaluate_panel_weather_decision(pid, pcts, weather_inputs, wcfg, eds_ctrl.emergency_stop)
            reasons.append(dec.reason)
            rows.append(
                {
                    "Panel ID": f"Panel {pid}",
                    "Humidity": dec.humidity_status,
                    "Rain": dec.rain_status,
                    "Temperature": dec.panel_temp_status,
                    "Cleaning Eligibility": "Permitted" if dec.cleaning_eligible else "Disabled / Wait",
                    "Recommended Action": dec.recommended_action,
                }
            )
        st.dataframe(pd.DataFrame(rows), use_container_width=True)
        render_text_report("Decision Matrix Text Report", " ".join(reasons))

    elif page.startswith("5."):
        st.subheader("4-Channel Travelling-Wave EDS Control & Verification")
        target_pid = st.selectbox("Target Panel", list(st.session_state.multi_panel_dust.keys()))
        target_pcts = st.session_state.multi_panel_dust[target_pid]
        dec = evaluate_panel_weather_decision(target_pid, target_pcts, weather_inputs, st.session_state.weather_config, eds_ctrl.emergency_stop)
        if st.button("Dispatch Selective EDS Request", type="primary"):
            ev = eds_ctrl.execute_cleaning_request(
                panel_id=target_pid,
                zone_mask=dec.zone_command.replace("ZONE:", ""),
                before_dust_pct=sum(target_pcts) / 4.0,
                weather_permitted=dec.cleaning_eligible,
                serial_handler=serial_mgr,
            )
            st.info(ev.notes)
        render_text_report(
            "EDS Verification Text Report",
            f"Target Panel {target_pid} queued command {dec.zone_command}. Driver Mode: {eds_ctrl.driver_mode.value}; State: {eds_ctrl.state.value}. "
            "High-voltage kV generation remains hardware-isolated from ESP32 GPIO pins.",
        )

    elif page.startswith("6."):
        st.subheader("LED Zone Indicator Control (Safe Demonstration)")
        decision = controller.compute_decision(st.session_state.zone_dust)
        if st.button("Send LED Command", type="primary"):
            ok, msg = controller.dispatch_command(decision, serial_mgr, st.session_state.mode)
            st.success(msg) if ok else st.error(msg)
        render_text_report(
            "LED Indicator Text Report",
            f"Generated binary zone mask {decision.command}. Indicator LEDs reflect zone selection only and do not imply HV electrostatic actuation.",
        )

    elif page.startswith("7."):
        st.subheader("Thermal Monitoring & Passive Cooling Comparison")
        delta_t = calculate_temperature_reduction(latest["reference_temp_c"], latest["panel_temp_c"])
        tc1, tc2, tc3 = st.columns(3)
        tc1.metric("Solar Panel Surface Temp", f"{latest['panel_temp_c']:.2f} °C")
        tc2.metric("Cooling Assembly Temp", f"{latest['cooling_temp_c']:.2f} °C")
        tc3.metric("Temperature Reduction", f"{delta_t:.2f} °C")
        render_text_report(
            "Thermal Performance Text Report",
            f"Solar panel surface temperature is {latest['panel_temp_c']:.2f} C while the independent cooling assembly reads {latest['cooling_temp_c']:.2f} C, "
            f"achieving a {delta_t:.2f} C reduction vs uncooled reference ({latest['reference_temp_c']:.1f} C) and ~{delta_t * 0.4:.2f}% relative thermal recovery.",
        )

    elif page.startswith("8."):
        st.subheader("Power, Conversion Efficiency & Effective Runtime Monitoring")
        p_area = st.number_input("Panel Active Area (m^2)", min_value=0.005, max_value=5.0, value=0.036, step=0.005, format="%.3f")
        irr_wm2 = st.number_input("Solar Irradiance (W/m^2)", min_value=50.0, max_value=1200.0, value=float((weather_inputs.ldr_pct or 82.0) * 10.0), step=10.0)
        forecast = evaluate_power_efficiency_and_runtime(
            power_history_w=[float(r["power_w"]) for r in st.session_state.telemetry_history],
            irradiance_wm2=irr_wm2,
            panel_area_m2=p_area,
            panel_temp_c=float(latest["panel_temp_c"]),
            avg_dust_pct=overall_dust,
            cleaning_threshold_pct=float(st.session_state.moderate_threshold),
        )
        pc1, pc2, pc3, pc4 = st.columns(4)
        pc1.metric("Current Efficiency", f"{forecast.current_efficiency_pct:.2f} %", delta=f"{forecast.efficiency_delta_pct:+.2f}% vs start")
        pc2.metric("Earlier Min / Max Eff.", f"{forecast.min_earlier_efficiency_pct:.1f}% / {forecast.max_earlier_efficiency_pct:.1f}%")
        pc3.metric("Effective Daylight Left", f"{forecast.estimated_effective_daylight_hours:.1f} hrs")
        pc4.metric("Days Until Next Clean", f"{forecast.estimated_days_before_cleaning:.1f} days")

        eff_hist = [calculate_panel_efficiency_pct(float(r["power_w"]), irr_wm2, p_area) for r in st.session_state.telemetry_history]
        fig_eff = go.Figure()
        fig_eff.add_trace(go.Scatter(x=[r["timestamp"] for r in st.session_state.telemetry_history], y=eff_hist, name="Efficiency (%)", line=dict(color="#38BDF8", width=2.5)))
        fig_eff.update_layout(template="plotly_dark", paper_bgcolor="#0E1628", plot_bgcolor="#0E1628", height=300, yaxis_title="Efficiency (%)")
        st.plotly_chart(fig_eff, use_container_width=True)
        render_text_report("Power, Efficiency & Runtime Text Report", forecast.summary_report)

    elif page.startswith("9."):
        st.subheader("Net Energy Benefit Calculator")
        ec1, ec2, ec3 = st.columns(3)
        ec1.metric("Additional Energy", f"{energy_report.additional_energy_wh:+.4f} Wh")
        ec2.metric("Total Consumption", f"{energy_report.total_consumption_wh:.4f} Wh")
        ec3.metric("Net Energy Benefit", f"{energy_report.net_energy_benefit_wh:+.4f} Wh", delta=energy_report.balance_status)
        render_text_report(
            "Net Energy Benefit Text Report",
            f"Under {energy_report.irradiance_wm2:.0f} W/m^2 over {energy_report.observation_period_min:.0f} min ({energy_report.data_source}), "
            f"selective cleaning generated {energy_report.additional_energy_wh:+.4f} Wh extra output against {energy_report.total_consumption_wh:.4f} Wh overhead, "
            f"yielding a {energy_report.balance_status} net benefit of {energy_report.net_energy_benefit_wh:+.4f} Wh.",
        )

    elif page.startswith("10."):
        st.subheader("Data Logs & Experimental CSV Export")
        pm_df = pd.DataFrame(logger.load_panel_monitoring_logs())
        s_df = pd.DataFrame(logger.load_sensor_readings())
        st.dataframe(pm_df, use_container_width=True)
        render_text_report(
            "Archive & Audit Text Report",
            f"Append-only CSV storage holds {len(pm_df)} per-panel autonomous monitoring log(s) and {len(s_df)} sensor snapshot(s).",
        )


if __name__ == "__main__":
    main()
