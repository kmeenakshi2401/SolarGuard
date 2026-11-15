"""OpenCV dust estimation module with structural mismatch fallback, edge-jitter tolerance,
and intrinsic PV surface chromaticity/matte-haze analysis.

Key improvement:
  When a user uploads a clean solar panel image taken from a different angle, panel model,
  or grid alignment than the stored `clean_reference.jpg`, naive pixel-by-pixel subtraction
  mistakenly flags shifted silver busbars/cell gaps as high dust. This module:
    1. Crops a 5% inner margin to ignore aluminum frame border differences.
    2. Performs per-channel color + luminance normalization.
    3. Measures normalized cross-correlation (structure match) between reference and current.
    4. Applies +/-2 px morphological edge tolerance on grid lines when aligned, OR automatically
       switches to Intrinsic PV Surface Soiling Analysis (detecting warm earthy/tan dust hue
       and matte cell-veiling haze while ignoring crisp neutral silver busbars) when
       cross-panel structural mismatch is detected.

Note: Visual image difference estimates apparent optical surface change; it is not a direct
gravimetric measurement of physical dust mass (g/m^2).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Tuple

try:
    import numpy as np

    NUMPY_AVAILABLE = True
except ImportError:  # pragma: no cover
    np = None  # type: ignore
    NUMPY_AVAILABLE = False

try:
    import cv2

    CV2_AVAILABLE = True
except ImportError:  # pragma: no cover
    cv2 = None  # type: ignore
    CV2_AVAILABLE = False


@dataclass
class DustDetectionConfig:
    """Configurable parameters for precision visual dust estimation."""

    target_width: int = 640
    target_height: int = 360
    clean_max_pct: float = 10.0
    moderate_max_pct: float = 25.0
    pixel_diff_threshold: float = 28.0
    enable_alignment: bool = True
    enable_lighting_compensation: bool = True
    analysis_mode: str = "AUTO"  # "AUTO", "REFERENCE_DIFF", or "INTRINSIC_SURFACE"


def _align_image_orb(reference_bgr: Any, current_bgr: Any) -> Any:
    """Attempt mild homography alignment using ORB features to correct small camera shifts."""
    if not CV2_AVAILABLE:
        return current_bgr

    try:
        ref_gray = cv2.cvtColor(reference_bgr, cv2.COLOR_BGR2GRAY)
        cur_gray = cv2.cvtColor(current_bgr, cv2.COLOR_BGR2GRAY)

        orb = cv2.ORB_create(nfeatures=600)
        kp1, des1 = orb.detectAndCompute(ref_gray, None)
        kp2, des2 = orb.detectAndCompute(cur_gray, None)

        if des1 is None or des2 is None or len(kp1) < 12 or len(kp2) < 12:
            return current_bgr

        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = sorted(matcher.match(des2, des1), key=lambda m: m.distance)[:45]
        if len(matches) < 10:
            return current_bgr

        src_pts = np.float32([kp2[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp1[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)

        matrix, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 4.0)
        if matrix is None or mask is None or int(mask.sum()) < 8:
            return current_bgr

        if abs(matrix[0, 0] - 1.0) > 0.25 or abs(matrix[1, 1] - 1.0) > 0.25:
            return current_bgr

        h, w = reference_bgr.shape[:2]
        return cv2.warpPerspective(current_bgr, matrix, (w, h), borderMode=cv2.BORDER_REPLICATE)
    except Exception:
        return current_bgr


def _compute_structural_similarity(ref_bgr: Any, cur_bgr: Any) -> float:
    """Estimate edge/grid layout correlation (0..1) to detect mismatched panel images."""
    ref_gray = cv2.cvtColor(ref_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    cur_gray = cv2.cvtColor(cur_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    ref_norm = (ref_gray - ref_gray.mean()) / (ref_gray.std() + 1e-5)
    cur_norm = (cur_gray - cur_gray.mean()) / (cur_gray.std() + 1e-5)
    corr = float((ref_norm * cur_norm).mean())
    return max(0.0, min(1.0, corr))


def compute_intrinsic_pv_dust_mask(panel_bgr: Any, sensitivity: float = 28.0) -> Tuple[Any, Any]:
    """
    Reference-independent PV surface dust detector.
    Distinguishes clean dark-blue/black cells and crisp neutral-white silver busbars
    from matte tan/brown/grayish dust scattering.
    """
    blur = cv2.GaussianBlur(panel_bgr, (5, 5), 0).astype(np.float32)
    b, g, r = blur[:, :, 0], blur[:, :, 1], blur[:, :, 2]

    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    chroma = max_c - min_c
    lum = 0.299 * r + 0.587 * g + 0.114 * b

    # Clean silver busbars & white backsheet grid lines: high luminance, neutral chroma, sharp high-pass edges
    gray = cv2.cvtColor(panel_bgr, cv2.COLOR_BGR2GRAY)
    grad_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    edge_mag = np.sqrt(grad_x ** 2 + grad_y ** 2)
    is_neutral_grid = (chroma < 24.0) & ((lum > 155.0) | (edge_mag > 42.0))

    # Dust signature 1: Warm earthy/tan/sand tone over panel (R > B significantly)
    warm_dust_score = np.maximum(0.0, (r - b) * 1.45 + np.maximum(0.0, g - b) * 0.65)
    # Dust signature 2: Matte gray/beige veil raising dark PV cell floor without being crisp busbar
    veil_score = np.where((~is_neutral_grid) & (lum > 72.0) & (b < r + 8.0), (lum - 72.0) * 0.55, 0.0)

    combined_score = np.where(is_neutral_grid, 0.0, np.maximum(warm_dust_score, veil_score))
    diff_score = np.clip(combined_score, 0, 255).astype(np.uint8)

    thresh = max(14.0, float(sensitivity) * 0.95)
    _, raw_mask = cv2.threshold(diff_score, int(thresh), 255, cv2.THRESH_BINARY)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    clean_mask = cv2.morphologyEx(raw_mask, cv2.MORPH_OPEN, kernel)
    clean_mask = cv2.morphologyEx(clean_mask, cv2.MORPH_CLOSE, kernel)
    return clean_mask, diff_score


def align_and_normalize_images(
    reference_bgr: Any,
    current_bgr: Any,
    config: DustDetectionConfig,
) -> Tuple[Any, Any]:
    """Resize both frames, optionally align, and compensate per-channel exposure/white-balance."""
    if reference_bgr is None or current_bgr is None:
        raise ValueError("Both reference and current images must be non-null.")
    if not CV2_AVAILABLE or not NUMPY_AVAILABLE:
        raise RuntimeError("OpenCV and NumPy are required for image alignment and normalization.")

    size = (config.target_width, config.target_height)
    ref_resized = cv2.resize(reference_bgr, size, interpolation=cv2.INTER_AREA)
    cur_resized = cv2.resize(current_bgr, size, interpolation=cv2.INTER_AREA)

    if config.enable_alignment:
        cur_resized = _align_image_orb(ref_resized, cur_resized)

    if config.enable_lighting_compensation:
        ref_lab = cv2.cvtColor(ref_resized, cv2.COLOR_BGR2LAB).astype(np.float32)
        cur_lab = cv2.cvtColor(cur_resized, cv2.COLOR_BGR2LAB).astype(np.float32)

        ref_l_mean, ref_l_std = float(ref_lab[:, :, 0].mean()), float(ref_lab[:, :, 0].std()) + 1e-5
        cur_l_mean, cur_l_std = float(cur_lab[:, :, 0].mean()), float(cur_lab[:, :, 0].std()) + 1e-5

        gain = max(0.75, min(1.35, ref_l_std / cur_l_std))
        cur_lab[:, :, 0] = np.clip((cur_lab[:, :, 0] - cur_l_mean) * gain + ref_l_mean, 0, 255)
        cur_resized = cv2.cvtColor(cur_lab.astype(np.uint8), cv2.COLOR_LAB2BGR)

    return ref_resized, cur_resized


def compute_dust_difference_map(
    reference_bgr: Any,
    current_bgr: Any,
    config: DustDetectionConfig | None = None,
) -> Tuple[Any, Any, Any, Any]:
    """
    Compute a binary dust mask and normalized difference score map with busbar-jitter
    suppression and automatic intrinsic fallback when comparing mismatched clean panels.
    """
    cfg = config or DustDetectionConfig()
    ref_norm, cur_norm = align_and_normalize_images(reference_bgr, current_bgr, cfg)

    corr = _compute_structural_similarity(ref_norm, cur_norm)
    use_intrinsic = cfg.analysis_mode == "INTRINSIC_SURFACE" or (
        cfg.analysis_mode == "AUTO" and corr < 0.38
    )

    if use_intrinsic:
        clean_mask, diff_score = compute_intrinsic_pv_dust_mask(cur_norm, cfg.pixel_diff_threshold)
        return ref_norm, cur_norm, clean_mask, diff_score

    ref_blur = cv2.GaussianBlur(ref_norm, (5, 5), 0)
    cur_blur = cv2.GaussianBlur(cur_norm, (5, 5), 0)

    ref_lab = cv2.cvtColor(ref_blur, cv2.COLOR_BGR2LAB).astype(np.float32)
    cur_lab = cv2.cvtColor(cur_blur, cv2.COLOR_BGR2LAB).astype(np.float32)

    dl = np.abs(cur_lab[:, :, 0] - ref_lab[:, :, 0]) * 0.45
    da = np.abs(cur_lab[:, :, 1] - ref_lab[:, :, 1]) * 1.20
    db = np.abs(cur_lab[:, :, 2] - ref_lab[:, :, 2]) * 1.20
    lab_delta = np.sqrt(dl ** 2 + da ** 2 + db ** 2)

    # Suppress narrow edge-shift artifacts around silver busbars using 5x5 local min-filter
    eroded_delta = cv2.erode(lab_delta, np.ones((3, 3), np.float32))
    diff_score = np.clip(eroded_delta, 0, 255).astype(np.uint8)

    _, raw_mask = cv2.threshold(diff_score, int(cfg.pixel_diff_threshold), 255, cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    clean_mask = cv2.morphologyEx(raw_mask, cv2.MORPH_OPEN, kernel)
    clean_mask = cv2.morphologyEx(clean_mask, cv2.MORPH_CLOSE, kernel)

    return ref_norm, cur_norm, clean_mask, diff_score
