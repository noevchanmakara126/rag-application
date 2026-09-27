from dataclasses import asdict

from fastapi import APIRouter, HTTPException, status

from app.core.deps import DbSession
from app.schemas.search import SearchRequest, SearchResponse, Source
from app.services.embeddings import EmbeddingError
from app.services.retrieval import retrieve

router = APIRouter(prefix="/search", tags=["search"])


@router.post("", response_model=SearchResponse)
async def search(payload: SearchRequest, db: DbSession) -> SearchResponse:
    """Retrieval without generation.

    Exists so retrieval quality can be judged on its own -- when an answer looks
    wrong, this tells you whether the problem is the search or the model.
    """
    try:
        sources = await retrieve(db, payload.query, payload.top_k)
    except EmbeddingError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    return SearchResponse(
        query=payload.query, sources=[Source(**asdict(source)) for source in sources]
    )
