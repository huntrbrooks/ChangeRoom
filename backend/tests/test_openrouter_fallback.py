import pytest


class DummyResponse:
    def __init__(self, *, ok: bool, status_code: int = 200, text: str = "", data=None):
        self.is_success = ok
        self.status_code = status_code
        self.text = text
        self._data = data or {}

    def json(self):
        return self._data


@pytest.mark.asyncio
async def test_preprocess_uses_openrouter_when_openai_key_missing(monkeypatch, sample_image_bytes):
    from services import preprocess_clothing

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    monkeypatch.setenv("OPENROUTER_VISION_MODEL", "google/gemini-3.1-flash-lite")

    calls = {"n": 0}

    async def fake_openrouter_chat(_client, *, api_key, payload):
        calls["n"] += 1
        return DummyResponse(
            ok=True,
            data={
                "choices": [
                    {
                        "message": {
                            "content": '{"body_region":"SHOES","item_type":"brown leather boots","color":"brown","style":"casual","brand":"unknown","tags":["boots"],"short_description":"Brown leather boots.","suggested_filename":"brown_leather_boots"}'
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr(preprocess_clothing, "post_openrouter_chat_completion", fake_openrouter_chat)

    result = await preprocess_clothing.analyze_single_clothing_image(
        sample_image_bytes,
        "",
        "boots.png",
    )

    assert calls["n"] == 1
    assert result["body_region"] == "SHOES"
    assert result["item_type"] == "brown leather boots"
