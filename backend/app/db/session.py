from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)


async def _register_vector_text_codec(connection) -> None:  # noqa: ANN001 - asyncpg.Connection
    """Teach asyncpg to pass `vector` values through as text.

    asyncpg refuses to bind a parameter whose Postgres type it does not know,
    and pgvector's SQLAlchemy type already serialises to the text form
    ('[0.1,0.2]') in its bind_processor -- and parses that same text back in its
    result_processor. So the codec asyncpg needs here is a passthrough.

    Note this is deliberately NOT `pgvector.asyncpg.register_vector`: that
    installs a *binary* codec expecting a list, which the SQLAlchemy layer never
    produces. Combining the two fails with "invalid input for query argument
    (expected list or ndarray)" on the first insert.
    """
    await connection.set_type_codec(
        "vector", schema="public", encoder=str, decoder=str, format="text"
    )


@event.listens_for(engine.sync_engine, "connect")
def _on_connect(dbapi_connection, _record) -> None:  # noqa: ANN001
    # `run_async` is how SQLAlchemy's asyncpg dialect lets a sync event handler
    # await an asyncpg coroutine on the underlying connection.
    dbapi_connection.run_async(_register_vector_text_codec)


SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
