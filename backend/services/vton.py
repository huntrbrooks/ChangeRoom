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
        
        logger.info(f"Generating image with {len(limited_garments)} clothing item(s)...")
        
        # Build text prompt for Gemini 3 Pro Image
        # Simple, clear instructions for virtual try-on
        text_prompt = (
            "You are a fashion virtual try on engine. "
            "Use the first image as the person that must stay consistent. "
            "Use the other images as clothing items. "
            "Generate one photorealistic image of the same person wearing all of the clothes, "
            "neutral clean studio background, flattering lighting, full body if possible."
        )
        
        # Add wearing style instructions if provided
        if garment_metadata:
            # Extract wearing instructions if available
            wearing_instructions = garment_metadata.get('wearing_instructions')
            items_wearing_styles = garment_metadata.get('items_wearing_styles')
            
            if wearing_instructions and isinstance(wearing_instructions, list) and len(wearing_instructions) > 0:
                text_prompt += "\n\nImportant - How each clothing item should be worn:\n"
                for instruction in wearing_instructions:
                    text_prompt += f"- {instruction}\n"
                logger.info(f"Added {len(wearing_instructions)} wearing style instruction(s)")
            
            # Add per-item wearing styles if available (alternative format)
            if items_wearing_styles and isinstance(items_wearing_styles, list) and len(items_wearing_styles) > 0:
                text_prompt += "\n\nPer-item wearing instructions:\n"
                for item_info in items_wearing_styles:
                    item_idx = item_info.get('index', 0) + 2  # +2 because first image is person, items start at 2
                    item_type = item_info.get('item_type', 'item')
                    category = item_info.get('category', 'clothing')
                    wearing_style = item_info.get('wearing_style', 'default')
                    
                    # Build instruction based on wearing style
                    style_desc = wearing_style.replace('_', ' ')
                    text_prompt += f"- The {item_type} ({category}) shown in image {item_idx} should be worn {style_desc}\n"
                logger.info(f"Added {len(items_wearing_styles)} per-item wearing style(s)")
            
            # Add other metadata instructions
            other_metadata = {k: v for k, v in garment_metadata.items() 
                            if k not in ['wearing_instructions', 'items_wearing_styles']}
            if other_metadata:
                metadata_str = json.dumps(other_metadata, indent=2, ensure_ascii=False)
                text_prompt += f"\n\nAdditional styling instructions:\n{metadata_str}"
            
            logger.info(f"Using metadata: {list(garment_metadata.keys())}")
        
        # Build parts array: text prompt first, then person image, then clothing images
        # Gemini 3 Pro Image expects: text instructions + base image + clothing images
        parts = [
            {
                "text": text_prompt
            },
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
        
        # Use Gemini 3 Pro Image for virtual try-on
        logger.info(f"🚀 Starting virtual try-on generation with Gemini 3 Pro Image")
        logger.info(f"   Person image: {len(user_img_base64)} chars (base64)")
        logger.info(f"   Clothing items: {len(limited_garments)}")
        logger.info(f"   Total content parts: {len(parts)} (1 text + {len(limited_garments) + 1} images)")
        
        base_url = "https://generativelanguage.googleapis.com/v1beta/models"
        model_name = "gemini-3-pro-image-preview"
        
        # First, verify the model is available
        try:
            list_endpoint = f"{base_url}?key={api_key}"
            async with httpx.AsyncClient(timeout=10.0) as list_client:
                list_response = await list_client.get(list_endpoint)
                if list_response.is_success:
                    list_data = list_response.json()
                    available_models = [m.get("name", "").split("/")[-1] for m in list_data.get("models", [])]
                    logger.info(f"Available models (sample): {', '.join(available_models[:20])}")
                    
                    # Check if our model is available
                    if model_name not in available_models:
                        # Try to find similar models
                        image_models = [m for m in available_models if "gemini" in m.lower() and "image" in m.lower()]
                        logger.warning(f"Model {model_name} not found. Available image models: {image_models}")
                        if image_models:
                            model_name = image_models[0]
                            logger.info(f"Trying alternative model: {model_name}")
        except Exception as e:
            logger.warning(f"Could not verify model availability: {e}")
        
        # Make async HTTP request using Gemini 3 Pro Image
        async with httpx.AsyncClient(timeout=300.0) as client:  # 5 minute timeout for image generation
            try:
                endpoint = f"{base_url}/{model_name}:generateContent"
                logger.info(f"Calling Gemini 3 Pro Image: {model_name}")
                    
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
                            "responseModalities": ["TEXT", "IMAGE"],  # Required for Gemini image models
                        },
                    },
                )
                
                if not response.is_success:
                    error_text = response.text
                    logger.error(f"Gemini 3 Pro Image failed: {response.status_code} - {error_text}")
                    raise ValueError(f"Gemini API error: {response.status_code} - {error_text}")
                
                data = response.json()
                
                # Log response structure for debugging
                logger.info(f"Gemini API response keys: {list(data.keys())}")
                
                # Extract image from response
                candidates = data.get("candidates", [])
                if not candidates:
                    logger.error(f"No candidates in response. Full response: {json.dumps(data, indent=2)[:1000]}")
                    raise ValueError("No candidates returned from Gemini 3 Pro Image")
                
                candidate = candidates[0]
                logger.info(f"Candidate keys: {list(candidate.keys())}")
                
                # Check for safety ratings or finish reasons
                if "safetyRatings" in candidate:
                    logger.warning(f"Safety ratings: {candidate.get('safetyRatings')}")
                if "finishReason" in candidate:
                    finish_reason = candidate.get("finishReason")
                    logger.info(f"Finish reason: {finish_reason}")
                    if finish_reason and finish_reason != "STOP":
                        logger.warning(f"Unexpected finish reason: {finish_reason}")
                
                content = candidate.get("content", {})
                logger.info(f"Content keys: {list(content.keys())}")
                
                content_parts = content.get("parts", [])
                logger.info(f"Number of parts in response: {len(content_parts)}")
                
                # Log part types for debugging
                for i, part in enumerate(content_parts):
                    logger.info(f"Part {i} keys: {list(part.keys())}")
                    if "text" in part:
                        logger.info(f"Part {i} has text: {str(part.get('text', ''))[:100]}")
                
                # Find the first image in the response
                # Check both snake_case (inline_data) and camelCase (inlineData)
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
                
                if not image_part:
                    # Log full response structure for debugging
                    logger.error(f"No image part found. Response structure: {json.dumps(data, indent=2)[:2000]}")
                    raise ValueError("No image part in Gemini 3 Pro Image response. Check logs for response structure.")
                
                image_base64 = image_part.get("data")
                mime_type = image_part.get("mime_type", "image/png")
                
                if not image_base64:
                    raise ValueError("Image data is empty in Gemini response")
                
                logger.info(f"✅ Successfully generated image using Gemini 3 Pro Image")
                logger.info(f"   Image size: {len(image_base64)} characters (base64), MIME type: {mime_type}")
                # Return as data URL
                return f"data:{mime_type};base64,{image_base64}"
                
            except httpx.TimeoutException as e:
                logger.error(f"Timeout calling Gemini 3 Pro Image: {e}")
                raise ValueError(f"Request timed out. Please try again.")
            except Exception as e:
                logger.error(f"Error calling Gemini 3 Pro Image: {e}")
                raise
            
    except Exception as e:
        logger.error(f"Error in Gemini 3 Pro Image generation: {e}", exc_info=True)
        raise e




