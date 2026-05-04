"""Storage cleanup CLI. Run via cron on host:

    docker compose exec api python -m klipin.scripts.cleanup_storage \\
        --max-age-days 30 --dry-run

Apa yang dibersihkan:
1. Job-job yang status FAILED + lebih lama dari N hari → hapus DB row + file
2. Clip-clip lebih lama dari N hari → hapus file mp4 (DB row dikeep
   buat history, output_path di-set NULL)
3. Orphan files di storage/clips/ yang gak ada di DB → hapus
4. Empty dirs di storage/jobs/ → hapus

Gunakan --dry-run dulu buat lihat apa yang bakal dihapus.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select

from klipin.config import settings
from klipin.db import SessionLocal
from klipin.models import Clip, Job


async def _run(max_age_days: int, dry_run: bool) -> None:
    cutoff = datetime.now(UTC) - timedelta(days=max_age_days)
    print(f"Cutoff: {cutoff.isoformat()} (older than {max_age_days} days)")
    print(f"Dry-run: {dry_run}")
    print()

    freed_bytes = 0
    removed_files = 0
    removed_jobs = 0
    removed_clip_files = 0

    async with SessionLocal() as db:
        # 1. Failed jobs older than cutoff
        failed_jobs = (
            await db.scalars(
                select(Job).where(Job.status == "failed", Job.created_at < cutoff)
            )
        ).all()
        print(f"Failed jobs to delete: {len(failed_jobs)}")
        for job in failed_jobs:
            job_dir = settings.storage_dir / "jobs" / job.id
            if job_dir.exists():
                for p in job_dir.iterdir():
                    try:
                        size = p.stat().st_size
                        if not dry_run:
                            p.unlink()
                        freed_bytes += size
                        removed_files += 1
                    except OSError:
                        pass
                if not dry_run:
                    with contextlib.suppress(OSError):
                        job_dir.rmdir()
            if not dry_run:
                await db.delete(job)
            removed_jobs += 1

        # 2. Old clips: delete mp4 file, keep DB row (set output_path NULL)
        old_clips = (
            await db.scalars(select(Clip).where(Clip.created_at < cutoff))
        ).all()
        print(f"Old clip files to remove: {len(old_clips)}")
        for clip in old_clips:
            if clip.output_path:
                p = Path(clip.output_path)
                if p.exists():
                    try:
                        size = p.stat().st_size
                        if not dry_run:
                            p.unlink()
                        freed_bytes += size
                        removed_clip_files += 1
                    except OSError:
                        pass
                if not dry_run:
                    clip.output_path = None

        # 3. Orphan clip files (in storage/clips/ but not in DB)
        clips_dir = settings.storage_dir / "clips"
        if clips_dir.exists():
            db_paths = {c.output_path for c in await db.scalars(select(Clip)) if c.output_path}
            for f in clips_dir.iterdir():
                if not f.is_file():
                    continue
                if str(f) not in db_paths:
                    try:
                        size = f.stat().st_size
                        if not dry_run:
                            f.unlink()
                        freed_bytes += size
                        removed_files += 1
                    except OSError:
                        pass

        # 4. Empty job dirs
        jobs_dir = settings.storage_dir / "jobs"
        if jobs_dir.exists():
            for d in jobs_dir.iterdir():
                if d.is_dir() and not any(d.iterdir()) and not dry_run:
                    with contextlib.suppress(OSError):
                        d.rmdir()

        if not dry_run:
            await db.commit()

    print()
    print("Summary:")
    print(f"  Failed jobs removed:  {removed_jobs}")
    print(f"  Clip files removed:   {removed_clip_files}")
    print(f"  Other files removed:  {removed_files}")
    print(f"  Disk space freed:     {freed_bytes / 1024 / 1024:.1f} MB")
    if dry_run:
        print()
        print("(dry-run, gak ada yang dihapus. Hapus --dry-run buat eksekusi.)")


def main() -> None:
    parser = argparse.ArgumentParser(prog="klipin.scripts.cleanup_storage")
    parser.add_argument(
        "--max-age-days",
        type=int,
        default=30,
        help="Hapus job/clip lebih lama dari N hari (default 30)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview tanpa hapus")
    args = parser.parse_args()
    asyncio.run(_run(args.max_age_days, args.dry_run))


if __name__ == "__main__":
    main()
