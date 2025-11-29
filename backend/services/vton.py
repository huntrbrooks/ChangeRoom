import replicate
import os
import asyncio
import logging

logger = logging.getLogger(__name__)

async def generate_try_on(user_image_file, garment_image_file, category="upper_body"):
    """
    Wraps the Replicate API for IDM-VTON or similar.
    
    Args:
        user_image_file: File-like object of the user.
        garment_image_file: File-like object of the garment.
        category: Category of the garment (upper_body, lower_body, dresses).
        
    Returns:
        str: URL of the generated image.
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
        elif model_override:
            # Use custom model specified in environment variable
            model_version = model_override
            logger.info(f"Using custom VTON model: {model_version}")
        else:
            # Default: use latest version for best results
            model_version = "yisol/idm-vton"
            logger.info("Using latest VTON model version")
        
        # Run Replicate API call in thread pool to avoid blocking event loop
        def run_replicate():
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
            return output
        
        # Execute blocking call in thread pool
        output = await asyncio.to_thread(run_replicate)
        
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


