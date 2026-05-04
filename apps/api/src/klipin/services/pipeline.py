"""End-to-end job pipeline. Runs as FastAPI BackgroundTask in dev,
swaps to arq worker in production (Day 7).

Stages:
  download → transcribe → analyze (highlights) → render (cut + reframe + subtitle)
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import traceback
from pathlib import Path

from sqlalchemy import select

from klipin.config import settings
from klipin.db import SessionLocal
from klipin.models import Clip, Job, JobStatus
from klipin.services import ffmpeg, highlight, reframe, subtitle, transcribe, youtube

logger = logging.getLogger(__name__)


def _job_dir(job_id: str) -> Path:
    path = settings.storage_dir / "jobs" / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _clip_dir() -> Path:
    path = settings.storage_dir / "clips"
    path.mkdir(parents=True, exist_ok=True)
    return path


async def _set_status(job_id: str, status: JobStatus, **fields) -> None:
    async with SessionLocal() as db:
        job = await db.scalar(select(Job).where(Job.id == job_id))
        if not job:
            return
        job.status = status.value
        for k, v in fields.items():
            setattr(job, k, v)
        await db.commit()


async def _persist_clip(
    job_id: str,
    *,
    start: float,
    end: float,
    caption: str,
    reason: str,
    hook_score: float,
    output_path: str,
) -> str:
    async with SessionLocal() as db:
        clip = Clip(
            job_id=job_id,
            start_sec=start,
            end_sec=end,
            caption=caption,
            reason=reason,
            hook_score=hook_score,
            output_path=output_path,
        )
        db.add(clip)
        await db.commit()
        await db.refresh(clip)
        return clip.id


async def _render_clip(
    job_id: str,
    source_path: Path,
    transcript: transcribe.Transcript,
    h: highlight.Highlight,
) -> None:
    """Full render: cut → reframe (9:16) → burn subtitles. 3 FFmpeg passes."""
    base = f"{job_id[:8]}_{int(h.start)}_{int(h.end)}"
    raw_path = _clip_dir() / f"{base}_raw.mp4"
    reframed_path = _clip_dir() / f"{base}_v.mp4"
    final_path = _clip_dir() / f"{base}.mp4"

    try:
        await ffmpeg.cut_segment(source_path, h.start, h.end, raw_path, reencode=True)
        await reframe.reframe_to_vertical(raw_path, reframed_path)
        await subtitle.burn_in_subtitles(
            reframed_path, transcript, h.start, h.end, final_path
        )
    finally:
        for p in (raw_path, reframed_path):
            with contextlib.suppress(OSError):
                p.unlink(missing_ok=True)

    await _persist_clip(
        job_id,
        start=h.start,
        end=h.end,
        caption=h.caption or h.title,
        reason=h.reason,
        hook_score=h.hook_score,
        output_path=str(final_path),
    )


async def process_job(job_id: str) -> None:
    """Pipeline orchestrator. Updates job.status across stages."""
    logger.info("[job %s] starting pipeline", job_id)

    try:
        async with SessionLocal() as db:
            job = await db.scalar(select(Job).where(Job.id == job_id))
            if not job:
                logger.error("[job %s] not found in DB", job_id)
                return
            youtube_url = job.youtube_url

        out_dir = _job_dir(job_id)

        # Stage 1: download (pakai cookies user kalau ada)
        await _set_status(job_id, JobStatus.DOWNLOADING)
        user_cookies = settings.storage_dir / "users" / job.user_id / "cookies.txt"
        download = await youtube.download(
            youtube_url,
            out_dir,
            max_minutes=settings.max_input_minutes,
            cookies_file=user_cookies if user_cookies.exists() else None,
        )
        logger.info(
            "[job %s] downloaded %s (%.1fs)", job_id, download.title, download.duration_sec
        )

        # Stage 2: transcribe
        await _set_status(
            job_id,
            JobStatus.TRANSCRIBING,
            source_path=str(download.video_path),
            duration_sec=download.duration_sec,
        )
        transcript = await transcribe.transcribe(download.audio_path, language="id")
        transcript_path = out_dir / "transcript.json"
        transcribe.save_transcript(transcript, transcript_path)
        logger.info("[job %s] transcribed %d words", job_id, len(transcript.words))

        # Stage 3: analyze (Claude highlight detection)
        await _set_status(job_id, JobStatus.ANALYZING, transcript_path=str(transcript_path))
        result = await highlight.detect_highlights(transcript)
        if not result.highlights:
            await _set_status(
                job_id,
                JobStatus.FAILED,
                error="Tidak ada momen viral yang bisa diambil dari video ini.",
            )
            return
        highlights_path = out_dir / "highlights.json"
        highlight.save_highlights(result.highlights, highlights_path)
        logger.info(
            "[job %s] picked %d highlights (cache_read=%d, in=%d, out=%d)",
            job_id,
            len(result.highlights),
            result.cache_read_tokens,
            result.input_tokens,
            result.output_tokens,
        )

        # Stage 4: render clips (parallel — cut + reframe + subtitle)
        await _set_status(job_id, JobStatus.RENDERING)
        await asyncio.gather(
            *[
                _render_clip(job_id, download.video_path, transcript, h)
                for h in result.highlights
            ]
        )
        logger.info("[job %s] rendered %d clips", job_id, len(result.highlights))

        await _set_status(job_id, JobStatus.DONE)
        logger.info("[job %s] pipeline complete", job_id)

    except youtube.TooLongError as e:
        logger.warning("[job %s] too long: %s", job_id, e)
        await _set_status(job_id, JobStatus.FAILED, error=f"Video terlalu panjang: {e}")
    except (
        youtube.YoutubeError,
        transcribe.TranscribeError,
        highlight.HighlightError,
        ffmpeg.FFmpegError,
        reframe.ReframeError,
        subtitle.SubtitleError,
    ) as e:
        logger.error("[job %s] pipeline error: %s", job_id, e)
        await _set_status(job_id, JobStatus.FAILED, error=str(e))
    except Exception as e:
        logger.exception("[job %s] unexpected error", job_id)
        await _set_status(
            job_id,
            JobStatus.FAILED,
            error=f"Unexpected: {e}\n{traceback.format_exc()[:500]}",
        )
