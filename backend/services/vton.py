import os
import asyncio
import logging
import base64
import io
from PIL import Image

logger = logging.getLogger(__name__)

# Import Google GenAI SDK for image generation
try:
    from google import genai
    from google.genai import types
    GEMINI_IMAGE_SDK_AVAILABLE = True
except ImportError:
    GEMINI_IMAGE_SDK_AVAILABLE = False
    logger.warning("google-genai package not installed. Install with: pip install google-genai")

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
    Uses Gemini 3 Pro (Nano Banana Pro) for virtual try-on image generation.
    Generates a photorealistic image of the person wearing all clothing items.
    
    Uses the new google-genai SDK with proper API configuration.
    Implements the system prompt for virtual try-on API.
    """
    if not GEMINI_IMAGE_SDK_AVAILABLE:
        raise ImportError("google-genai package is required. Install with: pip install google-genai")
    
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logger.warning("GOOGLE_API_KEY not set. Cannot use Gemini 3 Pro.")
        raise ValueError("GOOGLE_API_KEY is required for Gemini 3 Pro image generation")
    
    try:
        # Read user image
        if hasattr(user_image_file, 'seek'):
            user_image_file.seek(0)
        user_image_bytes = user_image_file.read() if hasattr(user_image_file, 'read') else user_image_file
        
        # Read all clothing images
        garment_image_bytes_list = []
        for garment_file in garment_image_files:
            if hasattr(garment_file, 'seek'):
                garment_file.seek(0)
            garment_bytes = garment_file.read() if hasattr(garment_file, 'read') else garment_file
            garment_image_bytes_list.append(garment_bytes)
        
        def run_gemini_image_generation():
            # Initialize the new Google GenAI client
            client = genai.Client(api_key=api_key)
            
            # Load user image
            user_image = Image.open(io.BytesIO(user_image_bytes))
            
            # Load all clothing images
            garment_images = [Image.open(io.BytesIO(gb)) for gb in garment_image_bytes_list]
            
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
                import json
                # Use ensure_ascii=False to handle Unicode characters properly
                metadata_str = json.dumps(garment_metadata, indent=2, ensure_ascii=False)
                user_prompt += f"\n\nMETADATA:\n{metadata_str}"
                logger.info(f"Using metadata: {list(garment_metadata.keys())}")
            
            logger.info(f"Generating image with {len(garment_images)} clothing item(s)...")
            
            # Model options for image generation (try in order of preference)
            model_options = [
                "gemini-3-pro-image-preview",  # Nano Banana Pro (Gemini 3 Pro Image)
                "gemini-3-pro-preview",        # Alternative model name
                "gemini-2.0-flash-exp",        # Fallback option
            ]
            
            last_error = None
            for model_name in model_options:
                try:
                    logger.info(f"Attempting to use model: {model_name} for virtual try-on generation")
                    
                    # Convert PIL Images to base64 for API compatibility
                    def image_to_base64(img):
                        buffer = io.BytesIO()
                        img.save(buffer, format='PNG')
                        return base64.b64encode(buffer.getvalue()).decode('utf-8')
                    
                    user_img_base64 = image_to_base64(user_image)
                    garment_img_base64_list = [image_to_base64(img) for img in garment_images]
                    
                    # Build contents in the format expected by google-genai SDK
                    # Format: list of parts, where each part can be text or inline_data
                    contents = []
                    
                    # Add text prompt as first part
                    contents.append({
                        "text": user_prompt
                    })
                    
                    # Add user image
                    contents.append({
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": user_img_base64
                        }
                    })
                    
                    # Add all clothing images
                    for garment_base64 in garment_img_base64_list:
                        contents.append({
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": garment_base64
                            }
                        })
                    
                    logger.info(f"Sending {len(contents)} content parts: 1 text + {len(contents) - 1} images")
                    
                    response = client.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            response_modalities=['IMAGE'],  # Request image output
                            image_config=types.ImageConfig(
                                aspect_ratio="2:3",  # Portrait orientation for fashion
                                image_size="2K"      # 2K resolution (options: "1K", "2K", "4K")
                            )
                        )
                    )
                    
                    # Extract image from response
                    if hasattr(response, 'contents') and response.contents:
                        for content in response.contents:
                            if hasattr(content, 'parts') and content.parts:
                                for part in content.parts:
                                    if hasattr(part, 'inline_data') and part.inline_data:
                                        return part.inline_data.data
                                    elif hasattr(part, 'image') and part.image:
                                        # Handle different response formats
                                        if hasattr(part.image, 'data'):
                                            return part.image.data
                                        elif hasattr(part.image, 'bytes'):
                                            return part.image.bytes
                    
                    # Alternative: check for image in response directly
                    if hasattr(response, 'image'):
                        if hasattr(response.image, 'data'):
                            return response.image.data
                        elif hasattr(response.image, 'bytes'):
                            return response.image.bytes
                    
                    raise ValueError("No image data found in response")
                    
                except Exception as e:
                    last_error = e
                    logger.warning(f"Model {model_name} failed: {e}. Trying next model...")
                    continue
            
            # If all models failed, raise the last error
            raise last_error or ValueError("All Gemini image editing models failed")
        
        # Execute in thread pool
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()
        
        image_data = await loop.run_in_executor(None, run_gemini_image_generation)
        
        # Convert to base64 data URL for frontend compatibility
        if isinstance(image_data, bytes):
            image_base64 = base64.b64encode(image_data).decode('utf-8')
            return f"data:image/png;base64,{image_base64}"
        else:
            # If it's already a string/URL, return as-is
            return str(image_data)
            
    except Exception as e:
        logger.error(f"Error in Gemini 3 Pro image editing: {e}", exc_info=True)
        raise e




