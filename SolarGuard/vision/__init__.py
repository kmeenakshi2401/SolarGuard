"""SolarGuard computer vision package."""

from .camera import CameraManager
from .dust_detection import DustDetectionConfig, compute_dust_difference_map, align_and_normalize_images
from .panel_detector import BasePanelDetector, ContourPanelDetector, DetectedPanel, PanelTracker, compute_iou
from .zone_analysis import (
    MultiPanelAnalysisResult,
    PanelZoneAnalysis,
    ZoneAnalysisResult,
    ZoneMetrics,
    analyze_four_zones,
    analyze_multi_panel_frame,
    classify_dust_level,
)

__all__ = [
    "CameraManager",
    "DustDetectionConfig",
    "compute_dust_difference_map",
    "align_and_normalize_images",
    "BasePanelDetector",
    "ContourPanelDetector",
    "DetectedPanel",
    "PanelTracker",
    "compute_iou",
    "MultiPanelAnalysisResult",
    "PanelZoneAnalysis",
    "ZoneAnalysisResult",
    "ZoneMetrics",
    "analyze_four_zones",
    "analyze_multi_panel_frame",
    "classify_dust_level",
]
