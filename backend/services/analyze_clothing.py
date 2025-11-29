import google.generativeai as genai
import os
from PIL import Image
import io
import asyncio
import json
import re
import logging
import hashlib
from typing import Dict, Any

logger = logging.getLogger(__name__)

async def analyze_clothing_item(image_bytes: bytes, original_filename: str = "") -> Dict[str, Any]:
    """
    Analyzes a clothing item image to extract comprehensive metadata.
    Returns category, detailed description, and metadata for Gemini 3 Pro optimization.
    
    Args:
        image_bytes: Image file bytes
        original_filename: Original filename for context
        
    Returns:
        Dictionary with:
        - category: upper_body, lower_body, dresses, accessories, etc.
        - detailed_description: Comprehensive description for image generation
        - color: Primary color(s)
        - style: Style description
        - material: Material/fabric type
        - fit: Fit type (slim, loose, etc.)
        - metadata: Additional metadata for Gemini optimization
        - suggested_filename: Categorized filename
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logger.warning("GOOGLE_API_KEY not set. Returning mock data.")
        return {
            "category": "upper_body",
            "detailed_description": "clothing item",
            "color": "unknown",
            "style": "casual",
            "material": "cotton",
            "fit": "regular",
            "metadata": {},
            "suggested_filename": f"upper_body_{original_filename or 'item'}.jpg"
        }

    def run_analysis():
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        image = Image.open(io.BytesIO(image_bytes))
        
        prompt = """
        Analyze this clothing item in detail. Provide comprehensive information in JSON format:
        {
            "category": "upper_body" | "lower_body" | "dresses" | "outerwear" | "accessories" | "shoes",
            "detailed_description": "A very detailed description including: exact color(s), style (casual/formal/sporty/etc.), specific type (t-shirt, jeans, dress, etc.), material/fabric, fit (slim/loose/regular), patterns, brand if visible, and any distinctive features. This description will be used for AI image generation, so be very specific.",
            "color": "primary color(s) - be specific",
            "style": "style description (casual, formal, sporty, etc.)",
            "material": "fabric/material type",
            "fit": "fit type (slim, loose, regular, oversized, etc.)",
            "patterns": "any patterns or prints",
            "brand": "brand name if visible, otherwise 'unknown'",
            "season": "appropriate season (spring, summer, fall, winter, all-season)",
            "occasion": "suitable occasions (casual, formal, party, work, etc.)"
        }
        
        Be extremely detailed in the description - include every visible detail that would help an AI generate this clothing item accurately.
        """
        
        response = model.generate_content([prompt, image])
        return response.text

    try:
        text = await asyncio.to_thread(run_analysis)
        
        # Parse JSON from response
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            analysis = json.loads(match.group(0))
            
            # Generate suggested filename based on category and metadata
            category = analysis.get("category", "unknown")
            color = analysis.get("color", "unknown").lower().replace(" ", "_").replace("/", "_")
            style = analysis.get("style", "unknown").lower().replace(" ", "_").replace("/", "_")
            
            # Create a clean filename (remove special characters)
            color = re.sub(r'[^a-z0-9_]', '', color)
            style = re.sub(r'[^a-z0-9_]', '', style)
            
            # Use a simple hash for uniqueness
            filename_hash = hashlib.md5(original_filename.encode()).hexdigest()[:8]
            suggested_filename = f"{category}_{color}_{style}_{filename_hash}.jpg"
            
            # Create comprehensive metadata for Gemini 3 Pro
            metadata = {
                "category": category,
                "color": analysis.get("color", "unknown"),
                "style": analysis.get("style", "unknown"),
                "material": analysis.get("material", "unknown"),
                "fit": analysis.get("fit", "regular"),
                "patterns": analysis.get("patterns", "none"),
                "brand": analysis.get("brand", "unknown"),
                "season": analysis.get("season", "all-season"),
                "occasion": analysis.get("occasion", "casual"),
                "original_filename": original_filename
            }
            
            return {
                "category": category,
                "detailed_description": analysis.get("detailed_description", "clothing item"),
                "color": analysis.get("color", "unknown"),
                "style": analysis.get("style", "unknown"),
                "material": analysis.get("material", "unknown"),
                "fit": analysis.get("fit", "regular"),
                "metadata": metadata,
                "suggested_filename": suggested_filename,
                "full_analysis": analysis
            }
        else:
            logger.warning(f"Could not parse Gemini response as JSON. Raw: {text}")
            return {
                "category": "unknown",
                "detailed_description": "clothing item",
                "color": "unknown",
                "style": "unknown",
                "material": "unknown",
                "fit": "regular",
                "metadata": {},
                "suggested_filename": f"unknown_{original_filename or 'item'}.jpg",
                "error": "Could not parse response",
                "raw": text
            }

    except Exception as e:
        logger.error(f"Error analyzing clothing item: {e}", exc_info=True)
        return {
            "category": "unknown",
            "detailed_description": "clothing item",
            "color": "unknown",
            "style": "unknown",
            "material": "unknown",
            "fit": "regular",
            "metadata": {},
            "suggested_filename": f"unknown_{original_filename or 'item'}.jpg",
            "error": str(e)
        }

