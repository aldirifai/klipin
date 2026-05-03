"""ASS subtitle generator + burn-in. MVP preset: bold yellow Arial Black,
3-word chunks, lower-third placement (Alex Hormozi style).

ASS color is BBGGRR (not RGB):
  &H0000FFFF& = yellow (primary)
  &H00000000& = black (outline)
  &H80000000& = transparent black (back, semi-transparent)
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from pathlib import Path

from klipin.services import ffmpeg as ff
from klipin.services.transcribe import Transcript, WordSpan

logger = logging.getLogger(__name__)


class SubtitleError(Exception):
    pass


CHUNK_SIZE = 3


def _format_ass_time(seconds: float) -> str:
    """ASS time format: H:MM:SS.cc"""
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds - (h * 3600 + m * 60)
    return f"{h}:{m:02d}:{s:05.2f}"


def _escape_ass_text(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("{", r"\{")
        .replace("}", r"\}")
        .replace("\n", " ")
    )


def _chunk_words(words: list[WordSpan], size: int) -> list[list[WordSpan]]:
    return [words[i : i + size] for i in range(0, len(words), size)]


def _build_ass(
    words: list[WordSpan],
    video_offset: float,
    target_w: int,
    target_h: int,
) -> str:
    style_line = (
        "Style: Default,Arial Black,90,&H0000FFFF,&H000000FF,&H00000000,&H80000000,"
        "1,0,0,0,100,100,0,0,1,6,0,2,80,80,400,1"
    )

    header = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {target_w}\n"
        f"PlayResY: {target_h}\n"
        "WrapStyle: 0\n"
        "ScaledBorderAndShadow: yes\n"
        "\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"{style_line}\n"
        "\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, "
        "MarginV, Effect, Text\n"
    )

    lines: list[str] = []
    for chunk in _chunk_words(words, CHUNK_SIZE):
        if not chunk:
            continue
        start = chunk[0].start - video_offset
        end = chunk[-1].end - video_offset
        if end <= start:
            continue
        text = " ".join(w.word.strip() for w in chunk if w.word.strip()).upper()
        if not text:
            continue
        text = _escape_ass_text(text)
        lines.append(
            f"Dialogue: 0,{_format_ass_time(start)},{_format_ass_time(end)},"
            f"Default,,0,0,0,,{text}"
        )

    return header + "\n".join(lines) + "\n"


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
        raise SubtitleError(f"ffmpeg timed out after {timeout}s") from e
    return (
        proc.returncode or 0,
        stdout.decode(errors="replace"),
        stderr.decode(errors="replace"),
    )


async def burn_in_subtitles(
    video_path: Path,
    transcript: Transcript,
    clip_start_sec: float,
    clip_end_sec: float,
    output: Path,
    *,
    target_w: int = 1080,
    target_h: int = 1920,
) -> Path:
    """Generate ASS for words within [clip_start, clip_end], burn into video.
    `video_path` is the already-reframed 9:16 clip; `clip_start_sec` is the
    original-video timestamp where this clip began (used to offset transcript words)."""
    if not video_path.exists():
        raise SubtitleError(f"video missing: {video_path}")

    words_in_clip = [
        w for w in transcript.words if w.end > clip_start_sec and w.start < clip_end_sec
    ]

    output.parent.mkdir(parents=True, exist_ok=True)

    if not words_in_clip:
        logger.info("[subtitle] no words in clip range, copying without burn-in")
        cmd = [
            "ffmpeg", "-y",
            "-i", str(video_path),
            "-c", "copy",
            str(output),
        ]
        rc, _, stderr = await ff._run(cmd)
        if rc != 0 or not output.exists():
            raise SubtitleError(f"ffmpeg copy failed: {stderr[-500:]}")
        return output

    ass_content = _build_ass(words_in_clip, clip_start_sec, target_w, target_h)
    ass_filename = f"{output.stem}.ass"
    ass_path = output.parent / ass_filename
    ass_path.write_text(ass_content, encoding="utf-8")

    abs_video = video_path.resolve()
    abs_output = output.resolve()
    cmd = [
        "ffmpeg", "-y",
        "-i", str(abs_video),
        "-vf", f"ass={ass_filename}",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-c:a", "copy",
        "-movflags", "+faststart",
        str(abs_output),
    ]

    rc, _, stderr = await _run_in_cwd(cmd, cwd=output.parent)
    if rc != 0 or not output.exists():
        raise SubtitleError(f"ffmpeg burn-in failed: {stderr[-500:]}")

    with contextlib.suppress(OSError):
        ass_path.unlink()

    return output
