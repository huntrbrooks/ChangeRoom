import replicate
import os

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
        # For development/mocking if no key is present
        print("Warning: REPLICATE_API_TOKEN not set. Returning mock URL.")
        return "https://via.placeholder.com/600x800?text=Mock+VTON+Result"

    try:
        # IDM-VTON model on Replicate
        # using: cuuupid/idm-vton
        model = "cuuupid/idm-vton:c871bb9b046607e580929ef719e7aa774a330fe8" # This version might change, using generic ref or latest if possible
        # But replicate client usually takes "owner/name" and runs latest or specific version.
        # Let's use a well known IDM-VTON deployment. 
        # For safety, I will use the official one if available or a popular public one.
        # 'yisol/idm-vton' is the official repo.
        
        output = replicate.run(
            "yisol/idm-vton:210a0f8136f8031240420b668cb1e10895c30945",
            input={
                "human_img": user_image_file,
                "garm_img": garment_image_file,
                "garment_des": "clothing item", # Optional description
                "category": category,
                "crop": False,
                "seed": 42,
                "steps": 30
            }
        )
        return output
    except Exception as e:
        print(f"Error in VTON generation: {e}")
        raise e

