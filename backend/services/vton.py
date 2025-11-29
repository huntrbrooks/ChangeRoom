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

async def generate_try_on(user_image_file, garment_image_file, category="upper_body"):
    """
    Generates image using Gemini 3 Pro (Nano Banana Pro) image generation.
    Note: This is text-to-image generation, not true virtual try-on.
    
    Args:
        user_image_file: File-like object of the user (used for context).
        garment_image_file: File-like object of the garment (used for context).
        category: Category of the garment (upper_body, lower_body, dresses).
        
    Returns:
        str: Base64 data URL of the generated image.
    """
    # Always use Gemini 3 Pro for image generation
    return await _generate_with_gemini(user_image_file, garment_image_file, category)


async def _generate_with_gemini(user_image_file, garment_image_file, category="upper_body"):
    """
    Uses Gemini 3 Pro (Nano Banana Pro) for image generation.
    Analyzes the uploaded images to create a better prompt for generation.
    
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
            
            # Use Gemini to analyze the images for better prompt generation
            analysis_model = genai.GenerativeModel('gemini-1.5-flash')
            
            # Analyze clothing image
            garment_image = Image.open(io.BytesIO(garment_image_bytes))
            garment_prompt = "Describe this clothing item in detail. Include: color, style, type (shirt, jacket, dress, etc.), material, and any distinctive features. Be specific."
            try:
                garment_analysis = analysis_model.generate_content([garment_prompt, garment_image])
                garment_description = garment_analysis.text if hasattr(garment_analysis, 'text') else "clothing item"
            except Exception as e:
                logger.warning(f"Could not analyze garment image: {e}. Using generic description.")
                garment_description = f"{category} clothing item"
            
            # Analyze person image for context
            user_image = Image.open(io.BytesIO(user_image_bytes))
            person_prompt = "Describe this person briefly: approximate age range, body type, pose, and any notable features. Keep it concise."
            try:
                person_analysis = analysis_model.generate_content([person_prompt, user_image])
                person_description = person_analysis.text if hasattr(person_analysis, 'text') else "a person"
            except Exception as e:
                logger.warning(f"Could not analyze person image: {e}. Using generic description.")
                person_description = "a person"
            
            # Create a detailed prompt based on the analysis
            prompt = (
                f"Generate a photorealistic, high-quality fashion photography image of {person_description} "
                f"wearing {garment_description}. The person should be in a natural, confident pose. "
                f"The clothing should fit well, look realistic, and be clearly visible. "
                f"The image should have professional studio lighting and a clean, elegant background. "
                f"Make it look like a high-end fashion photography shot with perfect composition and attention to detail."
            )
            
            logger.info(f"Generated prompt: {prompt[:150]}...")
            
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




