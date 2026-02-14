"""SQLAlchemy ORM models for Skyie Studio."""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base


class User(Base):
    """User account model."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(512))
    plan: Mapped[str] = mapped_column(String(50), default="free")
    credits: Mapped[int] = mapped_column(Integer, default=50)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    jobs: Mapped[list["Job"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    assets: Mapped[list["Asset"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    usage_records: Mapped[list["Usage"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Job(Base):
    """Video generation job model."""

    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    workflow: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(20), default="queued", nullable=False, index=True
    )
    progress: Mapped[int] = mapped_column(Integer, default=0)
    step: Mapped[str] = mapped_column(String(255), default="Queued")
    params: Mapped[dict | None] = mapped_column(JSONB)
    output_path: Mapped[str | None] = mapped_column(String(512))
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User | None"] = relationship(back_populates="jobs")
    usage: Mapped["Usage | None"] = relationship(back_populates="job", uselist=False)


class Asset(Base):
    """Uploaded or generated asset model."""

    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    asset_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    path: Mapped[str] = mapped_column(String(512), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User | None"] = relationship(back_populates="assets")


class Usage(Base):
    """Credit usage tracking model."""

    __tablename__ = "usage"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    credits_used: Mapped[int] = mapped_column(Integer, default=0)
    gpu_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User | None"] = relationship(back_populates="usage_records")
    job: Mapped["Job | None"] = relationship(back_populates="usage")
