import shutil
from fastapi import APIRouter
from config import settings
from models.model_manager import model_manager
from utils.vram_monitor import get_gpu_info

router = APIRouter(prefix="/api/v1", tags=["health"])


@router.get("/health")
async def health_check():
    # Disk usage
    disk = shutil.disk_usage(str(settings.ASSETS_PATH))

    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "mock_mode": settings.MOCK_MODE,
        "gpu": get_gpu_info(),
        "models": model_manager.get_status(),
        "disk": {
            "total_gb": round(disk.total / 1e9, 1),
            "used_gb": round(disk.used / 1e9, 1),
            "free_gb": round(disk.free / 1e9, 1),
        },
    }
