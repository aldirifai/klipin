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
import shutil
import tempfile
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


def _ydl_opts(out_dir: Path, max_minutes: int, cookies_override: Path | None = None) -> dict:
    opts: dict = {
        # Multi-tier fallback: prefer 1080p video+audio, tapi fallback ke
        # whatever yang available. Beberapa video gak punya format yang
        # match constraint ketat — better kasih lebih banyak escape hatch
        # daripada gagal total.
        "format": (
            "bestvideo[height<=1080]+bestaudio/"
            "best[height<=1080]/"
            "bestvideo+bestaudio/"
            "best"
        ),
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
            # bgutil PO Token plugin (lihat bgutil-pot service di
            # docker-compose.yml) auto-generate token via HTTP. Plugin ke-load
            # otomatis dari Python entrypoint.
            "youtube": {"player_client": ["web", "tv_simply", "mweb"]},
            "youtubepot-bgutilhttp": {
                "base_url": [
                    os.environ.get("BG_UTIL_POT_PROVIDER_URL", "http://bgutil-pot:4416"),
                ],
            },
        },
    }

    # Cookies priority: per-user upload > env file > browser fallback
    cookies_file: str | None
    if cookies_override is not None:
        cookies_file = str(cookies_override)
    else:
        cookies_file = os.environ.get("YOUTUBE_COOKIES_FILE")
    cookies_browser = os.environ.get("YOUTUBE_COOKIES_FROM_BROWSER")
    if cookies_file:
        src = Path(cookies_file)
        if src.exists():
            # yt-dlp update cookies file selama session (refresh tokens). Mount
            # bisa read-only, jadi copy ke /tmp dulu — biar yt-dlp boleh write
            # tanpa nyentuh source file di host.
            try:
                size = src.stat().st_size
                writable = Path(tempfile.gettempdir()) / "klipin_yt_cookies.txt"
                shutil.copy2(src, writable)
                writable.chmod(0o600)
                opts["cookiefile"] = str(writable)
                logger.info(
                    "yt-dlp pakai cookies dari %s (%d bytes, copy ke %s)",
                    cookies_file,
                    size,
                    writable,
                )
            except OSError as e:
                logger.warning("Gagal siapin cookies dari %s: %s", cookies_file, e)
        else:
            logger.warning(
                "YOUTUBE_COOKIES_FILE=%s tapi file gak ada di container. "
                "Cek mount di docker-compose.yml.",
                cookies_file,
            )
    elif cookies_browser:
        opts["cookiesfrombrowser"] = (cookies_browser,)
        logger.info("yt-dlp pakai cookies dari browser: %s", cookies_browser)
    else:
        logger.info("yt-dlp run tanpa cookies (YOUTUBE_COOKIES_FILE not set)")

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


def _download_sync(
    url: str, out_dir: Path, max_minutes: int, cookies_override: Path | None = None
) -> DownloadResult:
    out_dir.mkdir(parents=True, exist_ok=True)
    opts = _ydl_opts(out_dir, max_minutes, cookies_override)

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


async def download(
    url: str,
    out_dir: Path,
    max_minutes: int = 60,
    cookies_file: Path | None = None,
) -> DownloadResult:
    """Download a YouTube URL to `out_dir`. Returns paths to video + extracted audio.

    `cookies_file` overrides the env-based YOUTUBE_COOKIES_FILE — used for per-user
    cookies uploaded via the API."""
    return await asyncio.to_thread(_download_sync, url, out_dir, max_minutes, cookies_file)
