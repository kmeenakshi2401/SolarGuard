"""Unit tests for intelligent cleaning decision logic, overrides, ESTOP, and serial parsing."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from control.cleaning_logic import encode_zone_command, evaluate_cleaning_decision
from control.zone_control import ZoneController
from hardware.serial_handler import parse_sensor_line


class TestCleaningLogic(unittest.TestCase):
    def test_selective_zone_command_example(self) -> None:
        # Exact example from specification: Zone 1: 4%, Zone 2: 38%, Zone 3: 7%, Zone 4: 52%
        decision = evaluate_cleaning_decision([4.0, 38.0, 7.0, 52.0], threshold_pct=25.0)
        self.assertEqual(decision.command, "ZONE:0101")
        self.assertEqual(decision.zone_recommendations, [False, True, False, True])
        self.assertEqual(decision.selected_zones, [False, True, False, True])

    def test_manual_override_and_estop(self) -> None:
        controller = ZoneController(threshold_pct=25.0)
        decision = controller.compute_decision([4.0, 38.0, 7.0, 52.0], manual_override=[True, False, False, False])
        self.assertEqual(decision.command, "ZONE:1000")

        ok, _ = controller.dispatch_command(decision, mode="SIMULATION")
        self.assertTrue(ok)
        self.assertEqual(controller.active_zones, [True, False, False, False])

        # Trigger Emergency Stop -> forces LEDs OFF and blocks further commands
        controller.trigger_emergency_stop(mode="SIMULATION")
        self.assertTrue(controller.emergency_stop_active)
        self.assertEqual(controller.active_zones, [False, False, False, False])

        blocked_ok, _ = controller.dispatch_command(decision, mode="SIMULATION")
        self.assertFalse(blocked_ok)

        controller.reset_emergency_stop(mode="SIMULATION")
        self.assertFalse(controller.emergency_stop_active)

    def test_serial_packet_parsing_and_malformed_handling(self) -> None:
        pkt, err = parse_sensor_line("DATA,5.8,0.65,3.77,42.5,38.2")
        self.assertIsNone(err)
        assert pkt is not None
        self.assertAlmostEqual(pkt.voltage_v, 5.8)
        self.assertAlmostEqual(pkt.current_a, 0.65)
        self.assertAlmostEqual(pkt.power_w, 3.77)
        self.assertAlmostEqual(pkt.panel_temp_c, 42.5)
        self.assertAlmostEqual(pkt.cooling_temp_c, 38.2)

        bad_pkt, bad_err = parse_sensor_line("DATA,5.8,NOT_A_NUM,3.77,42.5,38.2")
        self.assertIsNone(bad_pkt)
        self.assertIsNotNone(bad_err)

        short_pkt, short_err = parse_sensor_line("DATA,5.8,0.65")
        self.assertIsNone(short_pkt)
        self.assertIsNotNone(short_err)

    def test_encode_zone_command_validation(self) -> None:
        self.assertEqual(encode_zone_command([False, True, False, True]), "ZONE:0101")
        with self.assertRaises(ValueError):
            encode_zone_command([True, False])


if __name__ == "__main__":
    unittest.main()
