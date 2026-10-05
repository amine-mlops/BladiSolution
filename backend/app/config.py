from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "BladiSolution"
    environment: str = "development"

    database_url: str = "postgresql+psycopg://bladi:bladi@localhost:5433/bladisolution"

    # Auth
    jwt_secret: str = "dev-only-change-me-in-production-please-32b"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24 * 7
    cookie_name: str = "bladi_session"
    cookie_secure: bool = False

    # CORS (only needed when the frontend is served from another origin)
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # AI provider: "auto" uses Claude when credentials exist, otherwise the local engine.
    ai_provider: str = "auto"
    anthropic_api_key: str | None = None
    ai_model: str = "claude-opus-5-5"
    ai_timeout_seconds: float = 25.0

    # Uploads
    upload_dir: str = "uploads"
    max_upload_mb: int = 5

    # Rate limiting
    rate_limit_enabled: bool = True

    # Seed the demo database on startup when it is empty
    seed_on_startup: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
