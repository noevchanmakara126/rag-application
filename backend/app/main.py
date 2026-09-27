from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1 import api_router
from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.services.embeddings import probe_dim
from app.services.llm import ping as llm_ping

__all__ = ["app"]


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


async def _db_ok() -> bool:
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001 - any failure means "not reachable"
        return False


@app.get("/health", tags=["health"])
async def health() -> dict:
    """Liveness, plus each dependency reported separately.

    Still returns `ok` when the LLM or embedding server is down: the container
    should not be restarted for someone else's outage. `dim_matches` is the
    check worth watching -- a mismatch between the model's output size and the
    vector(N) column otherwise surfaces as an opaque insert error on first use.
    """
    dim = await probe_dim()
    return {
        "status": "ok",
        "environment": settings.ENVIRONMENT,
        "database": {"reachable": await _db_ok()},
        "llm": {
            "url": settings.LLM_BASE_URL,
            "model": settings.LLM_MODEL,
            "reachable": await llm_ping(),
        },
        "embedding": {
            "url": settings.EMBEDDING_BASE_URL,
            "model": settings.EMBEDDING_MODEL,
            "reachable": dim is not None,
            "dim": dim,
            "configured_dim": settings.EMBEDDING_DIM,
            "dim_matches": dim == settings.EMBEDDING_DIM if dim is not None else None,
        },
    }
