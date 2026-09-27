import httpx

from app.core.config import settings


class EmbeddingError(RuntimeError):
    pass


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.LLM_API_KEY}"} if settings.LLM_API_KEY else {}


def _client(timeout: float | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.EMBEDDING_BASE_URL.rstrip("/"),
        timeout=timeout or settings.EMBEDDING_TIMEOUT,
        headers=_headers(),
    )


async def _embed_batch(client: httpx.AsyncClient, texts: list[str]) -> list[list[float]]:
    try:
        response = await client.post(
            "/embeddings", json={"model": settings.EMBEDDING_MODEL, "input": texts}
        )
    except httpx.HTTPError as exc:
        raise EmbeddingError(
            f"Could not reach the embedding server at {settings.EMBEDDING_BASE_URL}"
        ) from exc

    if response.status_code >= 400:
        raise EmbeddingError(
            f"Embedding server returned {response.status_code}: "
            f"{response.text[:300]}"
        )

    data = response.json().get("data") or []
    if len(data) != len(texts):
        raise EmbeddingError(f"Asked for {len(texts)} embeddings, received {len(data)}.")

    # The spec says results carry an `index`; it does not promise they arrive in
    # order, and mis-pairing a vector with its chunk fails silently forever.
    ordered = sorted(data, key=lambda item: item.get("index", 0))
    vectors = [item["embedding"] for item in ordered]

    for vector in vectors:
        if len(vector) != settings.EMBEDDING_DIM:
            raise EmbeddingError(
                f'Model "{settings.EMBEDDING_MODEL}" returned {len(vector)}-dim vectors '
                f"but the database column is vector({settings.EMBEDDING_DIM}). "
                f"Set EMBEDDING_DIM={len(vector)} and re-run migrations."
            )
    return vectors


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed document chunks, batched so one request never grows unbounded.

    The document-side prefix is applied here and nowhere else, so the stored
    chunk text stays exactly what gets shown to the user and sent to the model.
    """
    if not texts:
        return []

    prefixed = [f"{settings.EMBEDDING_DOCUMENT_PREFIX}{text}" for text in texts]
    vectors: list[list[float]] = []
    async with _client() as client:
        for start in range(0, len(prefixed), settings.EMBEDDING_BATCH_SIZE):
            batch = prefixed[start : start + settings.EMBEDDING_BATCH_SIZE]
            vectors.extend(await _embed_batch(client, batch))
    return vectors


async def embed_query(text: str) -> list[float]:
    """Embed a search query, with the query-side prefix rather than the document one."""
    async with _client() as client:
        return (await _embed_batch(client, [f"{settings.EMBEDDING_QUERY_PREFIX}{text}"]))[0]


async def probe_dim() -> int | None:
    """Dimension the configured model actually produces, or None if unreachable.

    Used by /health so a dimension mismatch is visible up front rather than as
    an opaque insert failure on the first ingest.
    """
    try:
        async with _client(10.0) as client:
            response = await client.post(
                "/embeddings", json={"model": settings.EMBEDDING_MODEL, "input": ["probe"]}
            )
            response.raise_for_status()
        return len(response.json()["data"][0]["embedding"])
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return None
