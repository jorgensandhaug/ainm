"""
Optional shelf / oblique-view geometry helpers for inference.

Primary method: estimate in-plane rotation from near-horizontal structure lines (Hough),
rotate the image to deskew shelf rows. This helps side-angled shots without a full
camera calibration.

Full perspective "keystone" correction would need reliable 4-point shelf-face detection;
rotation is cheaper, safer, and often helps strongly oblique captures.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np
from PIL import Image


@dataclass
class RectifyResult:
    """Image ready for model input + maps boxes from model space back to original pixels."""

    image_rgb: Image.Image
    # Model sees resize(image_rgb) -> (input_w, input_h); boxes are in that space.
    # Map back: model_xyxy -> rectified full-res -> original using M_rect_to_orig (2x3 affine) or identity.
    scale_to_rectified: tuple[float, float]  # multiply model coords by this to get pixels in image_rgb
    M_rect_to_orig: np.ndarray | None  # 2x3 affine: [x_r,y_r] -> [x_o,y_o] (homogeneous), or None if no warp
    # Diagnostics (rotate mode): rotation OpenCV would apply (deg, + = CCW); spread of line angles.
    estimated_rotation_deg: float = 0.0
    line_angle_std_deg: float = 0.0


def _line_angle_deg(x1: int, y1: int, x2: int, y2: int) -> float:
    return math.degrees(math.atan2(y2 - y1, x2 - x1))


def estimate_skew_angle_deg(gray: np.ndarray) -> tuple[float, float]:
    """
    Estimate rotation (degrees, OpenCV: positive = CCW) that would make dominant
    shelf-like lines horizontal. Returns (angle_to_apply, line_angle_std).
    """
    h, w = gray.shape[:2]
    small = max(400, min(w, h))
    scale = small / max(w, h)
    if scale < 1.0:
        g = cv2.resize(gray, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    else:
        g = gray

    blur = cv2.GaussianBlur(g, (3, 3), 0)
    edges = cv2.Canny(blur, 40, 120)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=max(30, int(min(g.shape) * 0.12)),
        minLineLength=int(min(g.shape) * 0.08),
        maxLineGap=int(min(g.shape) * 0.02),
    )
    if lines is None or len(lines) == 0:
        return 0.0, 0.0

    angles: list[float] = []
    for ln in lines[:, 0]:
        x1, y1, x2, y2 = map(int, ln)
        ang = _line_angle_deg(x1, y1, x2, y2)
        # Normalize to [-90, 90)
        while ang >= 90:
            ang -= 180
        while ang < -90:
            ang += 180
        # Near-horizontal structure (shelf rows): small tilt from 0
        if abs(ang) <= 50:
            angles.append(ang)

    if len(angles) < 5:
        return 0.0, 0.0

    arr = np.array(angles, dtype=np.float64)
    med = float(np.median(arr))
    std = float(np.std(arr))
    # Rotate by -med so median line becomes horizontal
    angle_to_apply = -med
    return angle_to_apply, std


def _rotate_expand_bgr(
    bgr: np.ndarray, angle_deg: float
) -> tuple[np.ndarray, np.ndarray]:
    """Rotate around image center, expand canvas. Returns (warped_bgr, M_2x3_rect_to_orig)."""
    h, w = bgr.shape[:2]
    center = (w / 2.0, h / 2.0)
    M = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
    cos = abs(M[0, 0])
    sin = abs(M[1, 0])
    new_w = int(h * sin + w * cos)
    new_h = int(h * cos + w * sin)
    M[0, 2] += (new_w / 2.0) - center[0]
    M[1, 2] += (new_h / 2.0) - center[1]
    warped = cv2.warpAffine(
        bgr,
        M,
        (new_w, new_h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )
    M_inv = cv2.invertAffineTransform(M)
    return warped, M_inv


def model_xyxy_to_original_xyxy(
    boxes_xyxy: np.ndarray,
    input_w: int,
    input_h: int,
    rect_w: int,
    rect_h: int,
    M_rect_to_orig: np.ndarray | None,
) -> np.ndarray:
    """Map boxes from model input pixel space (input_w x input_h) to original image coords."""
    if boxes_xyxy.size == 0:
        return boxes_xyxy
    sx = rect_w / float(input_w)
    sy = rect_h / float(input_h)
    out = boxes_xyxy.copy().astype(np.float64)
    out[:, 0] *= sx
    out[:, 2] *= sx
    out[:, 1] *= sy
    out[:, 3] *= sy
    if M_rect_to_orig is None:
        return out.astype(np.float32)

    n = out.shape[0]
    pts = np.empty((n * 4, 2), dtype=np.float64)
    for i in range(n):
        x1, y1, x2, y2 = out[i]
        pts[i * 4 + 0] = [x1, y1]
        pts[i * 4 + 1] = [x2, y1]
        pts[i * 4 + 2] = [x2, y2]
        pts[i * 4 + 3] = [x1, y2]
    ones = np.ones((n * 4, 1), dtype=np.float64)
    hom = np.hstack([pts, ones])
    M = M_rect_to_orig.astype(np.float64)
    mapped = (hom @ M.T)[:, :2]
    mapped = mapped.reshape(n, 4, 2)
    x_all = mapped[:, :, 0]
    y_all = mapped[:, :, 1]
    ox1 = x_all.min(axis=1)
    ox2 = x_all.max(axis=1)
    oy1 = y_all.min(axis=1)
    oy2 = y_all.max(axis=1)
    return np.stack([ox1, oy1, ox2, oy2], axis=1).astype(np.float32)


def rectify_for_inference(
    pil_rgb: Image.Image,
    *,
    mode: str,
    min_abs_angle_deg: float,
    max_abs_angle_deg: float,
) -> RectifyResult:
    """
    mode:
      - "off": no change
      - "rotate": estimate skew, rotate if |angle| in [min, max]
    """
    if mode == "off":
        w, h = pil_rgb.size
        return RectifyResult(
            image_rgb=pil_rgb.copy(),
            scale_to_rectified=(float(w), float(h)),
            M_rect_to_orig=None,
            estimated_rotation_deg=0.0,
            line_angle_std_deg=0.0,
        )

    arr = np.array(pil_rgb)
    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    angle, std = estimate_skew_angle_deg(gray)

    if mode != "rotate":
        raise ValueError(f"Unknown rectify mode: {mode}")

    if abs(angle) < min_abs_angle_deg or abs(angle) > max_abs_angle_deg:
        w, h = pil_rgb.size
        return RectifyResult(
            image_rgb=pil_rgb.copy(),
            scale_to_rectified=(float(w), float(h)),
            M_rect_to_orig=None,
            estimated_rotation_deg=float(angle),
            line_angle_std_deg=float(std),
        )

    warped_bgr, M_inv = _rotate_expand_bgr(bgr, angle)
    warped_rgb = cv2.cvtColor(warped_bgr, cv2.COLOR_BGR2RGB)
    pil_w = Image.fromarray(warped_rgb)
    rw, rh = pil_w.size
    return RectifyResult(
        image_rgb=pil_w,
        scale_to_rectified=(float(rw), float(rh)),
        M_rect_to_orig=M_inv,
        estimated_rotation_deg=float(angle),
        line_angle_std_deg=float(std),
    )


def obliqueness_score(gray: np.ndarray) -> float:
    """Higher => more spread in line orientations (often oblique / cluttered)."""
    _, std = estimate_skew_angle_deg(gray)
    return std
