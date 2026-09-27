import io
from pathlib import Path

import httpx
import trafilatura
from pypdf import PdfReader

from app.services.chunking import normalize

SUPPORTED_SUFFIXES = {".pdf", ".txt", ".md", ".markdown", ".text"}

# A descriptive UA rather than a spoofed browser string: several large sites
# (Wikipedia among them) return 403 to generic Chrome UAs from non-browser
# clients, and their policies ask automated readers to identify themselves.
_USER_AGENT = "rag-deploy/0.1 (document ingestion; +https://github.com/local/rag-deploy)"


class ExtractionError(ValueError):
    pass


def from_upload(filename: str, data: bytes) -> str:
    """Plain text from an uploaded PDF, TXT or Markdown file."""
    suffix = Path(filename or "").suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        supported = ", ".join(sorted(SUPPORTED_SUFFIXES))
        raise ExtractionError(
            f"Unsupported file type '{suffix or filename}'. Supported: {supported}"
        )

    if suffix == ".pdf":
        try:
            reader = PdfReader(io.BytesIO(data))
            pages = [page.extract_text() or "" for page in reader.pages]
        except Exception as exc:  # noqa: BLE001 - pypdf raises a wide variety
            raise ExtractionError(f"Could not read the PDF: {exc}") from exc
        text = normalize("\n\n".join(pages))
        if not text:
            raise ExtractionError(
                "No text found in the PDF. Scanned documents need OCR first."
            )
        return text

    return normalize(data.decode("utf-8", errors="replace"))


async def from_url(url: str) -> tuple[str, str]:
    """(title, text) scraped from a web page's main content."""
    try:
        async with httpx.AsyncClient(
            timeout=20.0, follow_redirects=True, headers={"User-Agent": _USER_AGENT}
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ExtractionError(f"Could not fetch {url}: {exc}") from exc

    html = response.text
    text = trafilatura.extract(html, include_comments=False, include_tables=True) or ""
    text = normalize(text)
    if not text:
        raise ExtractionError(
            f"No readable article text found at {url}. The page may be "
            "JavaScript-rendered or paywalled."
        )

    metadata = trafilatura.extract_metadata(html)
    title = (metadata.title if metadata and metadata.title else None) or url
    return title[:300], text
