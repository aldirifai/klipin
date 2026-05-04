from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_storage_dir() -> Path:
    """Default storage location. In dev: <repo-root>/storage (cari folder
    yang punya 'apps/' subdir). In Docker: /app/storage (cwd). Env
    STORAGE_DIR override-nya."""
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "apps").is_dir():
            return parent / "storage"
    return Path.cwd() / "storage"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./klipin.db"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    cors_origins: list[str] = ["http://localhost:3000"]

    storage_dir: Path = Field(default_factory=_default_storage_dir)

    max_input_minutes: int = 60
    whisper_model: str = "vaibhavs10/incredibly-fast-whisper"
    claude_model: str = "claude-sonnet-4-6"

    # Render concurrency. Setelah refactor: 1 FFmpeg pass per clip
    # (cut+reframe+subtitle combined), ~250-350MB RAM peak. Default 2 =
    # 2 clips paralel — fit di VPS 2-4GB. Naikin ke 3-4 kalau RAM 8GB+.
    max_concurrent_renders: int = 2

    anthropic_api_key: str = ""
    replicate_api_token: str = ""
    redis_url: str = "redis://localhost:6379"

    midtrans_server_key: str = ""
    midtrans_client_key: str = ""
    midtrans_is_production: bool = False
    lifetime_price_idr: int = 129000
    public_app_url: str = "http://localhost:3000"


settings = Settings()
