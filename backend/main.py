import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from config import settings
from models.model_manager import model_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting Skyie Studio ({settings.ENVIRONMENT})")
    logger.info(f"Mock mode: {settings.MOCK_MODE}")

    # Ensure storage directories exist
    for path in [settings.ASSETS_PATH, settings.TEMP_PATH, settings.OUTPUT_PATH]:
        Path(path).mkdir(parents=True, exist_ok=True)
    (settings.ASSETS_PATH / "avatars").mkdir(exist_ok=True)
    (settings.ASSETS_PATH / "voices").mkdir(exist_ok=True)

    # Initialize database
    from db.base import init_db
    await init_db()
    logger.info("Database initialized")

    yield

    # Shutdown
    logger.info("Shutting down — unloading models")
    await model_manager.unload_all()

    from db.base import close_db
    await close_db()
    logger.info("Database connections closed")


app = FastAPI(
    title="Skyie Studio",
    description="AI Video Generation Platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file serving for generated assets
assets_dir = Path(settings.ASSETS_PATH)
assets_dir.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

# Register routers
from api.routes_health import router as health_router
from api.routes_generate import router as generate_router
from api.routes_jobs import router as jobs_router
from api.routes_assets import router as assets_router
from api.routes_export import router as export_router

app.include_router(health_router)
app.include_router(generate_router)
app.include_router(jobs_router)
app.include_router(assets_router)
app.include_router(export_router)
