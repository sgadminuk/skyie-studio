from config import settings


def get_gpu_info() -> dict:
    """Return GPU status. Returns mock data when MOCK_MODE is enabled."""
    if settings.MOCK_MODE:
        return {
            "available": False,
            "mock_mode": True,
            "name": "Mock GPU (RTX 4090)",
            "vram_total_gb": 24.0,
            "vram_used_gb": 0.0,
            "vram_free_gb": 24.0,
            "utilization_percent": 0,
        }

    try:
        import torch

        if not torch.cuda.is_available():
            return {"available": False, "mock_mode": False, "error": "CUDA not available"}

        props = torch.cuda.get_device_properties(0)
        allocated = torch.cuda.memory_allocated(0) / 1e9
        total = props.total_mem / 1e9

        return {
            "available": True,
            "mock_mode": False,
            "name": torch.cuda.get_device_name(0),
            "vram_total_gb": round(total, 1),
            "vram_used_gb": round(allocated, 1),
            "vram_free_gb": round(total - allocated, 1),
            "utilization_percent": round(allocated / total * 100, 1),
        }
    except ImportError:
        return {"available": False, "mock_mode": False, "error": "PyTorch not installed"}
