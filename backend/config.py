from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # Server
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    ENVIRONMENT: str = "development"
    MOCK_MODE: bool = True

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

    # GPU Inference Server
    GPU_SERVER_URL: str = ""
    GPU_API_KEY: str = ""
    GPU_TIMEOUT_SECONDS: int = 600
    GPU_UPLOAD_TIMEOUT: int = 120
    GPU_MAX_RETRIES: int = 2
    HF_API_KEY: str = ""

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

    # Cloudflare R2
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "skyie-studio"
    R2_ENDPOINT: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
