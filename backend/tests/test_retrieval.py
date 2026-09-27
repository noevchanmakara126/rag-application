from app.services.retrieval import Retrieved, build_context_prompt


def _source(index: int, title: str = "Doc", score: float = 0.9) -> Retrieved:
    return Retrieved(
        id=f"c{index}",
        document_id="d1",
        document_title=title,
        ordinal=index,
        content=f"passage {index} body",
        score=score,
    )


def test_passages_are_numbered_from_one():
    prompt = build_context_prompt("What?", [_source(0), _source(1)])
    assert "[1] (from \"Doc\", section 1)" in prompt
    assert "[2] (from \"Doc\", section 2)" in prompt
    # Numbering must start at 1 so the model's markers index the sources array
    # the UI already received.
    assert "[0]" not in prompt


def test_question_is_appended_after_the_context():
    prompt = build_context_prompt("Why is the sky blue?", [_source(0)])
    assert prompt.index("passage 0 body") < prompt.index("Why is the sky blue?")


def test_every_passage_body_reaches_the_prompt():
    sources = [_source(i) for i in range(5)]
    prompt = build_context_prompt("q", sources)
    assert all(f"passage {i} body" in prompt for i in range(5))
