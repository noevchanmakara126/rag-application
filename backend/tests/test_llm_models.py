from app.core.config import settings
from app.services.llm import parse_model_ids, usable_chat_models


def test_reads_the_openai_models_shape():
    payload = {
        "object": "list",
        "data": [{"id": "qwen3:8b", "object": "model"}, {"id": "llama3.2:3b"}],
    }
    assert parse_model_ids(payload) == ["qwen3:8b", "llama3.2:3b"]


def test_accepts_a_bare_list_too():
    # Not every OpenAI-compatible server wraps the list in `data`.
    assert parse_model_ids([{"id": "a"}, "b"]) == ["a", "b"]


def test_ignores_entries_without_a_usable_id():
    payload = {"data": [{"id": "qwen3:8b"}, {"object": "model"}, {"id": ""}, {"id": "  "}, 7]}
    assert parse_model_ids(payload) == ["qwen3:8b"]


def test_a_body_that_is_not_a_list_yields_nothing():
    assert parse_model_ids({"error": "not found"}) == []
    assert parse_model_ids("nope") == []


def test_the_embedding_model_is_not_offered_as_a_chat_model(monkeypatch):
    # Ollama serves both kinds from one /models list, and answering with an
    # embedding model fails upstream in a way that reads like a broken app.
    monkeypatch.setattr(settings, "EMBEDDING_MODEL", "nomic-embed-text")
    assert usable_chat_models(["qwen3:8b", "nomic-embed-text"]) == ["qwen3:8b"]


def test_models_are_deduplicated_and_ordered():
    assert usable_chat_models(["b", "a", "b"]) == ["a", "b"]
