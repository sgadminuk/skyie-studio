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

    # Cloudflare R2 (Phase 2)
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "skyie-studio"
    R2_ENDPOINT: str = ""

    # Auth (Phase 2)
    SKYIE_AUTH_URL: str = ""
    SKYIE_AUTH_API_KEY: str = ""

    # Billing (Phase 2)
    ZYPPOPAY_API_URL: str = ""
    ZYPPOPAY_API_KEY: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
