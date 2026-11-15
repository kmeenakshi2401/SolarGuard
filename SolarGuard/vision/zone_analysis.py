"""Four-zone segmentation, multi-panel dust classification, and overlay visualization."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from .dust_detection import DustDetectionConfig, compute_dust_difference_map
from .panel_detector import BasePanelDetector, ContourPanelDetector, DetectedPanel, PanelTracker

try:
    import cv2
    import numpy as np

    CV2_AVAILABLE = True
except ImportError:  # pragma: no cover
    cv2 = None  # type: ignore
    np = None  # type: ignore
    CV2_AVAILABLE = False


CLASS_CLEAN = "Clean"
CLASS_MODERATE = "Moderate dust"
CLASS_DUSTY = "Dusty - cleaning recommended"


@dataclass
class ZoneMetrics:
    """Dust estimation metrics for a single solar panel quadrant."""

    zone_id: int
    zone_name: str
    dust_percentage: float
    classification: str
    cleaning_recommended: bool
    bbox_region: Tuple[int, int, int, int]
    dust_bounding_boxes: List[Tuple[int, int, int, int]] = field(default_factory=list)


@dataclass
class ZoneAnalysisResult:
    """Four-zone visual dust estimation output for a single rectified panel."""

    zones: List[ZoneMetrics]
    overall_dust_percentage: float
    annotated_image: Any = None
    disclaimer: str = (
        "Visual image difference estimates apparent optical surface change relative to the "
        "clean reference image; it is not a direct physical mass measurement and can be "
        "affected by shadows, glare, or lighting changes."
    )

    def to_percentage_dict(self) -> Dict[int, float]:
        return {z.zone_id: z.dust_percentage for z in self.zones}


@dataclass
class PanelZoneAnalysis:
    """Per-panel localized 4-zone dust analysis produced after multi-panel detection."""

    panel_id: int
    bbox: Tuple[int, int, int, int]
    polygon: List[Tuple[int, int]]
    confidence: float
    partially_visible: bool
    detection_method: str
    zone_result: ZoneAnalysisResult

    @property
    def zone_percentages(self) -> List[float]:
        return [z.dust_percentage for z in self.zone_result.zones]

    @property
    def overall_dust_percentage(self) -> float:
        return self.zone_result.overall_dust_percentage


@dataclass
class MultiPanelAnalysisResult:
    """Full-frame multi-panel detection + per-panel 4-zone dust estimation output."""

    panels: List[PanelZoneAnalysis]
    annotated_frame: Any = None
    panels_detected_count: int = 0
    warning: Optional[str] = None


def classify_dust_level(
    dust_percentage: float,
    clean_max_pct: float = 10.0,
    moderate_max_pct: float = 25.0,
) -> str:
    """Classify zone dust level using configurable thresholds."""
    if dust_percentage <= clean_max_pct:
        return CLASS_CLEAN
    if dust_percentage <= moderate_max_pct:
        return CLASS_MODERATE
    return CLASS_DUSTY


def segment_four_zones_bounds(width: int, height: int) -> List[Tuple[int, str, Tuple[int, int, int, int]]]:
    """Return (zone_id, label, (x1, y1, x2, y2)) for 4 equal quadrants of a panel."""
    if width <= 1 or height <= 1:
        raise ValueError("Panel dimensions must be greater than 1x1.")
    mid_x = width // 2
    mid_y = height // 2
    return [
        (1, "Zone 1 (Top-Left)", (0, 0, mid_x, mid_y)),
        (2, "Zone 2 (Top-Right)", (mid_x, 0, width, mid_y)),
        (3, "Zone 3 (Bottom-Left)", (0, mid_y, mid_x, height)),
        (4, "Zone 4 (Bottom-Right)", (mid_x, mid_y, width, height)),
    ]


def analyze_mask_four_zones(
    dust_mask: Any,
    config: DustDetectionConfig | None = None,
    base_image: Any = None,
) -> ZoneAnalysisResult:
    """Compute 4-zone dust percentages and classifications from a panel's binary mask."""
    cfg = config or DustDetectionConfig()
    height, width = dust_mask.shape[:2]
    quadrants = segment_four_zones_bounds(width, height)

    annotated = base_image.copy() if base_image is not None else None
    zones: List[ZoneMetrics] = []

    for zone_id, zone_name, (x1, y1, x2, y2) in quadrants:
        zone_slice = dust_mask[y1:y2, x1:x2]
        total_pixels = int(zone_slice.size)
        dirty_pixels = int((zone_slice > 0).sum()) if hasattr(zone_slice, "sum") else 0
        pct = round((dirty_pixels / total_pixels) * 100.0, 2) if total_pixels > 0 else 0.0
        classification = classify_dust_level(pct, cfg.clean_max_pct, cfg.moderate_max_pct)
        cleaning_rec = pct > cfg.moderate_max_pct

        dust_boxes: List[Tuple[int, int, int, int]] = []
        if CV2_AVAILABLE:
            contours, _ = cv2.findContours(zone_slice, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in contours:
                if cv2.contourArea(cnt) >= 40:
                    bx, by, bw, bh = cv2.boundingRect(cnt)
                    dust_boxes.append((x1 + bx, y1 + by, bw, bh))

        if annotated is not None and CV2_AVAILABLE:
            if classification == CLASS_CLEAN:
                color = (60, 190, 90)
            elif classification == CLASS_MODERATE:
                color = (30, 180, 245)
            else:
                color = (68, 68, 239)

            for (gx, gy, gw, gh) in dust_boxes:
                cv2.rectangle(annotated, (gx, gy), (gx + gw, gy + gh), color, 2)

            cv2.rectangle(annotated, (x1, y1), (x2 - 1, y2 - 1), (180, 195, 220), 1)
            label = f"Z{zone_id}: {pct:.1f}%"
            cv2.rectangle(annotated, (x1 + 4, y1 + 4), (x1 + 115, y1 + 24), (15, 23, 42), -1)
            cv2.putText(
                annotated,
                label,
                (x1 + 8, y1 + 19),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                color,
                1,
                cv2.LINE_AA,
            )

        zones.append(
            ZoneMetrics(
                zone_id=zone_id,
                zone_name=zone_name,
                dust_percentage=pct,
                classification=classification,
                cleaning_recommended=cleaning_rec,
                bbox_region=(x1, y1, x2, y2),
                dust_bounding_boxes=dust_boxes,
            )
        )

    overall_pct = round(sum(z.dust_percentage for z in zones) / len(zones), 2)
    return ZoneAnalysisResult(zones=zones, overall_dust_percentage=overall_pct, annotated_image=annotated)


def analyze_four_zones(
    reference_bgr: Any,
    current_bgr: Any,
    config: DustDetectionConfig | None = None,
) -> ZoneAnalysisResult:
    """Analyze a single rectified panel image against a clean reference panel image."""
    cfg = config or DustDetectionConfig()
    _, cur_norm, dust_mask, _ = compute_dust_difference_map(reference_bgr, current_bgr, cfg)
    return analyze_mask_four_zones(dust_mask=dust_mask, config=cfg, base_image=cur_norm)


def _draw_panel_overlay(
    canvas_bgr: Any,
    panel: DetectedPanel,
    zone_result: ZoneAnalysisResult,
    cfg: DustDetectionConfig,
) -> None:
    """Render panel bounding polygon, ID label, confidence, and 4 internal zone boundaries."""
    if not CV2_AVAILABLE:
        return

    x, y, w, h = panel.bbox
    max_pct = max(z.dust_percentage for z in zone_result.zones)
    if max_pct <= cfg.clean_max_pct:
        border_color = (60, 190, 90)
    elif max_pct <= cfg.moderate_max_pct:
        border_color = (30, 180, 245)
    else:
        border_color = (68, 68, 239)

    if len(panel.polygon) == 4:
        pts = np.array(panel.polygon, dtype=np.int32).reshape((-1, 1, 2))
        cv2.polylines(canvas_bgr, [pts], isClosed=True, color=border_color, thickness=2)
    else:
        cv2.rectangle(canvas_bgr, (x, y), (x + w, y + h), border_color, 2)

    # Internal 4-zone crosshair inside panel bounding region
    mid_x = x + w // 2
    mid_y = y + h // 2
    cv2.line(canvas_bgr, (mid_x, y), (mid_x, y + h), (148, 163, 184), 1, cv2.LINE_AA)
    cv2.line(canvas_bgr, (x, mid_y), (x + w, mid_y), (148, 163, 184), 1, cv2.LINE_AA)

    partial_tag = " [PARTIAL]" if panel.partially_visible else ""
    header = f"Panel {panel.panel_id} ({int(panel.confidence * 100)}%){partial_tag}"
    cv2.rectangle(canvas_bgr, (x, max(0, y - 24)), (min(canvas_bgr.shape[1], x + 230), max(24, y)), (7, 11, 20), -1)
    cv2.putText(
        canvas_bgr,
        header,
        (x + 6, max(16, y - 7)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        border_color,
        1,
        cv2.LINE_AA,
    )

    quad_anchors = [
        (x + 6, y + 18),
        (mid_x + 6, y + 18),
        (x + 6, mid_y + 18),
        (mid_x + 6, mid_y + 18),
    ]
    for idx, z in enumerate(zone_result.zones):
        qx, qy = quad_anchors[idx]
        z_color = (
            (60, 190, 90)
            if z.dust_percentage <= cfg.clean_max_pct
            else ((30, 180, 245) if z.dust_percentage <= cfg.moderate_max_pct else (68, 68, 239))
        )
        cv2.putText(
            canvas_bgr,
            f"Z{z.zone_id}:{z.dust_percentage:.0f}%",
            (qx, qy),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            z_color,
            1,
            cv2.LINE_AA,
        )


def analyze_multi_panel_frame(
    frame_bgr: Any,
    reference_panel_bgr: Any,
    detector: Optional[BasePanelDetector] = None,
    tracker: Optional[PanelTracker] = None,
    config: Optional[DustDetectionConfig] = None,
) -> MultiPanelAnalysisResult:
    """
    Detect all individual solar panels in a frame, track IDs, and divide EACH panel
    into four independent dust zones. Never blindly divides the raw camera frame.
    """
    if frame_bgr is None:
        return MultiPanelAnalysisResult(panels=[], annotated_frame=None, panels_detected_count=0, warning="Empty camera frame.")

    cfg = config or DustDetectionConfig()
    active_detector = detector or ContourPanelDetector()
    detected = active_detector.detect_panels(frame_bgr)
    if tracker is not None:
        detected = tracker.update(detected)

    annotated = frame_bgr.copy() if hasattr(frame_bgr, "copy") else frame_bgr
    if not detected:
        if CV2_AVAILABLE and annotated is not None:
            cv2.putText(
                annotated,
                "NO SOLAR PANELS DETECTED",
                (20, 36),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (30, 180, 245),
                2,
                cv2.LINE_AA,
            )
        return MultiPanelAnalysisResult(
            panels=[],
            annotated_frame=annotated,
            panels_detected_count=0,
            warning="No distinct solar panels detected in frame. Check camera framing or lighting.",
        )

    panel_cfg = DustDetectionConfig(
        target_width=320,
        target_height=240,
        clean_max_pct=cfg.clean_max_pct,
        moderate_max_pct=cfg.moderate_max_pct,
        pixel_diff_threshold=cfg.pixel_diff_threshold,
        enable_alignment=False,  # Perspective warp already aligned the panel bounds
        enable_lighting_compensation=cfg.enable_lighting_compensation,
        analysis_mode=cfg.analysis_mode,
    )

    results: List[PanelZoneAnalysis] = []
    for panel in detected:
        crop = panel.warped_bgr
        if crop is None and hasattr(frame_bgr, "__getitem__"):
            x, y, w, h = panel.bbox
            crop = frame_bgr[y : y + h, x : x + w]

        z_res = analyze_four_zones(reference_panel_bgr, crop, panel_cfg)
        _draw_panel_overlay(annotated, panel, z_res, cfg)
        results.append(
            PanelZoneAnalysis(
                panel_id=panel.panel_id,
                bbox=panel.bbox,
                polygon=panel.polygon,
                confidence=panel.confidence,
                partially_visible=panel.partially_visible,
                detection_method=panel.detection_method,
                zone_result=z_res,
            )
        )

    return MultiPanelAnalysisResult(
        panels=results,
        annotated_frame=annotated,
        panels_detected_count=len(results),
        warning=None,
    )
