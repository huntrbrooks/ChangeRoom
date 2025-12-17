import io
import pytest


class DummyGeminiResponse:
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
    assert "safety compliance" in new_prompt.lower()
    assert "heuristic_rewrite" in summary


@pytest.mark.asyncio
async def test_openai_rewrite_falls_back_without_key(monkeypatch):
    from services.vton import rewrite_for_modesty_openai

    # Ensure no key is present
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    meta, prompt, summary = await rewrite_for_modesty_openai(
        {"description": "lingerie"},
        "prompt",
        {"reason": "IMAGE_SAFETY"},
        strictness="moderate",
    )
    assert isinstance(meta, dict)
    assert isinstance(prompt, str)
    assert "fallback" in summary


@pytest.mark.asyncio
async def test_vton_retries_and_returns_retry_info(monkeypatch, sample_image_bytes):
    """
    Stubs Gemini responses: 3 safety blocks then a success.
    Ensures retry_info captures the progressive rewrite attempts without network calls.
    """
    from services import vton

    call_count = {"n": 0}

    async def fake_post(_client, *, url, headers, payload):
        call_count["n"] += 1
        # 1-3: safety block with IMAGE_SAFETY finish reason
        if call_count["n"] <= 3:
            return DummyGeminiResponse(
                ok=True,
                data={
                    "candidates": [
                        {
                            "finishReason": "IMAGE_SAFETY",
                            "safetyRatings": [{"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "probability": "HIGH"}],
                            "content": {"parts": [{"text": "Blocked by safety filter"}]},
                        }
                    ]
                },
            )
        # 4: success with an image part
        return DummyGeminiResponse(
            ok=True,
            data={
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {"parts": [{"inline_data": {"data": "AAAA", "mime_type": "image/png"}}]},
                    }
                ]
            },
        )

    monkeypatch.setattr(vton, "_gemini_post_json", fake_post)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    user_file = io.BytesIO(sample_image_bytes)
    garment_file = io.BytesIO(sample_image_bytes)

    result = await vton.generate_try_on(
        [user_file],
        [garment_file],
        category="upper_body",
        garment_metadata={"description": "lingerie"},
        user_attributes=None,
        main_index=0,
        user_quality_flags=None,
    )

    assert isinstance(result, dict)
    assert result.get("image_url", "").startswith("data:image/")
    retry_info = result.get("retry_info", [])
    assert isinstance(retry_info, list)
    assert len(retry_info) == 3
    assert retry_info[0]["strategy"] == "heuristic"


def test_try_on_endpoint_includes_retry_info(client, sample_image_bytes, monkeypatch):
    """
    Integration-ish: hit POST /api/try-on and ensure retry_info is returned when safety blocks occur.
    Avoids external calls by stubbing Gemini + user attribute analysis.
    """
    from services import vton
    from services import analyze_user

    async def fake_user_attrs(_files):
        return {}

    call_count = {"n": 0}

    async def fake_post(_client, *, url, headers, payload):
        call_count["n"] += 1
        if call_count["n"] <= 2:
            return DummyGeminiResponse(
                ok=True,
                data={
                    "candidates": [
                        {
                            "finishReason": "IMAGE_SAFETY",
                            "content": {"parts": [{"text": "Blocked"}]},
                        }
                    ]
                },
            )
        return DummyGeminiResponse(
            ok=True,
            data={
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {"parts": [{"inline_data": {"data": "AAAA", "mime_type": "image/png"}}]},
                    }
                ]
            },
        )

    monkeypatch.setattr(analyze_user, "analyze_user_attributes", fake_user_attrs)
    monkeypatch.setattr(vton, "_gemini_post_json", fake_post)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

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

