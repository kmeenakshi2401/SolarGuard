"""Electrical power, timestamp-integrated energy, instantaneous efficiency, and runtime forecasting."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, List, Optional, Tuple


@dataclass
class PowerEfficiencyForecast:
    """Comprehensive efficiency, historical variation, and effective runtime outlook."""

    instantaneous_power_w: float
    current_efficiency_pct: float
    rated_efficiency_pct: float
    efficiency_retention_pct: float
    min_earlier_efficiency_pct: float
    max_earlier_efficiency_pct: float
    efficiency_delta_pct: float
    estimated_effective_daylight_hours: float
    estimated_days_before_cleaning: float
    thermal_margin_to_derate_c: float
    battery_autonomy_hours: float
    summary_report: str


def calculate_instantaneous_power(voltage_v: float, current_a: float) -> float:
    """Power (W) = Voltage (V) * Current (A)."""
    v = max(0.0, float(voltage_v))
    i = max(0.0, float(current_a))
    return round(v * i, 4)


def calculate_panel_efficiency_pct(
    power_w: float,
    irradiance_wm2: float,
    panel_area_m2: float = 0.036,
) -> float:
    """
    Calculate instantaneous solar PV conversion efficiency (%):
        Efficiency (%) = (P_out / (Irradiance * Area)) * 100
    Default area 0.036 m^2 matches a ~6V / 5W bench demonstration PV panel (18cm x 20cm).
    """
    if irradiance_wm2 <= 10.0 or panel_area_m2 <= 0.0:
        return 0.0
    eff = (max(0.0, float(power_w)) / (float(irradiance_wm2) * float(panel_area_m2))) * 100.0
    return round(max(0.0, min(35.0, eff)), 2)


def _to_epoch_seconds(ts: str | float | int | datetime) -> float:
    if isinstance(ts, (int, float)):
        return float(ts)
    if isinstance(ts, datetime):
        return ts.timestamp()
    if isinstance(ts, str):
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    raise TypeError(f"Unsupported timestamp type: {type(ts)}")


def calculate_accumulated_energy_wh(
    samples: Iterable[Tuple[str | float | int | datetime, float]],
    max_gap_seconds: float = 300.0,
) -> float:
    """Energy (Wh) = Sum of (Power_avg * dt_seconds) / 3600 using actual timestamps."""
    ordered: List[Tuple[float, float]] = [
        (_to_epoch_seconds(ts), max(0.0, float(power_w))) for ts, power_w in samples
    ]
    if len(ordered) < 2:
        return 0.0

    ordered.sort(key=lambda item: item[0])
    total_wh = 0.0
    for idx in range(1, len(ordered)):
        t0, p0 = ordered[idx - 1]
        t1, p1 = ordered[idx]
        dt = t1 - t0
        if dt <= 0.0 or dt > max_gap_seconds:
            continue
        total_wh += (0.5 * (p0 + p1) * dt) / 3600.0

    return round(total_wh, 5)


def evaluate_power_efficiency_and_runtime(
    power_history_w: List[float],
    irradiance_wm2: float = 820.0,
    panel_area_m2: float = 0.036,
    rated_efficiency_pct: float = 18.5,
    panel_temp_c: float = 45.0,
    avg_dust_pct: float = 10.0,
    soiling_rate_pct_per_day: float = 3.5,
    cleaning_threshold_pct: float = 25.0,
    battery_capacity_wh: float = 20.0,
    load_power_w: float = 1.8,
) -> PowerEfficiencyForecast:
    """Compute current efficiency, historical variation, and effective runtime forecasts."""
    if not power_history_w:
        power_history_w = [0.0]

    eff_series = [
        calculate_panel_efficiency_pct(p, irradiance_wm2, panel_area_m2) for p in power_history_w
    ]
    current_p = float(power_history_w[-1])
    current_eff = eff_series[-1]
    earliest_eff = eff_series[0]
    min_eff = min(eff_series)
    max_eff = max(eff_series)
    delta_eff = round(current_eff - earliest_eff, 2)
    retention = round((current_eff / rated_efficiency_pct) * 100.0, 1) if rated_efficiency_pct > 0 else 0.0

    # Remaining effective daylight window scaled by irradiance intensity
    effective_daylight_h = round(max(0.0, min(10.0, (irradiance_wm2 / 1000.0) * 6.5)), 1)
    dust_headroom = max(0.0, cleaning_threshold_pct - avg_dust_pct)
    days_before_clean = round(dust_headroom / max(0.2, soiling_rate_pct_per_day), 1)
    thermal_margin = round(65.0 - panel_temp_c, 1)
    net_surplus_w = max(0.1, current_p - 0.15)
    autonomy_h = round(battery_capacity_wh / max(0.2, load_power_w) if current_p < load_power_w else (battery_capacity_wh / max(0.2, load_power_w)) + effective_daylight_h * (net_surplus_w / max(0.2, load_power_w)), 1)

    report = (
        f"Current conversion efficiency is {current_eff:.2f}% ({retention:.1f}% of {rated_efficiency_pct:.1f}% STC rating) "
        f"at {irradiance_wm2:.0f} W/m^2. Earlier in this session efficiency ranged from {min_eff:.2f}% to {max_eff:.2f}% "
        f"(net change {delta_eff:+.2f}%). At current irradiance and {avg_dust_pct:.1f}% average dust coverage, "
        f"the array has ~{effective_daylight_h:.1f} h of effective peak generation window remaining today, "
        f"~{days_before_clean:.1f} day(s) before reaching the {cleaning_threshold_pct:.0f}% cleaning threshold, "
        f"and {thermal_margin:+.1f} C margin below the 65 C thermal derating limit."
    )

    return PowerEfficiencyForecast(
        instantaneous_power_w=round(current_p, 3),
        current_efficiency_pct=current_eff,
        rated_efficiency_pct=rated_efficiency_pct,
        efficiency_retention_pct=retention,
        min_earlier_efficiency_pct=min_eff,
        max_earlier_efficiency_pct=max_eff,
        efficiency_delta_pct=delta_eff,
        estimated_effective_daylight_hours=effective_daylight_h,
        estimated_days_before_cleaning=days_before_clean,
        thermal_margin_to_derate_c=thermal_margin,
        battery_autonomy_hours=autonomy_h,
        summary_report=report,
    )
