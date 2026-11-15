"""Weather-aware intelligent cleaning decision engine for SolarGuard."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class WeatherDecisionConfig:
    """Configurable thresholds for weather-aware selective cleaning decisions."""

    max_humidity_pct: float = 80.0
    min_dust_for_cleaning_pct: float = 10.0
    critical_dust_pct: float = 25.0
    panel_temp_threshold_c: float = 45.0
    min_light_intensity_pct: float = 20.0
    min_power_loss_pct: float = 8.0
    require_weather_sensors_in_hardware: bool = True


@dataclass
class WeatherInputs:
    """Environmental and electrical sensor context for decision evaluation."""

    humidity_pct: Optional[float]
    rain_detected: Optional[bool]
    ambient_temp_c: Optional[float]
    panel_temp_c: float
    cooling_temp_c: float
    ldr_pct: Optional[float]
    power_w: float
    reference_power_w: float = 4.5
    dht22_connected: bool = False
    rain_sensor_connected: bool = False
    ldr_connected: bool = False
    is_simulated: bool = True


@dataclass
class PanelWeatherDecision:
    """Per-panel decision report covering atmospheric state, eligibility, and selected zones."""

    panel_id: int
    zone_percentages: List[float]
    atmospheric_condition: str
    dust_condition: str
    humidity_status: str
    rain_status: str
    panel_temp_status: str
    passive_cooling_active: bool
    recommended_action: str
    cleaning_eligible: bool
    selected_zones: List[bool]
    zone_command: str
    reason: str
    condition_code: str


def evaluate_panel_weather_decision(
    panel_id: int,
    zone_percentages: List[float],
    weather: WeatherInputs,
    config: Optional[WeatherDecisionConfig] = None,
    emergency_stop: bool = False,
) -> PanelWeatherDecision:
    """
    Evaluate all 8 weather-based conditions with strict safety & energy priorities:
      1. Emergency stop -> disabled.
      2. Missing critical weather sensors in hardware mode -> unsafe to clean blindly.
      3. Rain detected -> EDS disabled (wait until dry).
      4. High humidity (> max_humidity_pct) -> EDS disabled (prevent arcing/caking).
      5. No significant dust -> no cleaning (rely on passive PCM cooling if hot).
      6. Light dust + insignificant power loss -> monitor only.
      7. Critical/dusty zones + dry conditions -> clean affected zones.
      8. Passive PCM cooling operates independently of cleaning decisions.
    """
    if len(zone_percentages) != 4:
        raise ValueError(f"Expected 4 zone percentages for Panel {panel_id}, got {len(zone_percentages)}.")

    cfg = config or WeatherDecisionConfig()
    pcts = [max(0.0, min(100.0, float(p))) for p in zone_percentages]
    max_dust = max(pcts)
    avg_dust = sum(pcts) / 4.0

    is_hot = weather.panel_temp_c >= cfg.panel_temp_threshold_c
    passive_cooling_active = is_hot
    temp_status = f"{'Hot' if is_hot else 'Normal'} ({weather.panel_temp_c:.1f} °C)"

    power_loss_pct = (
        max(0.0, ((weather.reference_power_w - weather.power_w) / weather.reference_power_w) * 100.0)
        if weather.reference_power_w > 0
        else 0.0
    )

    # Sensor status reporting (never claim humidity or rain was measured if sensor missing)
    if weather.dht22_connected and weather.humidity_pct is not None:
        hum_high = weather.humidity_pct > cfg.max_humidity_pct
        humidity_status = f"{'High' if hum_high else 'Acceptable'} ({weather.humidity_pct:.1f}%)"
    else:
        hum_high = False
        humidity_status = "DHT22 Disconnected (Unmeasured)"

    if weather.rain_sensor_connected and weather.rain_detected is not None:
        raining = bool(weather.rain_detected)
        rain_status = "Rain Detected" if raining else "Dry (No Rain)"
    else:
        raining = False
        rain_status = "Rain Sensor Disconnected (Unmeasured)"

    if max_dust <= cfg.min_dust_for_cleaning_pct:
        dust_condition = f"Clean (Max {max_dust:.1f}%)"
    elif max_dust <= cfg.critical_dust_pct:
        dust_condition = f"Light/Moderate Dust (Max {max_dust:.1f}%)"
    else:
        dust_condition = f"Very Dusty / Critical (Max {max_dust:.1f}%)"

    # Priority 0: Emergency Stop
    if emergency_stop:
        return PanelWeatherDecision(
            panel_id=panel_id,
            zone_percentages=pcts,
            atmospheric_condition="Safety Lockout",
            dust_condition=dust_condition,
            humidity_status=humidity_status,
            rain_status=rain_status,
            panel_temp_status=temp_status,
            passive_cooling_active=passive_cooling_active,
            recommended_action="System halted (Emergency Stop active)",
            cleaning_eligible=False,
            selected_zones=[False, False, False, False],
            zone_command="ZONE:0000",
            reason=f"Panel {panel_id}: Cleaning disabled. Emergency Stop is engaged.",
            condition_code="ESTOP_LOCK",
        )

    # Priority 1: Missing hardware environmental sensors when not in simulation
    if (
        not weather.is_simulated
        and cfg.require_weather_sensors_in_hardware
        and (not weather.dht22_connected or not weather.rain_sensor_connected)
    ):
        return PanelWeatherDecision(
            panel_id=panel_id,
            zone_percentages=pcts,
            atmospheric_condition="Sensors Unavailable",
            dust_condition=dust_condition,
            humidity_status=humidity_status,
            rain_status=rain_status,
            panel_temp_status=temp_status,
            passive_cooling_active=passive_cooling_active,
            recommended_action="Wait — connect DHT22 and Rain sensor for safe weather gating",
            cleaning_eligible=False,
            selected_zones=[False, False, False, False],
            zone_command="ZONE:0000",
            reason=f"Panel {panel_id}: Cleaning disabled for safety. Missing DHT22 or Rain sensor telemetry.",
            condition_code="SENSOR_MISSING",
        )

    # Condition 5: Rain detected -> Suspend EDS cleaning
    if raining:
        return PanelWeatherDecision(
            panel_id=panel_id,
            zone_percentages=pcts,
            atmospheric_condition="Rainy / Wet",
            dust_condition=dust_condition,
            humidity_status=humidity_status,
            rain_status=rain_status,
            panel_temp_status=temp_status,
            passive_cooling_active=passive_cooling_active,
            recommended_action="Suspend EDS cleaning; wait until panel dries",
            cleaning_eligible=False,
            selected_zones=[False, False, False, False],
            zone_command="ZONE:0000",
            reason=f"Panel {panel_id}: Cleaning suspended. Rain detected on surface.",
            condition_code="COND_5_RAIN",
        )

    # Condition 6: High humidity / fog / dew -> Suspend EDS cleaning
    if hum_high:
        return PanelWeatherDecision(
            panel_id=panel_id,
            zone_percentages=pcts,
            atmospheric_condition="High Humidity / Fog / Dew",
            dust_condition=dust_condition,
            humidity_status=humidity_status,
            rain_status=rain_status,
            panel_temp_status=temp_status,
            passive_cooling_active=passive_cooling_active,
            recommended_action=f"Postpone EDS cleaning until RH <= {cfg.max_humidity_pct:.0f}%",
            cleaning_eligible=False,
            selected_zones=[False, False, False, False],
            zone_command="ZONE:0000",
            reason=f"Panel {panel_id}: Cleaning postponed. Humidity ({weather.humidity_pct:.1f}%) exceeds {cfg.max_humidity_pct:.0f}% threshold.",
            condition_code="COND_6_HIGH_HUMIDITY",
        )

    # Low light check (night / heavy shadow) when LDR is connected
    if weather.ldr_connected and weather.ldr_pct is not None and weather.ldr_pct < cfg.min_light_intensity_pct:
        if max_dust <= cfg.critical_dust_pct:
            return PanelWeatherDecision(
                panel_id=panel_id,
                zone_percentages=pcts,
                atmospheric_condition="Low Irradiance / Night",
                dust_condition=dust_condition,
                humidity_status=humidity_status,
                rain_status=rain_status,
                panel_temp_status=temp_status,
                passive_cooling_active=passive_cooling_active,
                recommended_action="Monitor only (low light intensity)",
                cleaning_eligible=False,
                selected_zones=[False, False, False, False],
                zone_command="ZONE:0000",
                reason=f"Panel {panel_id}: Monitoring only. Light intensity ({weather.ldr_pct:.0f}%) is below {cfg.min_light_intensity_pct:.0f}%.",
                condition_code="LOW_LIGHT_MONITOR",
            )

    # Condition 3 & 4: Clean surface (no significant dust)
    if max_dust <= cfg.min_dust_for_cleaning_pct:
        if is_hot:
            return PanelWeatherDecision(
                panel_id=panel_id,
                zone_percentages=pcts,
                atmospheric_condition="Dry & Hot",
                dust_condition=dust_condition,
                humidity_status=humidity_status,
                rain_status=rain_status,
                panel_temp_status=temp_status,
                passive_cooling_active=True,
                recommended_action="Do not clean; rely on passive PCM cooling",
                cleaning_eligible=False,
                selected_zones=[False, False, False, False],
                zone_command="ZONE:0000",
                reason=f"Panel {panel_id}: No cleaning required. Dust is below threshold; passive PCM cooling handles thermal load.",
                condition_code="COND_3_DRY_CLEAN_HOT",
            )
        return PanelWeatherDecision(
            panel_id=panel_id,
            zone_percentages=pcts,
            atmospheric_condition="Dry & Mild",
            dust_condition=dust_condition,
            humidity_status=humidity_status,
            rain_status=rain_status,
            panel_temp_status=temp_status,
            passive_cooling_active=False,
            recommended_action="Idle mode (save energy)",
            cleaning_eligible=False,
            selected_zones=[False, False, False, False],
            zone_command="ZONE:0000",
            reason=f"Panel {panel_id}: No cleaning required. Dust coverage is below the threshold.",
            condition_code="COND_4_DRY_CLEAN_MILD",
        )

    # Condition 7: Light/moderate dust AND insignificant power loss -> Monitor without wasting energy
    if max_dust <= cfg.critical_dust_pct and power_loss_pct < cfg.min_power_loss_pct:
        return PanelWeatherDecision(
            panel_id=panel_id,
            zone_percentages=pcts,
            atmospheric_condition="Dry",
            dust_condition=dust_condition,
            humidity_status=humidity_status,
            rain_status=rain_status,
            panel_temp_status=temp_status,
            passive_cooling_active=passive_cooling_active,
            recommended_action="Continue monitoring (insignificant power loss)",
            cleaning_eligible=False,
            selected_zones=[False, False, False, False],
            zone_command="ZONE:0000",
            reason=(
                f"Panel {panel_id}: Monitoring only. Light dust (avg {avg_dust:.1f}%) with only "
                f"{power_loss_pct:.1f}% power loss (< {cfg.min_power_loss_pct:.0f}% trigger)."
            ),
            condition_code="COND_7_LIGHT_DUST_MONITOR",
        )

    # Conditions 1, 2, & 8: Dusty + Dry & Acceptable Humidity -> Selective Cleaning Permitted
    selected = [p > cfg.critical_dust_pct or (p > cfg.min_dust_for_cleaning_pct and power_loss_pct >= cfg.min_power_loss_pct) for p in pcts]
    if not any(selected):
        selected = [p > cfg.min_dust_for_cleaning_pct for p in pcts]

    zone_names = [str(i + 1) for i, flag in enumerate(selected) if flag]
    zone_mask = "".join("1" if flag else "0" for flag in selected)
    zone_str = ", ".join(zone_names)

    if max_dust > cfg.critical_dust_pct and power_loss_pct >= cfg.min_power_loss_pct:
        cond_code = "COND_8_VERY_DUSTY_PRIORITY"
        atmo = "Dry (Priority Soiling)"
        action = f"Priority selective clean: Zones {zone_str} + reassess after cleaning"
    elif is_hot:
        cond_code = "COND_1_DRY_DUSTY_HOT"
        atmo = "Dry & Hot"
        action = f"Clean Zones {zone_str}; passive PCM cooling active"
    else:
        cond_code = "COND_2_DRY_DUSTY_MILD"
        atmo = "Dry & Mild"
        action = f"Clean dusty Zones {zone_str}"

    return PanelWeatherDecision(
        panel_id=panel_id,
        zone_percentages=pcts,
        atmospheric_condition=atmo,
        dust_condition=dust_condition,
        humidity_status=humidity_status,
        rain_status=rain_status,
        panel_temp_status=temp_status,
        passive_cooling_active=passive_cooling_active,
        recommended_action=action,
        cleaning_eligible=True,
        selected_zones=selected,
        zone_command=f"ZONE:{zone_mask}",
        reason=f"Panel {panel_id}: Cleaning permitted. Zones {zone_str} are dusty, humidity is acceptable, and no rain is detected.",
        condition_code=cond_code,
    )
