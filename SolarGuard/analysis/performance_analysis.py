"""Append-only CSV data logging, per-panel autonomous records, and performance reporting."""

from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


SENSOR_HEADERS = [
    "timestamp",
    "mode",
    "voltage_v",
    "current_a",
    "power_w",
    "panel_temp_c",
    "cooling_temp_c",
    "temp_reduction_c",
    "z1_dust_pct",
    "z2_dust_pct",
    "z3_dust_pct",
    "z4_dust_pct",
    "selected_zones",
    "cleaning_status",
    "generated_energy_wh",
    "cleaning_energy_wh",
    "net_energy_benefit_wh",
]

PANEL_MONITOR_HEADERS = [
    "timestamp",
    "panel_id",
    "z1_dust_pct",
    "z2_dust_pct",
    "z3_dust_pct",
    "z4_dust_pct",
    "humidity_pct",
    "rain_status",
    "ldr_reading",
    "panel_temp_c",
    "voltage_v",
    "current_a",
    "power_w",
    "weather_classification",
    "cleaning_eligibility",
    "selected_zones",
    "cleaning_request_status",
    "actual_eds_status",
    "before_cleaning_dust_pct",
    "after_cleaning_dust_pct",
    "cleaning_efficiency_pct",
    "cleaning_energy_wh",
    "net_energy_benefit_wh",
]

ENERGY_HEADERS = [
    "timestamp",
    "data_source",
    "observation_period_min",
    "irradiance_wm2",
    "reference_energy_wh",
    "improved_energy_wh",
    "additional_energy_wh",
    "cleaning_energy_wh",
    "controller_energy_wh",
    "total_consumption_wh",
    "net_energy_benefit_wh",
    "balance_status",
    "notes",
]

EXPERIMENT_HEADERS = [
    "timestamp",
    "data_source",
    "cooling_config",
    "reference_panel_temp_c",
    "cooled_panel_temp_c",
    "cooling_assembly_temp_c",
    "temp_reduction_c",
    "avg_power_w",
    "dust_coverage_avg_pct",
    "selected_zones",
    "notes",
]


def compute_cleaning_efficiency_pct(before_dust_pct: float, after_dust_pct: float) -> float:
    """Safely compute (Before - After) / Before * 100 handling zero baseline dust."""
    before = float(before_dust_pct)
    after = max(0.0, float(after_dust_pct))
    if before <= 0.0:
        return 0.0
    return round(max(-100.0, min(100.0, ((before - after) / before) * 100.0)), 2)


class CSVDataLogger:
    """Append-only CSV storage manager with recovery guarantees."""

    def __init__(self, data_dir: Optional[str] = None) -> None:
        default_dir = Path(__file__).resolve().parent.parent / "data"
        self.data_dir = Path(data_dir) if data_dir else default_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)

        self.sensor_csv = self.data_dir / "sensor_data.csv"
        self.panel_monitor_csv = self.data_dir / "panel_monitoring_log.csv"
        self.energy_csv = self.data_dir / "energy_data.csv"
        self.experiment_csv = self.data_dir / "experiment_results.csv"

        self._ensure_header(self.sensor_csv, SENSOR_HEADERS)
        self._ensure_header(self.panel_monitor_csv, PANEL_MONITOR_HEADERS)
        self._ensure_header(self.energy_csv, ENERGY_HEADERS)
        self._ensure_header(self.experiment_csv, EXPERIMENT_HEADERS)

    @staticmethod
    def _ensure_header(file_path: Path, headers: List[str]) -> None:
        if not file_path.exists() or file_path.stat().st_size == 0:
            with file_path.open("w", newline="", encoding="utf-8") as fh:
                csv.writer(fh).writerow(headers)

    @staticmethod
    def _append_row(file_path: Path, headers: List[str], row: Dict[str, Any]) -> None:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        if not file_path.exists() or file_path.stat().st_size == 0:
            with file_path.open("w", newline="", encoding="utf-8") as fh:
                csv.writer(fh).writerow(headers)
        with file_path.open("a", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=headers, extrasaction="ignore")
            writer.writerow(row)

    @staticmethod
    def _read_rows(file_path: Path) -> List[Dict[str, str]]:
        if not file_path.exists():
            return []
        try:
            with file_path.open("r", newline="", encoding="utf-8") as fh:
                return list(csv.DictReader(fh))
        except Exception:
            return []

    def log_sensor_reading(self, record: Dict[str, Any]) -> Dict[str, Any]:
        payload = {"timestamp": datetime.now().isoformat(timespec="seconds"), **record}
        self._append_row(self.sensor_csv, SENSOR_HEADERS, payload)
        return payload

    def log_panel_monitoring_event(self, record: Dict[str, Any]) -> Dict[str, Any]:
        payload = {"timestamp": datetime.now().isoformat(timespec="seconds"), **record}
        self._append_row(self.panel_monitor_csv, PANEL_MONITOR_HEADERS, payload)
        return payload

    def log_energy_analysis(self, record: Dict[str, Any]) -> Dict[str, Any]:
        payload = {"timestamp": datetime.now().isoformat(timespec="seconds"), **record}
        self._append_row(self.energy_csv, ENERGY_HEADERS, payload)
        return payload

    def log_experiment_result(self, record: Dict[str, Any]) -> Dict[str, Any]:
        payload = {"timestamp": datetime.now().isoformat(timespec="seconds"), **record}
        self._append_row(self.experiment_csv, EXPERIMENT_HEADERS, payload)
        return payload

    def load_sensor_readings(self) -> List[Dict[str, str]]:
        return self._read_rows(self.sensor_csv)

    def load_panel_monitoring_logs(self) -> List[Dict[str, str]]:
        return self._read_rows(self.panel_monitor_csv)

    def load_energy_analyses(self) -> List[Dict[str, str]]:
        return self._read_rows(self.energy_csv)

    def load_experiment_results(self) -> List[Dict[str, str]]:
        return self._read_rows(self.experiment_csv)
