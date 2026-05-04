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
    """Full render: cut → reframe (9:16) → burn subtitles.
    Cut step pakai -c copy (lossless, low memory) — keyframe alignment ~1-2s
    lebih maju OK karena reframe+subtitle yang final."""
    base = f"{job_id[:8]}_{int(h.start)}_{int(h.end)}"
    raw_path = _clip_dir() / f"{base}_raw.mp4"
    reframed_path = _clip_dir() / f"{base}_v.mp4"
    final_path = _clip_dir() / f"{base}.mp4"

    try:
        await ffmpeg.cut_segment(source_path, h.start, h.end, raw_path, reencode=False)
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
    """Pipeline orchestrator. Updates job.status across stages.

    Job sourcing:
    - Kalau `youtube_url` ada → download via yt-dlp (Stage 1)
    - Kalau `source_path` udah ada (dari upload) → skip download, extract audio
    """
    logger.info("[job %s] starting pipeline", job_id)

    try:
        async with SessionLocal() as db:
            job = await db.scalar(select(Job).where(Job.id == job_id))
            if not job:
                logger.error("[job %s] not found in DB", job_id)
                return
            youtube_url = job.youtube_url
            existing_source = job.source_path
            user_id = job.user_id

        out_dir = _job_dir(job_id)

        if existing_source and Path(existing_source).exists():
            # Stage 1 (upload variant): user upload udah ada, extract audio
            await _set_status(job_id, JobStatus.DOWNLOADING)
            video_path = Path(existing_source)
            duration_sec = await ffmpeg.probe_duration(video_path)
            max_sec = settings.max_input_minutes * 60
            if duration_sec > max_sec:
                raise youtube.TooLongError(
                    f"Video {duration_sec:.0f}s > batas {max_sec}s"
                )
            audio_path = out_dir / "source.mp3"
            await ffmpeg.extract_audio(video_path, audio_path)
            logger.info(
                "[job %s] uploaded source %.1fs, audio extracted",
                job_id,
                duration_sec,
            )
            await _set_status(
                job_id,
                JobStatus.TRANSCRIBING,
                duration_sec=duration_sec,
            )
        else:
            # Stage 1 (URL variant): download via yt-dlp
            await _set_status(job_id, JobStatus.DOWNLOADING)
            user_cookies = settings.storage_dir / "users" / user_id / "cookies.txt"
            dl = await youtube.download(
                youtube_url,
                out_dir,
                max_minutes=settings.max_input_minutes,
                cookies_file=user_cookies if user_cookies.exists() else None,
            )
            video_path = dl.video_path
            audio_path = dl.audio_path
            duration_sec = dl.duration_sec
            logger.info(
                "[job %s] downloaded %s (%.1fs)", job_id, dl.title, duration_sec
            )
            await _set_status(
                job_id,
                JobStatus.TRANSCRIBING,
                source_path=str(video_path),
                duration_sec=duration_sec,
            )

        # Stage 2: transcribe
        transcript = await transcribe.transcribe(audio_path, language="id")
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

        # Stage 4: render clips (concurrency-bounded). Tiap render butuh
        # ~300-500MB RAM untuk FFmpeg encode HD; pakai semaphore biar gak OOM.
        await _set_status(job_id, JobStatus.RENDERING)
        sem = asyncio.Semaphore(settings.max_concurrent_renders)

        async def _render_with_sem(h: highlight.Highlight) -> None:
            async with sem:
                await _render_clip(job_id, video_path, transcript, h)

        await asyncio.gather(*[_render_with_sem(h) for h in result.highlights])
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
