import os
import asyncio
import logging
import base64
import io
import json
import re
import copy
from typing import Any, Dict, List, Optional, Tuple, Union
from PIL import Image
import httpx

logger = logging.getLogger(__name__)

# This module uses direct REST API calls to Gemini API with API key authentication.
# No SDKs or OAuth2 are required - just set GEMINI_API_KEY (or GOOGLE_API_KEY) environment variable.

# OpenAI SDK is optional at runtime; used for safety/prompt rewrites on retries.
try:
    from openai import AsyncOpenAI  # type: ignore
    OPENAI_AVAILABLE = True
except Exception:
    AsyncOpenAI = None  # type: ignore
    OPENAI_AVAILABLE = False


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

    # Some Gemini errors return 400/403 with policy text.
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

    # Encourage conservative framing; do not overwrite explicit user intent, only set if missing.
    safe_meta.setdefault("framing", "three_quarter")
    safe_meta.setdefault("background", "neutral studio background")
    safe_meta.setdefault("camera", "professional fashion editorial, neutral studio, avoid close-ups")
    safe_meta.setdefault("pose", "neutral standing pose")
    safe_meta.setdefault("content_policy", "general_audience")

    guidance = (
        "\n\nSAFETY COMPLIANCE (MANDATORY): Create a general-audience fashion image. "
        "Avoid suggestive context, avoid close-up framing, keep styling professional and modest. "
        "If any garment appears revealing or semi-transparent, automatically add opaque lining/layering "
        "and increase coverage while keeping the garment recognizable."
    )
    if strictness == "max":
        guidance += (
            " Prioritize compliance over fidelity: default to conservative studio portrait framing, "
            "fully opaque fabrics, and layered styling when uncertain."
        )

    safe_prompt = sanitize_text(prompt) + guidance
    return safe_meta, safe_prompt, f"heuristic_rewrite(strictness={strictness})"


async def rewrite_for_modesty_openai(
    metadata: Optional[Dict[str, Any]],
    prompt: str,
    last_failure: Dict[str, Any],
    *,
    strictness: str,
) -> Tuple[Dict[str, Any], str, str]:
    """
    Uses OpenAI to rewrite prompt+metadata for compliance. Falls back to heuristic rewrite if
    OPENAI_API_KEY is missing or OpenAI SDK isn't available.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or not OPENAI_AVAILABLE:
        safe_meta, safe_prompt, summary = rewrite_for_modesty_heuristic(
            metadata, prompt, strictness="max" if strictness == "max" else "moderate"
        )
        return safe_meta, safe_prompt, f"openai_unavailable_fallback:{summary}"

    client = AsyncOpenAI(api_key=api_key)  # type: ignore

    system = (
        "You are a safety compliance editor for a fashion virtual try-on system. "
        "Rewrite the provided METADATA and propose ADDITIONAL PROMPT DIRECTIVES to reduce content-filter blocks while keeping the outfit recognizable. "
        "Keep all required wearing directives and positioning constraints (do not remove them). "
        "Ensure the output is general-audience, professional, and modest. "
        "Return ONLY valid JSON."
    )
    if strictness == "max":
        system += (
            " Apply MAXIMUM safety: prefer conservative studio framing, avoid close-ups, ensure opacity, and err on the side of coverage."
        )

    user = {
        "instruction": "Rewrite the metadata and propose additional prompt directives to be more modest and less likely to trigger safety filters.",
        "strictness": strictness,
        "last_failure": last_failure,
        "prompt_context": prompt,
        "metadata": metadata or {},
        "output_schema": {
            "prompt_additions": "string (short block of directives to append to the base prompt)",
            "metadata": "object (revised metadata, preserve keys if possible)",
            "changes": "array of short strings describing what changed",
        },
    }

    async def do_call():
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
            max_tokens=900,
        )
        return resp

    try:
        resp = await asyncio.wait_for(do_call(), timeout=12.0)
        content = resp.choices[0].message.content
        if not content:
            raise ValueError("Empty OpenAI response")
        data = json.loads(content)
        prompt_additions = str(data.get("prompt_additions") or "")
        new_meta_raw = data.get("metadata") or (metadata or {})
        new_meta = new_meta_raw if isinstance(new_meta_raw, dict) else (metadata or {})
        changes = data.get("changes") or []
        if not isinstance(changes, list):
            changes = []

        # Final defensive sanitization layer.
        # Final defensive sanitization layer on the prompt additions and metadata.
        new_meta2, safe_additions, _ = rewrite_for_modesty_heuristic(
            new_meta,
            prompt_additions,
            strictness="max" if strictness == "max" else "moderate",
        )
        summary = f"openai_rewrite(strictness={strictness}, changes={changes[:4]})"
        return new_meta2, safe_additions, summary
    except Exception as e:
        logger.warning(f"OpenAI rewrite failed ({strictness}), falling back to heuristic: {e}")
        safe_meta, safe_prompt, summary = rewrite_for_modesty_heuristic(
            metadata, prompt, strictness="max" if strictness == "max" else "moderate"
        )
        return safe_meta, safe_prompt, f"openai_error_fallback:{summary}"


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

async def generate_try_on(user_image_files, garment_image_files, category="upper_body", garment_metadata=None, user_attributes=None, main_index=0, user_quality_flags=None):
    """
    Uses Gemini 3 Pro (Nano Banana Pro) image editing to combine person and clothing images.
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
    
    # Use Gemini 3 Pro for image generation
    return await _generate_with_gemini(
        user_image_files,
        garment_image_files,
        category,
        garment_metadata,
        user_attributes,
        main_index=main_index,
        user_quality_flags=user_quality_flags,
    )


async def _generate_with_gemini(user_image_files, garment_image_files, category="upper_body", garment_metadata=None, user_attributes=None, main_index=0, user_quality_flags=None):
    """
    Uses Gemini 3 Pro Image for virtual try-on image generation.
    Generates a photorealistic image of the person wearing all clothing items.
    
    This function uses direct REST API calls to Gemini API with Gemini 3 Pro Image model.
    No SDKs or OAuth2 are required - just set GEMINI_API_KEY environment variable.
    
    Model: gemini-3-pro-image-preview
    - Supports multi-image fusion (base person + clothing images)
    - Uses responseModalities: ["TEXT", "IMAGE"] for image generation
    
    API Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent
    Authentication: API key passed as query parameter (?key={api_key})
    Request Format: JSON with text prompt + images as base64 inline_data and responseModalities: ["TEXT", "IMAGE"]
    
    Args:
        user_image_files: List of file-like objects of the person image(s)
        garment_image_files: List of file-like objects of clothing images
        category: Category of the garment (for metadata)
        garment_metadata: Optional styling instructions dict
        
    Returns:
        dict: {"image_url": "data:...base64,...", "retry_info": [...]} (retry_info may be empty)
    """
    # Get API key from environment (prefer GEMINI_API_KEY, fallback to GOOGLE_API_KEY)
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    # #region agent log
    import json as json_lib
    try:
        with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
            f.write(json_lib.dumps({"location":"vton.py:63","message":"Checking API key","data":{"hasApiKey":api_key is not None,"apiKeyLength":len(api_key) if api_key else 0},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
    except: pass
    # #endregion
    if not api_key:
        raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable is required")
    
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
        
        # Limit to 5 user images and 5 clothing items (10 total max is safe for Gemini usually, but let's be reasonable)
        limited_user_images = user_image_bytes_list[:5]
        if len(user_image_bytes_list) > 5:
            logger.warning(f"Limiting to 5 user images (received {len(user_image_bytes_list)})")

        limited_garments = garment_image_bytes_list[:5]
        if len(garment_image_bytes_list) > 5:
            logger.warning(f"Limiting to 5 clothing items (received {len(garment_image_bytes_list)})")
        
        # Convert images to base64 for API request
        # Gemini API requires images as base64-encoded inline_data
        def image_to_base64(image_bytes):
            """
            Convert image bytes to base64 string for Gemini API.
            Detects image format and converts to PNG for consistency.
            """
            try:
                img = Image.open(io.BytesIO(image_bytes))
                format_map = {
                    'JPEG': 'image/jpeg',
                    'PNG': 'image/png',
                    'WEBP': 'image/webp'
                }
                mime_type = format_map.get(img.format, 'image/png')
                # Convert to PNG for consistency (Gemini handles PNG well)
                buffer = io.BytesIO()
                img.save(buffer, format='PNG')
                return base64.b64encode(buffer.getvalue()).decode('utf-8'), 'image/png'
            except Exception as e:
                logger.warning(f"Could not detect image format, using raw bytes: {e}")
                return base64.b64encode(image_bytes).decode('utf-8'), 'image/jpeg'
        
        # Process user images
        user_data = []
        for idx, user_bytes in enumerate(limited_user_images):
            user_base64, user_mime = image_to_base64(user_bytes)
            user_data.append({
                'base64': user_base64,
                'mimeType': user_mime,
                'id': f'user_{idx + 1}',
            })

        # Process garment images
        garment_data = []
        for idx, garment_bytes in enumerate(limited_garments):
            garment_base64, garment_mime = image_to_base64(garment_bytes)
            garment_data.append({
                'base64': garment_base64,
                'mimeType': garment_mime,
                'id': f'item_{idx + 1}',
                'slot': category if idx == 0 else 'accessory',
                'layer_order': idx,
            })
        
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

        # Build text prompt for Gemini 3 Pro Image
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
                "You are a fashion virtual try-on engine. "
                f"Use the {user_refs} as the person reference. These images define the person's identity (face, hair, eyes), body shape, stature/height impression, and overall appearance. "
                f"The FIRST user image (index {main_index + 1}) is the Main Reference Image for preserving any non-conflicting garments. "
                f"Use the subsequent {garment_img_count} images as new garments that must be worn by that same person. "
                "Generate one photorealistic image of the person wearing all provided NEW clothing items. "
                "OUTFIT PRESERVATION: For any clothing or accessories NOT provided in the new garments list, faithfully reproduce them from the Main Reference Image. "
                "Replace ONLY the garments that conflict with the new items (e.g., new top replaces the old top, but keep the original pants/shoes if not replaced; a dress replaces both top and bottom). "
                "BACKGROUND & POSE: Do NOT reuse the original background. Use a clean, neutral, flattering background. Do NOT lock the exact pose/angle—allow natural variation that still fits the person. "
                "IDENTITY FIDELITY: All user images must be used to perfectly maintain the same face, hair, eyes, skin tone, and body shape/height impression in the final image. "
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
                "If any clothing appears potentially inappropriate, automatically modify it to be more modest and professional while maintaining the essential style and functionality. "
                "Ensure all generated content complies with general audience standards. "
                "Add subtle coverage or opacity as needed to maintain appropriateness without changing the garment's fundamental design."
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

        def build_parts(text_prompt_value: str):
            """Construct request parts with a given text prompt."""
            parts_local = [
                {
                    "text": text_prompt_value
                }
            ]
            for item in user_data:
                parts_local.append({
                    "inline_data": {
                        "mime_type": item['mimeType'],
                        "data": item['base64'],
                    }
                })
            for item in garment_data:
                parts_local.append({
                    "inline_data": {
                        "mime_type": item['mimeType'],
                        "data": item['base64'],
                    }
                })
            return parts_local

        # Use Gemini 3 Pro Image for virtual try-on
        logger.info(f"🚀 Starting virtual try-on generation with Gemini 3 Pro Image")
        logger.info(f"   Person images: {len(limited_user_images)}")
        logger.info(f"   Clothing items: {len(limited_garments)}")
        
        base_url = "https://generativelanguage.googleapis.com/v1beta/models"
        model_name = "gemini-3-pro-image-preview"
        
        # Optional: verify the model is available (disabled by default to avoid extra network call)
        if os.getenv("GEMINI_VERIFY_MODEL", "0") == "1":
            try:
                list_endpoint = f"{base_url}?key={api_key}"
                async with httpx.AsyncClient(timeout=10.0) as list_client:
                    list_response = await list_client.get(list_endpoint)
                    if list_response.is_success:
                        list_data = list_response.json()
                        available_models = [m.get("name", "").split("/")[-1] for m in list_data.get("models", [])]
                        logger.info(f"Available models (sample): {', '.join(available_models[:20])}")
                        if model_name not in available_models:
                            image_models = [m for m in available_models if "gemini" in m.lower() and "image" in m.lower()]
                            logger.warning(f"Model {model_name} not found. Available image models: {image_models}")
                            if image_models:
                                model_name = image_models[0]
                                logger.info(f"Trying alternative model: {model_name}")
            except Exception as e:
                logger.warning(f"Could not verify model availability: {e}")
        
        max_attempts = 4
        last_failure_details: Dict[str, Any] = {}
        retry_info: List[Dict[str, Any]] = []

        current_metadata: Dict[str, Any] = copy.deepcopy(garment_metadata) if isinstance(garment_metadata, dict) else {}
        base_prompt, _ = build_base_text_prompt(current_metadata)
        current_prompt: str = base_prompt

        def summarize_candidate(candidate_obj):
            finish_reason_local = candidate_obj.get("finishReason") or candidate_obj.get("finish_reason")
            safety_ratings = candidate_obj.get("safetyRatings") or []
            content_obj = candidate_obj.get("content", {}) or {}
            parts_local = content_obj.get("parts", []) or []
            texts = [str(p.get("text", "")) for p in parts_local if isinstance(p, dict) and "text" in p and p.get("text")]
            return finish_reason_local, safety_ratings, parts_local, texts

        async with httpx.AsyncClient(timeout=300.0) as client:  # 5 minute timeout for image generation
            for attempt in range(1, max_attempts + 1):
                retry_suffix = ""
                if attempt == 2:
                    retry_suffix = "\n\nRETRY: Keep output professional, conservative, and general-audience."
                elif attempt == 3:
                    retry_suffix = "\n\nRETRY: Increase coverage and opacity; avoid close-ups; professional studio framing."
                elif attempt == 4:
                    retry_suffix = "\n\nRETRY (MAX SAFETY): Default to conservative studio portrait; fully opaque fabrics; layered styling."

                text_prompt = current_prompt + retry_suffix
                parts = build_parts(text_prompt)

                logger.info(f"Attempt {attempt}/{max_attempts} - calling Gemini 3 Pro Image: {model_name}")
                try:
                    endpoint = f"{base_url}/{model_name}:generateContent"
                    payload = {
                        "contents": [
                            {
                                "role": "user",
                                "parts": parts,
                            }
                        ],
                        "generationConfig": {
                            "responseModalities": ["TEXT", "IMAGE"],
                        },
                        "safetySettings": [
                            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_LOW_AND_ABOVE"},
                            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
                        ],
                    }
                    response = await _gemini_post_json(
                        client,
                        url=f"{endpoint}?key={api_key}",
                        headers={"Content-Type": "application/json"},
                        payload=payload,
                    )
                    
                    if not response.is_success:
                        error_text = response.text
                        # #region agent log
                        try:
                            with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                                f.write(json_lib.dumps({"location":"vton.py:326","message":"Gemini API request failed","data":{"statusCode":response.status_code,"errorText":error_text[:500],"attempt":attempt},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"E"})+"\n")
                        except: pass
                        # #endregion
                        logger.error(f"Gemini 3 Pro Image failed (attempt {attempt}): {response.status_code} - {error_text}")
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
                                # OpenAI-assisted rewrite (second failure)
                                new_meta, additions, summary = await rewrite_for_modesty_openai(
                                    current_metadata,
                                    current_prompt,
                                    last_failure_details,
                                    strictness="moderate",
                                )
                                current_metadata = new_meta
                                rebuilt, _ = build_base_text_prompt(current_metadata)
                                current_prompt = rebuilt + "\n\n" + additions
                                retry_info.append({
                                    "attempt": attempt + 1,
                                    "strategy": "openai",
                                    "reason": "content_rejection",
                                    "modificationsSummary": summary,
                                })
                            elif attempt == 3:
                                # OpenAI-assisted rewrite (third failure, max safety)
                                new_meta, additions, summary = await rewrite_for_modesty_openai(
                                    current_metadata,
                                    current_prompt,
                                    last_failure_details,
                                    strictness="max",
                                )
                                current_metadata = new_meta
                                rebuilt, _ = build_base_text_prompt(current_metadata)
                                current_prompt = rebuilt + "\n\n" + additions
                                retry_info.append({
                                    "attempt": attempt + 1,
                                    "strategy": "openai",
                                    "reason": "content_rejection",
                                    "modificationsSummary": summary,
                                })

                        if attempt == max_attempts:
                            raise ValueError(f"Gemini API error after {max_attempts} attempts: {response.status_code} - {error_text}")
                        continue
                    
                    data = response.json()
                    # #region agent log
                    try:
                        with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                            f.write(json_lib.dumps({"location":"vton.py:331","message":"Gemini API response received","data":{"responseKeys":list(data.keys()) if isinstance(data,dict) else None,"hasCandidates":"candidates" in data if isinstance(data,dict) else False,"attempt":attempt},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"E"})+"\n")
                    except: pass
                    # #endregion
                    
                    # Extract image from response
                    candidates = data.get("candidates", [])
                    if not candidates:
                        logger.error(f"No candidates in response (attempt {attempt}). Full response: {json.dumps(data, indent=2)[:1000]}")
                        last_failure_details = {"reason": "no_candidates", "response": str(data)[:500]}
                        should_rewrite = is_content_rejection(error_text=str(data))
                        if should_rewrite and attempt < max_attempts:
                            # Treat as content rejection only if keywords suggest it; otherwise just retry.
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
                                "reason": "no_candidates",
                                "modificationsSummary": summary,
                            })
                        if attempt == max_attempts:
                            raise ValueError("No candidates returned from Gemini 3 Pro Image")
                        continue
                    
                    candidate = candidates[0]
                    finish_reason, safety_ratings, content_parts, text_parts = summarize_candidate(candidate)

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
                    
                    # Find the first image in the response
                    image_part = None
                    for part in content_parts:
                        # Try snake_case first (Python API format)
                        if "inline_data" in part:
                            inline_data = part["inline_data"]
                            if inline_data.get("data"):
                                image_part = inline_data
                                logger.info(f"Found image in part with inline_data (snake_case)")
                                break
                        # Try camelCase (JavaScript API format)
                        elif "inlineData" in part:
                            inline_data = part["inlineData"]
                            if inline_data.get("data"):
                                image_part = inline_data
                                logger.info(f"Found image in part with inlineData (camelCase)")
                                break
                    
                    if image_part and finish_reason in (None, "STOP"):
                        image_base64 = image_part.get("data")
                        mime_type = image_part.get("mime_type") or image_part.get("mimeType") or "image/png"
                        
                        if not image_base64:
                            last_failure_details = {"reason": "empty_image_data", "finish_reason": finish_reason}
                            if attempt == max_attempts:
                                raise ValueError("Image data is empty in Gemini response")
                            continue
                        
                        logger.info(f"✅ Successfully generated image using Gemini 3 Pro Image on attempt {attempt}")
                        logger.info(f"   Image size: {len(image_base64)} characters (base64), MIME type: {mime_type}")
                        return {
                            "image_url": f"data:{mime_type};base64,{image_base64}",
                            "retry_info": retry_info,
                        }
                    
                    # If we get here, we either have no image or a non-STOP finish reason
                    last_failure_details = {
                        "reason": "no_image_or_finish_reason",
                        "finish_reason": finish_reason,
                        "text": text_parts[:2] if text_parts else [],
                        "has_image": bool(image_part),
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
                        error_text=(text_parts[0] if text_parts else ""),
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
                            new_meta, additions, summary = await rewrite_for_modesty_openai(
                                current_metadata,
                                current_prompt,
                                last_failure_details,
                                strictness="moderate",
                            )
                            current_metadata = new_meta
                            rebuilt, _ = build_base_text_prompt(current_metadata)
                            current_prompt = rebuilt + "\n\n" + additions
                            retry_info.append({
                                "attempt": attempt + 1,
                                "strategy": "openai",
                                "reason": "content_rejection",
                                "modificationsSummary": summary,
                            })
                        elif attempt == 3:
                            new_meta, additions, summary = await rewrite_for_modesty_openai(
                                current_metadata,
                                current_prompt,
                                last_failure_details,
                                strictness="max",
                            )
                            current_metadata = new_meta
                            rebuilt, _ = build_base_text_prompt(current_metadata)
                            current_prompt = rebuilt + "\n\n" + additions
                            retry_info.append({
                                "attempt": attempt + 1,
                                "strategy": "openai",
                                "reason": "content_rejection",
                                "modificationsSummary": summary,
                            })

                    if attempt == max_attempts:
                        readable_text = text_parts[0][:300] if text_parts else ""
                        safety_hint = ""
                        if (finish_reason or "").upper() == "IMAGE_SAFETY" or should_rewrite:
                            safety_hint = " The request was blocked by image safety filters. Please use a less revealing garment description or select a different item."
                        raise ValueError(f"No image generated after {max_attempts} attempts. Finish reason: {finish_reason or 'UNKNOWN'}. Model message: {readable_text}.{safety_hint}")
                    continue

                except httpx.TimeoutException as e:
                    # #region agent log
                    try:
                        with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                            f.write(json_lib.dumps({"location":"vton.py:401","message":"Gemini API timeout","data":{"error":str(e),"attempt":attempt},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"F"})+"\n")
                    except: pass
                    # #endregion
                    logger.error(f"Timeout calling Gemini 3 Pro Image on attempt {attempt}: {e}")
                    last_failure_details = {"reason": "timeout", "error": str(e), "attempt": attempt}
                    if attempt == max_attempts:
                        raise ValueError(f"Request timed out after {max_attempts} attempts. Please try again.")
                    continue
                except Exception as e:
                    # #region agent log
                    try:
                        with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                            f.write(json_lib.dumps({"location":"vton.py:404","message":"Gemini API call error","data":{"errorType":type(e).__name__,"errorMessage":str(e),"attempt":attempt},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"E"})+"\n")
                    except: pass
                    # #endregion
                    logger.error(f"Error calling Gemini 3 Pro Image on attempt {attempt}: {e}")
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
        logger.error(f"Error in Gemini 3 Pro Image generation: {e}", exc_info=True)
        raise e




