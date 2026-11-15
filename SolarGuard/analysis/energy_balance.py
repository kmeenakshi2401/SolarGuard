"""Net Energy Benefit Calculator for SolarGuard research evaluation."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class EnergyBalanceReport:
    """Complete Net Energy Benefit breakdown with explicit data source tagging."""

    reference_energy_wh: float
    improved_energy_wh: float
    additional_energy_wh: float
    eds_cleaning_energy_wh: float
    controller_energy_wh: float
    total_consumption_wh: float
    net_energy_benefit_wh: float
    energy_gain_pct: float
    balance_status: str  # "POSITIVE", "NEUTRAL", or "NEGATIVE"
    data_source: str     # "SIMULATION" or "EXPERIMENTAL"
    observation_period_min: float = 60.0
    irradiance_wm2: float = 800.0


def calculate_net_energy_benefit(
    reference_energy_wh: float,
    improved_energy_wh: float,
    eds_cleaning_energy_wh: float,
    controller_energy_wh: float,
    data_source: str = "SIMULATION",
    observation_period_min: float = 60.0,
    irradiance_wm2: float = 800.0,
) -> EnergyBalanceReport:
    """
    Evaluate Net Energy Benefit under comparable observation periods & irradiance:
        Additional Energy    = Improved Panel Energy - Reference Panel Energy
        Total Consumption    = EDS Energy + Controller Energy
        Net Energy Benefit   = Additional Energy - Total Consumption
    """
    ref_wh = max(0.0, float(reference_energy_wh))
    imp_wh = max(0.0, float(improved_energy_wh))
    eds_wh = max(0.0, float(eds_cleaning_energy_wh))
    ctrl_wh = max(0.0, float(controller_energy_wh))

    additional_wh = round(imp_wh - ref_wh, 4)
    total_consumption_wh = round(eds_wh + ctrl_wh, 4)
    net_wh = round(additional_wh - total_consumption_wh, 4)

    gain_pct = round(((imp_wh - ref_wh) / ref_wh) * 100.0, 2) if ref_wh > 0 else 0.0

    if net_wh > 0.0001:
        status = "POSITIVE"
    elif net_wh < -0.0001:
        status = "NEGATIVE"
    else:
        status = "NEUTRAL"

    return EnergyBalanceReport(
        reference_energy_wh=round(ref_wh, 4),
        improved_energy_wh=round(imp_wh, 4),
        additional_energy_wh=additional_wh,
        eds_cleaning_energy_wh=round(eds_wh, 4),
        controller_energy_wh=round(ctrl_wh, 4),
        total_consumption_wh=total_consumption_wh,
        net_energy_benefit_wh=net_wh,
        energy_gain_pct=gain_pct,
        balance_status=status,
        data_source=data_source.upper(),
        observation_period_min=float(observation_period_min),
        irradiance_wm2=float(irradiance_wm2),
    )
