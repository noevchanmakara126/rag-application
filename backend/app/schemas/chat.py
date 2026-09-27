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
