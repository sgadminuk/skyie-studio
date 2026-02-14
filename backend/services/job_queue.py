"""Celery job queue with PostgreSQL persistence and Redis pub/sub progress.

Job lifecycle:
  1. create_job() — inserts into PostgreSQL + caches in Redis
  2. update_job() — updates PostgreSQL + publishes progress via Redis pub/sub
  3. get_job() — reads from Redis cache first, falls back to PostgreSQL
  4. list_jobs() — queries PostgreSQL (sorted, paginated)

Redis is used ONLY for:
  - Celery broker (task queue)
  - Celery result backend
  - Real-time progress pub/sub
  - Short-lived job state cache (for WebSocket streaming performance)
"""

import json
import time
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from enum import Enum

from celery import Celery
from redis import Redis
from sqlalchemy import create_engine, select, update as sa_update, desc
from sqlalchemy.orm import Session

from config import settings

logger = logging.getLogger(__name__)

# ── Celery ───────────────────────────────────────────────────────────────────

celery_app = Celery(
    "skyie_studio",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    worker_concurrency=1,  # Sequential — one GPU
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# ── Redis (pub/sub + cache) ─────────────────────────────────────────────────

redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)

JOB_PREFIX = "skyie:job:"
JOB_TTL = 86400 * 1  # 1 day cache (PostgreSQL is source of truth)

# ── Sync SQLAlchemy engine (for Celery workers — no async event loop) ────────

_sync_engine = create_engine(
    settings.DATABASE_URL_SYNC,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# ── Job CRUD ─────────────────────────────────────────────────────────────────

def create_job(workflow: str, params: dict) -> str:
    """Create a new job in PostgreSQL and cache in Redis."""
    from db.models import Job

    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Insert into PostgreSQL
    with Session(_sync_engine) as session:
        job = Job(
            id=uuid.UUID(job_id),
            workflow=workflow,
            status=JobStatus.QUEUED.value,
            progress=0,
            step="Queued",
            params=params,
            created_at=now,
        )
        session.add(job)
        session.commit()

    # Cache in Redis for fast WebSocket lookups
    redis_data = {
        "id": job_id,
        "workflow": workflow,
        "status": JobStatus.QUEUED.value,
        "progress": 0,
        "step": "Queued",
        "params": json.dumps(params),
        "created_at": now.isoformat(),
        "started_at": "",
        "completed_at": "",
        "output_path": "",
        "error": "",
    }
    redis_client.hset(f"{JOB_PREFIX}{job_id}", mapping=redis_data)
    redis_client.expire(f"{JOB_PREFIX}{job_id}", JOB_TTL)

    return job_id


def get_job(job_id: str) -> dict | None:
    """Get job data — Redis cache first, PostgreSQL fallback."""
    # Try Redis cache
    data = redis_client.hgetall(f"{JOB_PREFIX}{job_id}")
    if data:
        data["progress"] = int(data.get("progress", 0))
        if data.get("params"):
            try:
                data["params"] = json.loads(data["params"])
            except (json.JSONDecodeError, TypeError):
                pass
        return data

    # Fallback to PostgreSQL
    from db.models import Job

    with Session(_sync_engine) as session:
        job = session.get(Job, uuid.UUID(job_id))
        if not job:
            return None
        return _job_to_dict(job)


def update_job(job_id: str, **fields):
    """Update job in PostgreSQL + Redis cache, and publish progress via pub/sub."""
    from db.models import Job

    # Map fields to DB column values
    db_fields = {}
    for key, value in fields.items():
        if key == "status" and isinstance(value, JobStatus):
            db_fields[key] = value.value
        elif key in ("started_at", "completed_at") and isinstance(value, (int, float)):
            db_fields[key] = datetime.fromtimestamp(value, tz=timezone.utc)
        else:
            db_fields[key] = value

    # Update PostgreSQL
    with Session(_sync_engine) as session:
        session.execute(
            sa_update(Job).where(Job.id == uuid.UUID(job_id)).values(**db_fields)
        )
        session.commit()

    # Update Redis cache
    redis_key = f"{JOB_PREFIX}{job_id}"
    redis_fields = {}
    for k, v in fields.items():
        if isinstance(v, JobStatus):
            redis_fields[k] = v.value
        elif v is None:
            redis_fields[k] = ""
        else:
            redis_fields[k] = str(v)
    if redis_fields:
        redis_client.hset(redis_key, mapping=redis_fields)
        redis_client.expire(redis_key, JOB_TTL)

    # Publish progress via Redis pub/sub (for WebSocket streaming)
    pub_data = {"job_id": job_id}
    for k, v in fields.items():
        pub_data[k] = v.value if isinstance(v, JobStatus) else v
    redis_client.publish(f"skyie:progress:{job_id}", json.dumps(pub_data, default=str))


def list_jobs(limit: int = 50) -> list[dict]:
    """List recent jobs from PostgreSQL, ordered by creation time."""
    from db.models import Job

    with Session(_sync_engine) as session:
        jobs = session.execute(
            select(Job).order_by(desc(Job.created_at)).limit(limit)
        ).scalars().all()
        return [_job_to_dict(j) for j in jobs]


def _job_to_dict(job) -> dict:
    """Convert a Job ORM instance to a dictionary matching the API contract."""
    return {
        "id": str(job.id),
        "workflow": job.workflow,
        "status": job.status,
        "progress": job.progress or 0,
        "step": job.step or "Unknown",
        "params": job.params or {},
        "created_at": job.created_at.isoformat() if job.created_at else "",
        "started_at": job.started_at.isoformat() if job.started_at else "",
        "completed_at": job.completed_at.isoformat() if job.completed_at else "",
        "output_path": job.output_path or "",
        "error": job.error or "",
    }


# ── Celery Tasks ─────────────────────────────────────────────────────────────

@celery_app.task(name="skyie.run_talking_head", bind=True)
def run_talking_head_task(self, job_id: str, params: dict):
    """Execute talking head workflow."""
    from workflows.talking_head import execute_talking_head
    _run_workflow(job_id, params, execute_talking_head)


@celery_app.task(name="skyie.run_broll", bind=True)
def run_broll_task(self, job_id: str, params: dict):
    """Execute b-roll workflow."""
    from workflows.ai_broll import execute_broll
    _run_workflow(job_id, params, execute_broll)


@celery_app.task(name="skyie.run_full_production", bind=True)
def run_full_production_task(self, job_id: str, params: dict):
    """Execute full production workflow."""
    from workflows.full_production import execute_full_production
    _run_workflow(job_id, params, execute_full_production)


def _run_workflow(job_id: str, params: dict, workflow_fn):
    """Common wrapper for running any workflow."""
    update_job(job_id, status=JobStatus.PROCESSING, started_at=time.time(), step="Starting")
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        output_path = loop.run_until_complete(workflow_fn(job_id, params))
        loop.close()

        update_job(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100,
            step="Complete",
            completed_at=time.time(),
            output_path=output_path or "",
        )
    except Exception as e:
        logger.exception(f"Job {job_id} failed: {e}")
        update_job(
            job_id,
            status=JobStatus.FAILED,
            step="Failed",
            completed_at=time.time(),
            error=str(e),
        )
