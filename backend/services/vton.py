import os
import asyncio
import logging
import base64
import io
from PIL import Image

logger = logging.getLogger(__name__)

# Import Google GenAI SDK for image generation
# Try both SDKs - new one for image generation, old one as fallback
try:
    from google import genai as genai_new
    from google.genai import types
    NEW_SDK_AVAILABLE = True
except ImportError:
    NEW_SDK_AVAILABLE = False
    logger.warning("google-genai package not installed. Install with: pip install google-genai")

try:
    import google.generativeai as genai_old
    OLD_SDK_AVAILABLE = True
except ImportError:
    OLD_SDK_AVAILABLE = False
    logger.warning("google-generativeai package not installed. Install with: pip install google-generativeai")

# Import OAuth2 authentication libraries
try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth import default
    OAUTH2_AVAILABLE = True
except ImportError:
    OAUTH2_AVAILABLE = False
    logger.warning("google-auth packages not installed. Install with: pip install google-auth google-auth-oauthlib google-auth-httplib2")

GEMINI_SDK_AVAILABLE = NEW_SDK_AVAILABLE or OLD_SDK_AVAILABLE

# OAuth2 scopes for Generative AI
SCOPES = [
    'https://www.googleapis.com/auth/generative-language',
    'https://www.googleapis.com/auth/cloud-platform'
]

def _get_oauth2_credentials():
    """
    Get OAuth2 credentials for Google GenAI API.
    Uses client ID and secret from environment variables.
    For server-to-server, we need a refresh token or service account.
    """
    if not OAUTH2_AVAILABLE:
        raise ImportError("google-auth packages required for OAuth2. Install: pip install google-auth google-auth-oauthlib google-auth-httplib2")
    
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    
    if not client_id or not client_secret:
        raise ValueError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required for OAuth2 authentication")
    
    # Check for refresh token (required for server-to-server OAuth2)
    refresh_token = os.getenv("GOOGLE_REFRESH_TOKEN")
    
    if refresh_token:
        # Use refresh token to get access token
        from google.oauth2.credentials import Credentials
        credentials = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=SCOPES
        )
        # Refresh to get access token
        credentials.refresh(Request())
        logger.info("Using OAuth2 credentials with refresh token")
        return credentials
    else:
        # Try Application Default Credentials (for service accounts)
        try:
            credentials, project = default(scopes=SCOPES)
            logger.info("Using Application Default Credentials for OAuth2")
            return credentials
        except Exception as e:
            logger.warning(f"Application Default Credentials not available: {e}")
            raise ValueError(
                "OAuth2 requires either:\n"
                "1. A refresh token (set GOOGLE_REFRESH_TOKEN) - get one by running OAuth2 flow once\n"
                "2. A service account JSON file (set GOOGLE_APPLICATION_CREDENTIALS)\n"
                "3. Or use API key with the older google-generativeai SDK"
            )

def _get_genai_client():
    """
    Get authenticated Google GenAI client using OAuth2.
    Creates a temporary credentials file for the SDK to read.
    """
    if not NEW_SDK_AVAILABLE:
        raise ImportError("google-genai package is required for image generation")
    
    try:
        credentials = _get_oauth2_credentials()
        
        # Ensure credentials are refreshed and valid
        if not credentials.valid:
            credentials.refresh(Request())
            logger.info(f"Refreshed OAuth2 credentials. Token valid: {credentials.valid}")
        
        # Remove GOOGLE_API_KEY from environment to prevent SDK from using it
        original_api_key = os.environ.pop('GOOGLE_API_KEY', None)
        original_app_creds = os.environ.pop('GOOGLE_APPLICATION_CREDENTIALS', None)
        
        try:
            # Method 1: Create a temporary credentials file that the SDK can read
            # This is the most reliable way for the SDK to pick up OAuth2 credentials
            import tempfile
            import json
            
            # Create a temporary credentials file in the format the SDK expects
            creds_dict = {
                "type": "authorized_user",
                "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                "refresh_token": os.getenv("GOOGLE_REFRESH_TOKEN"),
                "token_uri": "https://oauth2.googleapis.com/token"
            }
            
            # Create temporary file
            temp_creds_file = None
            try:
                with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
                    json.dump(creds_dict, f, indent=2)
                    temp_creds_file = f.name
                
                # Set GOOGLE_APPLICATION_CREDENTIALS to point to our temp file
                os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = temp_creds_file
                
                logger.info(f"Created temporary credentials file: {temp_creds_file}")
                logger.info(f"GOOGLE_APPLICATION_CREDENTIALS set to: {temp_creds_file}")
                
                # Verify the file exists and is readable
                if os.path.exists(temp_creds_file):
                    with open(temp_creds_file, 'r') as f:
                        file_content = f.read()
                        logger.debug(f"Credentials file content (first 100 chars): {file_content[:100]}")
                else:
                    logger.error(f"Credentials file does not exist: {temp_creds_file}")
                
                # Now create the client - it should pick up credentials from GOOGLE_APPLICATION_CREDENTIALS
                # Also ensure we're not using any cached credentials
                import google.auth
                import google.auth._default
                
                # Clear any cached credentials
                if hasattr(google.auth._default, '_cached_credentials'):
                    google.auth._default._cached_credentials = None
                
                client = genai_new.Client()
                logger.info("Initialized Google GenAI client with OAuth2 credentials (via temp file)")
                return client
                
            except Exception as e:
                logger.warning(f"Temp file method failed: {e}", exc_info=True)
                # Clean up temp file if it exists
                if temp_creds_file and os.path.exists(temp_creds_file):
                    try:
                        os.unlink(temp_creds_file)
                    except:
                        pass
                
                # Method 2: Try passing credentials directly if SDK supports it
                try:
                    import inspect
                    sig = inspect.signature(genai_new.Client.__init__)
                    logger.info(f"Client.__init__ signature: {sig}")
                    if 'credentials' in sig.parameters:
                        client = genai_new.Client(credentials=credentials)
                        logger.info("Initialized Google GenAI client with OAuth2 credentials (direct)")
                        return client
                    else:
                        logger.info("Client does not accept credentials parameter")
                except (TypeError, AttributeError) as e2:
                    logger.debug(f"Direct credentials parameter not supported: {e2}")
                
                # Method 3: Override google.auth.default globally
                import google.auth
                original_default = google.auth.default
                
                def custom_default(scopes=None):
                    logger.info(f"custom_default called with scopes: {scopes}")
                    if not credentials.valid:
                        logger.info("Refreshing credentials in custom_default")
                        credentials.refresh(Request())
                    logger.info(f"Returning credentials, valid: {credentials.valid}")
                    return (credentials, None)
                
                google.auth.default = custom_default
                
                try:
                    client = genai_new.Client()
                    logger.info("Initialized Google GenAI client with OAuth2 credentials (via ADC override)")
                    return client
                finally:
                    google.auth.default = original_default
                
        finally:
            # Restore original environment variables if they were set
            if original_api_key:
                os.environ['GOOGLE_API_KEY'] = original_api_key
            if original_app_creds:
                os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = original_app_creds
            
    except Exception as e:
        logger.error(f"Failed to create GenAI client with OAuth2: {e}", exc_info=True)
        raise ValueError(f"OAuth2 authentication failed: {e}. Please check your GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN environment variables.")

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
    if not GEMINI_SDK_AVAILABLE:
        raise ImportError("Either google-genai or google-generativeai package is required")
    
    # Check for OAuth2 credentials first, then fallback to API key
    has_oauth2 = os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET")
    api_key = os.getenv("GOOGLE_API_KEY")
    
    if not has_oauth2 and not api_key:
        raise ValueError("Either OAuth2 credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) or GOOGLE_API_KEY is required")
    
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
            # Try new SDK first (supports image generation)
            client = None
            use_new_sdk = False
            
            if NEW_SDK_AVAILABLE:
                try:
                    # Try OAuth2 authentication first
                    if has_oauth2:
                        try:
                            client = _get_genai_client()
                            logger.info("Using new google-genai SDK with OAuth2 for image generation")
                            use_new_sdk = True
                        except Exception as e:
                            logger.warning(f"OAuth2 authentication failed: {e}, trying API key fallback")
                            # Fallback to API key if OAuth2 fails
                            if api_key:
                                os.environ['GOOGLE_API_KEY'] = api_key
                                try:
                                    client = genai_new.Client()
                                    logger.info("Using new google-genai SDK with API key (may not work for image generation)")
                                    use_new_sdk = True
                                except Exception as e2:
                                    logger.error(f"API key authentication also failed: {e2}")
                                    use_new_sdk = False
                            else:
                                use_new_sdk = False
                    elif api_key:
                        # Use API key directly
                        os.environ['GOOGLE_API_KEY'] = api_key
                        try:
                            client = genai_new.Client()
                            logger.info("Using new google-genai SDK with API key (may not work for image generation)")
                            use_new_sdk = True
                        except Exception as e:
                            logger.error(f"New SDK initialization failed: {e}")
                            use_new_sdk = False
                    else:
                        use_new_sdk = False
                except Exception as e:
                    logger.warning(f"Failed to use new SDK: {e}")
                    use_new_sdk = False
            
            # Fallback to old SDK if new one not available
            if not use_new_sdk:
                if OLD_SDK_AVAILABLE and api_key:
                    genai_old.configure(api_key=api_key)
                    logger.info("Using old google-generativeai SDK (note: does not support image generation)")
                else:
                    raise ImportError("No Google GenAI SDK available or no authentication credentials. Install google-genai or google-generativeai and set up OAuth2 or API key")
            
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
            
            if use_new_sdk and client:
                # Use new SDK for image generation
                # Model options for image generation
                model_options = [
                    "gemini-2.0-flash-exp",
                    "gemini-3-pro-image-preview",
                    "gemini-3-pro-preview",
                ]
                
                last_error = None
                for model_name in model_options:
                    try:
                        logger.info(f"Attempting to use model: {model_name} for virtual try-on generation")
                        
                        # Convert PIL Images to base64
                        def image_to_base64(img):
                            buffer = io.BytesIO()
                            img.save(buffer, format='PNG')
                            return base64.b64encode(buffer.getvalue()).decode('utf-8')
                        
                        user_img_base64 = image_to_base64(user_image)
                        garment_img_base64_list = [image_to_base64(img) for img in garment_images]
                        
                        # Build contents for new SDK
                        contents = [{"text": user_prompt}]
                        contents.append({
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": user_img_base64
                            }
                        })
                        for garment_base64 in garment_img_base64_list:
                            contents.append({
                                "inline_data": {
                                    "mime_type": "image/png",
                                    "data": garment_base64
                                }
                            })
                        
                        logger.info(f"Sending {len(contents)} content parts: 1 text + {len(contents) - 1} images")
                        
                        # Generate content with authenticated client
                        response = client.models.generate_content(
                            model=model_name,
                            contents=contents,
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
                                            if hasattr(part.image, 'data'):
                                                return part.image.data
                                            elif hasattr(part.image, 'bytes'):
                                                return part.image.bytes
                        
                        if hasattr(response, 'image'):
                            if hasattr(response.image, 'data'):
                                return response.image.data
                            elif hasattr(response.image, 'bytes'):
                                return response.image.bytes
                        
                        raise ValueError("No image data found in response")
                        
                    except Exception as e:
                        last_error = e
                        error_msg = str(e)
                        if "401" in error_msg or "UNAUTHENTICATED" in error_msg or "CREDENTIALS" in error_msg or "OAuth2" in error_msg:
                            logger.error(f"Authentication error: {e}")
                            logger.error("The new google-genai SDK requires OAuth2 authentication, not API keys.")
                            logger.error("You have two options:")
                            logger.error("1. Set up OAuth2 credentials in Google Cloud Console")
                            logger.error("2. Use a different image generation service that supports API keys")
                            raise ValueError(f"Authentication failed: The google-genai SDK requires OAuth2, not API keys. Error: {e}")
                        logger.warning(f"Model {model_name} failed: {e}. Trying next model...")
                        continue
                
                raise last_error or ValueError("All image generation models failed")
            else:
                # Old SDK doesn't support image generation
                raise ValueError("Image generation is not supported with the google-generativeai SDK. Please install google-genai package and set up OAuth2 authentication, or use a different image generation service.")
        
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




