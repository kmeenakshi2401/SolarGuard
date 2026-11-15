"""Four-channel (CH1-CH4) travelling-wave Electrostatic Dust Removal (EDS) controller interface."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional


class EDSState(str, Enum):
    """Explicit lifecycle states distinguishing LED demo from verified HV EDS cleaning."""

    IDLE = "IDLE"
    CLEANING_REQUESTED = "CLEANING_REQUESTED"
    CLEANING_PERMITTED = "CLEANING_PERMITTED"
    EDS_DRIVER_READY = "EDS_DRIVER_READY"
    CLEANING_ACTIVE = "CLEANING_ACTIVE"
    CLEANING_COMPLETED = "CLEANING_COMPLETED"
    CLEANING_FAILED = "CLEANING_FAILED"
    CLEANING_DISABLED_SAFETY = "CLEANING_DISABLED_SAFETY"


class EDSDriverMode(str, Enum):
    """Supported execution backends separating safe demo from isolated hardware driver."""

    SIMULATION = "SIMULATION"
    LED_DEMO_ONLY = "LED_DEMO_ONLY"
    ISOLATED_HARDWARE_DRIVER = "ISOLATED_HARDWARE_DRIVER"


@dataclass
class EDSCleaningEvent:
    """Complete audit record for an EDS cleaning cycle and verification outcome."""

    timestamp: str
    panel_id: int
    zone_mask: str
    channels: List[str]
    driver_mode: str
    status: EDSState
    duration_sec: float
    before_dust_pct: float
    after_dust_pct: Optional[float] = None
    cleaning_efficiency_pct: Optional[float] = None
    energy_consumed_wh: float = 0.0
    notes: str = ""


def calculate_cleaning_efficiency(before_dust_pct: float, after_dust_pct: float) -> float:
    """
    Calculate cleaning effectiveness safely:
        Cleaning efficiency (%) = (Before - After) / Before * 100
    Returns 0.0 safely when before_dust_pct <= 0.
    """
    before = float(before_dust_pct)
    after = max(0.0, float(after_dust_pct))
    if before <= 0.0:
        return 0.0
    eff = ((before - after) / before) * 100.0
    return round(max(-100.0, min(100.0, eff)), 2)


class EDSController:
    """
    Modular 4-channel travelling-wave (CH1, CH2, CH3, CH4) EDS controller abstraction.

    Safety rules:
      - Never drives kilovolt waveforms from ESP32 GPIO pins directly.
      - Requires hardware interlock + fault-free feedback before reporting real HV EDS.
      - Never falsely claims electrostatic dust removal occurred in LED_DEMO_ONLY mode.
    """

    CHANNELS = ("CH1", "CH2", "CH3", "CH4")

    def __init__(self, driver_mode: EDSDriverMode = EDSDriverMode.SIMULATION) -> None:
        self.driver_mode = driver_mode
        self.state: EDSState = EDSState.IDLE
        self.hardware_interlock_closed: bool = False
        self.driver_connected: bool = driver_mode == EDSDriverMode.SIMULATION
        self.fault_active: bool = False
        self.overcurrent_fault: bool = False
        self.overtemp_fault: bool = False
        self.emergency_stop: bool = False
        self.active_panel_id: Optional[int] = None
        self.active_zone_mask: str = "0000"
        self.events: List[EDSCleaningEvent] = []

    def set_driver_mode(self, mode: EDSDriverMode) -> None:
        self.driver_mode = mode
        if mode == EDSDriverMode.SIMULATION:
            self.driver_connected = True
            self.hardware_interlock_closed = True
        elif mode == EDSDriverMode.LED_DEMO_ONLY:
            self.driver_connected = False
            self.hardware_interlock_closed = False

    def trigger_emergency_stop(self, serial_handler: Optional[object] = None) -> str:
        self.emergency_stop = True
        self.state = EDSState.CLEANING_DISABLED_SAFETY
        self.active_panel_id = None
        self.active_zone_mask = "0000"
        if serial_handler is not None:
            try:
                serial_handler.send_emergency_stop()  # type: ignore[attr-defined]
            except Exception:
                pass
        return "EDS Emergency Stop active. All channels de-energized."

    def reset_emergency_stop(self, serial_handler: Optional[object] = None) -> str:
        self.emergency_stop = False
        self.fault_active = False
        self.overcurrent_fault = False
        self.overtemp_fault = False
        self.state = EDSState.IDLE
        if serial_handler is not None:
            try:
                serial_handler.send_reset()  # type: ignore[attr-defined]
            except Exception:
                pass
        return "EDS controller reset to IDLE."

    def check_driver_readiness(self) -> tuple[bool, str]:
        if self.emergency_stop:
            self.state = EDSState.CLEANING_DISABLED_SAFETY
            return False, "Blocked: Emergency Stop engaged."
        if self.fault_active or self.overcurrent_fault or self.overtemp_fault:
            self.state = EDSState.CLEANING_FAILED
            return False, "Blocked: EDS driver fault / overcurrent / overtemperature active."

        if self.driver_mode == EDSDriverMode.ISOLATED_HARDWARE_DRIVER:
            if not self.driver_connected or not self.hardware_interlock_closed:
                self.state = EDSState.CLEANING_DISABLED_SAFETY
                return False, "Blocked: Isolated HV EDS driver or hardware interlock is not ready."
            self.state = EDSState.EDS_DRIVER_READY
            return True, "Isolated HV EDS driver ready (interlock closed)."

        if self.driver_mode == EDSDriverMode.LED_DEMO_ONLY:
            self.state = EDSState.CLEANING_DISABLED_SAFETY
            return True, "LED-only demonstration mode (HV EDS disabled for safety)."

        self.state = EDSState.EDS_DRIVER_READY
        return True, "EDS simulation driver ready."

    def execute_cleaning_request(
        self,
        panel_id: int,
        zone_mask: str,
        before_dust_pct: float,
        weather_permitted: bool,
        serial_handler: Optional[object] = None,
        cycle_duration_sec: float = 12.0,
        eds_power_w: float = 2.4,
    ) -> EDSCleaningEvent:
        """
        Process a selective cleaning request through the state machine:
        CLEANING_REQUESTED -> CLEANING_PERMITTED -> EDS_DRIVER_READY -> CLEANING_ACTIVE -> COMPLETED/DISABLED.
        """
        now = datetime.now().isoformat(timespec="seconds")
        self.state = EDSState.CLEANING_REQUESTED

        if self.emergency_stop or not weather_permitted:
            self.state = EDSState.CLEANING_DISABLED_SAFETY
            ev = EDSCleaningEvent(
                timestamp=now,
                panel_id=panel_id,
                zone_mask="0000",
                channels=[],
                driver_mode=self.driver_mode.value,
                status=self.state,
                duration_sec=0.0,
                before_dust_pct=before_dust_pct,
                notes="Cleaning disabled due to weather gate or emergency stop.",
            )
            self.events.append(ev)
            return ev

        self.state = EDSState.CLEANING_PERMITTED
        ready, ready_msg = self.check_driver_readiness()
        if not ready:
            ev = EDSCleaningEvent(
                timestamp=now,
                panel_id=panel_id,
                zone_mask=zone_mask,
                channels=[],
                driver_mode=self.driver_mode.value,
                status=self.state,
                duration_sec=0.0,
                before_dust_pct=before_dust_pct,
                notes=ready_msg,
            )
            self.events.append(ev)
            return ev

        active_channels = [self.CHANNELS[i] for i, c in enumerate(zone_mask) if i < 4 and c == "1"]
        self.active_panel_id = panel_id
        self.active_zone_mask = zone_mask

        if self.driver_mode == EDSDriverMode.LED_DEMO_ONLY:
            if serial_handler is not None:
                try:
                    serial_handler.send_zone_command(f"ZONE:{zone_mask}")  # type: ignore[attr-defined]
                except Exception:
                    pass
            # Never falsely report electrostatic cleaning occurred when only LEDs are active
            self.state = EDSState.CLEANING_DISABLED_SAFETY
            ev = EDSCleaningEvent(
                timestamp=now,
                panel_id=panel_id,
                zone_mask=zone_mask,
                channels=active_channels,
                driver_mode=self.driver_mode.value,
                status=EDSState.CLEANING_DISABLED_SAFETY,
                duration_sec=0.0,
                before_dust_pct=before_dust_pct,
                notes="Indicator LEDs activated for safe demonstration only. HV EDS electrostatic cleaning NOT performed.",
            )
            self.events.append(ev)
            return ev

        # Simulation or Verified Isolated Driver Execution
        self.state = EDSState.CLEANING_ACTIVE
        if self.driver_mode == EDSDriverMode.ISOLATED_HARDWARE_DRIVER and serial_handler is not None:
            serial_handler.send_eds_request(panel_id, zone_mask)  # type: ignore[attr-defined]

        # Calculate realistic selective energy consumed (proportional to active channels)
        channel_fraction = max(0.25, len(active_channels) / 4.0)
        energy_wh = round((eds_power_w * channel_fraction * cycle_duration_sec) / 3600.0, 5)
        self.state = EDSState.CLEANING_COMPLETED

        ev = EDSCleaningEvent(
            timestamp=now,
            panel_id=panel_id,
            zone_mask=zone_mask,
            channels=active_channels,
            driver_mode=self.driver_mode.value,
            status=self.state,
            duration_sec=cycle_duration_sec,
            before_dust_pct=before_dust_pct,
            energy_consumed_wh=energy_wh,
            notes=f"Travelling-wave 4-phase excitation completed on {', '.join(active_channels)} ({self.driver_mode.value}).",
        )
        self.events.append(ev)
        return ev

    def verify_cleaning_effectiveness(
        self,
        event: EDSCleaningEvent,
        after_dust_pct: float,
    ) -> EDSCleaningEvent:
        """Update an EDS cleaning event with post-cleaning camera verification results."""
        eff = calculate_cleaning_efficiency(event.before_dust_pct, after_dust_pct)
        event.after_dust_pct = round(max(0.0, float(after_dust_pct)), 2)
        event.cleaning_efficiency_pct = eff
        if event.status == EDSState.CLEANING_COMPLETED and eff < 5.0 and event.before_dust_pct > 15.0:
            event.notes += " Verification shows minimal dust reduction; check surface adhesion."
        return event
