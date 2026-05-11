"""One-shot clip rendering — combines cut + reframe + subtitle in single
FFmpeg pass. ~3x faster than 3-pass approach.

Pipeline before (3 passes per clip):
  source → cut.mp4 (re-encode, accurate seek)
         → reframed.mp4 (re-encode, crop+scale)
         → final.mp4 (re-encode, ass burn-in)

Pipeline after (1 pass per clip):
  source → final.mp4 (re-encode once, all filters chained)

Face detection runs on source within clip's time range (no temp file).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from pathlib import Path

from klipin.services import reframe, subtitle
from klipin.services.transcribe import Transcript

logger = logging.getLogger(__name__)


class RenderError(Exception):
    pass


async def render_clip_oneshot(
    source: Path,
    output: Path,
    transcript: Transcript,
    start_sec: float,
    end_sec: float,
    *,
    target_w: int = 1080,
    target_h: int = 1920,
    fade_dur: float = 0.25,
) -> Path:
    """Single-pass render: accurate cut + crop + scale + fade + subtitle."""
    if not source.exists():
        raise RenderError(f"source missing: {source}")
    duration = end_sec - start_sec
    if duration <= 0:
        raise RenderError(f"invalid range: {start_sec} -> {end_sec}")

    # 1. Probe source dims (cv2, fast)
    src_w, src_h = await asyncio.to_thread(reframe._probe_dims_sync, source)

    # 2. Detect face within clip's time range (no temp file)
    face = await reframe.detect_face_center(
        source, start_sec=start_sec, end_sec=end_sec
    )
    if face:
        logger.info(
            "[render] face center (%.2f, %.2f) from %d samples",
            face.cx_norm,
            face.cy_norm,
            face.samples,
        )
    else:
        logger.info("[render] no face detected, center crop fallback")

    # 3. Compute crop coords
    crop_w, crop_h, x, y = reframe.compute_crop(src_w, src_h, target_w, target_h, face)

    # 4. Generate ASS file (timing relative to t=0 since output starts at 0)
    words_in_clip = [
        w for w in transcript.words if w.end > start_sec and w.start < end_sec
    ]
    output.parent.mkdir(parents=True, exist_ok=True)
    ass_filename = f"{output.stem}.ass"
    ass_path = output.parent / ass_filename

    has_subtitle = bool(words_in_clip)
    if has_subtitle:
        ass_content = subtitle._build_ass(
            words_in_clip, start_sec, target_w, target_h
        )
        ass_path.write_text(ass_content, encoding="utf-8")

    # 5. Build filter chain
    fade_out_start = max(0.0, duration - fade_dur)
    vf_parts = [
        f"crop={crop_w}:{crop_h}:{x}:{y}",
        f"scale={target_w}:{target_h}:flags=lanczos",
        f"fade=t=in:st=0:d={fade_dur}",
        f"fade=t=out:st={fade_out_start:.3f}:d={fade_dur}",
    ]
    if has_subtitle:
        vf_parts.append(f"ass={ass_filename}")
    vf = ",".join(vf_parts)

    af = (
        f"afade=t=in:st=0:d={fade_dur},"
        f"afade=t=out:st={fade_out_start:.3f}:d={fade_dur}"
    )

    abs_source = source.resolve()
    abs_output = output.resolve()

    # 6. Run ffmpeg in single pass — -ss before -i = fast seek + re-encode
    #    handles timing accuracy (output starts at 0).
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{start_sec:.3f}",
        "-i", str(abs_source),
        "-t", f"{duration:.3f}",
        "-vf", vf,
        "-af", af,
        # veryfast preset = ~50% lebih cepat dari fast, quality acceptable
        # buat 30-90s clips. crf 22 = visually lossless di mobile.
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        # 1 thread per FFmpeg. Pipeline jalan N render paralel (N = config
        # max_concurrent_renders, default 4). Kalau tiap FFmpeg auto-pakai
        # semua core (-threads 0), 4 paralel saling rebutan = thrashing.
        # 1 thread × 4 paralel = 4 core utilized clean, throughput maksimal.
        "-threads", "1",
        str(abs_output),
    ]

    rc, _, stderr = await _run_in_cwd(cmd, cwd=output.parent)

    with contextlib.suppress(OSError):
        ass_path.unlink(missing_ok=True)

    if rc != 0 or not output.exists():
        raise RenderError(f"ffmpeg one-shot render failed: {stderr[-500:]}")

    return output


async def _run_in_cwd(cmd: list[str], cwd: Path, *, timeout: float = 600) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(cwd),
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except TimeoutError as e:
        proc.kill()
        await proc.wait()
        raise RenderError(f"ffmpeg timed out after {timeout}s") from e
    return (
        proc.returncode or 0,
        stdout.decode(errors="replace"),
        stderr.decode(errors="replace"),
    )
