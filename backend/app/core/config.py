from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from the environment.

    The only thing that differs between development and production is the
    values of these variables -- never the code paths that read them.
    """

    # Later files win in pydantic-settings, so the repo-wide template is listed
    # first and the service-local .env last -- the more specific file overrides.
    model_config = SettingsConfigDict(env_file=("../.env.development", ".env"), extra="ignore")

    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "RAG API"

    # Postgres only: pgvector has no SQLite equivalent, so there is no dev
    # fallback engine the way the sibling chat project has one.
    DATABASE_URL: str = "postgresql+asyncpg://rag:rag@localhost:5432/rag"

    # ── Generation ───────────────────────────────────────────────────────
    # Any OpenAI-compatible server: Ollama's /v1, vLLM, TGI, LM Studio.
    LLM_BASE_URL: str = "http://localhost:11434/v1"
    LLM_MODEL: str = "qwen3:8b"
    # Sent as `Authorization: Bearer ...` only when non-empty. Self-hosted
    # servers usually ignore it, but several refuse a request without one.
    LLM_API_KEY: str = ""
    # A large model can sit silent for a while before the first token, so only
    # the *connect* phase gets a deadline (see services/llm.py).
    LLM_CONNECT_TIMEOUT: float = 10.0
    LLM_TEMPERATURE: float = 0.2

    # ── Embeddings ───────────────────────────────────────────────────────
    EMBEDDING_BASE_URL: str = "http://localhost:11434/v1"
    EMBEDDING_MODEL: str = "nomic-embed-text"
    # Must match the vector(N) column the migration created. /health surfaces a
    # mismatch, which would otherwise show up as an opaque insert error.
    EMBEDDING_DIM: int = 768
    EMBEDDING_BATCH_SIZE: int = 32
    EMBEDDING_TIMEOUT: float = 120.0
    # Asymmetric-retrieval prefixes. nomic-embed-text, bge-* and e5-* are all
    # trained with a task prefix, and omitting it collapses the similarity range
    # -- unrelated text still scores ~0.5, which makes MIN_SCORE useless. Set
    # both to "" for a model that does not want them (e.g. all-minilm).
    # Changing either invalidates already-stored vectors: re-ingest afterwards.
    EMBEDDING_DOCUMENT_PREFIX: str = "search_document: "
    EMBEDDING_QUERY_PREFIX: str = "search_query: "

    # ── Retrieval ────────────────────────────────────────────────────────
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 150
    TOP_K: int = 5
    # Cosine similarity floor: below this a chunk is treated as noise and never
    # reaches the prompt, so an unrelated question returns no sources at all.
    #
    # Calibrated for nomic-embed-text *with* the prefixes above. Measured on a
    # mixed corpus: off-topic queries topped out at 0.54, on-topic ones started
    # at 0.66. A different embedding model has a different scale -- re-measure
    # with POST /api/v1/search before trusting this number.
    MIN_SCORE: float = 0.55
    # How much prior conversation to replay. Keeps prompts bounded.
    HISTORY_LIMIT: int = 20

    MAX_UPLOAD_MB: int = 20

    # NoDecode: pydantic-settings would otherwise try to JSON-parse the env
    # value; we want a plain comma-separated string instead.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
