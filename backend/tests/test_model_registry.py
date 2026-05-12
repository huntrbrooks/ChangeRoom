import pytest


def test_get_openai_model_defaults(monkeypatch):
    from services.model_registry import get_openai_model

    monkeypatch.delenv("OPENAI_CLOTHING_ANALYZE_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_TRYON_IMAGE_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_IMAGE_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_VISION_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_MODEL", raising=False)

    assert get_openai_model("tryon_image") == "gpt-image-2"
    assert get_openai_model("model_photo_analysis") == "gpt-5.4-mini"
    assert get_openai_model("clothing_analysis") == "gpt-5.4"
    assert get_openai_model("clothing_preprocess") == "gpt-5-mini-2025-08-07"


def test_get_openai_model_prefers_specific_override(monkeypatch):
    from services.model_registry import get_openai_model

    monkeypatch.setenv("OPENAI_VISION_MODEL", "gpt-4.1-mini")
    monkeypatch.setenv("OPENAI_CLOTHING_ANALYZE_MODEL", "gpt-4.1")
    monkeypatch.setenv("OPENAI_TRYON_IMAGE_MODEL", "custom-image-model")

    assert get_openai_model("clothing_analysis") == "gpt-4.1"
    assert get_openai_model("tryon_image") == "custom-image-model"


def test_get_gemini_model_candidates_dedupes_and_respects_override(monkeypatch):
    from services.model_registry import get_gemini_model_candidates

    monkeypatch.setenv("GEMINI_REWRITE_MODEL", "gemini-3-flash-preview")
    candidates = get_gemini_model_candidates(
        "rewrite",
        extra_models=["gemini-3-flash-preview", "gemini-2.5-flash"],
    )

    assert candidates[0] == "gemini-3-flash-preview"
    assert candidates.count("gemini-3-flash-preview") == 1
    assert "gemini-2.5-flash" in candidates
    assert "gemini-2.0-flash" not in candidates
    assert "gemini-1.5-flash" not in candidates


def test_get_gemini_configured_model_defaults(monkeypatch):
    from services.model_registry import get_gemini_configured_model

    monkeypatch.delenv("GEMINI_GARMENT_ANALYZE_MODEL", raising=False)
    monkeypatch.delenv("GEMINI_VISION_MODEL", raising=False)
    monkeypatch.delenv("GEMINI_TEXT_MODEL", raising=False)

    assert get_gemini_configured_model("garment_analysis") == "gemini-3-flash-preview"


def test_unknown_task_raises():
    from services.model_registry import get_task_config

    with pytest.raises(ValueError):
        get_task_config("gemini", "unknown_task")

    with pytest.raises(ValueError):
        get_task_config("unsupported_gateway", "tryon_image")
