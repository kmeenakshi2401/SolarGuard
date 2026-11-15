"""Multi-solar-panel detection, perspective rectification, and stable ID tracking."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Optional, Protocol, Tuple

try:
    import cv2
    import numpy as np

    CV2_AVAILABLE = True
except ImportError:  # pragma: no cover
    cv2 = None  # type: ignore
    np = None  # type: ignore
    CV2_AVAILABLE = False


@dataclass
class DetectedPanel:
    """Represents a single localized solar panel inside a camera frame."""

    panel_id: int
    bbox: Tuple[int, int, int, int]  # (x, y, w, h)
    polygon: List[Tuple[int, int]]    # 4 corner points [(x,y), ...]
    confidence: float
    warped_bgr: Any = None
    partially_visible: bool = False
    detection_method: str = "OPENCV_CONTOUR"


class BasePanelDetector(Protocol):
    """Protocol allowing future drop-in replacement with YOLO/ONNX object detectors."""

    def detect_panels(self, frame_bgr: Any) -> List[DetectedPanel]:
        ...


def order_quad_points(pts: Any) -> Any:
    """Order 4 polygon points consistently: top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def compute_iou(box_a: Tuple[int, int, int, int], box_b: Tuple[int, int, int, int]) -> float:
    """Compute Intersection-over-Union (IoU) between two (x, y, w, h) bounding boxes."""
    ax1, ay1, aw, ah = box_a
    bx1, by1, bw, bh = box_b
    ax2, ay2 = ax1 + aw, ay1 + ah
    bx2, by2 = bx1 + bw, by1 + bh

    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw = max(0, ix2 - ix1)
    ih = max(0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    union = aw * ah + bw * bh - inter
    return float(inter) / float(union) if union > 0 else 0.0


class ContourPanelDetector:
    """
    OpenCV contour + geometric filtering + perspective correction solar panel detector.

    Identifies dark navy/blue/charcoal photovoltaic modules separated from lighter
    rooftop, ground, or bench backgrounds, rectifies perspective skew, handles partially
    visible edge panels, and removes overlapping duplicate detections.
    """

    def __init__(
        self,
        min_area_ratio: float = 0.035,
        max_area_ratio: float = 0.92,
        min_aspect_ratio: float = 0.35,
        max_aspect_ratio: float = 3.2,
        warp_width: int = 320,
        warp_height: int = 240,
    ) -> None:
        self.min_area_ratio = min_area_ratio
        self.max_area_ratio = max_area_ratio
        self.min_aspect_ratio = min_aspect_ratio
        self.max_aspect_ratio = max_aspect_ratio
        self.warp_width = warp_width
        self.warp_height = warp_height

    def detect_panels(self, frame_bgr: Any) -> List[DetectedPanel]:
        if frame_bgr is None:
            return []
        if not CV2_AVAILABLE:
            raise RuntimeError("OpenCV and NumPy are required for ContourPanelDetector.")

        h_img, w_img = frame_bgr.shape[:2]
        frame_area = float(h_img * w_img)
        if frame_area <= 0:
            return []

        hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)

        # Cue 1: Dark/blue PV cell regions (low-to-medium value, distinct from bright backgrounds)
        dark_mask = cv2.inRange(hsv, (0, 0, 10), (180, 255, 130))
        # Cue 2: Strong aluminum frame / cell grid edges
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 45, 135)
        edges_dilated = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)), iterations=1)

        combined = cv2.bitwise_or(dark_mask, edges_dilated)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        closed = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel, iterations=2)
        opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))

        contours, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates: List[DetectedPanel] = []

        for cnt in contours:
            area = cv2.contourArea(cnt)
            ratio = area / frame_area
            if ratio < self.min_area_ratio or ratio > self.max_area_ratio:
                continue

            x, y, w, h = cv2.boundingRect(cnt)
            if w < 32 or h < 32:
                continue
            aspect = float(w) / float(h)
            if aspect < self.min_aspect_ratio or aspect > self.max_aspect_ratio:
                continue

            # Approximate quadrilateral for perspective rectification
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.03 * peri, True)
            if len(approx) == 4:
                quad = order_quad_points(approx.reshape(4, 2).astype("float32"))
                confidence = min(0.96, 0.78 + 0.18 * (area / max(1.0, w * h)))
            else:
                rect = cv2.minAreaRect(cnt)
                box = cv2.boxPoints(rect)
                quad = order_quad_points(box.astype("float32"))
                confidence = min(0.88, 0.65 + 0.20 * (area / max(1.0, w * h)))

            dst = np.array(
                [
                    [0, 0],
                    [self.warp_width - 1, 0],
                    [self.warp_width - 1, self.warp_height - 1],
                    [0, self.warp_height - 1],
                ],
                dtype="float32",
            )
            matrix = cv2.getPerspectiveTransform(quad, dst)
            warped = cv2.warpPerspective(frame_bgr, matrix, (self.warp_width, self.warp_height))

            edge_margin = 4
            partial = (
                x <= edge_margin
                or y <= edge_margin
                or (x + w) >= (w_img - edge_margin)
                or (y + h) >= (h_img - edge_margin)
            )

            polygon = [(int(pt[0]), int(pt[1])) for pt in quad]
            candidates.append(
                DetectedPanel(
                    panel_id=0,
                    bbox=(x, y, w, h),
                    polygon=polygon,
                    confidence=round(float(confidence), 2),
                    warped_bgr=warped,
                    partially_visible=partial,
                    detection_method="OPENCV_CONTOUR",
                )
            )

        # Deduplicate overlapping boxes (NMS-like suppression)
        candidates.sort(key=lambda p: p.bbox[2] * p.bbox[3], reverse=True)
        filtered: List[DetectedPanel] = []
        for cand in candidates:
            if any(compute_iou(cand.bbox, kept.bbox) > 0.45 for kept in filtered):
                continue
            filtered.append(cand)

        # Sort left-to-right, top-to-bottom for deterministic initial IDs
        filtered.sort(key=lambda p: (p.bbox[1] // 80, p.bbox[0]))
        for idx, panel in enumerate(filtered, start=1):
            panel.panel_id = idx

        return filtered


class PanelTracker:
    """
    Maintains stable Panel IDs across consecutive camera frames using IoU + centroid matching.
    """

    def __init__(self, iou_threshold: float = 0.30, max_missing_frames: int = 10) -> None:
        self.iou_threshold = iou_threshold
        self.max_missing_frames = max_missing_frames
        self._next_id = 1
        self._tracks: dict[int, Tuple[Tuple[int, int, int, int], int]] = {}  # id -> (bbox, missed)

    def reset(self) -> None:
        self._next_id = 1
        self._tracks.clear()

    def update(self, detections: List[DetectedPanel]) -> List[DetectedPanel]:
        """Assign persistent IDs to incoming detections across consecutive frames."""
        if not detections:
            # Age existing tracks
            expired = []
            for pid, (bbox, missed) in self._tracks.items():
                if missed + 1 > self.max_missing_frames:
                    expired.append(pid)
                else:
                    self._tracks[pid] = (bbox, missed + 1)
            for pid in expired:
                del self._tracks[pid]
            return []

        unmatched_tracks = set(self._tracks.keys())
        assigned: List[DetectedPanel] = []

        for det in detections:
            best_id: Optional[int] = None
            best_score = 0.0
            dx = det.bbox[0] + det.bbox[2] * 0.5
            dy = det.bbox[1] + det.bbox[3] * 0.5

            for pid in unmatched_tracks:
                t_bbox, _ = self._tracks[pid]
                iou = compute_iou(det.bbox, t_bbox)
                tx = t_bbox[0] + t_bbox[2] * 0.5
                ty = t_bbox[1] + t_bbox[3] * 0.5
                dist = ((dx - tx) ** 2 + (dy - ty) ** 2) ** 0.5
                norm_dist_score = max(0.0, 1.0 - dist / max(120.0, float(max(t_bbox[2], t_bbox[3]))))
                score = 0.7 * iou + 0.3 * norm_dist_score
                if (iou >= self.iou_threshold or norm_dist_score > 0.72) and score > best_score:
                    best_score = score
                    best_id = pid

            if best_id is not None:
                unmatched_tracks.remove(best_id)
                det.panel_id = best_id
                self._tracks[best_id] = (det.bbox, 0)
            else:
                det.panel_id = self._next_id
                self._tracks[self._next_id] = (det.bbox, 0)
                self._next_id += 1
            assigned.append(det)

        for pid in list(unmatched_tracks):
            bbox, missed = self._tracks[pid]
            if missed + 1 > self.max_missing_frames:
                del self._tracks[pid]
            else:
                self._tracks[pid] = (bbox, missed + 1)

        assigned.sort(key=lambda p: p.panel_id)
        return assigned
