"""FFmpeg wrappers — clip extraction and re-encoding utilities."""

from __future__ import annotations

import asyncio
import logging
import shlex
from pathlib import Path

logger = logging.getLogger(__name__)


class FFmpegError(Exception):
    pass


async def _run(cmd: list[str], *, timeout: float = 600) -> tuple[int, str, str]:
    logger.debug("ffmpeg: %s", " ".join(shlex.quote(c) for c in cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except TimeoutError as e:
        proc.kill()
        await proc.wait()
        raise FFmpegError(f"ffmpeg timed out after {timeout}s") from e

    return proc.returncode or 0, stdout.decode(errors="replace"), stderr.decode(errors="replace")


async def cut_segment(
    source: Path,
    start_sec: float,
    end_sec: float,
    output: Path,
    *,
    reencode: bool = True,
) -> Path:
    """Cut [start, end] from source. Re-encodes by default for accurate cut.
    Set `reencode=False` for fast (keyframe-aligned) lossless copy."""
    if end_sec <= start_sec:
        raise FFmpegError(f"invalid range: {start_sec} -> {end_sec}")
    if not source.exists():
        raise FFmpegError(f"source not found: {source}")

    output.parent.mkdir(parents=True, exist_ok=True)
    duration = end_sec - start_sec

    if reencode:
        cmd = [
            "ffmpeg", "-y",
            "-ss", f"{start_sec:.3f}",
            "-i", str(source),
            "-t", f"{duration:.3f}",
            "-c:v", "libx264", "-preset", "fast", "-crf", "20",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            str(output),
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-ss", f"{start_sec:.3f}",
            "-i", str(source),
            "-t", f"{duration:.3f}",
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            str(output),
        ]

    rc, _, stderr = await _run(cmd)
    if rc != 0 or not output.exists():
        raise FFmpegError(f"ffmpeg cut failed (rc={rc}): {stderr[-500:]}")

    return output


async def probe_duration(path: Path) -> float:
    """Get media duration via ffprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    rc, stdout, stderr = await _run(cmd, timeout=30)
    if rc != 0:
        raise FFmpegError(f"ffprobe failed: {stderr}")
    try:
        return float(stdout.strip())
    except ValueError as e:
        raise FFmpegError(f"ffprobe returned non-numeric duration: {stdout!r}") from e


async def split_audio(source: Path, output_dir: Path, chunk_seconds: int) -> list[Path]:
    """Split audio jadi chunk ~chunk_seconds via segment muxer (stream-copy,
    no re-encode). Cuts di MP3 frame boundary (~26ms granularity) — durasi
    aktual per-chunk dekat target tapi gak presisi, jadi caller harus
    probe_duration() tiap chunk buat hitung offset yang akurat.
    `-reset_timestamps 1` bikin tiap chunk mulai dari 0."""
    output_dir.mkdir(parents=True, exist_ok=True)
    pattern = output_dir / "chunk_%03d.mp3"
    cmd = [
        "ffmpeg", "-y",
        "-i", str(source),
        "-f", "segment",
        "-segment_time", str(chunk_seconds),
        "-reset_timestamps", "1",
        "-c", "copy",
        str(pattern),
    ]
    rc, _, stderr = await _run(cmd)
    if rc != 0:
        raise FFmpegError(f"audio split failed (rc={rc}): {stderr[-500:]}")
    chunks = sorted(output_dir.glob("chunk_*.mp3"))
    if not chunks:
        raise FFmpegError(f"audio split produced no chunks in {output_dir}")
    return chunks


async def extract_audio(source: Path, output: Path, *, sample_rate: int = 16000) -> Path:
    """Extract mono audio for transcription. mp3 64k @ 16kHz keeps upload tiny."""
    output.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-i", str(source),
        "-vn",
        "-ac", "1",
        "-ar", str(sample_rate),
        "-c:a", "libmp3lame", "-b:a", "64k",
        str(output),
    ]
    rc, _, stderr = await _run(cmd)
    if rc != 0 or not output.exists():
        raise FFmpegError(f"audio extract failed: {stderr[-500:]}")
    return output
