"""Track per-video GPU cost based on generation time."""

GPU_COST_PER_HOUR = 0.379  # Vast.ai RTX 4090


def estimate_cost(generation_seconds: float) -> dict:
    """Calculate cost for a generation run."""
    hours = generation_seconds / 3600
    cost_usd = hours * GPU_COST_PER_HOUR
    cost_gbp = cost_usd * 0.79  # Approximate USD→GBP

    return {
        "generation_seconds": round(generation_seconds, 1),
        "gpu_hours": round(hours, 4),
        "cost_usd": round(cost_usd, 4),
        "cost_gbp": round(cost_gbp, 4),
    }
