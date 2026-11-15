"""SolarGuard intelligent cleaning, weather decision, EDS, and monitoring control package."""

from .cleaning_logic import CleaningDecision, evaluate_cleaning_decision, encode_zone_command
from .eds_controller import EDSCleaningEvent, EDSController, EDSDriverMode, EDSState, calculate_cleaning_efficiency
from .monitoring_loop import ContinuousMonitorService, MonitorConfig, MonitorState, PanelMonitorTracker
from .weather_decision import (
    PanelWeatherDecision,
    WeatherDecisionConfig,
    WeatherInputs,
    evaluate_panel_weather_decision,
)
from .zone_control import CleaningLogEntry, ZoneController

__all__ = [
    "CleaningDecision",
    "evaluate_cleaning_decision",
    "encode_zone_command",
    "CleaningLogEntry",
    "ZoneController",
    "EDSController",
    "EDSCleaningEvent",
    "EDSDriverMode",
    "EDSState",
    "calculate_cleaning_efficiency",
    "WeatherDecisionConfig",
    "WeatherInputs",
    "PanelWeatherDecision",
    "evaluate_panel_weather_decision",
    "ContinuousMonitorService",
    "MonitorConfig",
    "MonitorState",
    "PanelMonitorTracker",
]
