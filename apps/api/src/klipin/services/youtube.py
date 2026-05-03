"""YouTube ingest via yt-dlp. Async wrapper over the blocking download call."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

logger = logging.getLogger(__name__)


class YoutubeError(Exception):
    pass


class TooLongError(YoutubeError):
    pass


@dataclass(slots=True)
class DownloadResult:
    video_path: Path
    audio_path: Path
    duration_sec: float
    title: str


def _ydl_opts(out_dir: Path, max_minutes: int) -> dict:
    return {
        "format": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": str(out_dir / "source.%(ext)s"),
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "match_filter": _build_duration_filter(max_minutes),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "64",
                "nopostoverwrites": False,
            }
        ],
        "keepvideo": True,
    }


def _build_duration_filter(max_minutes: int):
    max_sec = max_minutes * 60

    def _filter(info, *, incomplete=False):
        duration = info.get("duration")
        if duration and duration > max_sec:
            return f"video too long: {duration:.0f}s > {max_sec}s"
        return None

    return _filter


def _download_sync(url: str, out_dir: Path, max_minutes: int) -> DownloadResult:
    out_dir.mkdir(parents=True, exist_ok=True)
    opts = _ydl_opts(out_dir, max_minutes)

    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except DownloadError as e:
        msg = str(e)
        if "video too long" in msg:
            raise TooLongError(msg) from e
        raise YoutubeError(msg) from e

    if info is None:
        raise YoutubeError("yt-dlp returned no info")

    video_path = out_dir / "source.mp4"
    audio_path = out_dir / "source.mp3"

    if not video_path.exists():
        candidates = list(out_dir.glob("source.*"))
        video_candidates = [p for p in candidates if p.suffix in {".mp4", ".mkv", ".webm"}]
        if not video_candidates:
            raise YoutubeError(f"video file not found in {out_dir}")
        video_path = video_candidates[0]

    if not audio_path.exists():
        raise YoutubeError(f"audio extraction failed in {out_dir}")

    return DownloadResult(
        video_path=video_path,
        audio_path=audio_path,
        duration_sec=float(info.get("duration") or 0.0),
        title=str(info.get("title") or ""),
    )


async def download(url: str, out_dir: Path, max_minutes: int = 60) -> DownloadResult:
    """Download a YouTube URL to `out_dir`. Returns paths to video + extracted audio."""
    return await asyncio.to_thread(_download_sync, url, out_dir, max_minutes)
