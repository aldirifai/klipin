import contextlib
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klipin.config import settings
from klipin.db import get_session
from klipin.models import User
from klipin.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

MAX_COOKIES_BYTES = 100_000  # 100 KB; cookies.txt valid biasanya <10 KB

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: str
    plan: str


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterIn,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> TokenOut:
    existing = await db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email sudah terdaftar")
    user = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    await db.commit()
    return TokenOut(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenOut)
async def login(
    payload: LoginIn,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> TokenOut:
    user = await db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email atau password salah")
    return TokenOut(access_token=create_access_token(user.id))


async def current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token tidak valid")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User tidak ditemukan")
    return user


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(current_user)]) -> UserOut:
    return UserOut(id=user.id, email=user.email, plan=user.plan)


def _user_cookies_path(user_id: str):
    return settings.storage_dir / "users" / user_id / "cookies.txt"


class CookiesStatus(BaseModel):
    uploaded: bool
    size_bytes: int | None = None
    uploaded_at: datetime | None = None


@router.get("/cookies/status", response_model=CookiesStatus)
async def cookies_status(user: Annotated[User, Depends(current_user)]) -> CookiesStatus:
    path = _user_cookies_path(user.id)
    if not path.exists():
        return CookiesStatus(uploaded=False)
    stat = path.stat()
    return CookiesStatus(
        uploaded=True,
        size_bytes=stat.st_size,
        uploaded_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC),
    )


@router.post("/cookies", response_model=CookiesStatus, status_code=status.HTTP_201_CREATED)
async def upload_cookies(
    user: Annotated[User, Depends(current_user)],
    file: Annotated[UploadFile, File(description="cookies.txt (Netscape format)")],
) -> CookiesStatus:
    content = await file.read()
    if len(content) > MAX_COOKIES_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "File terlalu besar (max 100KB)",
        )
    if len(content) < 50:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File terlalu kecil — bukan cookies valid")

    try:
        text = content.decode("utf-8", errors="strict")
    except UnicodeDecodeError as e:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "File harus text UTF-8 (cookies.txt Netscape format)",
        ) from e

    first_line = text.splitlines()[0] if text else ""
    if "Netscape HTTP Cookie" not in first_line and "# HTTP Cookie File" not in first_line:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Format tidak valid — file harus diawali '# Netscape HTTP Cookie File'",
        )
    if "youtube.com" not in text:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Tidak ada cookies untuk youtube.com — pastikan export dari sesi YouTube login",
        )

    path = _user_cookies_path(user.id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    with contextlib.suppress(OSError):
        path.chmod(0o600)

    stat = path.stat()
    return CookiesStatus(
        uploaded=True,
        size_bytes=stat.st_size,
        uploaded_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC),
    )


@router.delete("/cookies", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cookies(user: Annotated[User, Depends(current_user)]) -> None:
    path = _user_cookies_path(user.id)
    path.unlink(missing_ok=True)
