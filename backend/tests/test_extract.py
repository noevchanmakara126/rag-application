import pytest

from app.services.extract import ExtractionError, from_upload


def test_plain_text_is_decoded_and_normalized():
    assert from_upload("notes.txt", b"hello   world\r\n\r\n\r\nagain") == "hello world\n\nagain"


def test_markdown_is_accepted():
    assert from_upload("README.md", b"# Title\n\ntext") == "# Title\n\ntext"


def test_unknown_extension_is_rejected():
    with pytest.raises(ExtractionError, match="Unsupported file type"):
        from_upload("archive.zip", b"PK\x03\x04")


def test_no_extension_is_rejected():
    with pytest.raises(ExtractionError, match="Unsupported file type"):
        from_upload("noextension", b"data")


def test_invalid_utf8_is_replaced_rather_than_raising():
    # Extraction should never fail on a mis-encoded byte; losing one character
    # beats losing the whole document.
    assert "hello" in from_upload("notes.txt", b"hello \xff\xfe world")


def test_corrupt_pdf_raises_extraction_error():
    with pytest.raises(ExtractionError):
        from_upload("broken.pdf", b"not actually a pdf")
