"""Intelligent 4-zone cleaning decision algorithm and ZONE:XXXX command encoder."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class CleaningDecision:
    """Output of the selective 4-zone cleaning evaluation."""

    zone_percentages: List[float]
    zone_recommendations: List[bool]
    selected_zones: List[bool]
    zone_mask: str
    command: str
    status_messages: List[str]
    manual_override_active: bool = False
    emergency_stop_active: bool = False


def encode_zone_command(selected_zones: List[bool]) -> str:
    """Convert 4 boolean zone flags into a serial command string (e.g. ZONE:0101)."""
    if len(selected_zones) != 4:
        raise ValueError(f"Expected exactly 4 zone states, received {len(selected_zones)}.")
    mask = "".join("1" if active else "0" for active in selected_zones)
    return f"ZONE:{mask}"


def evaluate_cleaning_decision(
    zone_percentages: List[float],
    threshold_pct: float = 25.0,
    manual_override: Optional[List[bool]] = None,
    emergency_stop: bool = False,
) -> CleaningDecision:
    """
    Evaluate 4-zone dust coverage percentages and produce selective cleaning commands.

    Example:
        [4.0, 38.0, 7.0, 52.0] with threshold 25.0 -> ZONE:0101
    """
    if len(zone_percentages) != 4:
        raise ValueError(f"Expected 4 zone dust percentages, got {len(zone_percentages)}.")

    cleaned_pcts = [max(0.0, min(100.0, float(p))) for p in zone_percentages]
    auto_recommendations = [pct > threshold_pct for pct in cleaned_pcts]

    if emergency_stop:
        selected = [False, False, False, False]
        messages = [f"Zone {i + 1}: Halted (Emergency Stop Active)" for i in range(4)]
        return CleaningDecision(
            zone_percentages=cleaned_pcts,
            zone_recommendations=auto_recommendations,
            selected_zones=selected,
            zone_mask="0000",
            command="ZONE:0000",
            status_messages=messages,
            manual_override_active=False,
            emergency_stop_active=True,
        )

    if manual_override is not None:
        if len(manual_override) != 4:
            raise ValueError("Manual override must contain exactly 4 boolean entries.")
        selected = [bool(v) for v in manual_override]
        override_active = True
    else:
        selected = list(auto_recommendations)
        override_active = False

    messages: List[str] = []
    for idx in range(4):
        if selected[idx]:
            reason = "Manual override ON" if override_active else "Cleaning recommended"
            messages.append(f"Zone {idx + 1}: {reason} ({cleaned_pcts[idx]:.1f}%)")
        else:
            messages.append(f"Zone {idx + 1}: No cleaning ({cleaned_pcts[idx]:.1f}%)")

    mask = "".join("1" if s else "0" for s in selected)
    return CleaningDecision(
        zone_percentages=cleaned_pcts,
        zone_recommendations=auto_recommendations,
        selected_zones=selected,
        zone_mask=mask,
        command=f"ZONE:{mask}",
        status_messages=messages,
        manual_override_active=override_active,
        emergency_stop_active=False,
    )
