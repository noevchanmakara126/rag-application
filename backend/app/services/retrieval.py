from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import Chunk, Document
from app.services.embeddings import embed_query


@dataclass(slots=True)
class Retrieved:
    id: str
    document_id: str
    document_title: str
    ordinal: int
    content: str
    score: float


async def retrieve(db: AsyncSession, query: str, top_k: int | None = None) -> list[Retrieved]:
    """Nearest chunks to `query` by cosine distance, above the score floor.

    Only documents in `ready` state are searched -- a half-embedded document
    would otherwise contribute a lopsided subset of its content.
    """
    top_k = top_k or settings.TOP_K
    vector = await embed_query(query)

    # `cosine_distance` compiles to pgvector's `<=>`, which is what the HNSW
    # index on (embedding vector_cosine_ops) can actually serve.
    distance = Chunk.embedding.cosine_distance(vector).label("distance")

    rows = await db.execute(
        select(Chunk.id, Chunk.document_id, Chunk.ordinal, Chunk.content, Document.title, distance)
        .join(Document, Document.id == Chunk.document_id)
        .where(Document.status == "ready")
        .order_by(distance)
        .limit(top_k)
    )

    results = []
    for chunk_id, document_id, ordinal, content, title, dist in rows.all():
        # Cosine distance is 1 - cosine similarity for normalized vectors.
        score = 1.0 - float(dist)
        if score < settings.MIN_SCORE:
            continue
        results.append(
            Retrieved(
                id=chunk_id,
                document_id=document_id,
                document_title=title,
                ordinal=ordinal,
                content=content,
                score=round(score, 4),
            )
        )
    return results


def build_context_prompt(question: str, sources: list[Retrieved]) -> str:
    """Fold the retrieved chunks and the question into one user message.

    Passages are numbered from 1 so the model's `[n]` markers map directly onto
    the `sources` array the UI already received over SSE.
    """
    blocks = [
        f"[{index}] (from \"{source.document_title}\", section {source.ordinal + 1})\n"
        f"{source.content}"
        for index, source in enumerate(sources, start=1)
    ]
    return (
        "Context passages:\n\n"
        + "\n\n---\n\n".join(blocks)
        + f"\n\n---\n\nQuestion: {question}"
    )
