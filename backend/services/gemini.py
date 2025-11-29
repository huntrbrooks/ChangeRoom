import google.generativeai as genai
import os
from PIL import Image
import io
import asyncio
import json
import re
import logging

logger = logging.getLogger(__name__)

async def analyze_garment(image_bytes):
    """
    Uses Gemini to analyze a garment image.
    Returns a dictionary with search terms and estimated price.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logger.warning("GOOGLE_API_KEY not set. Returning mock data.")
        return {
            "search_query": "blue denim jacket",
            "estimated_price": "50.00",
            "description": "A classic blue denim jacket."
        }

    # Run blocking Gemini API call in thread pool to avoid blocking event loop
    def run_gemini():
        genai.configure(api_key=api_key)
        
        # Use Gemini 1.5 Flash for speed/quality balance
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        image = Image.open(io.BytesIO(image_bytes))
        
        prompt = """
        Analyze this clothing item. Provide:
        1. A specific search query to find this exact or very similar item online (include color, style, material, potential brand if visible).
        2. An estimated price range in USD.
        3. A short description.
        
        Return the response in JSON format:
        {
            "search_query": "...",
            "estimated_price": "...",
            "description": "..."
        }
        """
        
        response = model.generate_content([prompt, image])
        return response.text

    try:
        # Execute blocking call in thread pool
        text = await asyncio.to_thread(run_gemini)
        
        # Parse JSON from response
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        else:
            logger.warning(f"Could not parse Gemini response as JSON. Raw: {text}")
            return {"error": "Could not parse Gemini response", "raw": text}

    except Exception as e:
        logger.error(f"Error analyzing garment: {e}", exc_info=True)
        return {"error": str(e)}


