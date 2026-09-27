import logging

from app.db.session import SessionLocal
from app.models import Chunk, Document
from app.services.chunking import chunk_text
from app.services.embeddings import embed_texts

logger = logging.getLogger(__name__)


async def ingest_document(document_id: str, text: str) -> None:
    """Chunk, embed and store a document's text. Runs as a BackgroundTask.

    Opens its own session: the request that scheduled this has already returned
    and its request-scoped session is torn down. Failures are recorded on the
    row rather than raised, because nobody is left to catch them -- the UI reads
    `status` and `error` instead.
    """
    async with SessionLocal() as session:
        document = await session.get(Document, document_id)
        if document is None:
            logger.warning("ingest: document %s vanished before processing", document_id)
            return

        try:
            document.status = "embedding"
            await session.commit()

            chunks = chunk_text(text)
            if not chunks:
                raise ValueError("The document produced no text to embed.")

            vectors = await embed_texts(chunks)

            session.add_all(
                Chunk(
                    document_id=document_id,
                    ordinal=ordinal,
                    content=content,
                    char_count=len(content),
                    embedding=vector,
                )
                for ordinal, (content, vector) in enumerate(zip(chunks, vectors, strict=True))
            )
            document.chunk_count = len(chunks)
            document.status = "ready"
            document.error = None
            await session.commit()

        except Exception as exc:  # noqa: BLE001 - the status column is the report
            logger.exception("ingest failed for document %s", document_id)
            await session.rollback()
            if (stored := await session.get(Document, document_id)) is not None:
                stored.status = "failed"
                stored.error = str(exc)[:1000]
                await session.commit()
