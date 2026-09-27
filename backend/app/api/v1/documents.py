from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.deps import DbSession
from app.models import Document
from app.schemas.document import (
    DocumentDetail,
    DocumentOut,
    TextIngestRequest,
    UrlIngestRequest,
)
from app.services.extract import ExtractionError, from_upload, from_url
from app.services.ingest import ingest_document

router = APIRouter(prefix="/documents", tags=["documents"])

# Enough to recognise a chunk in the citation panel without shipping the whole
# corpus on every list request.
PREVIEW_CHARS = 400


async def _create(
    db: DbSession,
    background: BackgroundTasks,
    *,
    title: str,
    source_type: str,
    source_ref: str | None,
    text: str,
) -> Document:
    """Persist the row, then hand chunking and embedding to a background task.

    Returning before the vectors exist is deliberate: embedding a long PDF takes
    far longer than an HTTP request should, and the client polls `status`.
    """
    document = Document(
        title=title.strip()[:300] or "Untitled",
        source_type=source_type,
        source_ref=source_ref,
        status="pending",
        char_count=len(text),
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    background.add_task(ingest_document, document.id, text)
    return document


@router.get("", response_model=list[DocumentOut])
async def list_documents(db: DbSession) -> list[Document]:
    rows = await db.execute(select(Document).order_by(Document.created_at.desc()))
    return list(rows.scalars())


@router.get("/{document_id}", response_model=DocumentDetail)
async def get_document(document_id: str, db: DbSession) -> Document:
    document = await db.get(Document, document_id, options=[selectinload(Document.chunks)])
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    for chunk in document.chunks:
        if len(chunk.content) > PREVIEW_CHARS:
            chunk.content = chunk.content[:PREVIEW_CHARS].rstrip() + "…"
    return document


@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    db: DbSession,
    background: BackgroundTasks,
    file: Annotated[UploadFile, File()],
) -> Document:
    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The uploaded file is empty."
        )
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File is larger than the {settings.MAX_UPLOAD_MB} MB limit.",
        )

    try:
        text = from_upload(file.filename or "", data)
    except ExtractionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    return await _create(
        db,
        background,
        title=file.filename or "Uploaded file",
        source_type="upload",
        source_ref=file.filename,
        text=text,
    )


@router.post("/text", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def ingest_text(
    payload: TextIngestRequest, db: DbSession, background: BackgroundTasks
) -> Document:
    return await _create(
        db,
        background,
        title=payload.title,
        source_type="paste",
        source_ref=None,
        text=payload.content,
    )


@router.post("/url", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def ingest_url(
    payload: UrlIngestRequest, db: DbSession, background: BackgroundTasks
) -> Document:
    url = str(payload.url)
    try:
        title, text = await from_url(url)
    except ExtractionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    return await _create(
        db, background, title=title, source_type="url", source_ref=url, text=text
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str, db: DbSession) -> Response:
    document = await db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Chunks go with it via ON DELETE CASCADE.
    await db.delete(document)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
