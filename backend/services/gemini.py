import os
import base64
import io
import json
import re
import logging
from PIL import Image
import httpx

logger = logging.getLogger(__name__)

async def analyze_garment(image_bytes):
    """
    Uses Gemini API directly via REST to analyze a garment image.
    Returns a dictionary with search terms and estimated price.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY or GOOGLE_API_KEY not set. Returning mock data.")
        return {
            "search_query": "blue denim jacket",
            "estimated_price": "50.00",
            "description": "A classic blue denim jacket."
        }

    try:
        # Convert image to base64
        image = Image.open(io.BytesIO(image_bytes))
        buffer = io.BytesIO()
        # Save as PNG for consistency
        image.save(buffer, format='PNG')
        image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
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
        
        # Use Gemini 1.5 Flash for speed/quality balance
        endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
        
        # Make async HTTP request
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{endpoint}?key={api_key}",
                headers={
                    "Content-Type": "application/json",
                },
                json={
                    "contents": [
                        {
                            "role": "user",
                            "parts": [
                                {"text": prompt},
                                {
                                    "inline_data": {
                                        "mime_type": "image/png",
                                        "data": image_base64
                                    }
                                }
                            ]
                        }
                    ]
                },
            )
            
            if not response.is_success:
                error_text = response.text
                logger.error(f"Gemini API error: {response.status_code} - {error_text}")
                return {"error": f"Gemini API error: {response.status_code}", "details": error_text}
            
            data = response.json()
            
            # Extract text from response
            parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            text = ""
            for part in parts:
                if "text" in part:
                    text = part["text"]
                    break
            
            if not text:
                logger.warning(f"No text in Gemini response. Response: {json.dumps(data, indent=2)}")
                return {"error": "No text returned from Gemini", "raw": data}
            
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


