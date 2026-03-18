import os
import asyncio
import logging
import base64
import io
import json
import re
import copy
import time
from typing import Any, Dict, List, Optional, Tuple, Union
from PIL import Image, ImageOps
import httpx
from .model_registry import (
    gemini_generate_content_endpoints,
    get_gemini_model_candidates,
    get_openrouter_configured_model,
)

logger = logging.getLogger(__name__)

# Silence httpx INFO logs to avoid leaking API keys in URL query params.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# This module uses direct REST API calls for try-on generation plus Gemini REST calls for
# rewrite/safety helpers. No SDKs or OAuth2 are required.

CONTENT_REJECTION_FINISH_REASONS = {"IMAGE_SAFETY", "SAFETY", "CONTENT_FILTER", "PROHIBITED_CONTENT"}
CONTENT_REJECTION_KEYWORDS = [
    "image_safety",
    "safety filter",
    "safety filters",
    "blocked",
    "block",
    "content policy",
    "policy",
    "sexually explicit",
    "sexual",
    "adult",
    "nsfw",
    "nudity",
    "explicit",
]

INTIMATE_KEYWORDS = [
    "lingerie",
    "underwear",
    "panties",
    "thong",
    "bra",
    "bralette",
    "bustier",
    "corset",
    "nude",
    "nudity",
    "sheer",
    "see-through",
    "see through",
    "transparent",
    "fishnet",
]

TRYON_SYSTEM_PROMPT = (
    "You are a premium fashion virtual try-on renderer. "
    "Your highest priority is preserving the person's real identity and real body. "
    "Do not slim, widen, lengthen, shorten, sculpt, beautify, de-age, or otherwise alter the person's true body size, proportions, silhouette, facial structure, skin texture, or identity. "
    "The garment may drape naturally, but the body underneath must remain realistic and unchanged. "
    "Render the person in a neutral, seamless studio environment with soft, even, flattering commercial lighting. "
    "Do not reuse the original background from the reference image. "
    "Keep the output photorealistic, tasteful, and suitable for a premium ecommerce experience."
)

def is_content_rejection(
    *,
    finish_reason: Optional[str] = None,
    http_status: Optional[int] = None,
    error_text: Optional[str] = None,
    safety_ratings: Optional[List[Dict[str, Any]]] = None,
) -> bool:
    """
    Returns True if the failure looks like a content/safety rejection that should trigger
    prompt/metadata rewriting, as opposed to transient network/timeouts or unknown errors.
    """
    fr = (finish_reason or "").strip().upper()
    if fr in CONTENT_REJECTION_FINISH_REASONS:
        return True

    # Some model APIs return 400/403 with policy text.
    if http_status in (400, 403, 422):
        text = (error_text or "").lower()
        if any(k in text for k in CONTENT_REJECTION_KEYWORDS):
            return True

    # Safety ratings sometimes include categories/thresholds even when finishReason isn't set.
    if safety_ratings:
        try:
            for r in safety_ratings:
                cat = str(r.get("category", "")).lower()
                prob = str(r.get("probability", "")).lower()
                if "sex" in cat or "explicit" in cat or "sexual" in cat:
                    return True
                if prob in ("high", "medium"):
                    # A conservative signal that this candidate might be blocked.
                    return True
        except Exception:
            pass

    # Fallback: keyword scan
    text = (error_text or "").lower()
    return any(k in text for k in CONTENT_REJECTION_KEYWORDS)


def rewrite_for_modesty_heuristic(
    metadata: Optional[Dict[str, Any]],
    prompt: str,
    *,
    strictness: str = "moderate",
) -> Tuple[Dict[str, Any], str, str]:
    """
    Heuristic rewrite to reduce safety filter triggers while preserving intent.
    Does not remove wearing directives; it only sanitizes wording and adds more
    conservative framing instructions.
    """
    safe_meta: Dict[str, Any] = copy.deepcopy(metadata) if isinstance(metadata, dict) else {}

    def sanitize_text(s: str) -> str:
        # Keep this conservative; we want to avoid generating explicit phrases, but allow neutral guidance.
        replacements = {
            "lingerie": "intimate apparel",
            "thong": "minimal undergarment",
            "bra": "supportive top",
            "panties": "undergarments",
            "nude": "neutral tone",
            "see-through": "semi-transparent",
            "transparent": "semi-transparent",
            "sheer": "semi-transparent",
            "fishnet": "patterned fabric",
            "fetish": "specialty",
            "bondage": "restraint-style",
            "stripper": "dance wear",
            "pole dancing": "fitness wear",
            "provocative": "bold",
            "sexy": "stylish",
            "seductive": "elegant",
            "risque": "daring",
            "cleavage": "neckline area",
        }
        out = s
        for old, new in replacements.items():
            out = re.sub(rf"\b{re.escape(old)}\b", new, out, flags=re.IGNORECASE)
        # Remove extra whitespace
        out = re.sub(r"\s+", " ", out).strip()
        return out

    def sanitize_value(v: Any) -> Any:
        if isinstance(v, str):
            return sanitize_text(v)
        if isinstance(v, list):
            return [sanitize_value(x) for x in v]
        if isinstance(v, dict):
            return {k: sanitize_value(x) for k, x in v.items()}
        return v

    safe_meta = sanitize_value(safe_meta)

    # Encourage neutral studio presentation while preserving body/identity fidelity.
    safe_meta.setdefault("framing", "full_or_three_quarter_studio")
    safe_meta.setdefault("background", "neutral_seamless_studio")
    safe_meta.setdefault("lighting", "soft_even_studio")
    safe_meta.setdefault("camera", "natural_fashion_editorial")
    safe_meta.setdefault("pose", "natural_reference_pose")
    safe_meta.setdefault("content_policy", "general_audience")

    guidance = (
        "\n\nSAFETY COMPLIANCE (MANDATORY): Create a general-audience fashion image while preserving fidelity. "
        "PRESERVE FIDELITY: Keep the person identical to the user reference (face, hair, skin tone, body shape, tattoos, accessories), "
        "and keep the new garment identical to the clothing image (design, color, texture, logos, prints). "
        "STUDIO SETTING: Place the person in a neutral seamless studio setting with soft, even lighting instead of reusing the original background. "
        "Do not use background changes to disguise or alter the person's apparent size, shape, or identity. "
        "OVERLAY-ONLY MODE: If needed to satisfy safety policies, ONLY add a thin opaque lining/underlayer or increase fabric opacity "
        "(e.g., a seamless lining, modesty panel, or built-in lining). Do NOT redesign the garment, do NOT add new garments, and do NOT change fit/style."
    )
    if strictness == "max":
        guidance += (
            " If safety remains uncertain, prefer slightly higher opacity/lining, but still keep the garment and person unchanged inside the neutral studio setup."
        )

    safe_prompt = sanitize_text(prompt) + guidance
    return safe_meta, safe_prompt, f"heuristic_rewrite(strictness={strictness})"


async def _gemini_post_json(
    client: httpx.AsyncClient,
    *,
    url: str,
    headers: Dict[str, str],
    payload: Dict[str, Any],
) -> httpx.Response:
    """
    Thin wrapper for Gemini HTTP calls to make retry logic testable (can be monkeypatched).
    """
    return await client.post(url, headers=headers, json=payload)


async def _openrouter_post_json(
    client: httpx.AsyncClient,
    *,
    url: str,
    headers: Dict[str, str],
    payload: Dict[str, Any],
) -> httpx.Response:
    """
    Thin wrapper for OpenRouter HTTP calls to make retry logic testable (can be monkeypatched).
    """
    return await client.post(url, headers=headers, json=payload)


def _extract_openrouter_image_url(data: Dict[str, Any]) -> Tuple[Optional[str], Optional[str], List[str]]:
    choices = (data or {}).get("choices") or []
    if not choices:
        return None, None, []

    choice0 = choices[0] or {}
    finish_reason = choice0.get("finish_reason") or choice0.get("finishReason")
    message = choice0.get("message") or {}

    images = []
    if isinstance(message, dict):
        raw_images = message.get("images") or []
        if isinstance(raw_images, list):
            images = raw_images

    for image in images:
        if not isinstance(image, dict):
            continue
        image_url = image.get("image_url") or image.get("imageUrl") or {}
        if isinstance(image_url, dict):
            url = image_url.get("url") or image_url.get("data")
            if isinstance(url, str) and url.strip():
                mime_type = image.get("mime_type") or image.get("mimeType") or "image/png"
                return url.strip(), str(mime_type), []

    content = message.get("content") if isinstance(message, dict) else None
    content_parts: List[str] = []
    if isinstance(content, str) and content.strip().startswith("data:image/"):
        return content.strip(), None, content_parts
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict) and part.get("type") == "image_url":
                image_url = part.get("image_url") or {}
                if isinstance(image_url, dict):
                    url = image_url.get("url") or image_url.get("data")
                    if isinstance(url, str) and url.strip():
                        mime_type = image_url.get("mime_type") or image_url.get("mimeType")
                        return url.strip(), str(mime_type) if mime_type else None, content_parts
            if isinstance(part, dict) and part.get("type") == "text" and part.get("text"):
                content_parts.append(str(part.get("text") or ""))
    if isinstance(content, str) and content.strip():
        content_parts.append(content.strip())
    return None, None, content_parts


async def rewrite_for_modesty_gemini(
    client: httpx.AsyncClient,
    *,
    api_key: str,
    metadata: Optional[Dict[str, Any]],
    prompt: str,
    last_failure: Dict[str, Any],
    strictness: str,
) -> Tuple[Dict[str, Any], str, str]:
    """
    Gemini rewrite step (text-only) to reduce IMAGE_SAFETY/IMAGE_OTHER blocks.

    Returns:
      (new_metadata, prompt_additions, summary)

    Hardening:
    - Strict JSON-only output request (best-effort; we still defensively parse)
    - Short timeout; falls back to caller's heuristic logic on failure
    - Caller should still apply a heuristic sanitization layer to the output
    """
    if os.getenv("GEMINI_REWRITE_ENABLED", "1") != "1":
        raise RuntimeError("gemini_rewrite_disabled")

    preferred_model = os.getenv("GEMINI_REWRITE_MODEL") or os.getenv("GEMINI_TEXT_MODEL")
    model_candidates = get_gemini_model_candidates("rewrite", extra_models=[preferred_model])

    endpoints: List[Tuple[str, str]] = []
    for m in model_candidates:
        for endpoint in gemini_generate_content_endpoints(m):
            endpoints.append((m, endpoint))

    system = (
        "You are a safety compliance editor for a fashion virtual try-on system. "
        "Your job is to propose MINIMAL changes that reduce image safety blocks while preserving fidelity. "
        "ABSOLUTE CONSTRAINTS: "
        "Do NOT change the person's identity (face, hair, skin tone, body shape), do NOT change pose/angle/background/lighting, "
        "and do NOT change the garment design/color/texture/logos/prints. "
        "ALLOWED CHANGE ONLY: add a thin opaque lining/underlayer or increase fabric opacity/coverage *without* altering the garment's design. "
        "Do NOT remove or weaken mandatory wearing directives. "
        "Keep the output general-audience and professional. "
        "Return ONLY valid JSON matching the schema."
    )
    if strictness == "max":
        system += (
            " Apply MAXIMUM safety using overlay-only changes (higher opacity/lining) while still preserving identity/pose/background and garment design."
        )

    schema = {
        "prompt_additions": "string (short block of directives to append to the base prompt)",
        "metadata": "object (revised metadata, preserve keys if possible)",
        "changes": "array of short strings describing what changed",
    }

    user_payload = {
        "instruction": "Rewrite the metadata and propose additional prompt directives to be more modest and less likely to trigger safety filters.",
        "strictness": strictness,
        "last_failure": last_failure,
        "prompt_context": prompt,
        "metadata": metadata or {},
        "output_schema": schema,
    }

    text = (
        system
        + "\n\nINPUT_JSON:\n"
        + json.dumps(user_payload, ensure_ascii=False)
        + "\n\nOUTPUT: JSON ONLY. No markdown. No code fences."
    )

    req = {
        "contents": [{"role": "user", "parts": [{"text": text}]}],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 900,
            # Best-effort; some Gemini models honor this and will return raw JSON text.
            "responseMimeType": "application/json",
        },
    }

    async def do_call(endpoint_url: str) -> httpx.Response:
        return await _gemini_post_json(
            client,
            url=f"{endpoint_url}?key={api_key}",
            headers={"Content-Type": "application/json"},
            payload=req,
        )

    timeout_s = float(os.getenv("GEMINI_REWRITE_TIMEOUT_S", "12"))
    resp: Optional[httpx.Response] = None
    used_model: Optional[str] = None
    last_error: Optional[str] = None
    for model_name, endpoint_url in endpoints:
        try:
            resp = await asyncio.wait_for(do_call(endpoint_url), timeout=timeout_s)
        except asyncio.TimeoutError:
            raise RuntimeError("gemini_rewrite_timeout")

        if not resp.is_success:
            last_error = f"gemini_rewrite_http_error:{model_name}:{resp.status_code}:{resp.text[:200]}"
            # Most common failure here is a deprecated model alias (404 NOT_FOUND). Try the next candidate quickly.
            if resp.status_code == 404:
                continue
            raise RuntimeError(last_error)

        used_model = model_name
        break

    if not resp or not resp.is_success:
        raise RuntimeError(last_error or "gemini_rewrite_all_endpoints_failed")

    data = resp.json() if hasattr(resp, "json") else {}
    candidates = (data or {}).get("candidates") or []
    if not candidates:
        raise RuntimeError("gemini_rewrite_no_candidates")

    cand0 = candidates[0] or {}
    content = cand0.get("content") or {}
    parts = content.get("parts") or []
    out_text = ""
    for p in parts:
        if isinstance(p, dict) and p.get("text"):
            out_text = str(p.get("text") or "").strip()
            break
    if not out_text:
        raise RuntimeError("gemini_rewrite_empty_text")

    # Defensive: strip code fences if the model ignores the instruction.
    if out_text.startswith("```"):
        out_text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", out_text).strip()
        out_text = re.sub(r"\s*```$", "", out_text).strip()

    parsed = json.loads(out_text)
    if not isinstance(parsed, dict):
        raise RuntimeError("gemini_rewrite_non_object_json")

    prompt_additions = str(parsed.get("prompt_additions") or "")
    new_meta_raw = parsed.get("metadata") or (metadata or {})
    new_meta = new_meta_raw if isinstance(new_meta_raw, dict) else (metadata or {})
    changes = parsed.get("changes") or []
    if not isinstance(changes, list):
        changes = []

    summary = f"gemini_rewrite(strictness={strictness}, model={model_name}, changes={changes[:4]})"
    return new_meta, prompt_additions, summary

async def generate_try_on(user_image_files, garment_image_files, category="upper_body", garment_metadata=None, user_attributes=None, main_index=0, user_quality_flags=None):
    """
    Uses OpenRouter image generation to combine person and clothing images.
    Generates a photorealistic image of the person wearing all clothing items.
    
    Args:
        user_image_files: File-like object or list of File-like objects of the person image(s) (USER_IMAGE).
        garment_image_files: File-like object or list of File-like objects of clothing images (CLOTHING_IMAGES).
        category: Category of the garment (upper_body, lower_body, dresses) - kept for backward compatibility.
        garment_metadata: Optional metadata dict with styling instructions (background, style, framing, pose, camera, extras).
        user_attributes: Optional dict of AI-extracted user attributes (body_type, etc.)
        
    Returns:
        dict: {"image_url": "data:...base64,...", "retry_info": [...]} (retry_info may be empty)
    """
    # Normalize user images to list
    if not isinstance(user_image_files, list):
        user_image_files = [user_image_files]

    # Normalize garments to list if single file
    if not isinstance(garment_image_files, list):
        garment_image_files = [garment_image_files]
    
    # Use OpenRouter for image generation
    return await _generate_with_openrouter(
        user_image_files,
        garment_image_files,
        category,
        garment_metadata,
        user_attributes,
        main_index=main_index,
        user_quality_flags=user_quality_flags,
    )


async def _generate_with_openrouter(user_image_files, garment_image_files, category="upper_body", garment_metadata=None, user_attributes=None, main_index=0, user_quality_flags=None):
    """
    Uses OpenRouter image generation for virtual try-on image generation.
    Generates a photorealistic image of the person wearing all clothing items.
    
    This function uses direct REST API calls to OpenRouter with the configured
    Google Gemini image model via the OpenRouter gateway.
    No SDKs or OAuth2 are required - just set OPENROUTER_API_KEY environment variable.
    
    Model: resolved dynamically from OPENROUTER_TRYON_MODEL / configured OpenRouter model
    - Supports multi-image fusion (base person + clothing images)
    - Uses modalities: ["image", "text"] for image generation
    
    API Endpoint: https://openrouter.ai/api/v1/chat/completions
    Authentication: Bearer API key in the Authorization header
    Request Format: JSON messages with text prompt + images as base64 data URLs
    
    Args:
        user_image_files: List of file-like objects of the person image(s)
        garment_image_files: List of file-like objects of clothing images
        category: Category of the garment (for metadata)
        garment_metadata: Optional styling instructions dict
        
    Returns:
        dict: {"image_url": "data:...base64,...", "retry_info": [...]} (retry_info may be empty)
    """
    # Get API key from environment
    api_key = os.getenv("OPENROUTER_API_KEY")
    # #region agent log
    import json as json_lib
    try:
        with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
            f.write(json_lib.dumps({"location":"vton.py:63","message":"Checking OpenRouter API key","data":{"hasApiKey":api_key is not None,"apiKeyLength":len(api_key) if api_key else 0},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
    except: pass
    # #endregion
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY environment variable is required")
    
    try:
        # Read user image bytes
        # #region agent log
        try:
            with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                f.write(json_lib.dumps({"location":"vton.py:69","message":"Before reading images","data":{"userFilesCount":len(user_image_files),"garmentFilesCount":len(garment_image_files)},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"C"})+"\n")
        except: pass
        # #endregion
        
        user_image_bytes_list = []
        for user_file in user_image_files:
            if hasattr(user_file, 'seek'):
                user_file.seek(0)
            user_bytes = user_file.read() if hasattr(user_file, 'read') else user_file
            user_image_bytes_list.append(user_bytes)

        # Read all clothing images into list
        garment_image_bytes_list = []
        for garment_file in garment_image_files:
            if hasattr(garment_file, 'seek'):
                garment_file.seek(0)
            garment_bytes = garment_file.read() if hasattr(garment_file, 'read') else garment_file
            garment_image_bytes_list.append(garment_bytes)
        # #region agent log
        try:
            with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                f.write(json_lib.dumps({"location":"vton.py:80","message":"Clothing images read","data":{"garmentImagesCount":len(garment_image_bytes_list)},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"C"})+"\n")
        except: pass
        # #endregion
        
        # Limit to 5 user images and 5 clothing items to keep OpenRouter payloads reasonable.
        limited_user_images = user_image_bytes_list[:5]
        if len(user_image_bytes_list) > 5:
            logger.warning(f"Limiting to 5 user images (received {len(user_image_bytes_list)})")

        limited_garments = garment_image_bytes_list[:5]
        if len(garment_image_bytes_list) > 5:
            logger.warning(f"Limiting to 5 clothing items (received {len(garment_image_bytes_list)})")
        
        # Convert images to base64 for API request
        # OpenRouter chat completions uses image_url data URLs for multimodal inputs.
        def image_to_base64(image_bytes, *, max_dim: int, jpeg_quality: int):
            """
            Convert image bytes to base64 string for OpenRouter image inputs.
            Detects image format and converts to a size-efficient format:
            - JPEG for non-alpha images (smaller payload, better for mobile photos/screenshots)
            - PNG only when alpha/transparency is present
            """
            try:
                img = Image.open(io.BytesIO(image_bytes))
                img = ImageOps.exif_transpose(img)

                # Downscale large images to keep request payloads reasonable
                try:
                    w, h = img.size
                    longest = max(w, h)
                    if longest > max_dim:
                        scale = max_dim / float(longest)
                        new_w = max(1, int(round(w * scale)))
                        new_h = max(1, int(round(h * scale)))
                        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                except Exception:
                    pass

                has_alpha = img.mode in ("RGBA", "LA") or (
                    img.mode == "P" and "transparency" in (img.info or {})
                )

                buffer = io.BytesIO()
                if has_alpha:
                    img.save(buffer, format="PNG", optimize=True)
                    out_mime = "image/png"
                else:
                    img.convert("RGB").save(
                        buffer, format="JPEG", quality=jpeg_quality, optimize=True, progressive=True
                    )
                    out_mime = "image/jpeg"

                return base64.b64encode(buffer.getvalue()).decode("utf-8"), out_mime
            except Exception as e:
                logger.warning(f"Could not detect image format, using raw bytes: {e}")
                return base64.b64encode(image_bytes).decode('utf-8'), 'image/jpeg'
        
        # Model-call payload budget guard:
        # keep the total encoded image bytes under a conservative limit to reduce timeouts/failures.
        max_total_image_bytes = int(os.getenv("VTON_MAX_TOTAL_IMAGE_BYTES", 12 * 1024 * 1024))  # ~12MB
        # Main user ref guard: avoid shrinking the primary reference too far, to preserve face/body fidelity.
        min_main_user_dim = int(os.getenv("VTON_MIN_MAIN_USER_DIM", 1600))
        min_main_user_jpeg_quality = int(os.getenv("VTON_MIN_MAIN_USER_JPEG_QUALITY", 82))

        def estimate_b64_bytes(b64_str: str) -> int:
            # Base64 chars ≈ 4/3 of bytes. Ignore padding for simplicity.
            return int(len(b64_str) * 3 / 4)

        def build_encoded_images(
            *,
            main_user_dim: int,
            other_user_dim: int,
            main_user_q: int,
            other_user_q: int,
            first_garment_dim: int,
            other_garment_dim: int,
            first_garment_q: int,
            other_garment_q: int,
        ):
            user_data_local = []
            for idx, user_bytes in enumerate(limited_user_images):
                is_main = (idx == int(main_index or 0))
                user_base64, user_mime = image_to_base64(
                    user_bytes,
                    max_dim=main_user_dim if is_main else other_user_dim,
                    jpeg_quality=main_user_q if is_main else other_user_q,
                )
                user_data_local.append(
                    {
                        "base64": user_base64,
                        "mimeType": user_mime,
                        "id": f"user_{idx + 1}",
                    }
                )

            garment_data_local = []
            for idx, garment_bytes in enumerate(limited_garments):
                garment_base64, garment_mime = image_to_base64(
                    garment_bytes,
                    max_dim=first_garment_dim if idx == 0 else other_garment_dim,
                    jpeg_quality=first_garment_q if idx == 0 else other_garment_q,
                )
                garment_data_local.append(
                    {
                        "base64": garment_base64,
                        "mimeType": garment_mime,
                        "id": f"item_{idx + 1}",
                        "slot": category if idx == 0 else "accessory",
                        "layer_order": idx,
                    }
                )
            total_bytes = sum(estimate_b64_bytes(u["base64"]) for u in user_data_local) + sum(
                estimate_b64_bytes(g["base64"]) for g in garment_data_local
            )
            return user_data_local, garment_data_local, total_bytes

        # Initial quality/dimension targets
        main_user_dim = 2200
        other_user_dim = 1600
        first_garment_dim = 1800
        other_garment_dim = 1400
        main_user_q = 90
        other_user_q = 82
        first_garment_q = 86
        other_garment_q = 80

        # Iteratively shrink until under budget, prioritizing secondary refs.
        max_iters = 6
        user_data, garment_data, total_image_bytes = build_encoded_images(
            main_user_dim=main_user_dim,
            other_user_dim=other_user_dim,
            main_user_q=main_user_q,
            other_user_q=other_user_q,
            first_garment_dim=first_garment_dim,
            other_garment_dim=other_garment_dim,
            first_garment_q=first_garment_q,
            other_garment_q=other_garment_q,
        )

        if total_image_bytes > max_total_image_bytes:
            logger.warning(
                f"VTON payload over budget: {total_image_bytes}B > {max_total_image_bytes}B. "
                "Auto-downscaling secondary references."
            )

        for _i in range(max_iters):
            if total_image_bytes <= max_total_image_bytes:
                break

            # Priority 1: shrink secondary user refs + accessory garments
            other_user_dim = max(900, int(other_user_dim * 0.85))
            other_garment_dim = max(850, int(other_garment_dim * 0.85))
            other_user_q = max(70, other_user_q - 4)
            other_garment_q = max(68, other_garment_q - 4)

            # Priority 2: shrink primary garment
            first_garment_dim = max(1000, int(first_garment_dim * 0.9))
            first_garment_q = max(72, first_garment_q - 3)

            # Priority 3: as last resort, shrink main user ref slightly
            main_user_dim = max(min_main_user_dim, int(main_user_dim * 0.92))
            main_user_q = max(min_main_user_jpeg_quality, main_user_q - 2)

            user_data, garment_data, total_image_bytes = build_encoded_images(
                main_user_dim=main_user_dim,
                other_user_dim=other_user_dim,
                main_user_q=main_user_q,
                other_user_q=other_user_q,
                first_garment_dim=first_garment_dim,
                other_garment_dim=other_garment_dim,
                first_garment_q=first_garment_q,
                other_garment_q=other_garment_q,
            )

        if total_image_bytes > max_total_image_bytes:
            logger.warning(
                f"VTON payload still over budget after downscaling: {total_image_bytes}B > {max_total_image_bytes}B. "
                "Continuing anyway (best-effort)."
            )
        else:
            logger.info(
                f"VTON payload within budget: {total_image_bytes}B <= {max_total_image_bytes}B "
                f"(dims user main/other={main_user_dim}/{other_user_dim}, garments first/other={first_garment_dim}/{other_garment_dim})."
            )
        
        logger.info(f"Generating image with {len(limited_user_images)} user images and {len(limited_garments)} clothing item(s)...")
        
        def _sanitize_clothing_description(description):
            """
            Sanitize clothing descriptions to avoid triggering content filters while maintaining recognizability.
            """
            if not isinstance(description, str):
                return description

            # Replace potentially problematic terms with safer alternatives
            replacements = {
                'lingerie': 'intimate apparel',
                'lingerie top': 'delicate top',
                'intimate': 'delicate',
                'intimates': 'delicates',
                'bodysuit': 'one-piece outfit',
                'one-piece': 'one-piece outfit',
                'one piece': 'one-piece outfit',
                'unitard': 'one-piece outfit',
                'leotard': 'one-piece outfit',
                'catsuit': 'one-piece outfit',
                'swimsuit': 'swim outfit',
                'bathing suit': 'swim outfit',
                'monokini': 'swim outfit',
                'trikini': 'swim outfit',
                'bra': 'supportive top',
                'lacy': 'delicate fabric',
                'sheer': 'semi-transparent',
                'transparent': 'semi-transparent',
                'revealing': 'fitted',
                'low-cut': 'neckline',
                'plunging': 'v-neck',
                'thong': 'minimal undergarment',
                'bikini': 'swimwear',
                'micro': 'minimal',
                'cropped': 'short',
                'bodycon': 'form-fitting',
                'skinny': 'fitted',
                'tight': 'fitted',
                'cleavage': 'neckline area',
                'busty': 'full-figured',
                'sexy': 'stylish',
                'seductive': 'elegant',
                'provocative': 'bold',
                'risque': 'daring',
                'naughty': 'playful',
                'slutty': 'fashionable',
                'trashy': 'casual',
                'skimpy': 'minimalist',
                'barely there': 'minimal coverage',
                'nude': 'neutral tone',
                'flesh-colored': 'neutral tone',
                'see-through': 'semi-transparent',
                'mesh': 'open-weave',
                'fishnet': 'patterned',
                'fetish': 'specialty',
                'bondage': 'restraint-style',
                'dominatrix': 'bold fashion',
                'latex': 'shiny material',
                'leather': 'textured material',
                'PVC': 'synthetic material',
                'corset': 'structured top',
                'bustier': 'fitted bodice',
                'chemise': 'nightwear',
                'teddy': 'lingerie set',
                'camisole': 'light top',
                'bralette': 'supportive top',
                'panties': 'undergarments',
                'thongs': 'minimal undergarments',
                'boy shorts': 'short underwear',
                'garter': 'accessory',
                'stockings': 'hosiery',
                'pantyhose': 'legwear',
                'tights': 'leggings',
                'high heels': 'heels',
                'stilettos': 'high heels',
                'platform': 'elevated shoes',
                'stripper': 'dance wear',
                'pole dancing': 'fitness wear',
                'burlesque': 'performance wear',
            }

            sanitized = description.lower()
            for old, new in replacements.items():
                sanitized = sanitized.replace(old.lower(), new)

            # Capitalize first letter
            return sanitized.capitalize() if sanitized else description

        def _sanitize_metadata_value(value):
            """
            Recursively sanitize metadata values (strings, lists, dicts) to strip
            sensitive terms that could trigger guardrails.
            """
            if isinstance(value, str):
                return _sanitize_clothing_description(value)
            if isinstance(value, list):
                return [_sanitize_metadata_value(v) for v in value]
            if isinstance(value, dict):
                return {k: _sanitize_metadata_value(v) for k, v in value.items()}
            return value

        # Build text prompt for the OpenRouter image model
        user_img_count = len(limited_user_images)
        garment_img_count = len(limited_garments)
        user_refs = "image" if user_img_count == 1 else f"first {user_img_count} images"

        def build_base_text_prompt(meta_for_prompt: Optional[Dict[str, Any]]) -> Tuple[str, Dict[str, Any]]:
            """
            Build the full base prompt (including metadata section) from the current metadata state.
            Returns (prompt, sanitized_metadata_used).
            """
            local_meta: Dict[str, Any] = {}
            if isinstance(meta_for_prompt, dict):
                local_meta = _sanitize_metadata_value(meta_for_prompt)  # type: ignore

            text_prompt = (
                f"Use the {user_refs} as the person reference. These images define the person's identity (face, hair, eyes), body shape, stature/height impression, and overall appearance. "
                f"The FIRST user image (index {main_index + 1}) is the Main Reference Image for preserving any non-conflicting garments. "
                f"Use the subsequent {garment_img_count} images as new garments that must be worn by that same person. "
                "Generate one photorealistic image of the person wearing all provided NEW clothing items. "
                "OUTFIT PRESERVATION: For any clothing or accessories NOT provided in the new garments list, faithfully reproduce them from the Main Reference Image. "
                "Replace ONLY the garments that conflict with the new items (e.g., new top replaces the old top, but keep the original pants/shoes if not replaced; a dress replaces both top and bottom). "
                "BACKGROUND & LIGHTING: Reimagine the person in a neutral, seamless studio space with soft, even, premium fashion lighting. Do not reuse the original background. "
                "BODY FIDELITY IS PARAMOUNT: Preserve the person's real body size, proportions, silhouette, stance, and facial structure exactly as represented in the user images. "
                "Do not slim, enlarge, lengthen, shorten, smooth, beautify, or otherwise idealize the body or face. Only the garment should change, with natural fabric drape. "
                "IDENTITY FIDELITY: All user images must be used to perfectly maintain the same face, hair, eyes, skin tone, and body shape/height impression in the final image. "
                "MINIMAL CHANGE: Do not restyle or change facial features, body, age, hair, makeup, tattoos, or accessories except where a garment must realistically cover part of them. "
                "Every user-specified wearing style or positioning instruction is mandatory and overrides any defaults. "
                "Do not ignore, soften, or reinterpret those directives under any circumstance.\n\n"
            )

            if user_quality_flags:
                low_res_count = sum(1 for f in user_quality_flags if f.get("low_res"))
                if low_res_count > 0:
                    text_prompt += (
                        f"NOTE: Some user photos are lower resolution ({low_res_count}). "
                        "Prioritize the sharpest, best-lit reference when ensuring identity fidelity.\n"
                    )

            # Inject extracted user attributes to reinforce identity
            if user_attributes:
                text_prompt += "\nPHYSICAL ATTRIBUTES (Reinforce these features found in the user images):\n"
                if user_attributes.get('body_type'):
                    text_prompt += f"- Body Type: {user_attributes['body_type']}\n"
                if user_attributes.get('skin_tone'):
                    text_prompt += f"- Skin Tone: {user_attributes['skin_tone']}\n"
                if user_attributes.get('hair_color'):
                    text_prompt += f"- Hair: {user_attributes['hair_color']}\n"
                if user_attributes.get('gender'):
                    text_prompt += f"- Gender Presentation: {user_attributes['gender']}\n"
                if user_attributes.get('age_range'):
                    text_prompt += f"- Age Group: {user_attributes['age_range']}\n"
                text_prompt += "Ensure the generated person strictly adheres to these physical characteristics to maintain identity consistency.\n\n"

            text_prompt += (
                "IMPORTANT SAFETY GUIDELINES: "
                "Generate appropriate, tasteful fashion content only. "
                "If any clothing appears potentially inappropriate, use overlay-only adjustments to make it more modest and professional while preserving the garment design. "
                "Ensure all generated content complies with general audience standards. "
                "Add subtle coverage/opacity (lining/underlayer) only if needed, without changing the garment's fundamental design."
            )

            # If this request is flagged as intimate/high-risk, enforce a deterministic “modesty contract”
            # so the image model can comply without hard blocking. We allow underlayers/coverage.
            if local_meta.get("modesty_contract") is True or local_meta.get("intimate_mode") is True:
                text_prompt += (
                    "\n\nMODESTY CONTRACT (MANDATORY): "
                    "This outfit may include intimate or minimal-coverage garments. "
                    "You MUST output a general-audience, tasteful fashion image. "
                    "OVERLAY-ONLY: If any garment is small, sheer, or revealing, ONLY add a thin opaque lining/underlayer or increase fabric opacity/coverage "
                    "while keeping the garment IDENTICAL (same design, color, texture, logos/prints). "
                    "DO NOT change the person's identity, pose, background, lighting, or camera angle. "
                    "Avoid explicit emphasis; keep results tasteful and professional."
                )

            # Add wearing style instructions if provided
            if local_meta:
                def _normalize_instruction(value):
                    if isinstance(value, str):
                        cleaned = value.strip()
                        if cleaned:
                            return cleaned
                    return None

                def _extract_descriptor(item_info, fallback_index):
                    descriptor = (
                        item_info.get('descriptor')
                        or item_info.get('item_type')
                        or item_info.get('category')
                        or f"item {fallback_index + 1}"
                    )
                    if isinstance(descriptor, str):
                        descriptor = descriptor.strip()
                    return descriptor or f"item {fallback_index + 1}"

                wearing_instructions = local_meta.get('wearing_instructions')
                items_wearing_styles = local_meta.get('items_wearing_styles')

                normalized_instructions = []
                if isinstance(wearing_instructions, list):
                    for idx, instruction in enumerate(wearing_instructions):
                        normalized = _normalize_instruction(instruction)
                        if normalized:
                            sanitized = _sanitize_clothing_description(normalized)
                            normalized_instructions.append(sanitized)
                        else:
                            logger.warning(f"Wearing instruction at index {idx} is invalid and will be ignored: {instruction!r}")
                else:
                    normalized = _normalize_instruction(wearing_instructions)
                    if normalized:
                        sanitized = _sanitize_clothing_description(normalized)
                        normalized_instructions.append(sanitized)

                if normalized_instructions:
                    text_prompt += "\n\nMANDATORY wearing directives (never override these):\n"
                    for instruction in normalized_instructions:
                        text_prompt += f"- {instruction}\n"

                if items_wearing_styles and isinstance(items_wearing_styles, list) and len(items_wearing_styles) > 0:
                    text_prompt += "\n\nPer-item wearing instructions (non-negotiable):\n"
                    for idx, item_info in enumerate(items_wearing_styles):
                        if not isinstance(item_info, dict):
                            logger.warning(f"Ignoring invalid item_wearing_styles entry at index {idx}: {item_info!r}")
                            continue
                        try:
                            item_index = int(item_info.get('index', 0))
                        except (TypeError, ValueError):
                            item_index = 0
                        descriptor = _extract_descriptor(item_info, item_index)
                        prompt_text = item_info.get('prompt_text') or item_info.get('instruction') or item_info.get('wearing_style')
                        if not prompt_text:
                            continue
                        if not isinstance(prompt_text, str):
                            prompt_text = str(prompt_text)
                        style_desc = prompt_text.replace('_', ' ').strip()
                        if not style_desc:
                            continue

                        safe_descriptor = _sanitize_clothing_description(descriptor)
                        safe_style_desc = _sanitize_clothing_description(style_desc)
                        image_reference = user_img_count + item_index + 1
                        text_prompt += (
                            f"- Image {image_reference}: Render the {safe_descriptor} {safe_style_desc}. "
                            "This positioning is mandatory.\n"
                        )

                if local_meta.get('strict_wearing_enforcement'):
                    text_prompt += (
                        "\n\nSTRICT COMPLIANCE: Adjust garment fit, tuck, tilt, or orientation until every "
                        "wearing instruction is satisfied exactly. Never revert to default placements."
                    )
                if local_meta.get('wearing_instruction_policy'):
                    policy = local_meta.get('wearing_instruction_policy')
                    text_prompt += f"\n\nWearing instruction policy: {policy}."
                if local_meta.get('wearing_instruction_summary'):
                    summary = local_meta.get('wearing_instruction_summary')
                    text_prompt += f"\n\nSummary of required styling outcomes: {summary}"

                other_metadata = {
                    k: v for k, v in local_meta.items()
                    if k not in [
                        'wearing_instructions',
                        'items_wearing_styles',
                        'strict_wearing_enforcement',
                        'wearing_instruction_policy',
                        'wearing_instruction_summary',
                        'enforced_items_count'
                    ]
                }
                if other_metadata:
                    metadata_str = json.dumps(other_metadata, indent=2, ensure_ascii=False)
                    text_prompt += f"\n\nAdditional styling instructions:\n{metadata_str}"

            text_prompt += (
                "\n\nCONTENT FILTER AVOIDANCE: "
                "If this request involves any clothing that could be considered revealing or intimate, "
                "automatically add subtle opacity, coverage, or conservative styling to ensure the generated image "
                "meets general audience standards while preserving the garment's essential design and functionality. "
                "Make tasteful modifications as needed without changing the fundamental garment type or purpose."
            )

            return text_prompt, local_meta

        def build_openrouter_messages(text_prompt_value: str):
            """Construct OpenRouter chat messages with a given text prompt."""
            content_blocks = [{"type": "text", "text": text_prompt_value}]
            for item in user_data:
                content_blocks.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{item['mimeType']};base64,{item['base64']}",
                    },
                })
            for item in garment_data:
                content_blocks.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{item['mimeType']};base64,{item['base64']}",
                    },
                })
            return [
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "text",
                            "text": TRYON_SYSTEM_PROMPT,
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": content_blocks,
                }
            ]

        logger.info("🚀 Starting virtual try-on generation with OpenRouter image model selection")
        logger.info(f"   Person images: {len(limited_user_images)}")
        logger.info(f"   Clothing items: {len(limited_garments)}")
        
        base_url = "https://openrouter.ai/api/v1/chat/completions"
        model_name = get_openrouter_configured_model("tryon_image")
        
        max_attempts = 4
        last_failure_details: Dict[str, Any] = {}
        retry_info: List[Dict[str, Any]] = []

        current_metadata: Dict[str, Any] = copy.deepcopy(garment_metadata) if isinstance(garment_metadata, dict) else {}

        def is_intimate_request(meta: Dict[str, Any], cat: str) -> bool:
            # Category hint (best-effort; frontend may send upper_body even for bra/bikini)
            cat_l = (cat or "").lower()
            if cat_l in ("intimates", "lingerie", "swimwear", "bikini"):
                return True

            # Metadata hints
            try:
                scan_text = json.dumps(meta or {}, ensure_ascii=False).lower()
            except Exception:
                scan_text = str(meta or "").lower()

            if any(k in scan_text for k in INTIMATE_KEYWORDS):
                return True

            # Additional common hints
            for k in ("subcategory", "item_type", "category", "body_region", "tags"):
                v = meta.get(k) if isinstance(meta, dict) else None
                if isinstance(v, str) and any(w in v.lower() for w in INTIMATE_KEYWORDS):
                    return True
                if isinstance(v, list) and any(isinstance(x, str) and any(w in x.lower() for w in INTIMATE_KEYWORDS) for x in v):
                    return True

            # Per-item wearing metadata (if present) can contain good descriptors even when top-level description is neutral.
            try:
                items = meta.get("items_wearing_styles") if isinstance(meta, dict) else None
                if isinstance(items, list):
                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        for k in ("descriptor", "item_type", "category", "subcategory", "body_region", "wearing_style", "prompt_text"):
                            v = item.get(k)
                            if isinstance(v, str) and any(w in v.lower() for w in INTIMATE_KEYWORDS):
                                return True
                        tags = item.get("tags")
                        if isinstance(tags, list) and any(isinstance(t, str) and any(w in t.lower() for w in INTIMATE_KEYWORDS) for t in tags):
                            return True
            except Exception:
                pass

            return False

        async def detect_intimate_from_gemini_vision(
            client: httpx.AsyncClient,
            *,
            api_key_value: str,
            garment_bytes: bytes,
        ) -> Tuple[bool, str]:
            """
            Best-effort vision classification to detect bras/bikinis/lingerie even when metadata is neutral.
            Returns (is_intimate, label_reason). Never raises (caller should catch and ignore).
            """
            if os.getenv("GEMINI_INTIMATE_DETECT_ENABLED", "1") != "1":
                return False, "disabled"

            # Keep this lightweight: downscale + compress to reduce request size.
            try:
                img = Image.open(io.BytesIO(garment_bytes))
                img = ImageOps.exif_transpose(img)
                w, h = img.size
                max_dim = int(os.getenv("GEMINI_INTIMATE_DETECT_MAX_DIM", "900"))
                longest = max(w, h)
                if longest > max_dim:
                    scale = max_dim / float(longest)
                    img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
                buf = io.BytesIO()
                img.convert("RGB").save(buf, format="JPEG", quality=70, optimize=True, progressive=True)
                b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                mime = "image/jpeg"
            except Exception:
                b64 = base64.b64encode(garment_bytes).decode("utf-8")
                mime = "image/jpeg"

            preferred_model = (
                os.getenv("GEMINI_INTIMATE_DETECT_MODEL")
                or os.getenv("GEMINI_VISION_MODEL")
                or os.getenv("GEMINI_TEXT_MODEL")
            )
            model_candidates = get_gemini_model_candidates(
                "intimate_detect",
                extra_models=[preferred_model],
            )

            prompt = (
                "You are a clothing safety classifier. Determine whether the garment in the image is intimate/minimal-coverage "
                "or likely to trigger image safety filters when used for virtual try-on.\n\n"
                "Return JSON ONLY:\n"
                '{\"is_intimate\": boolean, \"label\": string, \"reason\": string}\n\n'
                "Mark is_intimate=true for items like bras, bralettes, lingerie, bikini tops/bottoms, thongs, sheer lingerie, "
                "or any minimal coverage undergarment/swimwear.\n"
                "Otherwise set is_intimate=false."
            )

            payload = {
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {"text": prompt},
                            {"inline_data": {"mime_type": mime, "data": b64}},
                        ],
                    }
                ],
                "generationConfig": {"temperature": 0.0, "maxOutputTokens": 250, "responseMimeType": "application/json"},
            }

            last_http: Optional[str] = None
            resp: Optional[httpx.Response] = None
            used_model: Optional[str] = None
            for model_name in model_candidates:
                for endpoint_url in gemini_generate_content_endpoints(model_name):
                    resp = await _gemini_post_json(
                        client,
                        url=f"{endpoint_url}?key={api_key_value}",
                        headers={"Content-Type": "application/json"},
                        payload=payload,
                    )
                    if resp.is_success:
                        used_model = model_name
                        break
                    last_http = f"{model_name}:{resp.status_code}"
                if resp and resp.is_success:
                    break

            if not resp or not resp.is_success:
                return False, f"http_error:{last_http or 'unknown'}"

            data = resp.json()
            candidates = (data or {}).get("candidates") or []
            if not candidates:
                return False, "no_candidates"
            parts = (candidates[0] or {}).get("content", {}).get("parts", []) or []
            text_out = ""
            for p in parts:
                if isinstance(p, dict) and p.get("text"):
                    text_out = str(p.get("text") or "").strip()
                    break
            if not text_out:
                return False, "empty_text"
            if text_out.startswith("```"):
                text_out = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text_out).strip()
                text_out = re.sub(r"\s*```$", "", text_out).strip()
            parsed = json.loads(text_out)
            is_int = bool(parsed.get("is_intimate"))
            label = str(parsed.get("label") or "")
            reason = str(parsed.get("reason") or "")
            if used_model and preferred_model and used_model != preferred_model:
                return is_int, f"{label}:{reason} (fallback_model={used_model})"[:140]
            return is_int, f"{label}:{reason}"[:140]

        def apply_modesty_contract(meta: Dict[str, Any]) -> Dict[str, Any]:
            out = copy.deepcopy(meta) if isinstance(meta, dict) else {}
            out["modesty_contract"] = True
            out["intimate_mode"] = True
            # Prefer fidelity: match the main reference image unless the user explicitly requests otherwise.
            out.setdefault("framing", "match_main_reference")
            out.setdefault("background", "match_main_reference")
            out.setdefault("pose", "match_main_reference")
            out.setdefault("camera", "match_main_reference")
            out.setdefault("content_policy", "general_audience")
            # Explicit allowance to add coverage/underlayers to pass safety, but keep it minimal.
            out.setdefault("allow_underlayer", True)
            out.setdefault("overlay_only", True)
            out.setdefault("coverage_preference", "minimal")
            out.setdefault("opacity_preference", "increase_opacity_if_needed")
            out.setdefault("avoid_closeups", True)
            return out

        intimate_flag = is_intimate_request(current_metadata, category or "")
        modesty_applied = False

        async def apply_intimate_pipeline(reason: str):
            nonlocal current_metadata, modesty_applied
            current_metadata = apply_modesty_contract(current_metadata)
            modesty_applied = True
            retry_info.append({
                "attempt": 1,
                "strategy": "modesty_contract_preflight",
                "reason": reason,
                "modificationsSummary": "Applied deterministic modesty contract (coverage/underlayer allowed).",
            })
            # Preflight sanitization to reduce immediate blocks.
            try:
                safe_meta, safe_prompt, summary = rewrite_for_modesty_heuristic(
                    current_metadata,
                    build_base_text_prompt(current_metadata)[0],
                    strictness="moderate",
                )
                current_metadata = apply_modesty_contract(safe_meta)
                retry_info.append({
                    "attempt": 1,
                    "strategy": "preflight_heuristic",
                    "reason": reason,
                    "modificationsSummary": summary,
                })
            except Exception:
                pass

        if intimate_flag:
            # Metadata-based detection caught it; apply pipeline immediately.
            # (No network call needed.)
            # Note: prompt will be rebuilt after this.
            pass

        def summarize_candidate(candidate_obj):
            finish_reason_local = candidate_obj.get("finishReason") or candidate_obj.get("finish_reason")
            safety_ratings = candidate_obj.get("safetyRatings") or []
            content_obj = candidate_obj.get("content", {}) or {}
            parts_local = content_obj.get("parts", []) or []
            texts = [str(p.get("text", "")) for p in parts_local if isinstance(p, dict) and "text" in p and p.get("text")]
            return finish_reason_local, safety_ratings, parts_local, texts

        async with httpx.AsyncClient(timeout=300.0) as client:  # 5 minute timeout for image generation
            # If not detected by metadata, do a lightweight Gemini vision check on the first garment image.
            if not intimate_flag and limited_garments:
                try:
                    is_int, label = await asyncio.wait_for(
                        detect_intimate_from_gemini_vision(
                            client,
                            api_key_value=api_key,
                            garment_bytes=limited_garments[0],
                        ),
                        timeout=float(os.getenv("GEMINI_INTIMATE_DETECT_TIMEOUT_S", "6")),
                    )
                    if is_int:
                        intimate_flag = True
                        retry_info.append({
                            "attempt": 1,
                            "strategy": "intimate_vision_detect",
                            "reason": "gemini_vision",
                            "modificationsSummary": label or "Detected intimate item via Gemini vision.",
                        })
                except Exception:
                    pass

            if intimate_flag and not modesty_applied:
                await apply_intimate_pipeline("intimate_detected")

            # Build prompt after all preflight modifications (metadata/vision detection).
            base_prompt, _ = build_base_text_prompt(current_metadata)
            current_prompt: str = base_prompt

            for attempt in range(1, max_attempts + 1):
                retry_suffix = ""
                if attempt == 2:
                    retry_suffix = "\n\nRETRY: Preserve the person, pose, background, and garment design. Use overlay-only (lining/opacity) if needed for safety."
                elif attempt == 3:
                    retry_suffix = "\n\nRETRY: Increase opacity/lining slightly (overlay-only). Do NOT change pose/background/identity or garment design."
                elif attempt == 4:
                    retry_suffix = "\n\nRETRY (MAX SAFETY): Overlay-only with fully opaque lining if necessary. Do NOT change pose/background/identity or garment design."

                text_prompt = current_prompt + retry_suffix
                messages = build_openrouter_messages(text_prompt)

                logger.info(f"Attempt {attempt}/{max_attempts} - calling OpenRouter image model: {model_name}")
                try:
                    payload = {
                        "model": model_name,
                        "messages": messages,
                        "modalities": ["image", "text"],
                        "temperature": 0.4,
                        "max_tokens": 1024,
                    }
                    headers = {
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {api_key}",
                    }
                    app_title = os.getenv("OPENROUTER_APP_TITLE", "IGetDressed.Online")
                    http_referer = (
                        os.getenv("OPENROUTER_HTTP_REFERER")
                        or os.getenv("NEXT_PUBLIC_APP_URL")
                        or os.getenv("APP_URL")
                        or ""
                    ).strip()
                    if http_referer:
                        headers["HTTP-Referer"] = http_referer
                    if app_title:
                        headers["X-Title"] = app_title

                    response = await _openrouter_post_json(
                        client,
                        url=base_url,
                        headers=headers,
                        payload=payload,
                    )
                    
                    if not response.is_success:
                        error_text = response.text
                        # #region agent log
                        try:
                            with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                                f.write(json_lib.dumps({"location":"vton.py:326","message":"OpenRouter API request failed","data":{"statusCode":response.status_code,"errorText":error_text[:500],"attempt":attempt},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"E"})+"\n")
                        except: pass
                        # #endregion
                        logger.error(f"OpenRouter try-on failed (attempt {attempt}): {response.status_code} - {error_text}")
                        last_failure_details = {
                            "reason": "http_error",
                            "status": response.status_code,
                            "error": error_text[:800],
                            "attempt": attempt,
                        }

                        should_rewrite = is_content_rejection(
                            http_status=response.status_code,
                            error_text=error_text,
                        )
                        if should_rewrite and attempt < max_attempts:
                            if attempt == 1:
                                # Heuristic rewrite (first failure)
                                safe_meta, safe_prompt, summary = rewrite_for_modesty_heuristic(
                                    current_metadata,
                                    build_base_text_prompt(current_metadata)[0],
                                    strictness="moderate",
                                )
                                current_metadata = safe_meta
                                current_prompt = safe_prompt
                                retry_info.append({
                                    "attempt": attempt + 1,
                                    "strategy": "heuristic",
                                    "reason": "content_rejection",
                                    "modificationsSummary": summary,
                                })
                            elif attempt == 2:
                                # Gemini text-only rewrite (second failure) with heuristic sanitization layer.
                                try:
                                    new_meta, additions, gem_summary = await rewrite_for_modesty_gemini(
                                        client,
                                        api_key=api_key,
                                        metadata=current_metadata,
                                        prompt=current_prompt,
                                        last_failure=last_failure_details,
                                        strictness="moderate",
                                    )
                                    sanitized_meta, safe_additions, heur_summary = rewrite_for_modesty_heuristic(
                                        new_meta,
                                        additions,
                                        strictness="moderate",
                                    )
                                    current_metadata = sanitized_meta
                                    rebuilt, _ = build_base_text_prompt(current_metadata)
                                    current_prompt = rebuilt + "\n\n" + safe_additions
                                    retry_info.append({
                                        "attempt": attempt + 1,
                                        "strategy": "gemini_rewrite",
                                        "reason": "content_rejection",
                                        "modificationsSummary": f"{gem_summary};{heur_summary}",
                                    })
                                except Exception as e:
                                    # Fall back to heuristic-only if Gemini rewrite fails.
                                    safe_meta, safe_prompt, summary = rewrite_for_modesty_heuristic(
                                        current_metadata,
                                        current_prompt,
                                        strictness="moderate",
                                    )
                                    current_metadata = safe_meta
                                    current_prompt = safe_prompt
                                    retry_info.append({
                                        "attempt": attempt + 1,
                                        "strategy": "heuristic",
                                        "reason": "gemini_rewrite_failed_fallback",
                                        "modificationsSummary": f"{summary};err={str(e)[:120]}",
                                    })
                            elif attempt == 3:
                                # Gemini text-only rewrite (third failure) with heuristic sanitization layer.
                                try:
                                    new_meta, additions, gem_summary = await rewrite_for_modesty_gemini(
                                        client,
                                        api_key=api_key,
                                        metadata=current_metadata,
                                        prompt=current_prompt,
                                        last_failure=last_failure_details,
                                        strictness="max",
                                    )
                                    sanitized_meta, safe_additions, heur_summary = rewrite_for_modesty_heuristic(
                                        new_meta,
                                        additions,
                                        strictness="max",
                                    )
                                    current_metadata = sanitized_meta
                                    rebuilt, _ = build_base_text_prompt(current_metadata)
                                    current_prompt = rebuilt + "\n\n" + safe_additions
                                    retry_info.append({
                                        "attempt": attempt + 1,
                                        "strategy": "gemini_rewrite",
                                        "reason": "content_rejection",
                                        "modificationsSummary": f"{gem_summary};{heur_summary}",
                                    })
                                except Exception as e:
                                    # Fall back to heuristic-only if Gemini rewrite fails.
                                    safe_meta, safe_prompt, summary = rewrite_for_modesty_heuristic(
                                        current_metadata,
                                        current_prompt,
                                        strictness="max",
                                    )
                                    current_metadata = safe_meta
                                    current_prompt = safe_prompt
                                    retry_info.append({
                                        "attempt": attempt + 1,
                                        "strategy": "heuristic",
                                        "reason": "gemini_rewrite_failed_fallback",
                                        "modificationsSummary": f"{summary};err={str(e)[:120]}",
                                    })

                        if attempt == max_attempts:
                            raise ValueError(f"OpenRouter API error after {max_attempts} attempts: {response.status_code} - {error_text}")
                        continue
                    
                    data = response.json()
                    # #region agent log
                    try:
                        with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                            f.write(json_lib.dumps({"location":"vton.py:331","message":"OpenRouter API response received","data":{"responseKeys":list(data.keys()) if isinstance(data,dict) else None,"hasChoices":"choices" in data if isinstance(data,dict) else False,"attempt":attempt},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"E"})+"\n")
                    except: pass
                    # #endregion
                    
                    # Extract image from OpenRouter response
                    choices = data.get("choices", [])
                    if not choices:
                        logger.error(f"No choices in response (attempt {attempt}). Full response: {json.dumps(data, indent=2)[:1000]}")
                        last_failure_details = {"reason": "no_choices", "response": str(data)[:500]}
                        should_rewrite = is_content_rejection(error_text=str(data))
                        if should_rewrite and attempt < max_attempts:
                            safe_meta, safe_prompt, summary = rewrite_for_modesty_heuristic(
                                current_metadata,
                                build_base_text_prompt(current_metadata)[0],
                                strictness="moderate",
                            )
                            current_metadata = safe_meta
                            current_prompt = safe_prompt
                            retry_info.append({
                                "attempt": attempt + 1,
                                "strategy": "heuristic",
                                "reason": "no_choices",
                                "modificationsSummary": summary,
                            })
                        if attempt == max_attempts:
                            raise ValueError("No choices returned from OpenRouter image model")
                        continue

                    choice = choices[0] or {}
                    finish_reason = choice.get("finish_reason") or choice.get("finishReason")
                    message = choice.get("message") or {}
                    safety_ratings = []
                    content_parts: List[Dict[str, Any]] = []
                    text_parts: List[str] = []
                    if isinstance(message, dict):
                        content_value = message.get("content")
                        if isinstance(content_value, list):
                            content_parts = [part for part in content_value if isinstance(part, dict)]
                            text_parts = [
                                str(part.get("text") or "")
                                for part in content_parts
                                if part.get("text")
                            ]
                        elif isinstance(content_value, str):
                            text_parts = [content_value]
                            content_parts = [{"text": content_value}]

                    if safety_ratings:
                        logger.warning(f"Safety ratings (attempt {attempt}): {safety_ratings}")
                    if finish_reason:
                        logger.info(f"Finish reason (attempt {attempt}): {finish_reason}")
                        if finish_reason != "STOP":
                            logger.warning(f"Unexpected finish reason (attempt {attempt}): {finish_reason}")
                    
                    logger.info(f"Number of parts in response: {len(content_parts)}")
                    
                    for i, part in enumerate(content_parts):
                        logger.info(f"Part {i} keys: {list(part.keys())}")
                        if "text" in part:
                            logger.info(f"Part {i} has text: {str(part.get('text', ''))[:100]}")
                    
                    image_url, mime_type, extracted_text_parts = _extract_openrouter_image_url(data)
                    if image_url and finish_reason in (None, "stop", "STOP", "completed", "SUCCESS"):
                        logger.info(f"✅ Successfully generated image using OpenRouter on attempt {attempt}")
                        return {
                            "image_url": image_url if image_url.startswith("data:") or image_url.startswith("http") else f"data:{mime_type or 'image/png'};base64,{image_url}",
                            "retry_info": retry_info,
                            "modesty_applied": modesty_applied,
                        }
                    
                    # If we get here, we either have no image or a non-STOP finish reason
                    last_failure_details = {
                        "reason": "no_image_or_finish_reason",
                        "finish_reason": finish_reason,
                        "text": (text_parts or extracted_text_parts)[:2] if (text_parts or extracted_text_parts) else [],
                        "has_image": bool(image_url),
                        "attempt": attempt,
                        "safety_ratings": safety_ratings,
                    }
                    logger.warning(f"No usable image on attempt {attempt}. Details: {last_failure_details}")
                    # #region agent log
                    try:
                        with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                            f.write(json_lib.dumps({"location":"vton.py:386","message":"No image part in response","data":{"contentPartsCount":len(content_parts),"finishReason":finish_reason,"attempt":attempt,"text":text_parts[:2] if text_parts else []},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"E"})+"\n")
                    except: pass
                    # #endregion
                    
                    should_rewrite = is_content_rejection(
                        finish_reason=finish_reason,
                        error_text=((text_parts or extracted_text_parts)[0] if (text_parts or extracted_text_parts) else ""),
                        safety_ratings=safety_ratings,
                    )
                    if should_rewrite and attempt < max_attempts:
                        if attempt == 1:
                            safe_meta, safe_prompt, summary = rewrite_for_modesty_heuristic(
                                current_metadata,
                                build_base_text_prompt(current_metadata)[0],
                                strictness="moderate",
                            )
                            current_metadata = safe_meta
                            current_prompt = safe_prompt
                            retry_info.append({
                                "attempt": attempt + 1,
                                "strategy": "heuristic",
                                "reason": "content_rejection",
                                "modificationsSummary": summary,
                            })
                        elif attempt == 2:
                            try:
                                new_meta, additions, gem_summary = await rewrite_for_modesty_gemini(
                                    client,
                                    api_key=api_key,
                                    metadata=current_metadata,
                                    prompt=current_prompt,
                                    last_failure=last_failure_details,
                                    strictness="moderate",
                                )
                                sanitized_meta, safe_additions, heur_summary = rewrite_for_modesty_heuristic(
                                    new_meta,
                                    additions,
                                    strictness="moderate",
                                )
                                current_metadata = sanitized_meta
                                rebuilt, _ = build_base_text_prompt(current_metadata)
                                current_prompt = rebuilt + "\n\n" + safe_additions
                                retry_info.append({
                                    "attempt": attempt + 1,
                                    "strategy": "gemini_rewrite",
                                    "reason": "content_rejection",
                                    "modificationsSummary": f"{gem_summary};{heur_summary}",
                                })
                            except Exception as e:
                                safe_meta, safe_prompt, summary = rewrite_for_modesty_heuristic(
                                    current_metadata,
                                    current_prompt,
                                    strictness="moderate",
                                )
                                current_metadata = safe_meta
                                current_prompt = safe_prompt
                                retry_info.append({
                                    "attempt": attempt + 1,
                                    "strategy": "heuristic",
                                    "reason": "gemini_rewrite_failed_fallback",
                                    "modificationsSummary": f"{summary};err={str(e)[:120]}",
                                })
                        elif attempt == 3:
                            try:
                                new_meta, additions, gem_summary = await rewrite_for_modesty_gemini(
                                    client,
                                    api_key=api_key,
                                    metadata=current_metadata,
                                    prompt=current_prompt,
                                    last_failure=last_failure_details,
                                    strictness="max",
                                )
                                sanitized_meta, safe_additions, heur_summary = rewrite_for_modesty_heuristic(
                                    new_meta,
                                    additions,
                                    strictness="max",
                                )
                                current_metadata = sanitized_meta
                                rebuilt, _ = build_base_text_prompt(current_metadata)
                                current_prompt = rebuilt + "\n\n" + safe_additions
                                retry_info.append({
                                    "attempt": attempt + 1,
                                    "strategy": "gemini_rewrite",
                                    "reason": "content_rejection",
                                    "modificationsSummary": f"{gem_summary};{heur_summary}",
                                })
                            except Exception as e:
                                safe_meta, safe_prompt, summary = rewrite_for_modesty_heuristic(
                                    current_metadata,
                                    current_prompt,
                                    strictness="max",
                                )
                                current_metadata = safe_meta
                                current_prompt = safe_prompt
                                retry_info.append({
                                    "attempt": attempt + 1,
                                    "strategy": "heuristic",
                                    "reason": "gemini_rewrite_failed_fallback",
                                    "modificationsSummary": f"{summary};err={str(e)[:120]}",
                                })

                    if attempt == max_attempts:
                        readable_text = ((text_parts or extracted_text_parts)[0][:300] if (text_parts or extracted_text_parts) else "")
                        safety_hint = ""
                        if (str(finish_reason or "").upper() == "IMAGE_SAFETY" or should_rewrite or str(finish_reason or "").upper().startswith("IMAGE_")):
                            safety_hint = " The request was blocked by image safety filters. Please use a less revealing garment description or select a different item."
                        raise ValueError(f"No image generated after {max_attempts} attempts. Finish reason: {finish_reason or 'UNKNOWN'}. Model message: {readable_text}.{safety_hint}")
                    continue

                except httpx.TimeoutException as e:
                    # #region agent log
                    try:
                        with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                            f.write(json_lib.dumps({"location":"vton.py:401","message":"OpenRouter API timeout","data":{"error":str(e),"attempt":attempt},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"F"})+"\n")
                    except: pass
                    # #endregion
                    logger.error(f"Timeout calling OpenRouter try-on on attempt {attempt}: {e}")
                    last_failure_details = {"reason": "timeout", "error": str(e), "attempt": attempt}
                    if attempt == max_attempts:
                        raise ValueError(f"Request timed out after {max_attempts} attempts. Please try again.")
                    continue
                except Exception as e:
                    # #region agent log
                    try:
                        with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                            f.write(json_lib.dumps({"location":"vton.py:404","message":"OpenRouter API call error","data":{"errorType":type(e).__name__,"errorMessage":str(e),"attempt":attempt},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"E"})+"\n")
                    except: pass
                    # #endregion
                    logger.error(f"Error calling OpenRouter try-on on attempt {attempt}: {e}")
                    last_failure_details = {"reason": "exception", "error": str(e), "attempt": attempt}
                    if attempt == max_attempts:
                        raise
                    continue
            
    except Exception as e:
        # #region agent log
        try:
            with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                f.write(json_lib.dumps({"location":"vton.py:408","message":"vton.generate_try_on error","data":{"errorType":type(e).__name__,"errorMessage":str(e)},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"B"})+"\n")
        except: pass
        # #endregion
        logger.error(f"Error in OpenRouter try-on generation: {e}", exc_info=True)
        raise e
