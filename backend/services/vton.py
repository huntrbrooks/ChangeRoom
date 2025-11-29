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

async def generate_try_on(user_image_file, garment_image_file, category="upper_body", garment_metadata=None):
    """
    Uses Gemini 3 Pro (Nano Banana Pro) image editing to combine person and clothing images.
    Edits the person image to add/change the clothing item.
    
    Args:
        user_image_file: File-like object of the person image (base image to edit).
        garment_image_file: File-like object of the clothing image (reference for editing).
        category: Category of the garment (upper_body, lower_body, dresses).
        garment_metadata: Optional metadata from analysis (dict with detailed_description, color, style, etc.)
        
    Returns:
        str: Base64 data URL of the edited image.
    """
    # Use Gemini 3 Pro for image editing
    return await _generate_with_gemini(user_image_file, garment_image_file, category, garment_metadata)


async def _generate_with_gemini(user_image_file, garment_image_file, category="upper_body", garment_metadata=None):
    """
    Uses Gemini 3 Pro (Nano Banana Pro) for image editing.
    Takes the person image and edits it to add/change the clothing item.
    
    Uses the new google-genai SDK with proper API configuration.
    If garment_metadata is provided, uses it for more accurate editing.
    """
    if not GEMINI_IMAGE_SDK_AVAILABLE:
        raise ImportError("google-genai package is required. Install with: pip install google-genai")
    
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logger.warning("GOOGLE_API_KEY not set. Cannot use Gemini 3 Pro.")
        raise ValueError("GOOGLE_API_KEY is required for Gemini 3 Pro image generation")
    
    try:
        # Read images to analyze them for better prompt generation
        if hasattr(user_image_file, 'seek'):
            user_image_file.seek(0)
        if hasattr(garment_image_file, 'seek'):
            garment_image_file.seek(0)
        
        user_image_bytes = user_image_file.read() if hasattr(user_image_file, 'read') else user_image_file
        garment_image_bytes = garment_image_file.read() if hasattr(garment_image_file, 'read') else garment_image_file
        
        def run_gemini_image_edit():
            # Initialize the new Google GenAI client
            client = genai.Client(api_key=api_key)
            
            # Load images
            user_image = Image.open(io.BytesIO(user_image_bytes))
            garment_image = Image.open(io.BytesIO(garment_image_bytes))
            
            # Use pre-analyzed metadata if available, otherwise analyze on the fly
            if garment_metadata and garment_metadata.get('detailed_description'):
                garment_description = garment_metadata['detailed_description']
                logger.info("Using pre-analyzed metadata for garment description")
            else:
                # Fallback: analyze the clothing image for better editing instructions
                analysis_model = genai.GenerativeModel('gemini-1.5-flash')
                garment_prompt = "Describe this clothing item in detail. Include: color, style, type, material, and distinctive features. Be specific about how it should look when worn."
                try:
                    garment_analysis = analysis_model.generate_content([garment_prompt, garment_image])
                    garment_description = garment_analysis.text if hasattr(garment_analysis, 'text') else "this clothing item"
                except Exception as e:
                    logger.warning(f"Could not analyze garment image: {e}. Using generic description.")
                    garment_description = f"a {category} clothing item"
            
            # Build enhanced editing prompt with metadata if available
            metadata_context = ""
            if garment_metadata:
                color = garment_metadata.get('color', '')
                style = garment_metadata.get('style', '')
                material = garment_metadata.get('material', '')
                fit = garment_metadata.get('fit', '')
                
                if color or style or material or fit:
                    metadata_context = f" The clothing is {color} in color, {style} in style, made of {material}, with a {fit} fit."
            
            # Create editing prompt - instruct Gemini to edit the person image
            edit_prompt = (
                f"Edit this person image to show them wearing {garment_description}.{metadata_context} "
                f"Replace or add the clothing item to match the reference clothing image exactly. "
                f"The clothing should fit naturally on the person, maintain their pose and body shape, "
                f"and look realistic. Keep the person's face, body proportions, and background the same. "
                f"Only modify the clothing to match the reference garment. Pay attention to the specific "
                f"details: color, material texture, fit, and style as described."
            )
            
            logger.info(f"Editing image with prompt: {edit_prompt[:150]}...")
            
            # Model options for image editing (try in order of preference)
            model_options = [
                "gemini-3-pro-image-preview",  # Nano Banana Pro (Gemini 3 Pro Image)
                "gemini-3-pro-preview",        # Alternative model name
                "gemini-2.0-flash-exp",        # Fallback option
            ]
            
            last_error = None
            for model_name in model_options:
                try:
                    logger.info(f"Attempting to use model: {model_name} for image editing")
                    
                    # Edit image using person image as base and garment as reference
                    # Convert PIL Images to bytes for API compatibility
                    user_img_bytes = io.BytesIO()
                    user_image.save(user_img_bytes, format='PNG')
                    user_img_bytes.seek(0)
                    
                    garment_img_bytes = io.BytesIO()
                    garment_image.save(garment_img_bytes, format='PNG')
                    garment_img_bytes.seek(0)
                    
                    # Pass both images: person image as the base to edit, garment as reference
                    # The API accepts images in various formats - try PIL Image first, then bytes if needed
                    try:
                        response = client.models.generate_content(
                            model=model_name,
                            contents=[
                                edit_prompt,
                                user_image,  # Base image to edit (PIL Image)
                                garment_image  # Reference clothing image (PIL Image)
                            ],
                            config=types.GenerateContentConfig(
                                response_modalities=['IMAGE'],  # Request image output
                                image_config=types.ImageConfig(
                                    aspect_ratio="2:3",  # Portrait orientation for fashion
                                    image_size="2K"      # 2K resolution (options: "1K", "2K", "4K")
                                )
                            )
                        )
                    except Exception as img_format_error:
                        # If PIL Images don't work, try with bytes
                        logger.warning(f"PIL Image format failed, trying bytes: {img_format_error}")
                        response = client.models.generate_content(
                            model=model_name,
                            contents=[
                                edit_prompt,
                                user_img_bytes.getvalue(),  # Base image as bytes
                                garment_img_bytes.getvalue()  # Reference image as bytes
                            ],
                            config=types.GenerateContentConfig(
                                response_modalities=['IMAGE'],
                                image_config=types.ImageConfig(
                                    aspect_ratio="2:3",
                                    image_size="2K"
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
        
        image_data = await loop.run_in_executor(None, run_gemini_image_edit)
        
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




