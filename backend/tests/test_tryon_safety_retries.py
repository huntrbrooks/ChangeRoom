import io

import pytest


class DummyResponse:
    def __init__(self, *, ok: bool, status_code: int = 200, text: str = "", data=None):
        self.is_success = ok
        self.status_code = status_code
        self.text = text
        self._data = data or {}

    def json(self):
        return self._data


def test_is_content_rejection_finish_reason():
    from services.vton import is_content_rejection

    assert is_content_rejection(finish_reason="IMAGE_SAFETY") is True
    assert is_content_rejection(finish_reason="STOP") is False


def test_heuristic_rewrite_sanitizes_and_adds_defaults():
    from services.vton import rewrite_for_modesty_heuristic

    meta = {
        "framing": "full_body",
        "description": "Sheer lingerie set with nude tones",
        "wearing_instructions": ["wear lingerie"],
    }
    new_meta, new_prompt, summary = rewrite_for_modesty_heuristic(meta, "A lingerie photo", strictness="moderate")

    assert isinstance(new_meta, dict)
    assert "intimate" in str(new_meta).lower() or "delicate" in str(new_meta).lower()
    assert new_meta.get("background") is not None
    assert new_meta.get("background") == "neutral_seamless_studio"
    assert "safety compliance" in new_prompt.lower()
    assert "overlay-only" in new_prompt.lower() or "overlay only" in new_prompt.lower()
    assert "neutral seamless studio setting" in new_prompt.lower()
    assert "do not use background changes to disguise" in new_prompt.lower()
    assert "do not redesign" in new_prompt.lower()
    assert "heuristic_rewrite" in summary


def test_extract_openai_image_url_handles_b64_response():
    from services.vton import _extract_openai_image_url

    image_url, mime_type, text_parts = _extract_openai_image_url(
        {
            "data": [
                {"b64_json": "AAAA", "revised_prompt": "done"}
            ]
        },
        default_mime_type="image/jpeg",
    )

    assert image_url == "data:image/jpeg;base64,AAAA"
    assert mime_type == "image/jpeg"
    assert text_parts == ["done"]


def test_openai_credit_exhaustion_detection():
    from services.openrouter_fallback import is_openai_credit_exhausted

    assert is_openai_credit_exhausted(
        status_code=429,
        error_text="You exceeded your current quota, please check your plan and billing details.",
        error_code="insufficient_quota",
    )
    assert is_openai_credit_exhausted(status_code=402, error_text="Payment required")
    assert not is_openai_credit_exhausted(status_code=429, error_text="Rate limit reached for requests")


@pytest.mark.asyncio
async def test_vton_retries_and_returns_retry_info(monkeypatch, sample_image_bytes):
    from services import vton

    openai_calls = {"n": 0}
    rewrite_calls = {"n": 0}
    captured_payloads = []

    async def fake_openai_edit(_client, *, url, headers, data, files):
        openai_calls["n"] += 1
        captured_payloads.append({"data": data, "files": files})
        if openai_calls["n"] <= 2:
            return DummyResponse(
                ok=False,
                status_code=400,
                text="Blocked by content policy",
                data={
                    "error": {"message": "Blocked by content policy"}
                },
            )

        return DummyResponse(
            ok=True,
            data={
                "data": [{"b64_json": "AAAA"}]
            },
        )

    async def fake_gemini_post(_client, *, url, headers, payload):
        rewrite_calls["n"] += 1
        return DummyResponse(
            ok=True,
            data={
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {
                            "parts": [
                                {
                                    "text": '{"prompt_additions":"Keep framing conservative, avoid close-ups, add opaque lining if needed.","metadata":{"description":"intimate apparel","framing":"three_quarter"},"changes":["sanitized description","more modest framing"]}'
                                }
                            ]
                        },
                    }
                ]
            },
        )

    monkeypatch.setattr(vton, "_openai_images_edit", fake_openai_edit)
    monkeypatch.setattr(vton, "_gemini_post_json", fake_gemini_post)

    result = await vton.generate_try_on(
        [io.BytesIO(sample_image_bytes)],
        [io.BytesIO(sample_image_bytes)],
        category="upper_body",
        garment_metadata={"description": "lingerie"},
        user_attributes=None,
        main_index=0,
        user_quality_flags=None,
    )

    assert isinstance(result, dict)
    assert result.get("image_url", "").startswith("data:image/")
    assert result.get("modesty_applied") is True
    retry_info = result.get("retry_info", [])
    assert isinstance(retry_info, list)
    assert len(retry_info) >= 3
    strategies = [r.get("strategy") for r in retry_info if isinstance(r, dict)]
    assert "modesty_contract_preflight" in strategies
    assert any(s in ("preflight_heuristic", "heuristic", "gemini_rewrite") for s in strategies)
    assert openai_calls["n"] == 3
    assert rewrite_calls["n"] >= 1
    first_payload = captured_payloads[0]["data"]
    assert first_payload["model"] == "gpt-image-1.5"
    assert "real body" in first_payload["prompt"]
    assert "neutral, seamless studio environment" in first_payload["prompt"]
    assert "BODY FIDELITY IS PARAMOUNT" in first_payload["prompt"]
    assert "Do not reuse the original background" in first_payload["prompt"]
    assert "Do not slim, enlarge, lengthen, shorten" in first_payload["prompt"]
    assert len(captured_payloads[0]["files"]) == 2


@pytest.mark.asyncio
async def test_vton_falls_back_to_openrouter_when_openai_credit_exhausted(monkeypatch, sample_image_bytes):
    from services import vton

    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    monkeypatch.setenv("OPENROUTER_TRYON_IMAGE_MODEL", "google/gemini-3.1-flash-image-preview")

    openai_calls = {"n": 0}
    openrouter_calls = {"n": 0}
    captured_payloads = []

    async def fake_openai_edit(_client, *, url, headers, data, files):
        openai_calls["n"] += 1
        return DummyResponse(
            ok=False,
            status_code=429,
            text="You exceeded your current quota, please check your plan and billing details.",
            data={
                "error": {
                    "message": "You exceeded your current quota, please check your plan and billing details.",
                    "code": "insufficient_quota",
                    "type": "insufficient_quota",
                }
            },
        )

    async def fake_openrouter_chat(_client, *, api_key, payload):
        openrouter_calls["n"] += 1
        captured_payloads.append(payload)
        return DummyResponse(
            ok=True,
            data={
                "choices": [
                    {
                        "message": {
                            "images": [
                                {"image_url": {"url": "data:image/png;base64,BBBB"}}
                            ]
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr(vton, "_openai_images_edit", fake_openai_edit)
    monkeypatch.setattr(vton, "post_openrouter_chat_completion", fake_openrouter_chat)

    result = await vton.generate_try_on(
        [io.BytesIO(sample_image_bytes)],
        [io.BytesIO(sample_image_bytes)],
        category="upper_body",
        garment_metadata={"description": "black t-shirt"},
        user_attributes=None,
        main_index=0,
        user_quality_flags=None,
    )

    assert result["image_url"] == "data:image/png;base64,BBBB"
    assert openai_calls["n"] == 1
    assert openrouter_calls["n"] == 1
    assert captured_payloads[0]["model"] == "google/gemini-3.1-flash-image-preview"
    assert captured_payloads[0]["modalities"] == ["image", "text"]
    assert any(
        info.get("strategy") == "openrouter_fallback"
        for info in result.get("retry_info", [])
        if isinstance(info, dict)
    )


def test_try_on_endpoint_includes_retry_info(client, sample_image_bytes, monkeypatch):
    from services import analyze_user
    from services import vton

    async def fake_user_attrs(_files):
        return {}

    openai_calls = {"n": 0}

    async def fake_openai_edit(_client, *, url, headers, data, files):
        openai_calls["n"] += 1
        if openai_calls["n"] <= 2:
            return DummyResponse(
                ok=False,
                status_code=400,
                text="Blocked",
                data={
                    "error": {"message": "Blocked"}
                },
            )
        return DummyResponse(
            ok=True,
            data={
                "data": [{"b64_json": "AAAA"}]
            },
        )

    async def fake_gemini_post(_client, *, url, headers, payload):
        return DummyResponse(
            ok=True,
            data={
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {
                            "parts": [
                                {
                                    "text": '{"prompt_additions":"Keep framing conservative and professional.","metadata":{"framing":"three_quarter"},"changes":["more modest framing"]}'
                                }
                            ]
                        },
                    }
                ]
            },
        )

    monkeypatch.setattr(analyze_user, "analyze_user_attributes", fake_user_attrs)
    monkeypatch.setattr(vton, "_openai_images_edit", fake_openai_edit)
    monkeypatch.setattr(vton, "_gemini_post_json", fake_gemini_post)

    files = {
        "user_image": ("user.png", sample_image_bytes, "image/png"),
        "clothing_image": ("garment.png", sample_image_bytes, "image/png"),
    }
    data = {
        "category": "upper_body",
        "garment_metadata": '{"description":"lingerie"}',
    }
    resp = client.post("/api/try-on", files=files, data=data)
    assert resp.status_code == 200
    payload = resp.json()
    assert "image_url" in payload
    assert "retry_info" in payload
    assert isinstance(payload["retry_info"], list)
    assert payload.get("modesty_applied") is True
