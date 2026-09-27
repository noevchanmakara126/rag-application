import json
from collections.abc import AsyncGenerator
from dataclasses import asdict

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.core.deps import DbSession
from app.schemas.chat import ChatRequest
from app.schemas.search import Source
from app.services.embeddings import EmbeddingError
from app.services.llm import NO_CONTEXT_REPLY, LLMError, stream_chat
from app.services.retrieval import build_context_prompt, retrieve

router = APIRouter(prefix="/chat", tags=["chat"])


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/stream")
async def chat_stream(payload: ChatRequest, db: DbSession) -> StreamingResponse:
    """Retrieve, then stream a cited answer as SSE.

    Frames are `{"sources": [...]}` first, then `{"delta": "..."}` while
    generating, then a terminal `{"done": true}` or `{"error": "..."}`.

    Retrieval happens *before* the response starts so a failure there becomes a
    clean HTTP-level error path inside the stream, and so the UI can paint the
    citation chips while the answer is still arriving.
    """
    try:
        retrieved = await retrieve(db, payload.content, payload.top_k)
        sources = [Source(**asdict(item)) for item in retrieved]
        retrieval_error = None
    except EmbeddingError as exc:
        retrieved, sources, retrieval_error = [], [], str(exc)

    history = [
        {"role": message.role, "content": message.content}
        for message in payload.history[-settings.HISTORY_LIMIT :]
    ]
    question = build_context_prompt(payload.content, retrieved) if retrieved else ""

    async def generate() -> AsyncGenerator[str, None]:
        if retrieval_error is not None:
            yield _sse({"sources": []})
            yield _sse({"error": retrieval_error})
            return

        yield _sse({"sources": [source.model_dump() for source in sources]})

        # Nothing cleared the score floor. Answering anyway would mean answering
        # from the model's own memory, which is exactly what this app must not do.
        if not retrieved:
            yield _sse({"delta": NO_CONTEXT_REPLY})
            yield _sse({"done": True})
            return

        produced = False
        try:
            async for delta in stream_chat([*history, {"role": "user", "content": question}]):
                produced = True
                yield _sse({"delta": delta})
        except LLMError as exc:
            yield _sse({"error": str(exc)})
            return
        except Exception:  # noqa: BLE001 - never leak a stack trace into the stream
            yield _sse({"error": "The assistant stopped unexpectedly. Please try again."})
            return

        if not produced:
            yield _sse({"error": "The model returned an empty response."})
            return

        yield _sse({"done": True})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # stops nginx from buffering the stream
        },
    )
