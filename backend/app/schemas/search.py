from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int | None = Field(default=None, ge=1, le=20)


class Source(BaseModel):
    """One retrieved chunk, as both the search result and the citation payload."""

    id: str
    document_id: str
    document_title: str
    ordinal: int
    content: str
    score: float


class SearchResponse(BaseModel):
    query: str
    sources: list[Source]
