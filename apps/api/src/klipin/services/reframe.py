"""Auto-reframe landscape clips to 9:16 menggunakan OpenCV haar cascade
buat face detection. Static crop based on median face position.

Pakai OpenCV (sudah include haarcascades data) instead of MediaPipe karena:
- Tidak ada API churn antar versi (mediapipe 0.10.x hapus mp.solutions)
- Built-in di opencv-contrib-python yang sudah dipakai
- Cukup akurat buat 'find face center' use case (kita gak butuh
  landmark detail)

Dynamic crop is v1.1 enhancement.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from klipin.services import ffmpeg as ff

logger = logging.getLogger(__name__)


class ReframeError(Exception):
    pass


@dataclass(slots=True)
class FaceCenter:
    cx_norm: float
    cy_norm: float
    samples: int


def _get_cascade() -> cv2.CascadeClassifier:
    """Load Haar cascade dari OpenCV's bundled data."""
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    cascade = cv2.CascadeClassifier(cascade_path)
    if cascade.empty():
        raise ReframeError(f"failed to load haar cascade from {cascade_path}")
    return cascade


def _detect_face_center_sync(video_path: Path, sample_interval: float = 2.0) -> FaceCenter | None:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if total <= 0 or width <= 0 or height <= 0:
        cap.release()
        return None

    cascade = _get_cascade()
    sample_step = max(1, int(fps * sample_interval))
    centers: list[tuple[float, float]] = []

    try:
        for frame_idx in range(0, total, sample_step):
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap.read()
            if not ret:
                break
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            # Sedikit blur buat noise reduction
            gray = cv2.equalizeHist(gray)
            faces = cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(60, 60),
            )
            if len(faces) == 0:
                continue
            # Pick face dengan area terbesar (asumsi: presenter utama)
            best = max(faces, key=lambda f: f[2] * f[3])
            x, y, w, h = best
            cx = (x + w / 2) / width
            cy = (y + h / 2) / height
            centers.append((max(0.0, min(1.0, cx)), max(0.0, min(1.0, cy))))
    finally:
        cap.release()

    if not centers:
        return None

    cx_med = float(np.median([c[0] for c in centers]))
    cy_med = float(np.median([c[1] for c in centers]))
    return FaceCenter(cx_norm=cx_med, cy_norm=cy_med, samples=len(centers))


async def detect_face_center(
    video_path: Path, sample_interval: float = 2.0
) -> FaceCenter | None:
    return await asyncio.to_thread(_detect_face_center_sync, video_path, sample_interval)


def _probe_dims_sync(video_path: Path) -> tuple[int, int]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ReframeError(f"cannot open video: {video_path}")
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    if w <= 0 or h <= 0:
        raise ReframeError(f"invalid dimensions {w}x{h}")
    return w, h


async def reframe_to_vertical(
    source: Path,
    output: Path,
    *,
    target_w: int = 1080,
    target_h: int = 1920,
) -> Path:
    """Reframe `source` to a vertical 9:16 clip at `target_w`x`target_h`."""
    if not source.exists():
        raise ReframeError(f"source missing: {source}")

    src_w, src_h = await asyncio.to_thread(_probe_dims_sync, source)
    target_aspect = target_w / target_h
    src_aspect = src_w / src_h

    face = await detect_face_center(source)
    if face:
        logger.info(
            "[reframe] face center (%.2f, %.2f) from %d samples",
            face.cx_norm,
            face.cy_norm,
            face.samples,
        )
    else:
        logger.info("[reframe] no face detected, using center crop")

    if src_aspect > target_aspect:
        crop_w = int(round(src_h * target_aspect))
        crop_h = src_h
        crop_w -= crop_w % 2
        if face:
            cx_px = int(face.cx_norm * src_w)
            x = max(0, min(src_w - crop_w, cx_px - crop_w // 2))
        else:
            x = (src_w - crop_w) // 2
        y = 0
    elif src_aspect < target_aspect:
        crop_w = src_w
        crop_h = int(round(src_w / target_aspect))
        crop_h -= crop_h % 2
        x = 0
        if face:
            cy_px = int(face.cy_norm * src_h)
            y = max(0, min(src_h - crop_h, cy_px - crop_h // 2))
        else:
            y = (src_h - crop_h) // 2
    else:
        crop_w, crop_h, x, y = src_w, src_h, 0, 0

    vf = (
        f"crop={crop_w}:{crop_h}:{x}:{y},"
        f"scale={target_w}:{target_h}:flags=lanczos"
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-i", str(source),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        str(output),
    ]
    rc, _, stderr = await ff._run(cmd)
    if rc != 0 or not output.exists():
        raise ReframeError(f"ffmpeg reframe failed: {stderr[-500:]}")

    return output
