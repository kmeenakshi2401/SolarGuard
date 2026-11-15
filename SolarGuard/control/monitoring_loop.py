"""Continuous autonomous camera + sensor monitoring loop with anti-flap safeguards."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Callable, Dict, List, Optional

from .eds_controller import EDSController, EDSState
from .weather_decision import (
    PanelWeatherDecision,
    WeatherDecisionConfig,
    WeatherInputs,
    evaluate_panel_weather_decision,
)


class MonitorState(str, Enum):
    STOPPED = "STOPPED"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    FAULT_RECOVERY = "FAULT_RECOVERY"


@dataclass
class MonitorConfig:
    """Configurable timing, persistence, hysteresis, and cooldown parameters."""

    interval_seconds: float = 2.0
    min_persistence_frames: int = 3
    cooldown_seconds: float = 120.0
    hysteresis_clear_pct: float = 18.0
    max_cleaning_attempts_per_session: int = 5
    auto_cleaning_enabled: bool = True


@dataclass
class PanelMonitorTracker:
    """Per-panel anti-flap state preventing repeated false-positive cleaning triggers."""

    panel_id: int
    consecutive_dusty_frames: int = 0
    last_clean_timestamp: float = 0.0
    cleaning_attempts: int = 0
    active_request_in_flight: bool = False
    last_before_dust_pct: Optional[float] = None
    last_after_dust_pct: Optional[float] = None
    last_efficiency_pct: Optional[float] = None


class ContinuousMonitorService:
    """
    Thread-safe background worker orchestrating:
      Capture -> Multi-Panel Detection -> 4-Zone Dust -> Weather Decision
      -> Persistent Trigger Check -> EDS Controller -> Verification -> CSV Log.

    Owns at most one CameraManager and one SerialHandler reference to prevent
    duplicate camera/COM port contention.
    """

    def __init__(
        self,
        eds_controller: EDSController,
        weather_config: Optional[WeatherDecisionConfig] = None,
        monitor_config: Optional[MonitorConfig] = None,
    ) -> None:
        self.eds_controller = eds_controller
        self.weather_config = weather_config or WeatherDecisionConfig()
        self.monitor_config = monitor_config or MonitorConfig()

        self.state: MonitorState = MonitorState.STOPPED
        self.camera_connected: bool = False
        self.serial_connected: bool = False
        self.last_error: Optional[str] = None
        self.cycle_count: int = 0
        self.latest_decisions: Dict[int, PanelWeatherDecision] = {}
        self.panel_trackers: Dict[int, PanelMonitorTracker] = {}
        self.event_log: List[str] = []

        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def _log(self, message: str) -> None:
        stamp = datetime.now().strftime("%H:%M:%S")
        self.event_log.insert(0, f"[{stamp}] {message}")
        self.event_log = self.event_log[:100]

    def evaluate_panel_cycle(
        self,
        panel_id: int,
        zone_percentages: List[float],
        weather: WeatherInputs,
        now_epoch: Optional[float] = None,
        serial_handler: Optional[object] = None,
    ) -> PanelWeatherDecision:
        """
        Execute one deterministic monitoring + anti-flap decision step for a single panel.
        Callable both from the background worker and directly in synchronous tests/UI ticks.
        """
        now_ts = now_epoch if now_epoch is not None else time.time()
        with self._lock:
            tracker = self.panel_trackers.setdefault(panel_id, PanelMonitorTracker(panel_id=panel_id))
            decision = evaluate_panel_weather_decision(
                panel_id=panel_id,
                zone_percentages=zone_percentages,
                weather=weather,
                config=self.weather_config,
                emergency_stop=self.eds_controller.emergency_stop,
            )
            self.latest_decisions[panel_id] = decision
            avg_dust = sum(zone_percentages) / 4.0
            max_dust = max(zone_percentages)

            # Hysteresis: reset persistence counter only once dust drops below clear threshold
            if max_dust <= self.monitor_config.hysteresis_clear_pct:
                tracker.consecutive_dusty_frames = 0
            elif any(decision.selected_zones) or max_dust > self.weather_config.critical_dust_pct:
                tracker.consecutive_dusty_frames += 1

            # Check autonomous trigger conditions
            cooldown_elapsed = (now_ts - tracker.last_clean_timestamp) >= self.monitor_config.cooldown_seconds
            persistence_met = tracker.consecutive_dusty_frames >= self.monitor_config.min_persistence_frames
            under_attempt_cap = tracker.cleaning_attempts < self.monitor_config.max_cleaning_attempts_per_session

            if (
                self.monitor_config.auto_cleaning_enabled
                and decision.cleaning_eligible
                and any(decision.selected_zones)
                and not tracker.active_request_in_flight
                and persistence_met
                and cooldown_elapsed
                and under_attempt_cap
            ):
                tracker.active_request_in_flight = True
                tracker.last_before_dust_pct = round(avg_dust, 2)
                tracker.cleaning_attempts += 1
                tracker.last_clean_timestamp = now_ts
                tracker.consecutive_dusty_frames = 0

                event = self.eds_controller.execute_cleaning_request(
                    panel_id=panel_id,
                    zone_mask=decision.zone_command.replace("ZONE:", ""),
                    before_dust_pct=avg_dust,
                    weather_permitted=decision.cleaning_eligible,
                    serial_handler=serial_handler,
                )
                self._log(
                    f"Auto-triggered Panel {panel_id} ({decision.zone_command}) -> {event.status.value}: {event.notes}"
                )
                tracker.active_request_in_flight = False
            elif decision.cleaning_eligible and any(decision.selected_zones):
                if not persistence_met:
                    self._log(
                        f"Panel {panel_id}: Dust detected ({tracker.consecutive_dusty_frames}/{self.monitor_config.min_persistence_frames} frames); confirming persistence."
                    )
                elif not cooldown_elapsed:
                    remaining = int(self.monitor_config.cooldown_seconds - (now_ts - tracker.last_clean_timestamp))
                    self._log(f"Panel {panel_id}: Cleaning suppressed by cooldown ({remaining}s remaining).")
                elif not under_attempt_cap:
                    self._log(f"Panel {panel_id}: Max session cleaning attempts ({self.monitor_config.max_cleaning_attempts_per_session}) reached.")

            return decision

    def verify_post_cleaning(self, panel_id: int, after_zone_percentages: List[float]) -> Optional[float]:
        """Compare latest post-cleaning dust measurement against the pre-cleaning baseline."""
        after_avg = round(sum(after_zone_percentages) / 4.0, 2)
        with self._lock:
            tracker = self.panel_trackers.get(panel_id)
            matching_events = [e for e in self.eds_controller.events if e.panel_id == panel_id]
            if not matching_events:
                return None
            latest_event = matching_events[-1]
            self.eds_controller.verify_cleaning_effectiveness(latest_event, after_avg)
            if tracker is not None:
                tracker.last_after_dust_pct = after_avg
                tracker.last_efficiency_pct = latest_event.cleaning_efficiency_pct
            self._log(
                f"Panel {panel_id} verification: Before {latest_event.before_dust_pct:.1f}% -> "
                f"After {after_avg:.1f}% (Efficiency {latest_event.cleaning_efficiency_pct:.1f}%)"
            )
            return latest_event.cleaning_efficiency_pct

    def start_background_loop(self, step_callback: Callable[[], None]) -> bool:
        """Start background monitoring thread safely without spawning duplicates."""
        if self._thread is not None and self._thread.is_alive():
            if self.state == MonitorState.PAUSED:
                self.resume()
            return False

        self._stop_event.clear()
        self.state = MonitorState.RUNNING
        self._log("Continuous monitoring started.")

        def _worker() -> None:
            while not self._stop_event.is_set():
                if self.state == MonitorState.RUNNING:
                    try:
                        step_callback()
                        self.cycle_count += 1
                        self.last_error = None
                    except Exception as exc:
                        self.last_error = f"Monitor cycle error: {exc}"
                        self.state = MonitorState.FAULT_RECOVERY
                        self._log(f"Fault recovery triggered: {exc}")
                elif self.state == MonitorState.FAULT_RECOVERY:
                    try:
                        step_callback()
                        self.state = MonitorState.RUNNING
                        self.last_error = None
                        self._log("Recovered from transient fault; monitoring resumed.")
                    except Exception:
                        pass
                self._stop_event.wait(timeout=max(0.25, self.monitor_config.interval_seconds))

        self._thread = threading.Thread(target=_worker, name="SolarGuardMonitorThread", daemon=True)
        self._thread.start()
        return True

    def pause(self) -> None:
        if self.state in (MonitorState.RUNNING, MonitorState.FAULT_RECOVERY):
            self.state = MonitorState.PAUSED
            self._log("Continuous monitoring paused.")

    def resume(self) -> None:
        if self.state == MonitorState.PAUSED:
            self.state = MonitorState.RUNNING
            self._log("Continuous monitoring resumed.")

    def stop(self) -> None:
        self._stop_event.set()
        self.state = MonitorState.STOPPED
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self._thread = None
        self._log("Continuous monitoring stopped.")
