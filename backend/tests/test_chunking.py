from app.services.chunking import chunk_text, normalize


def test_normalize_collapses_extraction_noise():
    raw = "Title  \r\n\r\n\r\n  body   text \t here \n\n\n next"
    assert normalize(raw) == "Title\n\nbody text here\n\nnext"


def test_short_text_is_one_chunk():
    assert chunk_text("A single short sentence.", size=1000) == ["A single short sentence."]


def test_empty_input_produces_no_chunks():
    assert chunk_text("") == []
    assert chunk_text("   \n\n \t ") == []


def test_every_chunk_respects_the_size_limit():
    text = " ".join(f"Sentence number {i} with some filler words." for i in range(400))
    chunks = chunk_text(text, size=300, overlap=40)
    assert len(chunks) > 1
    assert all(len(chunk) <= 300 for chunk in chunks)


def test_paragraph_boundaries_are_preferred_over_mid_sentence_cuts():
    paragraphs = [f"Paragraph {i} stays whole because it is short." for i in range(6)]
    chunks = chunk_text("\n\n".join(paragraphs), size=120, overlap=0)
    # With no overlap and a size that fits two paragraphs, nothing should be cut
    # in the middle of a word.
    assert all(not chunk.endswith(("Paragrap", "becaus")) for chunk in chunks)


def _shared_boundary(a: str, b: str) -> int:
    """Longest suffix of `a` that is also a prefix of `b`."""
    for k in range(min(len(a), len(b)), 0, -1):
        if a[-k:] == b[:k]:
            return k
    return 0


def test_overlap_repeats_the_tail_of_the_previous_chunk():
    text = " ".join(f"word{i}" for i in range(200))
    overlap = 60
    chunks = chunk_text(text, size=200, overlap=overlap)
    assert len(chunks) > 2

    # Every boundary must carry real shared text forward -- that is what stops a
    # sentence straddling two chunks from being absent from both.
    pairs = list(zip(chunks, chunks[1:], strict=False))  # pairwise: lengths differ by one
    shared = [_shared_boundary(a, b) for a, b in pairs]
    assert all(0 < n <= overlap for n in shared), shared


def test_overlap_is_capped_so_the_window_always_advances():
    # An overlap at or above the chunk size would loop forever if uncapped.
    chunks = chunk_text(" ".join(f"w{i}" for i in range(300)), size=100, overlap=500)
    assert len(chunks) > 1
    assert all(len(chunk) <= 100 for chunk in chunks)


def test_unbroken_token_longer_than_the_chunk_is_hard_cut():
    chunks = chunk_text("x" * 250, size=100, overlap=0)
    assert len(chunks) == 3
    assert all(len(chunk) <= 100 for chunk in chunks)
