"""Unit tests for multi-panel detection, weather decision engine, EDS safety states, and monitoring safeguards."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from analysis.performance_analysis import compute_cleaning_efficiency_pct
from control.eds_controller import EDSController, EDSDriverMode, EDSState, calculate_cleaning_efficiency
from control.monitoring_loop import ContinuousMonitorService, MonitorConfig
from control.weather_decision import WeatherDecisionConfig, WeatherInputs, evaluate_panel_weather_decision
from hardware.serial_handler import parse_sensor_line
from vision.panel_detector import DetectedPanel, PanelTracker, compute_iou


class TestAutonomousUpgrade(unittest.TestCase):
    def test_three_panel_id_tracking_stability(self) -> None:
        tracker = PanelTracker(iou_threshold=0.3)
        frame1 = [
            DetectedPanel(panel_id=0, bbox=(20, 40, 180, 260), polygon=[], confidence=0.92),
            DetectedPanel(panel_id=0, bbox=(220, 40, 180, 260), polygon=[], confidence=0.90),
            DetectedPanel(panel_id=0, bbox=(420, 40, 180, 260), polygon=[], confidence=0.89),
        ]
        tracked1 = tracker.update(frame1)
        self.assertEqual([p.panel_id for p in tracked1], [1, 2, 3])

        # Slight camera jitter in frame 2 should preserve IDs 1, 2, 3
        frame2 = [
            DetectedPanel(panel_id=0, bbox=(25, 43, 180, 260), polygon=[], confidence=0.91),
            DetectedPanel(panel_id=0, bbox=(223, 42, 180, 260), polygon=[], confidence=0.88),
            DetectedPanel(panel_id=0, bbox=(424, 38, 180, 260), polygon=[], confidence=0.90),
        ]
        tracked2 = tracker.update(frame2)
        self.assertEqual([p.panel_id for p in tracked2], [1, 2, 3])
        self.assertGreater(compute_iou(frame1[0].bbox, frame2[0].bbox), 0.85)

    def test_weather_decision_eight_conditions_and_priorities(self) -> None:
        cfg = WeatherDecisionConfig(max_humidity_pct=80.0, critical_dust_pct=25.0, panel_temp_threshold_c=45.0)

        # Panel 1: Dry, dusty, hot -> Clean Zones 2 & 4, passive PCM active
        dry_hot = WeatherInputs(
            humidity_pct=55.0,
            rain_detected=False,
            ambient_temp_c=33.0,
            panel_temp_c=48.0,
            cooling_temp_c=39.0,
            ldr_pct=82.0,
            power_w=3.8,
            reference_power_w=4.6,
            dht22_connected=True,
            rain_sensor_connected=True,
            ldr_connected=True,
            is_simulated=False,
        )
        d1 = evaluate_panel_weather_decision(1, [5.0, 32.0, 8.0, 45.0], dry_hot, cfg)
        self.assertTrue(d1.cleaning_eligible)
        self.assertEqual(d1.zone_command, "ZONE:0101")
        self.assertTrue(d1.passive_cooling_active)
        self.assertIn("Cleaning permitted", d1.reason)

        # Condition 5: Rain detected -> EDS disabled
        rainy = WeatherInputs(**{**dry_hot.__dict__, "rain_detected": True})
        d_rain = evaluate_panel_weather_decision(1, [5.0, 32.0, 8.0, 45.0], rainy, cfg)
        self.assertFalse(d_rain.cleaning_eligible)
        self.assertEqual(d_rain.zone_command, "ZONE:0000")

        # Condition 6: Humidity > 80% -> EDS postponed
        humid = WeatherInputs(**{**dry_hot.__dict__, "humidity_pct": 86.0})
        d_hum = evaluate_panel_weather_decision(2, [10.0, 12.0, 38.0, 6.0], humid, cfg)
        self.assertFalse(d_hum.cleaning_eligible)
        self.assertIn("Humidity", d_hum.reason)

        # Condition 3: High temp alone + clean panel -> No cleaning, passive cooling handles thermal
        d_clean_hot = evaluate_panel_weather_decision(3, [4.0, 7.0, 9.0, 8.0], dry_hot, cfg)
        self.assertFalse(d_clean_hot.cleaning_eligible)
        self.assertTrue(d_clean_hot.passive_cooling_active)

        # Missing sensors in hardware mode -> Must NOT claim humidity/rain measured or permit blind EDS
        missing_hw = WeatherInputs(**{**dry_hot.__dict__, "dht22_connected": False, "rain_sensor_connected": False})
        d_missing = evaluate_panel_weather_decision(1, [5.0, 32.0, 8.0, 45.0], missing_hw, cfg)
        self.assertFalse(d_missing.cleaning_eligible)
        self.assertIn("Missing DHT22 or Rain", d_missing.reason)

    def test_eds_led_only_does_not_falsely_report_electrostatic_cleaning(self) -> None:
        eds = EDSController(driver_mode=EDSDriverMode.LED_DEMO_ONLY)
        ev = eds.execute_cleaning_request(panel_id=1, zone_mask="0101", before_dust_pct=22.5, weather_permitted=True)
        self.assertEqual(ev.status, EDSState.CLEANING_DISABLED_SAFETY)
        self.assertIn("NOT performed", ev.notes)

        eds_sim = EDSController(driver_mode=EDSDriverMode.SIMULATION)
        ev_sim = eds_sim.execute_cleaning_request(panel_id=1, zone_mask="0101", before_dust_pct=40.0, weather_permitted=True)
        self.assertEqual(ev_sim.status, EDSState.CLEANING_COMPLETED)
        eds_sim.verify_cleaning_effectiveness(ev_sim, after_dust_pct=8.0)
        self.assertAlmostEqual(ev_sim.cleaning_efficiency_pct or 0.0, 80.0)

    def test_cleaning_efficiency_handles_zero_safely(self) -> None:
        self.assertEqual(calculate_cleaning_efficiency(0.0, 0.0), 0.0)
        self.assertEqual(compute_cleaning_efficiency_pct(0.0, 5.0), 0.0)
        self.assertAlmostEqual(compute_cleaning_efficiency_pct(50.0, 10.0), 80.0)

    def test_persistence_and_cooldown_prevent_false_or_repeated_triggers(self) -> None:
        eds = EDSController(driver_mode=EDSDriverMode.SIMULATION)
        mon_cfg = MonitorConfig(min_persistence_frames=3, cooldown_seconds=60.0)
        monitor = ContinuousMonitorService(eds, WeatherDecisionConfig(), mon_cfg)
        weather = WeatherInputs(
            humidity_pct=52.0,
            rain_detected=False,
            ambient_temp_c=31.0,
            panel_temp_c=46.0,
            cooling_temp_c=38.0,
            ldr_pct=80.0,
            power_w=3.7,
            reference_power_w=4.6,
            dht22_connected=True,
            rain_sensor_connected=True,
            ldr_connected=True,
            is_simulated=True,
        )

        # Frame 1 & 2: must NOT trigger yet (persistence < 3)
        monitor.evaluate_panel_cycle(1, [5.0, 35.0, 6.0, 42.0], weather, now_epoch=1000.0)
        monitor.evaluate_panel_cycle(1, [5.0, 35.0, 6.0, 42.0], weather, now_epoch=1002.0)
        self.assertEqual(len(eds.events), 0)

        # Frame 3: persistence met -> triggers 1st cleaning
        monitor.evaluate_panel_cycle(1, [5.0, 35.0, 6.0, 42.0], weather, now_epoch=1004.0)
        self.assertEqual(len(eds.events), 1)

        # Frame 4..6 within cooldown -> must NOT re-trigger
        monitor.evaluate_panel_cycle(1, [5.0, 35.0, 6.0, 42.0], weather, now_epoch=1010.0)
        monitor.evaluate_panel_cycle(1, [5.0, 35.0, 6.0, 42.0], weather, now_epoch=1012.0)
        monitor.evaluate_panel_cycle(1, [5.0, 35.0, 6.0, 42.0], weather, now_epoch=1014.0)
        self.assertEqual(len(eds.events), 1)

    def test_extended_11_field_esp32_serial_packet(self) -> None:
        line = "DATA,5.85,0.680,3.978,47.20,38.90,56.5,31.40,0,84.0,15"
        pkt, err = parse_sensor_line(line)
        self.assertIsNone(err)
        assert pkt is not None
        self.assertTrue(pkt.dht22_valid)
        self.assertAlmostEqual(pkt.humidity_pct or 0.0, 56.5)
        self.assertFalse(pkt.rain_detected)
        self.assertAlmostEqual(pkt.ldr_pct or 0.0, 84.0)

    def test_power_efficiency_and_runtime_forecast(self) -> None:
        from analysis.power_calculation import evaluate_power_efficiency_and_runtime

        forecast = evaluate_power_efficiency_and_runtime(
            power_history_w=[3.4, 3.8, 4.5],
            irradiance_wm2=820.0,
            panel_area_m2=0.036,
            panel_temp_c=44.5,
            avg_dust_pct=11.0,
            cleaning_threshold_pct=25.0,
        )
        self.assertGreater(forecast.current_efficiency_pct, 10.0)
        self.assertGreater(forecast.efficiency_delta_pct, 0.0)
        self.assertGreater(forecast.estimated_effective_daylight_hours, 0.0)
        self.assertGreater(forecast.estimated_days_before_cleaning, 0.0)
        self.assertIn("efficiency", forecast.summary_report.lower())


if __name__ == "__main__":
    unittest.main()
