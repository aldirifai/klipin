"""Auto-reframe landscape clips to 9:16. Detects face center via MediaPipe,
uses static crop based on the median face position across sampled frames.

For MVP we use static crop instead of dynamic crop because:
1. Talking-head clips (podcast/vlog/interview) usually have a stationary speaker.
2. Static crop keeps FFmpeg pipeline simple — single `crop` filter, no sendcmd.
3. Dynamic crop is a v1.1 enhancement (smoothed crop path with sendcmd).

If no face is detected, falls back to center crop.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

from klipin.services import ffmpeg as ff

logger = logging.getLogger(__name__)


class ReframeError(Exception):
    pass


@dataclass(slots=True)
class FaceCenter:
    cx_norm: float  # 0..1, horizontal center of face in source frame
    cy_norm: float  # 0..1, vertical
    samples: int    # how many sample frames detected a face


def _detect_face_center_sync(video_path: Path, sample_interval: float = 2.0) -> FaceCenter | None:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        cap.release()
        return None

    sample_step = max(1, int(fps * sample_interval))
    centers: list[tuple[float, float]] = []

    detector = mp.solutions.face_detection.FaceDetection(
        model_selection=1, min_detection_confidence=0.5
    )
    try:
        for frame_idx in range(0, total, sample_step):
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap.read()
            if not ret:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = detector.process(rgb)
            if not results.detections:
                continue
            best = max(
                results.detections,
                key=lambda d: (
                    d.location_data.relative_bounding_box.width
                    * d.location_data.relative_bounding_box.height
                ),
            )
            bb = best.location_data.relative_bounding_box
            cx = max(0.0, min(1.0, bb.xmin + bb.width / 2))
            cy = max(0.0, min(1.0, bb.ymin + bb.height / 2))
            centers.append((cx, cy))
    finally:
        detector.close()
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
    """Reframe `source` to a vertical 9:16 clip at `target_w`x`target_h`.
    Output is re-encoded H.264/AAC, suitable for direct upload to TikTok/Reels."""
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
