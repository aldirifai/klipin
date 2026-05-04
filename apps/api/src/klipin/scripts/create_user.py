"""CLI: create or upgrade a user, optionally with lifetime access.

Usage (lokal dev):
    uv run python -m klipin.scripts.create_user admin@klipin.id --lifetime

Usage (di Docker prod):
    docker compose exec api python -m klipin.scripts.create_user \\
        admin@klipin.aldirifai.com --lifetime

Password dibaca interaktif (getpass). Untuk non-interaktif, set env
`KLIPIN_NEW_PASSWORD`:
    docker compose exec -e KLIPIN_NEW_PASSWORD=secret123 api \\
        python -m klipin.scripts.create_user admin@... --lifetime

Idempotent: kalau user udah ada, password dibiarkan (pakai --reset-password
buat ganti) dan flag --lifetime cuma upgrade plan.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import os
import sys
from datetime import UTC, datetime

from sqlalchemy import select

from klipin.db import SessionLocal
from klipin.models import User
from klipin.security import hash_password


async def _run(email: str, password: str | None, lifetime: bool, reset_password: bool) -> int:
    async with SessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == email))

        if user:
            print(f"User {email} sudah ada (id={user.id}, plan={user.plan})")
            changed = False

            if reset_password:
                if not password:
                    print("ERROR: --reset-password tapi password kosong", file=sys.stderr)
                    return 2
                user.password_hash = hash_password(password)
                changed = True
                print("  - password di-reset")

            if lifetime and not user.lifetime_paid_at:
                user.lifetime_paid_at = datetime.now(UTC)
                user.plan = "lifetime"
                changed = True
                print("  - upgraded ke lifetime")
            elif lifetime:
                print(f"  - sudah lifetime sejak {user.lifetime_paid_at}")

            if changed:
                await db.commit()
            return 0

        # New user
        if not password:
            print("ERROR: password wajib untuk user baru", file=sys.stderr)
            return 2

        user = User(
            email=email,
            password_hash=hash_password(password),
            plan="lifetime" if lifetime else "free",
            lifetime_paid_at=datetime.now(UTC) if lifetime else None,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        suffix = " [lifetime]" if lifetime else ""
        print(f"Created user {email} (id={user.id}){suffix}")
        return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="klipin.scripts.create_user",
        description="Create or upgrade a Klipin user.",
    )
    parser.add_argument("email", help="Email user")
    parser.add_argument(
        "--lifetime",
        action="store_true",
        help="Set plan ke lifetime (untuk user baru: bypass payment; existing: upgrade)",
    )
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Reset password untuk user yang sudah ada (default: skip)",
    )
    args = parser.parse_args()

    password = os.environ.get("KLIPIN_NEW_PASSWORD")
    if not password:
        try:
            password = getpass.getpass(f"Password for {args.email} (kosong = skip): ")
        except (EOFError, KeyboardInterrupt):
            print()
            sys.exit(1)
    if not password:
        password = None

    rc = asyncio.run(_run(args.email, password, args.lifetime, args.reset_password))
    sys.exit(rc)


if __name__ == "__main__":
    main()
