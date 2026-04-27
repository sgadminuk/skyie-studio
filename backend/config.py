from pydantic_settings import BaseSettings
from pathlib import Path
from typing import Any


class Settings(BaseSettings):
    # Server
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    ENVIRONMENT: str = "development"
    MOCK_MODE: bool = True

    # CORS — comma-separated origins. The default development list covers
    # local Next.js dev servers (3000–3002) for both marketing/ and frontend/.
    # Production sets this in .env.production to the real domains:
    #   CORS_ORIGINS=https://skyie.studio,https://app.skyie.studio
    CORS_ORIGINS: str = (
        "http://localhost:3000,"
        "http://localhost:3001,"
        "http://localhost:3002,"
        "https://skyie.studio,"
        "https://app.skyie.studio"
    )

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://skyie_studio:skyie_studio@localhost:5432/skyie_studio"
    DATABASE_URL_SYNC: str = "postgresql://skyie_studio:skyie_studio@localhost:5432/skyie_studio"

    # GPU
    CUDA_VISIBLE_DEVICES: str = "0"
    MODEL_BASE_PATH: Path = Path("/workspace/models")
    VRAM_LIMIT_GB: float = 23.0

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # Storage
    ASSETS_PATH: Path = Path("./assets")
    TEMP_PATH: Path = Path("./temp")
    OUTPUT_PATH: Path = Path("./assets/generated")
    BRANDS_PATH: Path = Path("./assets/brands")

    # GPU Inference Server
    GPU_SERVER_URL: str = ""
    GPU_API_KEY: str = ""
    GPU_TIMEOUT_SECONDS: int = 600
    GPU_UPLOAD_TIMEOUT: int = 120
    GPU_MAX_RETRIES: int = 2
    GPU_REGISTRATION_KEY: str = ""
    GPU_HEARTBEAT_TIMEOUT: int = 120
    HF_API_KEY: str = ""

    # Owner Account (OTP auth)
    OWNER_EMAIL: str = "hello@skyieglobal.co.uk"
    OWNER_NAME: str = "Deepak"

    # SMTP (legacy — unused, kept for compat)
    SMTP_HOST: str = ""

    # Maielr Email API
    MAIELR_API_KEY: str = ""
    MAIELR_WEBHOOK_SECRET: str = ""
    MAIELR_FROM_EMAIL: str = "noreply@skyie.studio"
    MAIELR_FROM_NAME: str = "Skyie Studio"

    # JWT Auth
    JWT_SECRET_KEY: str = "change-this-in-production-to-random-64-char-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # LLM (Prompt Enhancement)
    OPENAI_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4o-mini"

    # Gemini (Veo 3.1 video + Nano Banana image) — max quality defaults, no compromises
    GEMINI_API_KEY: str = ""
    GEMINI_VEO_MODEL: str = "veo-3.1-generate-preview"
    GEMINI_IMAGE_MODEL: str = "gemini-2.5-flash-image"
    GEMINI_DEFAULT_VIDEO_RESOLUTION: str = "1080p"
    GEMINI_DEFAULT_VIDEO_DURATION: int = 8
    GEMINI_DEFAULT_VIDEO_ASPECT: str = "16:9"
    GEMINI_DEFAULT_GENERATE_AUDIO: bool = True
    GEMINI_REQUEST_TIMEOUT: int = 900
    GEMINI_POLL_INTERVAL_SEC: int = 8
    GEMINI_MAX_POLL_ATTEMPTS: int = 120
    GEMINI_USER_RATE_PER_MIN: int = 30
    GEMINI_BREAKER_FAIL_THRESHOLD: int = 5
    GEMINI_BREAKER_WINDOW_SEC: int = 60
    GEMINI_BREAKER_COOLDOWN_SEC: int = 120

    # Cloudflare R2
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "skyie-studio"
    R2_ENDPOINT: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def model_post_init(self, __context: Any) -> None:
        """Make derived storage paths absolute and rooted under ASSETS_PATH.

        Without this, a deployment that only sets ASSETS_PATH (which docker-
        compose does) leaves OUTPUT_PATH and BRANDS_PATH at their relative
        defaults — the worker writes to ./assets/brands while ASSETS_PATH is
        /app/assets, so get_asset_url() can't compute a relative URL and
        falls back to the bare filename.
        """
        assets = self.ASSETS_PATH.resolve() if self.ASSETS_PATH.is_absolute() else self.ASSETS_PATH
        if not self.OUTPUT_PATH.is_absolute():
            self.OUTPUT_PATH = assets / "generated"
        if not self.BRANDS_PATH.is_absolute():
            self.BRANDS_PATH = assets / "brands"


settings = Settings()
