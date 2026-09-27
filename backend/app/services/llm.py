import json
from collections.abc import AsyncGenerator

import httpx

from app.core.config import settings

# The whole point of RAG is that the model answers from the retrieved text and
# nothing else. Saying so explicitly -- and demanding the [n] markers -- is what
# makes the citation chips in the UI line up with the sources panel.
SYSTEM_PROMPT = (
    "You are a precise retrieval assistant. Answer using ONLY the numbered "
    "context passages provided in the user message.\n\n"
    "Rules:\n"
    "- Cite every claim with the passage number in square brackets, e.g. [1] or [2][3].\n"
    "- If the passages do not contain the answer, say so plainly and do not guess.\n"
    "- Never invent a citation number that was not provided.\n"
    "- Be concise. Prefer short paragraphs or bullets over preamble.\n"
    "- Answer in the same language the question was asked in."
)

NO_CONTEXT_REPLY = (
    "I could not find anything in the knowledge base that matches that question. "
    "Try rephrasing it, or add a document on the Documents page first."
)


class LLMError(RuntimeError):
    pass


def _headers() -> dict[str, str]:
    # Self-hosted servers mostly ignore the key, but some reject a request that
    # omits the header entirely, so send it whenever one is configured.
    return {"Authorization": f"Bearer {settings.LLM_API_KEY}"} if settings.LLM_API_KEY else {}


def _timeout() -> httpx.Timeout:
    # No read timeout: a large model can sit silent for a while before the first
    # token, and the connection then stays open for the whole generation.
    return httpx.Timeout(connect=settings.LLM_CONNECT_TIMEOUT, read=None, write=30.0, pool=None)


def _client(timeout: float | httpx.Timeout = 15.0) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.LLM_BASE_URL.rstrip("/"), timeout=timeout, headers=_headers()
    )


async def ping() -> bool:
    try:
        async with _client(3.0) as client:
            response = await client.get("/models")
        return response.status_code < 500
    except httpx.HTTPError:
        return False


def parse_model_ids(payload: object) -> list[str]:
    """Pull model ids out of an OpenAI-shaped `/models` body.

    Kept separate from the request so the tolerance is testable: Ollama, vLLM,
    TGI and LM Studio all answer `{"data": [{"id": ...}]}`, but a few servers
    return a bare list, and any of them may include entries without an id.
    """
    data = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(data, list):
        return []

    ids = []
    for entry in data:
        model_id = entry.get("id") if isinstance(entry, dict) else entry
        if isinstance(model_id, str) and model_id.strip():
            ids.append(model_id.strip())
    return ids


def usable_chat_models(ids: list[str]) -> list[str]:
    """The subset of `ids` worth offering as a generation model.

    Ollama serves generation and embedding models from one `/models` list, and
    choosing an embedding model to answer with fails upstream in a way that
    reads like a broken app. Only the configured embedding model can be
    identified for certain, so that is the one dropped.
    """
    return sorted({i for i in ids if i != settings.EMBEDDING_MODEL.strip()})


async def list_models() -> list[str]:
    """Model ids the generation server currently offers.

    Raises `LLMError` rather than returning empty: "the server has no models"
    and "the server could not be asked" need different handling by the caller.
    """
    try:
        async with _client(5.0) as client:
            response = await client.get("/models")
    except httpx.HTTPError as exc:
        raise LLMError(f"Could not reach the LLM at {settings.LLM_BASE_URL}") from exc

    if response.status_code >= 400:
        raise LLMError(_readable_error(response.status_code, response.text, settings.LLM_MODEL))

    try:
        return parse_model_ids(response.json())
    except ValueError as exc:
        raise LLMError(f"{settings.LLM_BASE_URL}/models did not return JSON.") from exc


async def stream_chat(messages: list[dict], model: str | None = None) -> AsyncGenerator[str, None]:
    """Yield assistant text deltas from an OpenAI-compatible /chat/completions.

    ``messages`` is the conversation in ``{role, content}`` form; the system
    prompt is prepended here so callers never have to carry one.
    """
    model = model or settings.LLM_MODEL
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, *messages],
        "stream": True,
        "temperature": settings.LLM_TEMPERATURE,
    }

    try:
        async with _client(_timeout()) as client:
            async with client.stream("POST", "/chat/completions", json=payload) as response:
                if response.status_code >= 400:
                    raw = (await response.aread()).decode("utf-8", "replace")
                    raise LLMError(_readable_error(response.status_code, raw, model))

                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data or data == "[DONE]":
                        if data == "[DONE]":
                            break
                        continue
                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue

                    if error := event.get("error"):
                        raise LLMError(str(error.get("message") or error)[:300])

                    for choice in event.get("choices") or []:
                        # Reasoning models put chain of thought in a separate
                        # `reasoning_content` field, which we simply never read.
                        delta = (choice.get("delta") or {}).get("content")
                        if delta:
                            yield delta
    except httpx.HTTPError as exc:
        raise LLMError(f"Could not reach the LLM at {settings.LLM_BASE_URL}") from exc


def _readable_error(status_code: int, body: str, model: str) -> str:
    if status_code == 404:
        return f'Model "{model}" is not available on {settings.LLM_BASE_URL}.'
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return f"The LLM returned {status_code}: {body[:300]}"
    error = parsed.get("error")
    if isinstance(error, dict):
        return str(error.get("message", error))[:300]
    return str(error or parsed)[:300]
