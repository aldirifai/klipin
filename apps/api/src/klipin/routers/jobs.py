"""Job CRUD endpoints. Submission triggers BackgroundTask pipeline."""

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klipin.config import settings
from klipin.db import get_session
from klipin.models import Clip, Job, User
from klipin.routers.auth import current_user
from klipin.services.pipeline import process_job

MAX_UPLOAD_BYTES = 1024 * 1024 * 1024  # 1 GB
ALLOWED_VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".m4v"}

router = APIRouter(prefix="/jobs", tags=["jobs"])
clips_router = APIRouter(prefix="/clips", tags=["clips"])


class JobCreateIn(BaseModel):
    youtube_url: HttpUrl


class ClipOut(BaseModel):
    id: str
    start_sec: float
    end_sec: float
    download_url: str | None
    caption: str | None
    hook_score: float | None
    reason: str | None


class JobOut(BaseModel):
    id: str
    youtube_url: str
    status: str
    duration_sec: float | None
    error: str | None
    clips: list[ClipOut] = Field(default_factory=list)


def _serialize(job: Job, clips: list[Clip] | None = None) -> JobOut:
    return JobOut(
        id=job.id,
        youtube_url=job.youtube_url,
        status=job.status,
        duration_sec=job.duration_sec,
        error=job.error,
        clips=[
            ClipOut(
                id=c.id,
                start_sec=c.start_sec,
                end_sec=c.end_sec,
                download_url=f"/clips/{c.id}/file" if c.output_path else None,
                caption=c.caption,
                hook_score=c.hook_score,
                reason=c.reason,
            )
            for c in (clips or [])
        ],
    )


@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def create_job(
    payload: JobCreateIn,
    background: BackgroundTasks,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> JobOut:
    job = Job(user_id=user.id, youtube_url=str(payload.youtube_url))
    db.add(job)
    await db.commit()
    await db.refresh(job)

    background.add_task(process_job, job.id)
    return _serialize(job)


@router.post("/upload", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def upload_job(
    background: BackgroundTasks,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
    file: Annotated[UploadFile, File(description="Video file (mp4/mov/mkv/webm)")],
) -> JobOut:
    """Upload video langsung tanpa lewat YouTube. Pipeline (transcribe →
    highlight → cut → reframe → subtitle) sama persis."""
    if not file.filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File harus punya nama")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Format gak didukung. Pakai salah satu: {sorted(ALLOWED_VIDEO_EXTS)}",
        )

    job = Job(user_id=user.id, youtube_url=f"upload://{file.filename}")
    db.add(job)
    await db.commit()
    await db.refresh(job)

    job_dir = settings.storage_dir / "jobs" / job.id
    job_dir.mkdir(parents=True, exist_ok=True)
    source_path = job_dir / "source.mp4"

    # Stream file ke disk, cap di 1GB
    written = 0
    with source_path.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            written += len(chunk)
            if written > MAX_UPLOAD_BYTES:
                source_path.unlink(missing_ok=True)
                await db.delete(job)
                await db.commit()
                raise HTTPException(
                    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    "File terlalu besar (max 1 GB)",
                )
            out.write(chunk)

    job.source_path = str(source_path)
    await db.commit()
    await db.refresh(job)

    background.add_task(process_job, job.id)
    return _serialize(job)


@router.get("", response_model=list[JobOut])
async def list_jobs(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> list[JobOut]:
    rows = await db.scalars(
        select(Job).where(Job.user_id == user.id).order_by(Job.created_at.desc())
    )
    return [_serialize(j) for j in rows.all()]


@router.get("/{job_id}", response_model=JobOut)
async def get_job(
    job_id: str,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> JobOut:
    job = await db.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job tidak ditemukan")

    clip_rows = await db.scalars(select(Clip).where(Clip.job_id == job.id))
    return _serialize(job, list(clip_rows.all()))


@clips_router.get("/{clip_id}/file")
async def stream_clip(
    clip_id: str,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> FileResponse:
    clip = await db.get(Clip, clip_id)
    if not clip or not clip.output_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Klip tidak ditemukan")
    job = await db.get(Job, clip.job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Klip tidak ditemukan")

    path = Path(clip.output_path)
    if not path.exists():
        raise HTTPException(status.HTTP_410_GONE, "File klip sudah tidak ada")
    return FileResponse(path, media_type="video/mp4", filename=f"klipin-{clip.id[:8]}.mp4")
