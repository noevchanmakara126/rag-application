import re

from app.core.config import settings

# Ordered coarse-to-fine. Each level is tried only when the level above left a
# piece still larger than the target, so paragraph structure survives wherever
# it can and only genuinely long prose gets cut mid-sentence.
_SEPARATORS = ("\n\n", "\n", ". ", " ")

_WHITESPACE_RUN = re.compile(r"[ \t]+")
_BLANK_LINES = re.compile(r"\n{3,}")


def normalize(text: str) -> str:
    """Collapse the whitespace noise that PDF and HTML extraction leaves behind."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _WHITESPACE_RUN.sub(" ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    return _BLANK_LINES.sub("\n\n", text).strip()


def _split(text: str, size: int, depth: int = 0) -> list[str]:
    """Break `text` into pieces no longer than `size`, at the coarsest boundary."""
    if len(text) <= size:
        return [text] if text.strip() else []

    if depth >= len(_SEPARATORS):
        # No boundary left to respect: hard-cut. Only reachable for pathological
        # input such as a single unbroken token longer than CHUNK_SIZE.
        return [text[i : i + size] for i in range(0, len(text), size)]

    separator = _SEPARATORS[depth]
    parts = text.split(separator)
    pieces: list[str] = []
    for index, part in enumerate(parts):
        # Put the separator back, except after the final part.
        piece = part + separator if index < len(parts) - 1 else part
        if len(piece) > size:
            pieces.extend(_split(piece, size, depth + 1))
        elif piece.strip():
            pieces.append(piece)
    return pieces


def chunk_text(
    text: str, size: int | None = None, overlap: int | None = None
) -> list[str]:
    """Split prose into overlapping chunks suitable for embedding.

    Overlap is carried as the *tail* of the previous chunk so a sentence
    straddling a boundary is still fully present in at least one chunk -- the
    common case where a naive splitter loses the answer.
    """
    size = size or settings.CHUNK_SIZE
    overlap = settings.CHUNK_OVERLAP if overlap is None else overlap
    # An overlap at or above the chunk size would never advance the window.
    overlap = max(0, min(overlap, size // 2))

    text = normalize(text)
    if not text:
        return []

    chunks: list[str] = []
    current = ""
    for piece in _split(text, size):
        if len(current) + len(piece) <= size:
            current += piece
            continue

        if current.strip():
            chunks.append(current.strip())
        # Seed the next chunk with the tail of this one.
        tail = current[-overlap:] if overlap else ""
        current = tail + piece if len(tail) + len(piece) <= size else piece

    if current.strip():
        chunks.append(current.strip())
    return chunks
