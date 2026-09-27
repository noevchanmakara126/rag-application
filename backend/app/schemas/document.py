from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    source_type: str
    source_ref: str | None
    status: str
    error: str | None
    char_count: int
    chunk_count: int
    created_at: datetime


class ChunkPreview(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    ordinal: int
    content: str
    char_count: int


class DocumentDetail(DocumentOut):
    chunks: list[ChunkPreview] = []


class TextIngestRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    content: str = Field(min_length=1)


class UrlIngestRequest(BaseModel):
    url: HttpUrl
