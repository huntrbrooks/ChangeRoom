import asyncio
import base64
import io
import json
import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
from PIL import Image

from .image_metadata import embed_structured_metadata, utc_now_iso
from .image_normalize import normalize_image_bytes, normalize_image_bytes_with_budget
from .model_registry import get_openai_model
from .storage import get_storage_backend

logger = logging.getLogger(__name__)

MODEL_UPLOAD_SUBDIR = "model"
MODEL_ANALYSIS_VERSION = "model-photo-v1"
OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_IMAGES_EDITS_URL = "https://api.openai.com/v1/images/edits"


class ModelPhotoProcessingError(RuntimeError):
    def __init__(self, provider: str, code: str, message: str):
        super().__init__(f"{provider} {code}: {message}")
        self.provider = provider
        self.code = code
        self.message = message


def _safe_filename_part(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", value.strip().lower())
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned[:80] or "model"


def _as_data_url(image_bytes: bytes, mime_type: str) -> str:
    return f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode('utf-8')}"


def _extract_json_object(text: str) -> Dict[str, Any]:
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
    raise ValueError("model photo analysis did not contain a JSON object")


async def _post_with_retries(
    client: httpx.AsyncClient,
    *,
    provider: str,
    request_name: str,
    max_retries: int,
    method: str,
    url: str,
    **kwargs: Any,
) -> httpx.Response:
    attempts = max_retries + 1
    last_error: Optional[str] = None
    for attempt in range(1, attempts + 1):
        try:
            response = await client.request(method, url, **kwargs)
            if response.is_success:
                return response
            code = str(response.status_code)
            message = response.text[:800]
            try:
                err = response.json().get("error", {})
                if isinstance(err, dict):
                    code = str(err.get("code") or err.get("type") or code)
                    message = str(err.get("message") or message)
            except Exception:
                pass
            last_error = f"{code}: {message}"
            logger.error(
                "%s %s failed attempt=%s code=%s message=%s",
                provider,
                request_name,
                attempt,
                code,
                message,
            )
        except Exception as exc:
            last_error = str(exc)
            logger.error(
                "%s %s failed attempt=%s code=exception message=%s",
                provider,
                request_name,
                attempt,
                exc,
            )
        if attempt < attempts:
            await asyncio.sleep(min(8, 2 ** (attempt - 1)))

    raise ModelPhotoProcessingError(provider, "request_failed", last_error or "unknown error")


def _normalise_model_photo(image_bytes: bytes) -> Tuple[bytes, str, Optional[int], Optional[int]]:
    return normalize_image_bytes(
        image_bytes,
        max_dimension=int(os.getenv("MODEL_PHOTO_MAX_DIMENSION", "2200")),
        prefer_mime="image/jpeg",
        jpeg_quality=int(os.getenv("MODEL_PHOTO_JPEG_QUALITY", "92")),
        allow_png_alpha=False,
    )


def _build_model_metadata(analysis: Dict[str, Any], *, image_role: str, source_filename: str) -> Dict[str, Any]:
    analysed_at = utc_now_iso()
    body_pose = analysis.get("bodyPose") or analysis.get("body_pose") or "unknown"
    skin_tone = analysis.get("skinTone") or analysis.get("skin_tone") or "unknown"
    lighting = analysis.get("lightingCondition") or analysis.get("lighting_condition") or "unknown"
    background = analysis.get("backgroundType") or analysis.get("background_type") or "unknown"
    measurements = analysis.get("approximateMeasurements") or analysis.get("approximate_measurements") or {}
    proportions = analysis.get("proportions") or {}

    return {
        "model:bodyPose": body_pose,
        "model:skinTone": skin_tone,
        "model:approximateMeasurements": measurements,
        "model:proportions": proportions,
        "model:lightingCondition": lighting,
        "model:backgroundType": background,
        "model:analysisVersion": MODEL_ANALYSIS_VERSION,
        "model:analysedAt": analysed_at,
        "model:imageRole": image_role,
        "model:sourceFilename": source_filename,
        "body_pose": body_pose,
        "skin_tone": skin_tone,
        "approximate_measurements": measurements,
        "proportions": proportions,
        "lighting_condition": lighting,
        "background_type": background,
        "analysis_version": MODEL_ANALYSIS_VERSION,
        "analysed_at": analysed_at,
    }


async def analyze_model_photo_set(
    images: List[Tuple[str, bytes, str]],
    *,
    api_key: str,
) -> Dict[str, Any]:
    if not api_key:
        raise ModelPhotoProcessingError("OpenAI", "missing_api_key", "OPENAI_API_KEY is required")

    model_name = os.getenv("OPENAI_MODEL_PHOTO_ANALYSIS_MODEL") or get_openai_model("model_photo_analysis")
    prompt = """
Analyze the uploaded model reference photos for a virtual try-on pipeline.

Return JSON only with:
{
  "bodyPose": "short pose summary across the photos",
  "skinTone": "neutral visual skin tone descriptor",
  "approximateMeasurements": {
    "heightImpression": "short/tall/average/unknown",
    "shoulderWidth": "narrow/average/broad/unknown",
    "torsoLength": "short/average/long/unknown",
    "legLength": "short/average/long/unknown",
    "build": "slim/average/athletic/curvy/muscular/unknown"
  },
  "proportions": "coarse body proportion notes useful for garment drape",
  "lightingCondition": "lighting summary",
  "backgroundType": "background summary",
  "faceVisibility": "clear/partial/obscured/unknown",
  "framingQuality": "full_body/three_quarter/upper_body/close_up/mixed/unknown",
  "recommendedMainIndex": 0,
  "perPhoto": [
    {"index": 0, "pose": "...", "lighting": "...", "qualityNotes": "..."}
  ]
}

Do not identify the person. Do not infer sensitive identity traits. Keep all measurements approximate and qualitative.
""".strip()

    content: List[Dict[str, Any]] = [{"type": "text", "text": prompt}]
    for index, (filename, image_bytes, mime_type) in enumerate(images):
        content.append({"type": "text", "text": f"Model reference photo {index}: {filename}"})
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": _as_data_url(image_bytes, mime_type),
                    "detail": "high",
                },
            }
        )

    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "system",
                "content": "You are a computer-vision analyst for a virtual fashion try-on system.",
            },
            {"role": "user", "content": content},
        ],
        "temperature": 0.0,
        "max_tokens": 1200,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await _post_with_retries(
            client,
            provider="OpenAI",
            request_name="model_photo_analysis",
            max_retries=int(os.getenv("MODEL_PHOTO_API_MAX_RETRIES", "2")),
            method="POST",
            url=OPENAI_CHAT_COMPLETIONS_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )

    data = response.json()
    text = (
        (data.get("choices") or [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    if not isinstance(text, str):
        raise ModelPhotoProcessingError("OpenAI", "invalid_response", "model photo analysis returned non-text content")
    analysis = _extract_json_object(text)
    analysis["provider"] = "openai"
    analysis["model"] = model_name
    return analysis


def _extract_openai_image(data: Dict[str, Any], *, output_mime: str) -> bytes:
    items = data.get("data") or []
    if not items or not isinstance(items[0], dict):
        raise ModelPhotoProcessingError("OpenAI", "no_image", "composite response had no image data")
    item = items[0]
    b64 = item.get("b64_json") or item.get("base64")
    if isinstance(b64, str) and b64.strip():
        return base64.b64decode(b64)
    raise ModelPhotoProcessingError("OpenAI", "no_b64_image", f"composite response did not include {output_mime} bytes")


async def generate_composite_model_photo(
    images: List[Tuple[str, bytes, str]],
    *,
    api_key: str,
    analysis: Dict[str, Any],
) -> Tuple[bytes, str]:
    if len(images) <= 1:
        return images[0][1], images[0][2]

    model_name = os.getenv("OPENAI_MODEL_PHOTO_COMPOSITE_MODEL") or get_openai_model("tryon_image")
    output_format = os.getenv("MODEL_PHOTO_COMPOSITE_OUTPUT_FORMAT", "jpeg").strip().lower()
    if output_format not in {"jpeg", "png", "webp"}:
        output_format = "jpeg"
    output_mime = {"jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[output_format]
    size = os.getenv("MODEL_PHOTO_COMPOSITE_SIZE", "1024x1536")
    quality = os.getenv("MODEL_PHOTO_COMPOSITE_QUALITY", "high")

    prompt = (
        "Create one clean, photorealistic, full-body model reference image optimized for virtual clothing try-on. "
        "Use the provided photos only to preserve the same person, face, hair, skin tone, body proportions, and natural stance. "
        "Use a neutral seamless studio background, soft even lighting, full body visible including feet, and no extra text or watermark. "
        "Do not idealize, slim, enlarge, beautify, de-age, or otherwise change the person's body or identity. "
        "Resolve conflicting angles by using the clearest full-body view and the metadata below as guidance.\n\n"
        f"MODEL_ANALYSIS_JSON:\n{json.dumps(analysis, ensure_ascii=False)}"
    )

    files = []
    for index, (filename, image_bytes, mime_type) in enumerate(images):
        ext = "png" if mime_type == "image/png" else "jpg"
        files.append(("image[]", (f"model_reference_{index + 1}_{_safe_filename_part(filename)}.{ext}", image_bytes, mime_type)))

    async with httpx.AsyncClient(timeout=240.0) as client:
        response = await _post_with_retries(
            client,
            provider="OpenAI",
            request_name="model_photo_composite",
            max_retries=int(os.getenv("MODEL_PHOTO_API_MAX_RETRIES", "2")),
            method="POST",
            url=OPENAI_IMAGES_EDITS_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            data={
                "model": model_name,
                "prompt": prompt,
                "size": size,
                "quality": quality,
                "output_format": output_format,
                "moderation": os.getenv("OPENAI_TRYON_MODERATION", "auto"),
            },
            files=files,
        )

    return _extract_openai_image(response.json(), output_mime=output_mime), output_mime


async def process_model_photos(
    image_files: List[bytes],
    original_filenames: List[str],
    *,
    output_dir: str = "uploads",
) -> Dict[str, Any]:
    if not image_files:
        raise ValueError("At least one model photo is required")
    if len(image_files) != len(original_filenames):
        raise ValueError("Model photo bytes and filenames length mismatch")
    if len(image_files) > 5:
        raise ValueError("Maximum 5 model photos allowed")

    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise ModelPhotoProcessingError("OpenAI", "missing_api_key", "OPENAI_API_KEY is required")

    normalized: List[Tuple[str, bytes, str]] = []
    dimensions: List[Dict[str, Any]] = []
    for index, (image_bytes, filename) in enumerate(zip(image_files, original_filenames)):
        try:
            max_bytes = int(os.getenv("MODEL_PHOTO_MAX_IMAGE_BYTES", 6 * 1024 * 1024))
            normalised_bytes, mime_type, width, height = normalize_image_bytes_with_budget(
                image_bytes,
                max_bytes=max_bytes,
                max_dimension=int(os.getenv("MODEL_PHOTO_MAX_DIMENSION", "2200")),
                min_dimension=1000,
                prefer_mime="image/jpeg",
                jpeg_quality=int(os.getenv("MODEL_PHOTO_JPEG_QUALITY", "92")),
                min_jpeg_quality=78,
                allow_png_alpha=False,
            )
        except Exception:
            normalised_bytes, mime_type, width, height = _normalise_model_photo(image_bytes)
        normalized.append((filename or f"model_{index + 1}.jpg", normalised_bytes, mime_type))
        dimensions.append({"index": index, "width": width, "height": height, "mime_type": mime_type})

    analysis = await analyze_model_photo_set(normalized, api_key=api_key)
    composite_bytes, composite_mime = await generate_composite_model_photo(
        normalized,
        api_key=api_key,
        analysis=analysis,
    )

    primary_source = "composite" if len(normalized) > 1 else "single"
    primary_filename = original_filenames[0] if original_filenames else "model.jpg"
    metadata = _build_model_metadata(analysis, image_role=primary_source, source_filename=primary_filename)
    metadata["model:sourcePhotoCount"] = len(normalized)
    metadata["model:inputDimensions"] = dimensions

    preferred_format = "PNG" if composite_mime == "image/png" else "JPEG"
    enriched_bytes = embed_structured_metadata(composite_bytes, metadata, preferred_format=preferred_format)

    ext = ".png" if composite_mime == "image/png" else ".jpg"
    timestamp = datetime.utcnow().strftime("%Y-%m-%d")
    unique_id = uuid.uuid4().hex[:8]
    storage_path = f"{MODEL_UPLOAD_SUBDIR}/{timestamp}/model_reference_{primary_source}_{unique_id}{ext}"
    storage = get_storage_backend(base_dir=output_dir)
    public_url = await storage.save_file(enriched_bytes, storage_path, composite_mime)

    return {
        "status": "success",
        "primary": {
            "image_url": public_url,
            "file_url": public_url,
            "storage_path": storage_path,
            "mime_type": composite_mime,
            "size_bytes": len(enriched_bytes),
            "metadata": metadata,
            "source": primary_source,
        },
        "analysis": analysis,
        "metadata": metadata,
        "items": [
            {
                "index": idx,
                "original_filename": filename,
                "mime_type": mime_type,
                "size_bytes": len(image_bytes),
                "dimensions": dimensions[idx],
            }
            for idx, (filename, image_bytes, mime_type) in enumerate(normalized)
        ],
    }
