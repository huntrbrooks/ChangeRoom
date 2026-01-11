import os
import logging
import json
import base64
import io
import re
from typing import List, Optional, Tuple
from PIL import Image
import httpx

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_MODEL_CANDIDATES: List[str] = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-3-pro-image-preview",
]


def _unique_models(models: List[Optional[str]]) -> List[str]:
    out: List[str] = []
    seen = set()
    for m in models:
        m2 = (m or "").strip()
        if not m2 or m2 in seen:
            continue
        seen.add(m2)
        out.append(m2)
    return out


def _generate_content_endpoints(model: str) -> List[str]:
    return [
        f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent",
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    ]


async def analyze_user_attributes(image_files):
    """
    Analyzes user images to extract physical attributes using Gemini 1.5 Flash.

    Args:
        image_files: List of file-like objects (opened images)

    Returns:
        dict: Extracted attributes (body_type, skin_tone, hair_color, gender, age_range)
    """
    # Get API key
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY or GOOGLE_API_KEY not set. Skipping user analysis.")
        return {}

    try:
        # Prepare images for API (limit to 3 for analysis to save tokens/time)
        images_to_analyze = image_files[:3]

        image_parts = []
        for img_file in images_to_analyze:
            # Read bytes
            if hasattr(img_file, "seek"):
                img_file.seek(0)
            img_bytes = img_file.read() if hasattr(img_file, "read") else img_file

            # Convert to base64
            try:
                img = Image.open(io.BytesIO(img_bytes))
                buffer = io.BytesIO()
                img.save(buffer, format="JPEG", quality=85)
                b64_data = base64.b64encode(buffer.getvalue()).decode("utf-8")

                image_parts.append(
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": b64_data,
                        }
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to process image for analysis: {e}")
                continue

        if not image_parts:
            logger.warning("No valid images for user analysis")
            return {}

        # Construct prompt
        prompt = """
        Analyze these images of a person to extract physical attributes for a virtual try-on simulation.
        Focus on consistent features across images.

        Extract the following fields:
        1. body_type: (e.g., athletic, slim, curvy, average, muscular)
        2. skin_tone: (e.g., fair, medium, olive, brown, dark)
        3. hair_color: (e.g., black, brown, blonde, red, gray) and style (e.g., long, short, curly)
        4. gender: (e.g., male, female, non-binary) - based on visual presentation
        5. age_range: (e.g., 20s, 30s, 40s)

        Return ONLY a JSON object with these keys: "body_type", "skin_tone", "hair_color", "gender", "age_range".
        Do not include markdown formatting or explanations.
        """

        preferred_model = (
            os.getenv("GEMINI_USER_ANALYZE_MODEL")
            or os.getenv("GEMINI_VISION_MODEL")
            or os.getenv("GEMINI_TEXT_MODEL")
        )
        model_candidates = _unique_models([preferred_model] + DEFAULT_GEMINI_MODEL_CANDIDATES)
        attempts: List[Tuple[str, str]] = []
        for m in model_candidates:
            for endpoint in _generate_content_endpoints(m):
                attempts.append((m, endpoint))

        last_error = None
        data = None
        used_model = None
        async with httpx.AsyncClient(timeout=30.0) as client:
            for model_name, endpoint in attempts:
                response = await client.post(
                    f"{endpoint}?key={api_key}",
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [
                            {
                                "role": "user",
                                "parts": [{"text": prompt}] + image_parts,
                            }
                        ],
                        "generationConfig": {
                            # Best-effort hint; some models will honor and return raw JSON text.
                            "responseMimeType": "application/json",
                        },
                    },
                )

                if not response.is_success:
                    last_error = (model_name, response.status_code, response.text[:400])
                    continue

                data = response.json()
                used_model = model_name
                break

        if data is None:
            if last_error:
                model_name, status, details = last_error
                logger.warning(f"User analysis failed (model={model_name}) {status} - {details}")
            return {}

        text_response = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )

        # Clean and parse JSON
        try:
            # Remove any potential markdown blocks if the model ignored the instruction
            text_response = re.sub(r"```json\s*|\s*```", "", text_response)
            attributes = json.loads(text_response)
            if used_model and preferred_model and used_model != preferred_model:
                logger.info(f"User analysis fell back to model={used_model} (preferred={preferred_model})")
            logger.info(f"User analysis complete: {attributes}")
            return attributes
        except json.JSONDecodeError:
            logger.error(f"Failed to parse user analysis JSON: {text_response}")
            return {}

    except Exception as e:
        logger.error(f"Error in user analysis: {e}", exc_info=True)
        return {}
