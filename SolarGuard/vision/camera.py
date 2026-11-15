"""Webcam capture and image file management for SolarGuard."""

from __future__ import annotations

import os
import platform
from pathlib import Path
from typing import Optional, Tuple, Any

try:
    import cv2

    CV2_AVAILABLE = True
except ImportError:  # pragma: no cover
    cv2 = None  # type: ignore
    CV2_AVAILABLE = False


class CameraManager:
    """Handles Windows/Linux webcam capture, uploaded images, and clean reference storage."""

    def __init__(self, camera_index: int = 0, reference_path: Optional[str] = None) -> None:
        self.camera_index = camera_index
        default_ref = Path(__file__).resolve().parent.parent / "data" / "clean_reference.jpg"
        self.reference_path = Path(reference_path) if reference_path else default_ref

    def capture_frame(self) -> Tuple[Optional[Any], Optional[str]]:
        """Capture a single BGR frame from the laptop webcam safely."""
        if not CV2_AVAILABLE:
            return None, "OpenCV (cv2) is not installed. Run: pip install opencv-python"

        backend = cv2.CAP_DSHOW if platform.system() == "Windows" else cv2.CAP_ANY
        cap = None
        try:
            cap = cv2.VideoCapture(self.camera_index, backend)
            if not cap.isOpened():
                # Fallback to default backend if CAP_DSHOW fails
                cap = cv2.VideoCapture(self.camera_index)
            if not cap.isOpened():
                return None, f"Camera index {self.camera_index} could not be opened. Check webcam connection or permissions."

            # Warm up auto-exposure for 3 frames
            frame = None
            for _ in range(3):
                ok, frame = cap.read()
                if not ok:
                    frame = None

            if frame is None:
                return None, "Camera opened but returned an empty frame."
            return frame, None
        except Exception as exc:
            return None, f"Webcam capture failed: {exc}"
        finally:
            if cap is not None:
                try:
                    cap.release()
                except Exception:
                    pass

    def load_image_from_path(self, image_path: str) -> Tuple[Optional[Any], Optional[str]]:
        """Load an image file from disk and validate its contents."""
        if not CV2_AVAILABLE:
            return None, "OpenCV (cv2) is not installed."

        if not image_path or not os.path.exists(image_path):
            return None, f"Image file not found: {image_path}"

        try:
            image = cv2.imread(image_path, cv2.IMREAD_COLOR)
            if image is None or image.size == 0:
                return None, f"Invalid or corrupted image file: {image_path}"
            return image, None
        except Exception as exc:
            return None, f"Failed to read image '{image_path}': {exc}"

    def save_clean_reference(self, image: Any) -> Tuple[bool, str]:
        """Save a captured or uploaded clean panel image as the baseline reference."""
        if not CV2_AVAILABLE:
            return False, "OpenCV (cv2) is not installed."
        if image is None or getattr(image, "size", 0) == 0:
            return False, "Cannot save an empty reference image."

        try:
            self.reference_path.parent.mkdir(parents=True, exist_ok=True)
            ok = cv2.imwrite(str(self.reference_path), image)
            if not ok:
                return False, f"Failed to write reference image to {self.reference_path}"
            return True, f"Saved clean reference image to {self.reference_path}"
        except Exception as exc:
            return False, f"Error saving clean reference: {exc}"

    def load_clean_reference(self) -> Tuple[Optional[Any], Optional[str]]:
        """Load the stored clean reference solar panel image."""
        return self.load_image_from_path(str(self.reference_path))
