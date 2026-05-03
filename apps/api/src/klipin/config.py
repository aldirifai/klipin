from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./klipin.db"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    cors_origins: list[str] = ["http://localhost:3000"]

    storage_dir: Path = Path(__file__).resolve().parents[4] / "storage"

    max_input_minutes: int = 60
    whisper_model: str = "openai/whisper"
    claude_model: str = "claude-sonnet-4-6"

    anthropic_api_key: str = ""
    replicate_api_token: str = ""
    redis_url: str = "redis://localhost:6379"

    midtrans_server_key: str = ""
    midtrans_client_key: str = ""
    midtrans_is_production: bool = False
    lifetime_price_idr: int = 129000
    public_app_url: str = "http://localhost:3000"


settings = Settings()
