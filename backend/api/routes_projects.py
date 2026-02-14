"""Project CRUD endpoints — save, load, and manage workflow configurations."""

from __future__ import annotations

import uuid as uuid_mod

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.base import get_session
from db.models import Project, User
from api.dependencies import get_current_user
from services.job_queue import create_job, run_talking_head_task, run_broll_task, run_full_production_task
from services.credit_service import get_credit_cost, check_credits, reserve_credits

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


# ── Request / Response schemas ────────────────────────────────────────────────


class CreateProjectRequest(BaseModel):
    name: str
    workflow: str
    params: dict = {}


class UpdateProjectRequest(BaseModel):
    name: str | None = None
    params: dict | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────


def _project_to_dict(project: Project) -> dict:
    return {
        "id": str(project.id),
        "user_id": str(project.user_id),
        "name": project.name,
        "workflow": project.workflow,
        "params": project.params or {},
        "thumbnail_url": project.thumbnail_url,
        "last_job_id": str(project.last_job_id) if project.last_job_id else None,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }


async def _get_user_project(
    session: AsyncSession, project_id: uuid_mod.UUID, user_id: uuid_mod.UUID
) -> Project:
    """Fetch a project and verify ownership. Raises 404 if not found / not owned."""
    result = await session.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


# ── WORKFLOW task dispatcher ──────────────────────────────────────────────────

WORKFLOW_TASKS = {
    "talking_head": run_talking_head_task,
    "broll": run_broll_task,
    "full_production": run_full_production_task,
}


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/")
async def list_projects(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all projects belonging to the authenticated user."""
    result = await session.execute(
        select(Project)
        .where(Project.user_id == user.id)
        .order_by(Project.updated_at.desc())
    )
    projects = result.scalars().all()
    return {"projects": [_project_to_dict(p) for p in projects]}


@router.post("/")
async def create_project(
    request: CreateProjectRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new project."""
    project = Project(
        user_id=user.id,
        name=request.name,
        workflow=request.workflow,
        params=request.params,
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return _project_to_dict(project)


@router.get("/{project_id}")
async def get_project(
    project_id: uuid_mod.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a single project by ID (must be owned by current user)."""
    project = await _get_user_project(session, project_id, user.id)
    return _project_to_dict(project)


@router.put("/{project_id}")
async def update_project(
    project_id: uuid_mod.UUID,
    request: UpdateProjectRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update project name and/or params."""
    project = await _get_user_project(session, project_id, user.id)

    if request.name is not None:
        project.name = request.name
    if request.params is not None:
        project.params = request.params

    await session.commit()
    await session.refresh(project)
    return _project_to_dict(project)


@router.delete("/{project_id}")
async def delete_project(
    project_id: uuid_mod.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a project."""
    project = await _get_user_project(session, project_id, user.id)
    await session.delete(project)
    await session.commit()
    return {"detail": "Project deleted"}


@router.post("/{project_id}/duplicate")
async def duplicate_project(
    project_id: uuid_mod.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Duplicate a project with a new name."""
    original = await _get_user_project(session, project_id, user.id)

    duplicate = Project(
        user_id=user.id,
        name=f"{original.name} (copy)",
        workflow=original.workflow,
        params=original.params or {},
    )
    session.add(duplicate)
    await session.commit()
    await session.refresh(duplicate)
    return _project_to_dict(duplicate)


@router.post("/{project_id}/generate")
async def generate_from_project(
    project_id: uuid_mod.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a generation job using the project's saved workflow and params."""
    project = await _get_user_project(session, project_id, user.id)

    workflow = project.workflow
    params = project.params or {}

    task_fn = WORKFLOW_TASKS.get(workflow)
    if not task_fn:
        raise HTTPException(status_code=400, detail=f"Unknown workflow: {workflow}")

    cost = get_credit_cost(workflow, params)
    if not await check_credits(session, user.id, cost):
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits. Need {cost}, have {user.credits}",
        )

    job_id = create_job(workflow, params, user_id=str(user.id))
    await reserve_credits(
        session,
        user.id,
        cost,
        job_id=uuid_mod.UUID(job_id),
        description=f"Project '{project.name}' generation",
    )

    # Update project's last_job_id
    project.last_job_id = uuid_mod.UUID(job_id)
    await session.commit()

    task_fn.delay(job_id, params)

    return {
        "job_id": job_id,
        "project_id": str(project.id),
        "workflow": workflow,
        "status": "queued",
        "credits_used": cost,
    }
