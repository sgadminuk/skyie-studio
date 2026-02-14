"""SQLAlchemy base and engine configuration."""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.ENVIRONMENT == "development",
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncSession:
    """Dependency for FastAPI route handlers."""
    async with async_session_factory() as session:
        yield session


async def init_db():
    """Create tables if they don't exist (used for initial setup)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """Dispose engine connections on shutdown."""
    await engine.dispose()
