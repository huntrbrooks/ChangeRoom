import os
import asyncio
import logging
import base64
import io
import json
from PIL import Image
import httpx

logger = logging.getLogger(__name__)

# This module uses direct REST API calls to Gemini API with API key authentication.
# No SDKs or OAuth2 are required - just set GEMINI_API_KEY (or GOOGLE_API_KEY) environment variable.

async def generate_try_on(user_image_file, garment_image_files, category="upper_body", garment_metadata=None):
    """
    Uses Gemini 3 Pro (Nano Banana Pro) image editing to combine person and clothing images.
    Generates a photorealistic image of the person wearing all clothing items.
    
    Args:
        user_image_file: File-like object of the person image (USER_IMAGE).
        garment_image_files: File-like object or list of File-like objects of clothing images (CLOTHING_IMAGES).
        category: Category of the garment (upper_body, lower_body, dresses) - kept for backward compatibility.
        garment_metadata: Optional metadata dict with styling instructions (background, style, framing, pose, camera, extras).
        
    Returns:
        str: Base64 data URL of the generated image.
    """
    # Normalize to list if single file
    if not isinstance(garment_image_files, list):
        garment_image_files = [garment_image_files]
    
    # Use Gemini 3 Pro for image generation
    return await _generate_with_gemini(user_image_file, garment_image_files, category, garment_metadata)


async def _generate_with_gemini(user_image_file, garment_image_files, category="upper_body", garment_metadata=None):
    """
    Uses Imagen 4 via Gemini API for virtual try-on image generation.
    Generates a photorealistic image of the person wearing all clothing items.
    
    This function uses direct REST API calls to Gemini API with Imagen 4 models.
    Imagen 4 models are accessed through the Gemini API endpoint.
    No SDKs or OAuth2 are required - just set GEMINI_API_KEY environment variable.
    
    Model Selection Strategy:
    - Uses imagen-4.0-generate-001 for high quality output
    - Falls back to imagen-4.0-fast-generate-001 for faster generation
    
    API Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
    Authentication: API key passed as query parameter (?key={api_key})
    Request Format: JSON with images as base64 inline_data and responseModalities: ["IMAGE"]
    
    Args:
        user_image_file: File-like object of the person image
        garment_image_files: List of file-like objects of clothing images
        category: Category of the garment (for metadata)
        garment_metadata: Optional styling instructions dict
        
    Returns:
        str: Base64 data URL of the generated image (format: data:image/png;base64,...)
    """
    # Get API key from environment (prefer GEMINI_API_KEY, fallback to GOOGLE_API_KEY)
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    
    if not api_key:
        raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable is required")
    
    try:
        # Read user image bytes
        if hasattr(user_image_file, 'seek'):
            user_image_file.seek(0)
        user_image_bytes = user_image_file.read() if hasattr(user_image_file, 'read') else user_image_file
        
        # Read all clothing images into list
        garment_image_bytes_list = []
        for garment_file in garment_image_files:
            if hasattr(garment_file, 'seek'):
                garment_file.seek(0)
            garment_bytes = garment_file.read() if hasattr(garment_file, 'read') else garment_file
            garment_image_bytes_list.append(garment_bytes)
        
        # Limit to 5 clothing items (Gemini API supports up to 5 images per request)
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
        
        user_img_base64, user_mime_type = image_to_base64(user_image_bytes)
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
        
        # System prompt for virtual try-on API
        system_prompt = """You are the image generator behind a virtual try on API endpoint called /api/try-on.

Each request provides:

- One USER_IMAGE: a photo of the real person who must appear in the final image.

- One or more CLOTHING_IMAGES: photos of individual clothing items to be worn by that person.

- Optional METADATA: a JSON object with styling instructions.

Your job:

Generate one high quality, photorealistic image of the SAME PERSON from the USER_IMAGE, wearing ALL of the clothing items from CLOTHING_IMAGES, styled according to METADATA.

Identity and body consistency:

- The person in the output must clearly be the same person as in USER_IMAGE.

- Keep the same face, age, skin tone, hair color, hairstyle, facial hair, tattoos, and body type.

- Do not beautify, slim, bulk up, de-age, change ethnicity, or otherwise alter their core appearance unless METADATA explicitly allows this.

Clothing requirements:

- Use ONLY the clothing items shown in CLOTHING_IMAGES.

- Reproduce the actual colors, prints, logos, graphics, fabrics, and textures accurately.

- Respect correct layering:

  - Underwear or base layers closest to the body.

  - Tops over base layers.

  - Jackets, coats, or hoodies as outer layers.

- If an item is partly visible, infer the missing parts logically while staying consistent with visible details.

- Ignore the bodies, models, faces, and backgrounds in CLOTHING_IMAGES. Only the garments matter.

- Do not add extra garments, shoes, accessories, or logos that are not in CLOTHING_IMAGES unless METADATA explicitly asks for them.

Pose, framing, and composition:

- By default, show a three quarter or full body view that clearly displays the full outfit.

- Keep the person centered and in focus.

- Hands, arms, and body position should not block key parts of the clothing whenever possible.

- If METADATA specifies pose, angle, crop, or framing, follow it.

Background and visual style:

- Default background: simple, neutral, studio style with soft, flattering light.

- If METADATA includes environment, mood, or background style, follow it.

- Do not add overlaid text, watermarks, stickers, or design elements unless METADATA clearly requests them.

- Aim for realistic photography quality, similar to a professional fashion photo or a clean mirror selfie, depending on METADATA.

Using METADATA:

METADATA is a JSON object that can include keys like:

- "background": description of the background or environment.

- "style": description of photo style, for example studio, streetwear, mirror selfie.

- "framing": for example full_body, three_quarter, waist_up.

- "pose": instructions for body pose or direction.

- "camera": instructions like close_up, wide, eye_level, low_angle.

- "extras": any additional user preferences.

Treat METADATA as high priority instructions, as long as they do not conflict with:

1) Preserving the identity from USER_IMAGE,

2) Accurately representing the clothing from CLOTHING_IMAGES.

Conflict resolution:

- If there is any conflict, always prioritise:

  1) Identity consistency with USER_IMAGE,

  2) Clothing accuracy from CLOTHING_IMAGES,

  3) METADATA and other text instructions.

- If something is unclear, choose the safest and most realistic option that shows the outfit clearly and keeps the person recognisable.

Output:

- Return exactly one generated image of the person wearing all clothing items, with no text in the image and no textual explanation in the response."""
        
        # Build user prompt with metadata if available
        user_prompt = system_prompt
        
        if garment_metadata:
            # Format metadata as JSON string for the prompt
            metadata_str = json.dumps(garment_metadata, indent=2, ensure_ascii=False)
            user_prompt += f"\n\nMETADATA:\n{metadata_str}"
            logger.info(f"Using metadata: {list(garment_metadata.keys())}")
        
        # Build metadata payload for clothing items
        metadata_payload = {
            "clothing": [
                {
                    "index": idx + 1,
                    "id": item.get('id', f'item_{idx + 1}'),
                    "slot": item.get('slot', category if idx == 0 else 'accessory'),
                    "layer_order": item.get('layer_order', idx),
                    "description": item.get('description', ''),
                }
                for idx, item in enumerate(garment_data)
            ]
        }
        
        user_prompt += "\n\nGenerate one photorealistic image of the same person wearing all valid clothing pieces according to this JSON metadata:\n"
        user_prompt += json.dumps(metadata_payload, indent=2)
        
        logger.info(f"Generating image with {len(limited_garments)} clothing item(s)...")
        
        # Build parts array: person image first, then clothing images, then text
        parts = [
            {
                "inline_data": {
                    "mime_type": user_mime_type,
                    "data": user_img_base64,
                }
            }
        ]
        
        # Add clothing images
        for item in garment_data:
            parts.append({
                "inline_data": {
                    "mime_type": item['mimeType'],
                    "data": item['base64'],
                }
            })
        
        # Add text prompt
        parts.append({"text": user_prompt})
        
        # Optimized model selection for best image generation quality
        # Models ordered by quality and image generation capability
        # Priority: Best quality first, then fallback to reliable alternatives
        logger.info(f"🚀 Starting virtual try-on generation")
        logger.info(f"   Person image: {len(user_img_base64)} chars (base64)")
        logger.info(f"   Clothing items: {len(limited_garments)}")
        logger.info(f"   Total content parts: {len(parts)} ({len(limited_garments) + 1} images + 1 text)")
        
        # First, try to list available models to see what's actually available
        base_url = "https://generativelanguage.googleapis.com/v1beta/models"
        available_models = []
        
        try:
            list_endpoint = f"{base_url}?key={api_key}"
            async with httpx.AsyncClient(timeout=10.0) as list_client:
                list_response = await list_client.get(list_endpoint)
                if list_response.is_success:
                    list_data = list_response.json()
                    available_models = [m.get("name", "").split("/")[-1] for m in list_data.get("models", [])]
                    logger.info(f"Found {len(available_models)} available models")
                    logger.info(f"Sample models: {', '.join(available_models[:10])}")
                    
                    # Look for models that might support image generation
                    image_models = [
                        m for m in available_models 
                        if "imagen" in m.lower() or "image" in m.lower() or "generate" in m.lower()
                    ]
                    if image_models:
                        logger.info(f"Found potential image generation models: {', '.join(image_models)}")
        except Exception as e:
            logger.warning(f"Could not list available models: {e}")
        
        # Try Imagen 4 Ultra first (highest quality), then other variants
        model_options = [
            "imagen-4.0-ultra-generate-001",  # Ultra variant - highest quality
            "imagen-4.0-generate-001",        # Standard Imagen 4
            "imagen-4.0-fast-generate-001",   # Fast variant
            "imagen-3.0-generate-001",        # Imagen 3 fallback
        ]
        
        # Add any discovered models that might support image generation
        if available_models:
            for model in available_models:
                if ("imagen" in model.lower() and "generate" in model.lower()) and model not in model_options:
                    model_options.append(model)
        
        # If still no models found, try Gemini models that might support image generation
        if len(model_options) <= 3:
            model_options.extend([
                "gemini-2.0-flash-exp",
                "gemini-2.5-flash-exp",
            ])
        
        logger.info(f"Will try models in order: {', '.join(model_options[:5])}")
        last_error = None
        successful_model = None
        
        # Make async HTTP request
        # Using httpx for async REST API calls (no SDK required)
        async with httpx.AsyncClient(timeout=300.0) as client:  # 5 minute timeout for image generation
            for model_name in model_options:
                try:
                    endpoint = f"{base_url}/{model_name}:generateContent"
                    logger.info(f"Attempting to use Imagen 4 model: {model_name} with API: v1beta")
                        
                    response = await client.post(
                        f"{endpoint}?key={api_key}",
                        headers={
                            "Content-Type": "application/json",
                        },
                        json={
                            "contents": [
                                {
                                    "role": "user",
                                    "parts": parts,
                                }
                            ],
                            "generationConfig": {
                                "responseModalities": ["IMAGE"],
                            },
                        },
                    )
                    
                    if not response.is_success:
                        error_text = response.text
                        logger.warning(f"Model {model_name} failed: {response.status_code} - {error_text}")
                        last_error = ValueError(f"Gemini API error: {response.status_code} - {error_text}")
                        continue
                    
                    data = response.json()
                    
                    # Extract image from response
                    parts_out = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                    
                    image_part = None
                    for part in parts_out:
                        if "inline_data" in part:
                            image_part = part["inline_data"]
                            break
                    
                    if not image_part:
                        logger.warning(f"Model {model_name} returned no image in response")
                        last_error = ValueError("No image returned from Gemini - model may not support image generation")
                        continue
                    
                    image_base64 = image_part.get("data")
                    mime_type = image_part.get("mime_type", "image/png")
                    
                    if not image_base64:
                        logger.warning(f"Model {model_name} returned empty image data")
                        last_error = ValueError("Image data is empty in Gemini response")
                        continue
                    
                    successful_model = f"{model_name} (v1beta)"
                    logger.info(f"✅ Successfully generated image using model: {successful_model}")
                    logger.info(f"   Image size: {len(image_base64)} characters (base64), MIME type: {mime_type}")
                    # Return as data URL
                    return f"data:{mime_type};base64,{image_base64}"
                    
                except httpx.TimeoutException as e:
                    logger.error(f"Timeout calling model {model_name}: {e}")
                    last_error = e
                    continue
                except Exception as e:
                    logger.warning(f"Error calling model {model_name}: {e}")
                    last_error = e
                    continue
            
            # If all models failed, raise the last error with helpful context
            if last_error:
                error_msg = str(last_error)
                if "404" in error_msg or "NOT_FOUND" in error_msg or "not found" in error_msg.lower():
                    raise ValueError(
                        f"Imagen 4 API: Model not found.\n\n"
                        f"Troubleshooting:\n"
                        f"1. Verify your API key has access to Imagen 4 models\n"
                        f"2. Enable Generative AI API in Google Cloud Console\n"
                        f"3. Ensure Imagen API is enabled for your project\n"
                        f"4. Check that the model names are correct\n\n"
                        f"Tried models: {', '.join(model_options)}\n"
                        f"Original error: {error_msg}"
                    )
                raise last_error
            raise ValueError("Imagen 4 failed to generate image. Please check your API key has access to Imagen models.")
            
    except Exception as e:
        logger.error(f"Error in Imagen 4 image generation: {e}", exc_info=True)
        raise e




