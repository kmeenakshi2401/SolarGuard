"""Unit tests for 4-zone segmentation, dust classification, and OpenCV pipeline."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from vision.dust_detection import DustDetectionConfig, compute_dust_difference_map
from vision.zone_analysis import (
    CLASS_CLEAN,
    CLASS_DUSTY,
    CLASS_MODERATE,
    analyze_four_zones,
    classify_dust_level,
    segment_four_zones_bounds,
)

try:
    import cv2
    import numpy as np

    HAS_CV2_NP = True
except ImportError:
    HAS_CV2_NP = False


class TestDustDetection(unittest.TestCase):
    def test_zone_classification_thresholds(self) -> None:
        self.assertEqual(classify_dust_level(4.0), CLASS_CLEAN)
        self.assertEqual(classify_dust_level(10.0), CLASS_CLEAN)
        self.assertEqual(classify_dust_level(15.5), CLASS_MODERATE)
        self.assertEqual(classify_dust_level(25.0), CLASS_MODERATE)
        self.assertEqual(classify_dust_level(38.0), CLASS_DUSTY)

    def test_four_zone_quadrant_geometry(self) -> None:
        bounds = segment_four_zones_bounds(640, 360)
        self.assertEqual(len(bounds), 4)
        self.assertEqual(bounds[0][2], (0, 0, 320, 180))
        self.assertEqual(bounds[1][2], (320, 0, 640, 180))
        self.assertEqual(bounds[2][2], (0, 180, 320, 360))
        self.assertEqual(bounds[3][2], (320, 180, 640, 360))

    def test_invalid_dimensions_raise(self) -> None:
        with self.assertRaises(ValueError):
            segment_four_zones_bounds(0, 360)

    @unittest.skipUnless(HAS_CV2_NP, "OpenCV + NumPy required for full image diff test")
    def test_selective_dust_detection_on_synthetic_panel(self) -> None:
        # Clean dark-blue solar panel reference
        ref = np.full((360, 640, 3), (85, 35, 18), dtype=np.uint8)
        cur = ref.copy()

        # Paint realistic tan dust over Zone 2 (top-right) and Zone 4 (bottom-right)
        cur[20:160, 340:620] = (95, 138, 175)
        cur[200:340, 340:620] = (95, 138, 175)

        cfg = DustDetectionConfig(enable_alignment=False, enable_lighting_compensation=False)
        result = analyze_four_zones(ref, cur, cfg)

        self.assertLess(result.zones[0].dust_percentage, 10.0)
        self.assertGreater(result.zones[1].dust_percentage, 25.0)
        self.assertLess(result.zones[2].dust_percentage, 10.0)
        self.assertGreater(result.zones[3].dust_percentage, 25.0)
        self.assertTrue(result.zones[1].cleaning_recommended)
        self.assertTrue(result.zones[3].cleaning_recommended)


if __name__ == "__main__":
    unittest.main()
