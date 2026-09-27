"""Mirror of frontend/src/lib/citations.ts.

The parsing rule lives in TypeScript, but the contract it encodes is the
backend's: markers are 1-based and bounded by the number of sources sent. These
cases are the ones the two implementations must agree on.
"""

import re

TOKEN = re.compile(r"\[(\d{1,2})\]|`([^`\n]+)`")


def parse(text: str, source_count: int) -> list[tuple[str, str | int]]:
    segments: list[tuple[str, str | int]] = []
    cursor = 0

    def push(end: int) -> None:
        if end > cursor:
            segments.append(("text", text[cursor:end]))

    for match in TOKEN.finditer(text):
        citation, code = match.group(1), match.group(2)
        if code is not None:
            push(match.start())
            segments.append(("code", code))
            cursor = match.end()
            continue
        index = int(citation)
        if not 1 <= index <= source_count:
            continue
        push(match.start())
        segments.append(("citation", index))
        cursor = match.end()

    push(len(text))
    return segments


def test_single_marker_splits_into_three_segments():
    assert parse("Yes [1] indeed.", 3) == [
        ("text", "Yes "),
        ("citation", 1),
        ("text", " indeed."),
    ]


def test_adjacent_markers_each_become_a_citation():
    assert parse("Both [1][2] agree.", 2) == [
        ("text", "Both "),
        ("citation", 1),
        ("citation", 2),
        ("text", " agree."),
    ]


def test_out_of_range_marker_stays_literal_text():
    # A model that invents [9] against 3 sources must not produce a chip
    # pointing at nothing.
    assert parse("See [9].", 3) == [("text", "See [9].")]


def test_zero_is_not_a_valid_marker():
    assert parse("See [0].", 3) == [("text", "See [0].")]


def test_text_without_markers_is_one_segment():
    assert parse("No citations here.", 5) == [("text", "No citations here.")]


def test_inline_code_becomes_its_own_segment():
    assert parse("Use `<=>` for cosine.", 2) == [
        ("text", "Use "),
        ("code", "<=>"),
        ("text", " for cosine."),
    ]


def test_code_and_citation_coexist():
    assert parse("`<=>` is cosine [1].", 1) == [
        ("code", "<=>"),
        ("text", " is cosine "),
        ("citation", 1),
        ("text", "."),
    ]


def test_marker_inside_a_code_span_stays_literal():
    # Single pass over both tokens: the code span wins, so an array index in a
    # snippet never turns into a citation chip.
    assert parse("Call `arr[1]` here.", 3) == [
        ("text", "Call "),
        ("code", "arr[1]"),
        ("text", " here."),
    ]


def test_unterminated_backtick_is_left_alone():
    assert parse("a ` b", 1) == [("text", "a ` b")]
