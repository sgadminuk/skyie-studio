"""Admin endpoints — platform statistics, user management, job oversight."""

from __future__ import annotations

import uuid as uuid_mod
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.base import get_session
from db.models import CreditTransaction, Job, Usage, User
from api.dependencies import require_admin

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# ── Request schemas ───────────────────────────────────────────────────────────


class AdjustCreditsRequest(BaseModel):
    amount: int
    reason: str


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/stats")
async def get_stats(
    _admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Aggregate platform statistics."""
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    # Total users
    total_users_result = await session.execute(select(func.count(User.id)))
    total_users = total_users_result.scalar() or 0

    # Total jobs
    total_jobs_result = await session.execute(select(func.count(Job.id)))
    total_jobs = total_jobs_result.scalar() or 0

    # Jobs last 7 days
    jobs_7d_result = await session.execute(
        select(func.count(Job.id)).where(Job.created_at >= seven_days_ago)
    )
    jobs_7d = jobs_7d_result.scalar() or 0

    # Jobs last 30 days
    jobs_30d_result = await session.execute(
        select(func.count(Job.id)).where(Job.created_at >= thirty_days_ago)
    )
    jobs_30d = jobs_30d_result.scalar() or 0

    # Total GPU seconds
    gpu_seconds_result = await session.execute(
        select(func.coalesce(func.sum(Usage.gpu_seconds), 0.0))
    )
    total_gpu_seconds = float(gpu_seconds_result.scalar() or 0.0)

    return {
        "total_users": total_users,
        "total_jobs": total_jobs,
        "jobs_last_7d": jobs_7d,
        "jobs_last_30d": jobs_30d,
        "total_gpu_seconds": total_gpu_seconds,
    }


@router.get("/users")
async def list_users(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Paginated user list."""
    total_result = await session.execute(select(func.count(User.id)))
    total = total_result.scalar() or 0

    result = await session.execute(
        select(User)
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    users = result.scalars().all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "users": [
            {
                "id": str(u.id),
                "email": u.email,
                "name": u.name,
                "plan": u.plan,
                "credits": u.credits,
                "is_active": u.is_active,
                "is_admin": u.is_admin,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
    }


@router.post("/users/{user_id}/credits")
async def adjust_credits(
    user_id: uuid_mod.UUID,
    request: AdjustCreditsRequest,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Adjust a user's credit balance (positive to add, negative to deduct)."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_balance = user.credits + request.amount
    if new_balance < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Adjustment would result in negative balance ({new_balance})",
        )

    user.credits = new_balance

    txn = CreditTransaction(
        user_id=user_id,
        amount=request.amount,
        balance_after=new_balance,
        type="admin_adjustment",
        description=f"Admin ({admin.email}): {request.reason}",
    )
    session.add(txn)
    await session.commit()

    return {
        "user_id": str(user_id),
        "previous_balance": new_balance - request.amount,
        "adjustment": request.amount,
        "new_balance": new_balance,
        "reason": request.reason,
    }


@router.post("/users/{user_id}/disable")
async def toggle_user_active(
    user_id: uuid_mod.UUID,
    _admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Toggle a user's is_active status."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_admin:
        raise HTTPException(status_code=400, detail="Cannot disable an admin user")

    user.is_active = not user.is_active
    await session.commit()

    return {
        "user_id": str(user_id),
        "is_active": user.is_active,
        "detail": f"User {'enabled' if user.is_active else 'disabled'}",
    }


@router.get("/jobs")
async def list_all_jobs(
    status: str | None = Query(default=None),
    workflow: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """List all jobs with optional filters and pagination."""
    query = select(Job)

    if status:
        query = query.where(Job.status == status)
    if workflow:
        query = query.where(Job.workflow == workflow)

    # Total count with same filters
    count_query = select(func.count(Job.id))
    if status:
        count_query = count_query.where(Job.status == status)
    if workflow:
        count_query = count_query.where(Job.workflow == workflow)

    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    result = await session.execute(
        query.order_by(Job.created_at.desc()).offset(offset).limit(limit)
    )
    jobs = result.scalars().all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "jobs": [
            {
                "id": str(j.id),
                "user_id": str(j.user_id) if j.user_id else None,
                "workflow": j.workflow,
                "status": j.status,
                "progress": j.progress or 0,
                "step": j.step or "Unknown",
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "started_at": j.started_at.isoformat() if j.started_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                "error": j.error,
            }
            for j in jobs
        ],
    }
