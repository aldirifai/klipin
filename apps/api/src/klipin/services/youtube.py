"""YouTube ingest via yt-dlp. Async wrapper over the blocking download call.

Catatan deploy: kalau VPS dari datacenter (Hetzner/DO/AWS/etc), YouTube
sering blokir download dengan error "Sign in to confirm you're not a bot".
Workaround: kasih cookies file via env COOKIES_FROM_BROWSER atau
COOKIES_FILE (path absolut ke cookies.txt yang di-export dari browser).
"""

from __future__ import annotations

import asyncio
import logging
import os
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


class _YDLLogger:
    """Pipe yt-dlp logs ke Python logging supaya error visible di docker logs."""

    def debug(self, msg: str) -> None:
        if msg.startswith("[debug]"):
            logger.debug(msg)
        else:
            self.info(msg)

    def info(self, msg: str) -> None:
        logger.info("yt-dlp: %s", msg)

    def warning(self, msg: str) -> None:
        logger.warning("yt-dlp: %s", msg)

    def error(self, msg: str) -> None:
        logger.error("yt-dlp: %s", msg)


def _ydl_opts(out_dir: Path, max_minutes: int) -> dict:
    opts: dict = {
        # Lebih permissive: pakai any video+audio format, tapi tetep cap 1080p.
        "format": "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
        "outtmpl": str(out_dir / "source.%(ext)s"),
        "merge_output_format": "mp4",
        "noplaylist": True,
        "logger": _YDLLogger(),
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
        "retries": 5,
        "fragment_retries": 5,
        "concurrent_fragment_downloads": 4,
        "extractor_args": {
            # Per Q4 2025, android & ios clients butuh GVS PO token (YouTube
            # anti-bot baru). tv_simply + tv_embedded + mweb masih bypass-able
            # tanpa token. Urutan: yang paling reliable dulu.
            "youtube": {
                "player_client": [
                    "tv_simply",
                    "tv_embedded",
                    "mweb",
                    "web",
                ],
            },
        },
    }

    # Optional: cookies dari env (untuk bypass bot detection di datacenter IP)
    cookies_file = os.environ.get("YOUTUBE_COOKIES_FILE")
    cookies_browser = os.environ.get("YOUTUBE_COOKIES_FROM_BROWSER")
    if cookies_file and Path(cookies_file).exists():
        opts["cookiefile"] = cookies_file
    elif cookies_browser:
        opts["cookiesfrombrowser"] = (cookies_browser,)

    return opts


def _build_duration_filter(max_minutes: int):
    max_sec = max_minutes * 60

    def _filter(info, *, incomplete=False):
        duration = info.get("duration")
        if duration and duration > max_sec:
            return f"video too long: {duration:.0f}s > {max_sec}s"
        return None

    return _filter


_VIDEO_EXTS = {".mp4", ".mkv", ".webm", ".mov", ".m4v"}


def _find_video_file(out_dir: Path) -> Path | None:
    """Cari file video di out_dir. Coba `source.mp4` (merged) dulu,
    kalau gak ada, ambil file video apa pun yang awalannya `source.`
    (misal `source.f399.mp4` kalau merge gagal)."""
    final = out_dir / "source.mp4"
    if final.exists() and final.stat().st_size > 0:
        return final

    candidates = sorted(
        (p for p in out_dir.glob("source.*") if p.suffix.lower() in _VIDEO_EXTS),
        key=lambda p: p.stat().st_size,
        reverse=True,
    )
    return candidates[0] if candidates else None


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
        raise YoutubeError(f"yt-dlp download error: {msg}") from e

    if info is None:
        raise YoutubeError("yt-dlp returned no info (extract_info returned None)")

    video_path = _find_video_file(out_dir)
    audio_path = out_dir / "source.mp3"

    if video_path is None:
        existing = sorted(p.name for p in out_dir.iterdir())
        hint = (
            "YouTube blokir semua format (PO Token / bot detection). "
            "Solusi: export cookies dari browser kamu (yt-dlp --cookies-from-browser "
            "firefox --cookies cookies.txt URL), simpan ke server, set env "
            "YOUTUBE_COOKIES_FILE=/app/cookies.txt + mount via docker-compose."
        ) if not existing else f"Files yang ada: {existing}"
        raise YoutubeError(f"Video gak ke-download. {hint}")

    if not audio_path.exists():
        # Audio belum ke-extract — fallback ke extract manual via ffmpeg
        logger.warning("audio extract postprocessor gagal, audio file gak ada di %s", out_dir)
        existing = sorted(p.name for p in out_dir.iterdir())
        raise YoutubeError(
            f"audio extraction gagal. Files di {out_dir.name}/: {existing}"
        )

    return DownloadResult(
        video_path=video_path,
        audio_path=audio_path,
        duration_sec=float(info.get("duration") or 0.0),
        title=str(info.get("title") or ""),
    )


async def download(url: str, out_dir: Path, max_minutes: int = 60) -> DownloadResult:
    """Download a YouTube URL to `out_dir`. Returns paths to video + extracted audio."""
    return await asyncio.to_thread(_download_sync, url, out_dir, max_minutes)
