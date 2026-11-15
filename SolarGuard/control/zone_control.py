"""Zone indicator controller, cleaning activity log, and hardware safety interlock."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Tuple

from .cleaning_logic import CleaningDecision, evaluate_cleaning_decision


@dataclass
class CleaningLogEntry:
    """Single logged cleaning request or safety event."""

    timestamp: str
    command: str
    zone_mask: str
    status: str
    mode: str
    target_driver: str
    notes: str = ""


class ZoneController:
    """
    Coordinates zone selection commands, ESP32 LED dispatch, and emergency stop state.

    Safety Policy:
        High-voltage EDS electrode control is intentionally disabled. Commands drive
        low-voltage indicator LEDs only until an approved isolated driver, documented
        interface, independent hardware interlocks, and qualified safety validation exist.
    """

    EDS_HIGH_VOLTAGE_ENABLED = False  # Hard safety lock: LEDs only

    def __init__(self, threshold_pct: float = 25.0) -> None:
        self.threshold_pct = threshold_pct
        self.emergency_stop_active = False
        self.active_zones: List[bool] = [False, False, False, False]
        self.cleaning_status: str = "IDLE"
        self.logs: List[CleaningLogEntry] = []

    def update_threshold(self, threshold_pct: float) -> None:
        self.threshold_pct = max(1.0, min(95.0, float(threshold_pct)))

    def compute_decision(
        self,
        zone_percentages: List[float],
        manual_override: Optional[List[bool]] = None,
    ) -> CleaningDecision:
        return evaluate_cleaning_decision(
            zone_percentages=zone_percentages,
            threshold_pct=self.threshold_pct,
            manual_override=manual_override,
            emergency_stop=self.emergency_stop_active,
        )

    def dispatch_command(
        self,
        decision: CleaningDecision,
        serial_handler: Optional[object] = None,
        mode: str = "SIMULATION",
    ) -> Tuple[bool, str]:
        """Dispatch ZONE:XXXX command to ESP32 LEDs (Hardware) or virtual LED state (Simulation)."""
        now = datetime.now().isoformat(timespec="seconds")

        if self.emergency_stop_active:
            self.active_zones = [False, False, False, False]
            self.cleaning_status = "EMERGENCY_STOP"
            return False, "Blocked: Emergency Stop is active. Reset controller before sending commands."

        if self.EDS_HIGH_VOLTAGE_ENABLED:
            raise RuntimeError("High-voltage EDS interlock violation.")

        self.active_zones = list(decision.selected_zones)
        active_indices = [str(i + 1) for i, flag in enumerate(self.active_zones) if flag]
        if active_indices:
            self.cleaning_status = f"ACTIVE_ZONES_{'_'.join(active_indices)}"
        else:
            self.cleaning_status = "IDLE"

        if mode.upper() == "HARDWARE" and serial_handler is not None:
            ok, msg = serial_handler.send_zone_command(decision.command)  # type: ignore[attr-defined]
            target = "ESP32_LED_ARRAY" if ok else "ESP32_DISCONNECTED"
            status_note = msg
        else:
            ok = True
            target = "SIMULATED_LED_ARRAY"
            status_note = f"Simulated LED command {decision.command} applied."

        self.logs.append(
            CleaningLogEntry(
                timestamp=now,
                command=decision.command,
                zone_mask=decision.zone_mask,
                status=self.cleaning_status if ok else "DISPATCH_ERROR",
                mode=mode.upper(),
                target_driver=target,
                notes=status_note,
            )
        )
        return ok, status_note

    def trigger_emergency_stop(
        self,
        serial_handler: Optional[object] = None,
        mode: str = "SIMULATION",
    ) -> str:
        """Immediately halt active zone indicators and lock controller."""
        self.emergency_stop_active = True
        self.active_zones = [False, False, False, False]
        self.cleaning_status = "EMERGENCY_STOP"

        note = "Emergency stop engaged. All zone LEDs forced OFF."
        if mode.upper() == "HARDWARE" and serial_handler is not None:
            ok, hw_msg = serial_handler.send_emergency_stop()  # type: ignore[attr-defined]
            note = f"{note} ({hw_msg})" if ok else f"{note} (Hardware warning: {hw_msg})"

        self.logs.append(
            CleaningLogEntry(
                timestamp=datetime.now().isoformat(timespec="seconds"),
                command="ESTOP",
                zone_mask="0000",
                status="EMERGENCY_STOP",
                mode=mode.upper(),
                target_driver="SAFETY_INTERLOCK",
                notes=note,
            )
        )
        return note

    def reset_emergency_stop(
        self,
        serial_handler: Optional[object] = None,
        mode: str = "SIMULATION",
    ) -> str:
        """Clear emergency stop lock and restore IDLE state with all LEDs OFF."""
        self.emergency_stop_active = False
        self.active_zones = [False, False, False, False]
        self.cleaning_status = "IDLE"

        note = "Emergency stop reset. System returned to safe IDLE state."
        if mode.upper() == "HARDWARE" and serial_handler is not None:
            ok, hw_msg = serial_handler.send_reset()  # type: ignore[attr-defined]
            note = f"{note} ({hw_msg})"

        self.logs.append(
            CleaningLogEntry(
                timestamp=datetime.now().isoformat(timespec="seconds"),
                command="RESET",
                zone_mask="0000",
                status="IDLE",
                mode=mode.upper(),
                target_driver="SAFETY_INTERLOCK",
                notes=note,
            )
        )
        return note
