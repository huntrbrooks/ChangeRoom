import google.generativeai as genai
import os
from PIL import Image
import io

def analyze_garment(image_bytes):
    """
    Uses Gemini to analyze a garment image.
    Returns a dictionary with search terms and estimated price.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("Warning: GOOGLE_API_KEY not set.")
        return {
            "search_query": "blue denim jacket",
            "estimated_price": "50.00",
            "description": "A classic blue denim jacket."
        }

    genai.configure(api_key=api_key)
    
    # Use Gemini 1.5 Flash or Pro for speed/quality balance
    model = genai.GenerativeModel('gemini-1.5-flash')

    try:
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
        
        # Basic parsing - in production, use structured output or robust JSON parsing
        # For now, we'll try to extract JSON from the text
        text = response.text
        import json
        import re
        
        # Find JSON block
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        else:
            return {"error": "Could not parse Gemini response", "raw": text}

    except Exception as e:
        print(f"Error analyzing garment: {e}")
        return {"error": str(e)}


