import replicate
import os
import asyncio
import logging
import base64
import io
from PIL import Image

logger = logging.getLogger(__name__)

# Import new Google GenAI SDK for image generation
try:
    from google import genai
    from google.genai import types
    GEMINI_IMAGE_SDK_AVAILABLE = True
except ImportError:
    GEMINI_IMAGE_SDK_AVAILABLE = False
    logger.warning("google-genai package not installed. Install with: pip install google-genai")

async def generate_try_on(user_image_file, garment_image_file, category="upper_body"):
    """
    Generates virtual try-on image using either Replicate IDM-VTON or Gemini 3 Pro.
    Configurable via VTON_ENGINE environment variable.
    
    Args:
        user_image_file: File-like object of the user.
        garment_image_file: File-like object of the garment.
        category: Category of the garment (upper_body, lower_body, dresses).
        
    Returns:
        str: URL or base64 data URL of the generated image.
    """
    # Check which engine to use
    vton_engine = os.getenv("VTON_ENGINE", "replicate").lower().strip()
    
    if vton_engine == "gemini" or vton_engine == "nano-banana":
        # Use Gemini 3 Pro (Nano Banana Pro) for image generation
        return await _generate_with_gemini(user_image_file, garment_image_file, category)
    else:
        # Default: Use Replicate IDM-VTON
        return await _generate_with_replicate(user_image_file, garment_image_file, category)


async def _generate_with_gemini(user_image_file, garment_image_file, category="upper_body"):
    """
    Uses Gemini 3 Pro (Nano Banana Pro) for image generation.
    Note: This is text-to-image, not true virtual try-on.
    It will generate an image based on description, not combine person + clothing.
    
    Uses the new google-genai SDK with proper API configuration.
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
        
        def run_gemini_image_gen():
            # Initialize the new Google GenAI client
            client = genai.Client(api_key=api_key)
            
            # Create a detailed prompt for image generation
            # Note: This is text-to-image, so we describe what we want rather than combining images
            prompt = (
                f"Generate a photorealistic, high-quality image of a person wearing a {category} clothing item. "
                "The person should be in a natural, confident pose. The clothing should fit well, look realistic, "
                "and be clearly visible. The image should have professional lighting and a clean background. "
                "Make it look like a fashion photography shot."
            )
            
            # Model options (try in order of preference)
            model_options = [
                "gemini-3-pro-image-preview",  # Nano Banana Pro (Gemini 3 Pro Image)
                "gemini-3-pro-preview",        # Alternative model name
                "gemini-2.0-flash-exp",        # Fallback option
            ]
            
            last_error = None
            for model_name in model_options:
                try:
                    logger.info(f"Attempting to use model: {model_name}")
                    
                    # Generate image with proper configuration
                    response = client.models.generate_content(
                        model=model_name,
                        contents=prompt,
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
            raise last_error or ValueError("All Gemini image generation models failed")
        
        # Execute in thread pool
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()
        
        image_data = await loop.run_in_executor(None, run_gemini_image_gen)
        
        # Convert to base64 data URL for frontend compatibility
        if isinstance(image_data, bytes):
            image_base64 = base64.b64encode(image_data).decode('utf-8')
            return f"data:image/png;base64,{image_base64}"
        else:
            # If it's already a string/URL, return as-is
            return str(image_data)
            
    except Exception as e:
        logger.error(f"Error in Gemini 3 Pro image generation: {e}", exc_info=True)
        raise e


async def _generate_with_replicate(user_image_file, garment_image_file, category="upper_body"):
    """
    Uses Replicate IDM-VTON for true virtual try-on.
    This is the recommended method for virtual try-on.
    """
    # Ensure REPLICATE_API_TOKEN is set
    if not os.getenv("REPLICATE_API_TOKEN"):
        logger.warning("REPLICATE_API_TOKEN not set. Returning mock URL.")
        return "https://via.placeholder.com/600x800?text=Mock+VTON+Result"

    try:
        # Reset file positions to ensure we read from the beginning
        if hasattr(user_image_file, 'seek'):
            user_image_file.seek(0)
        if hasattr(garment_image_file, 'seek'):
            garment_image_file.seek(0)
        
        # IDM-VTON model on Replicate - configurable via environment variable
        # Set REPLICATE_VTON_MODEL to override default
        # Options:
        # - "latest" or empty: uses "yisol/idm-vton" (latest - recommended for best quality)
        # - "stable": uses specific stable version
        # - Custom: any valid Replicate model identifier
        #   Examples: "yisol/idm-vton:210a0f8136f8031240420b668cb1e10895c30945", "levihsu/ootdiffusion"
        model_override = os.getenv("REPLICATE_VTON_MODEL", "").strip()
        
        if model_override and model_override.lower() == "stable":
            # Use stable specific version
            model_version = "yisol/idm-vton:210a0f8136f8031240420b668cb1e10895c30945"
            logger.info("Using stable VTON model version")
        elif model_override and model_override.lower() == "latest":
            # Use latest version (may require model name without version)
            model_version = "yisol/idm-vton"
            logger.info("Using latest VTON model version")
        elif model_override:
            # Use custom model specified in environment variable
            model_version = model_override
            logger.info(f"Using custom VTON model: {model_version}")
        else:
            # Default: use stable version for reliability
            model_version = "yisol/idm-vton:210a0f8136f8031240420b668cb1e10895c30945"
            logger.info("Using stable VTON model version (default)")
        
        # Run Replicate API call in thread pool to avoid blocking event loop
        # Replicate accepts file-like objects directly, but we need to ensure they're accessible in thread
        def run_replicate():
            try:
                # Ensure files are at the beginning
                if hasattr(user_image_file, 'seek'):
                    user_image_file.seek(0)
                if hasattr(garment_image_file, 'seek'):
                    garment_image_file.seek(0)
                
                logger.info(f"Calling Replicate with model: {model_version}")
                output = replicate.run(
                    model_version,
                    input={
                        "human_img": user_image_file,
                        "garm_img": garment_image_file,
                        "garment_des": "clothing item",
                        "category": category,
                        "crop": False,
                        "seed": 42,
                        "steps": 30
                    }
                )
                logger.info(f"Replicate call completed. Output type: {type(output)}")
                return output
            except Exception as replicate_error:
                logger.error(f"Replicate API error: {replicate_error}", exc_info=True)
                raise
        
        # Execute blocking call in thread pool using run_in_executor for compatibility
        # Use get_running_loop() in async context (Python 3.7+)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()
        output = await loop.run_in_executor(None, run_replicate)
        
        # Handle different response formats from Replicate
        # Replicate can return: string URL, list of URLs, or iterator
        if isinstance(output, str):
            return output
        elif isinstance(output, list):
            # If list, return first URL
            if len(output) > 0:
                return output[0] if isinstance(output[0], str) else str(output[0])
            else:
                raise ValueError("Replicate returned empty list")
        else:
            # If iterator or other type, convert to string
            result = str(output)
            if result.startswith('http'):
                return result
            else:
                raise ValueError(f"Unexpected Replicate response format: {type(output)}")
                
    except Exception as e:
        logger.error(f"Error in VTON generation: {e}", exc_info=True)
        raise e


