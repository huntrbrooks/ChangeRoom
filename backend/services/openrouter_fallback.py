import json
import logging
import os
import re
from typing import Any, Dict, Iterable, List, Optional

import httpx

logger = logging.getLogger(__name__)

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"

OPENAI_CREDIT_ERROR_KEYWORDS = (
    "insufficient_quota",
    "insufficient quota",
    "quota exceeded",
    "exceeded your current quota",
    "billing",
    "hard_limit_reached",
    "out of credits",
    "out of credit",
    "credit balance",
    "insufficient funds",
    "balance",
    "payment required",
)


def is_openai_credit_exhausted(
    *,
    status_code: Optional[int] = None,
    error_text: Optional[str] = None,
    error_code: Optional[str] = None,
    error_type: Optional[str] = None,
    exception: Optional[BaseException] = None,
) -> bool:
    """
    Best-effort detection for OpenAI billing/quota failures.

    We intentionally keep this narrower than generic rate limiting: transient 429s
    should continue through normal retry handling, while credit/billing failures
    should immediately switch providers.
    """
    parts = [
        str(status_code or ""),
        error_text or "",
        error_code or "",
        error_type or "",
    ]
    if exception is not None:
        parts.extend(
            [
                str(exception),
                str(getattr(exception, "code", "") or ""),
                str(getattr(exception, "type", "") or ""),
                str(getattr(exception, "status_code", "") or ""),
            ]
        )

    haystack = " ".join(parts).lower()
    if status_code == 402:
        return True
    return any(keyword in haystack for keyword in OPENAI_CREDIT_ERROR_KEYWORDS)


def openrouter_model_candidates(
    env_key: str,
    *,
    default_model: str,
    fallback_models: Iterable[str] = (),
) -> List[str]:
    values = [
        os.getenv(env_key),
        default_model,
        *fallback_models,
    ]
    seen = set()
    models: List[str] = []
    for value in values:
        model = (value or "").strip()
        if not model or model in seen:
            continue
        seen.add(model)
        models.append(model)
    return models


def openrouter_headers(api_key: str) -> Dict[str, str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    app_url = (os.getenv("NEXT_PUBLIC_APP_URL") or "").strip()
    if app_url:
        headers["HTTP-Referer"] = app_url
    headers["X-Title"] = "IGetDressed.Online"
    return headers


async def post_openrouter_chat_completion(
    client: httpx.AsyncClient,
    *,
    api_key: str,
    payload: Dict[str, Any],
) -> httpx.Response:
    return await client.post(
        OPENROUTER_CHAT_URL,
        headers=openrouter_headers(api_key),
        json=payload,
    )


def extract_message_text(data: Dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""

    message = (choices[0] or {}).get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        text_parts = []
        for part in content:
            if isinstance(part, dict):
                text = part.get("text")
                if isinstance(text, str) and text.strip():
                    text_parts.append(text.strip())
        return "\n".join(text_parts).strip()

    return ""


def parse_json_object_from_text(text: str) -> Dict[str, Any]:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", cleaned).strip()
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        parsed = json.loads(match.group(0))
        if isinstance(parsed, dict):
            return parsed

    raise ValueError("OpenRouter response did not contain a JSON object")


def extract_image_url(data: Dict[str, Any]) -> Optional[str]:
    choices = data.get("choices") or []
    if not choices:
        return None

    message = (choices[0] or {}).get("message") or {}

    images = message.get("images") or []
    if isinstance(images, list):
        for image in images:
            if not isinstance(image, dict):
                continue
            image_url = image.get("image_url") or image.get("imageUrl") or {}
            if isinstance(image_url, dict):
                url = image_url.get("url")
            else:
                url = image_url
            if isinstance(url, str) and url.strip():
                return url.strip()

    def walk(value: Any) -> Optional[str]:
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("data:image/") or re.match(r"^https?://", stripped):
                return stripped
            return None
        if isinstance(value, dict):
            for key in ("url", "image_url", "imageUrl", "data"):
                found = walk(value.get(key))
                if found:
                    return found
            for child in value.values():
                found = walk(child)
                if found:
                    return found
        if isinstance(value, list):
            for child in value:
                found = walk(child)
                if found:
                    return found
        return None

    return walk(message)
