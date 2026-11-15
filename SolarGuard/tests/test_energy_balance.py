"""Unit tests for thermal, electrical power, net energy benefit, and append-only CSV logging."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from analysis.energy_balance import calculate_net_energy_benefit
from analysis.performance_analysis import CSVDataLogger
from analysis.power_calculation import calculate_accumulated_energy_wh, calculate_instantaneous_power
from analysis.thermal_analysis import calculate_temperature_reduction


class TestEnergyAndThermal(unittest.TestCase):
    def test_temperature_reduction(self) -> None:
        self.assertEqual(calculate_temperature_reduction(51.4, 43.2), 8.2)

    def test_power_and_timestamped_energy_wh(self) -> None:
        self.assertEqual(calculate_instantaneous_power(6.0, 0.75), 4.5)
        # Constant 3.6 W for 3600 seconds = 3.6 Wh
        samples = [
            ("2026-11-14T10:00:00", 3.6),
            ("2026-11-14T10:30:00", 3.6),
            ("2026-11-14T11:00:00", 3.6),
        ]
        # Note: max_gap_seconds=2000 allows 30-min steps in unit test
        energy_wh = calculate_accumulated_energy_wh(samples, max_gap_seconds=2000.0)
        self.assertAlmostEqual(energy_wh, 3.6, places=4)

    def test_net_energy_benefit_positive_and_negative(self) -> None:
        pos = calculate_net_energy_benefit(
            reference_energy_wh=3.60,
            improved_energy_wh=4.50,
            eds_cleaning_energy_wh=0.08,
            controller_energy_wh=0.14,
            data_source="EXPERIMENTAL",
        )
        self.assertAlmostEqual(pos.additional_energy_wh, 0.90)
        self.assertAlmostEqual(pos.total_consumption_wh, 0.22)
        self.assertAlmostEqual(pos.net_energy_benefit_wh, 0.68)
        self.assertEqual(pos.balance_status, "POSITIVE")

        neg = calculate_net_energy_benefit(
            reference_energy_wh=3.60,
            improved_energy_wh=3.70,
            eds_cleaning_energy_wh=0.15,
            controller_energy_wh=0.15,
        )
        self.assertAlmostEqual(neg.net_energy_benefit_wh, -0.20)
        self.assertEqual(neg.balance_status, "NEGATIVE")

    def test_csv_append_preserves_prior_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = CSVDataLogger(tmpdir)
            logger.log_sensor_reading({"mode": "SIMULATION", "voltage_v": 5.8, "current_a": 0.6, "power_w": 3.48})
            logger.log_sensor_reading({"mode": "SIMULATION", "voltage_v": 6.1, "current_a": 0.7, "power_w": 4.27})
            rows = logger.load_sensor_readings()
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["voltage_v"], "5.8")
            self.assertEqual(rows[1]["voltage_v"], "6.1")


if __name__ == "__main__":
    unittest.main()
