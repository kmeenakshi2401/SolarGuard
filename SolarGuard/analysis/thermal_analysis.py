"""Thermal monitoring and cooling configuration comparison for SolarGuard.

Explicitly distinguishes solar panel surface temperature from cooling assembly
temperature so heatsink/fluid temperature is never substituted for PV cell temperature.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


@dataclass
class ThermalComparisonRecord:
    """Thermal performance comparison entry for a cooling configuration."""

    cooling_config: str
    reference_panel_temp_c: float
    cooled_panel_temp_c: float
    cooling_assembly_temp_c: float
    temp_reduction_c: float
    relative_efficiency_gain_pct: float


def calculate_temperature_reduction(reference_temp_c: float, cooled_temp_c: float) -> float:
    """
    Calculate panel temperature reduction achieved by cooling:
        Temperature reduction = Reference temperature - Cooled temperature
    """
    return round(float(reference_temp_c) - float(cooled_temp_c), 2)


def estimate_silicon_pv_thermal_gain_pct(
    temp_reduction_c: float,
    temp_coeff_pct_per_c: float = 0.40,
) -> float:
    """Estimate crystalline silicon efficiency recovery (~0.40%/C per degree cooled)."""
    return round(float(temp_reduction_c) * float(temp_coeff_pct_per_c), 2)


def summarize_cooling_configurations(records: List[Dict[str, float | str]]) -> List[ThermalComparisonRecord]:
    """Build structured thermal comparison records from experimental rows."""
    output: List[ThermalComparisonRecord] = []
    for row in records:
        ref_t = float(row.get("reference_panel_temp_c", 0.0))
        cooled_t = float(row.get("cooled_panel_temp_c", 0.0))
        cool_asm_t = float(row.get("cooling_assembly_temp_c", 0.0))
        delta_t = calculate_temperature_reduction(ref_t, cooled_t)
        gain_pct = estimate_silicon_pv_thermal_gain_pct(delta_t)
        output.append(
            ThermalComparisonRecord(
                cooling_config=str(row.get("cooling_config", "Unknown")),
                reference_panel_temp_c=round(ref_t, 2),
                cooled_panel_temp_c=round(cooled_t, 2),
                cooling_assembly_temp_c=round(cool_asm_t, 2),
                temp_reduction_c=delta_t,
                relative_efficiency_gain_pct=gain_pct,
            )
        )
    return output
