from typing import Literal

from pydantic import BaseModel, Field


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    content: str = Field(min_length=1)
    # Nothing is persisted server-side, so the client replays the transcript it
    # already has. Trimmed to HISTORY_LIMIT before it reaches the model.
    history: list[HistoryMessage] = []
    top_k: int | None = Field(default=None, ge=1, le=20)
    # Which generation model answers. None falls back to LLM_MODEL, so an older
    # client that does not know about the picker keeps working unchanged.
    model: str | None = Field(default=None, min_length=1, max_length=200)


class ChatModels(BaseModel):
    """What the model picker offers, and which entry it starts on."""

    models: list[str]
    default: str
