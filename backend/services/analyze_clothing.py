import os
import base64
import asyncio
import json
import re
import logging
import hashlib
from typing import Dict, Any
from PIL import Image
import io

logger = logging.getLogger(__name__)

# Import OpenAI SDK
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    logger.warning("openai package not installed. Install with: pip install openai")

async def analyze_clothing_item(image_bytes: bytes, original_filename: str = "") -> Dict[str, Any]:
    """
    Analyzes a clothing item image to extract comprehensive metadata using OpenAI GPT-4o-mini.
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
    if not OPENAI_AVAILABLE:
        logger.warning("OpenAI package not available. Returning mock data.")
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
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set. Returning mock data.")
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
        client = OpenAI(api_key=api_key)
        
        # Detect image format and encode to base64 for OpenAI API
        try:
            image = Image.open(io.BytesIO(image_bytes))
            # Determine MIME type based on image format
            format_map = {
                'JPEG': 'jpeg',
                'PNG': 'png',
                'WEBP': 'webp',
                'GIF': 'gif'
            }
            mime_type = format_map.get(image.format, 'jpeg')
        except Exception:
            # Default to jpeg if format detection fails
            mime_type = 'jpeg'
        
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')
        
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
        Return ONLY valid JSON, no additional text.
        """
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/{mime_type};base64,{image_base64}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=1000,
            response_format={"type": "json_object"}
        )
        
        return response.choices[0].message.content

    try:
        text = await asyncio.to_thread(run_analysis)
        
        if not text:
            raise ValueError("Empty response from OpenAI")
        
        # Parse JSON from response (OpenAI should return valid JSON directly)
        try:
            analysis = json.loads(text)
        except json.JSONDecodeError:
            # Fallback: try to extract JSON from text if wrapped
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                analysis = json.loads(match.group(0))
            else:
                logger.warning(f"Could not parse OpenAI response as JSON. Raw: {text}")
                raise ValueError("Could not parse JSON from response")
        
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

