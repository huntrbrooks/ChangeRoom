"""
Batch clothing preprocessing service - processes each image individually.

This ensures accurate categorization per image and prevents category leakage.

Clean Architecture:
- OpenAI: Analyzes each image separately and provides structured metadata + recommended filenames
- Backend: Saves files, handles storage, wires everything for Gemini

Flow:
1. User uploads up to 5 images on frontend
2. Frontend sends them to /api/preprocess-clothing as multipart/form-data
3. Backend processes each image individually with separate OpenAI calls
4. Backend parses JSON, renames files based on each image's category, saves them
5. Returns array of items with URLs and metadata for Gemini flow
"""

import os
import base64
import json
import re
import logging
import asyncio
import uuid
from typing import List, Dict, Any, Optional
from pathlib import Path
import io
from PIL import Image
from datetime import datetime

# OpenAI SDK for structured outputs
try:
    from openai import OpenAI, AsyncOpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

# Storage backend
from .storage import get_storage_backend

logger = logging.getLogger(__name__)

# Valid categories - these match what the frontend expects
VALID_CATEGORIES = {
    "UPPER_BODY", "LOWER_BODY", "FOOTWEAR", "ACCESSORY", "FULL_BODY",
    "upper_body", "lower_body", "footwear", "accessory", "full_body"
}

CLOTHING_UPLOAD_SUBDIR = "clothing"


async def analyze_single_clothing_image(
    image_bytes: bytes,
    api_key: str,
    original_filename: str = ""
) -> Dict[str, Any]:
    """
    Call OpenAI on a single image and return structured clothing metadata.
    
    This processes ONE image independently to ensure accurate categorization.
    
    Args:
        image_bytes: Image file bytes
        api_key: OpenAI API key
        original_filename: Original filename for context
        
    Returns:
        Dictionary with category, item_type, color, style, tags, etc.
    """
    client = AsyncOpenAI(api_key=api_key)
    
    # Detect image format
    try:
        image = Image.open(io.BytesIO(image_bytes))
        format_map = {
            'JPEG': 'image/jpeg',
            'PNG': 'image/png',
            'WEBP': 'image/webp',
            'GIF': 'image/gif'
        }
        mime_type = format_map.get(image.format, 'image/jpeg')
    except Exception:
        mime_type = 'image/jpeg'
    
    # Convert to base64
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    
    # Build prompt with strict category rules
    system_prompt = """You are a fashion classifier. Identify which body region this clothing item belongs to and return STRICT JSON.

Valid categories (use EXACTLY these):
- UPPER_BODY (shirts, hoodies, jackets, tops, t-shirts, blouses, sweaters)
- LOWER_BODY (pants, shorts, skirts, jeans, trousers, leggings)
- FOOTWEAR (shoes, boots, sneakers, sandals, heels, any item worn on feet)
- ACCESSORY (hats, caps, bags, belts, scarves, jewelry, sunglasses)
- FULL_BODY (dresses, jumpsuits, overalls, rompers)

⚠️ CRITICAL RULES:
- Boots/shoes → FOOTWEAR (NOT UPPER_BODY)
- Pants/jeans → LOWER_BODY (NOT UPPER_BODY)
- Hats/caps → ACCESSORY (NOT UPPER_BODY)
- Look at what the item ACTUALLY IS before classifying

Respond with JSON only, no commentary."""
    
    user_prompt = """Classify this clothing item and extract metadata. 

Return JSON with these exact fields:
- category: One of UPPER_BODY, LOWER_BODY, FOOTWEAR, ACCESSORY, FULL_BODY
- item_type: Specific type (e.g., "brown leather lace up boots", "black baseball cap", "blue cargo pants")
- color: Primary color(s)
- style: Style description (casual, formal, streetwear, vintage, etc.)
- tags: Array of 3-10 useful tags
- short_description: One clear sentence describing the item
- suggested_filename: snake_case filename (e.g., "brown_leather_boots", "black_baseball_cap")

Return ONLY valid JSON, no markdown, no code blocks."""
    
    messages = [
        {
            "role": "system",
            "content": system_prompt
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": user_prompt
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{image_base64}",
                        "detail": "high"  # High detail for better classification
                    }
                }
            ]
        }
    ]
    
    try:
        # Call OpenAI with JSON mode
        response = await client.chat.completions.create(
            model="gpt-4o-mini",  # Cost-effective and accurate
            messages=messages,
            response_format={"type": "json_object"},  # Ensures valid JSON
            temperature=0.0,  # Deterministic
            max_tokens=1000
        )
        
        json_text = response.choices[0].message.content
        if not json_text:
            raise ValueError("Empty response from OpenAI")
        
        # Parse JSON
        data = json.loads(json_text)
        
        # Guard rails: validate category
        category = data.get("category", "").strip().upper()
        
        # Map common variations to standard categories
        category_map = {
            "SHOES": "FOOTWEAR",
            "SHOE": "FOOTWEAR",
            "BOOT": "FOOTWEAR",
            "BOOTS": "FOOTWEAR",
            "UPPER_BODY": "UPPER_BODY",
            "LOWER_BODY": "LOWER_BODY",
            "ACCESSORY": "ACCESSORY",
            "ACCESSORIES": "ACCESSORY",
            "FULL_BODY": "FULL_BODY",
            "DRESS": "FULL_BODY"
        }
        
        if category in category_map:
            category = category_map[category]
        
        # Validate category
        if category not in VALID_CATEGORIES:
            logger.warning(f"Invalid category '{category}' for {original_filename}, defaulting to UPPER_BODY")
            category = "UPPER_BODY"
        
        data["category"] = category
        
        logger.info(f"Analysis result for {original_filename}: category={category}, item_type={data.get('item_type', 'unknown')}")
        
        return data
        
    except Exception as e:
        logger.error(f"OpenAI analysis failed for {original_filename}: {e}", exc_info=True)
        # Return safe defaults
        return {
            "category": "UPPER_BODY",
            "item_type": "clothing item",
            "color": "unknown",
            "style": "casual",
            "tags": [],
            "short_description": "Clothing item",
            "suggested_filename": "item"
        }


async def preprocess_clothing_batch(
    image_files: List[bytes],
    original_filenames: List[str],
    output_dir: str = "uploads"
) -> List[Dict[str, Any]]:
    """
    Process each clothing image individually so results do not leak between images.
    
    This ensures each image gets its own category based on what it actually is,
    preventing all images from being labeled as UPPER_BODY.
    
    Args:
        image_files: List of image file bytes (up to 5)
        original_filenames: List of original filenames (same order as image_files)
        output_dir: Directory to save processed images
        
    Returns:
        List of dictionaries with analysis, saved_filename and file_url
    """
    if not OPENAI_AVAILABLE:
        logger.error("OpenAI SDK not available. Install with: pip install openai")
        raise RuntimeError("OpenAI SDK not installed")
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY not set")
        raise ValueError("OPENAI_API_KEY environment variable is required")
    
    if len(image_files) != len(original_filenames):
        raise ValueError("Image list and filename list length mismatch")
    
    if len(image_files) > 5:
        raise ValueError("Maximum 5 images allowed per batch")
    
    if len(image_files) == 0:
        raise ValueError("At least one image is required")
    
    logger.info(f"Starting batch preprocessing for {len(image_files)} images (processing individually)")
    
    # Get storage backend
    storage = get_storage_backend(base_dir=output_dir)
    logger.info(f"Using storage backend: {type(storage).__name__}")
    
    async def process_one(image_bytes: bytes, original_name: str, index: int):
        """
        Process a single image: analyze, save, and return metadata.
        """
        try:
            # Analyze image individually
            analysis = await analyze_single_clothing_image(
                image_bytes,
                api_key,
                original_name
            )
            
            logger.info(f"Analysis result for image {index} ({original_name}): {json.dumps(analysis, indent=2)}")
            
            # Get category (validated in analyze_single_clothing_image)
            category = analysis.get("category", "UPPER_BODY").upper()
            
            # Build filename from analysis
            suggested_filename = analysis.get("suggested_filename", "")
            item_type = analysis.get("item_type", "")
            
            # Create base name from suggested_filename or item_type
            if suggested_filename:
                # Clean suggested filename
                base_name = re.sub(r'[^a-z0-9_]+', '_', suggested_filename.lower())
                base_name = re.sub(r'_+', '_', base_name).strip('_')
            elif item_type:
                # Create from item_type
                base_name = re.sub(r'[^a-z0-9_]+', '_', item_type.lower())
                base_name = re.sub(r'_+', '_', base_name).strip('_')
            else:
                # Fallback to original filename (without extension)
                base_name = os.path.splitext(original_name)[0]
                base_name = re.sub(r'[^a-z0-9_]+', '_', base_name.lower())
            
            # Get file extension from original or default to jpg
            ext = os.path.splitext(original_name)[1] or ".jpg"
            if ext.lower() not in ['.jpg', '.jpeg', '.png', '.webp']:
                ext = ".jpg"
            ext = ext.lower()
            
            # Create unique filename: category_base_name_uniqueid.ext
            # Example: footwear_brown_leather_boots_abc12345.jpg
            unique_suffix = uuid.uuid4().hex[:8]
            saved_filename = f"{category.lower()}_{base_name}_{unique_suffix}{ext}"
            
            # Limit filename length
            if len(saved_filename) > 200:
                name_part = f"{category.lower()}_{base_name}"
                if len(name_part) > 190:
                    name_part = name_part[:190]
                saved_filename = f"{name_part}_{unique_suffix}{ext}"
            
            # Build storage path with date prefix
            timestamp = datetime.now().strftime("%Y-%m-%d")
            storage_path = f"{CLOTHING_UPLOAD_SUBDIR}/{timestamp}/{saved_filename}"
            
            # Detect content type
            try:
                image = Image.open(io.BytesIO(image_bytes))
                format_map = {
                    'JPEG': 'image/jpeg',
                    'PNG': 'image/png',
                    'WEBP': 'image/webp',
                    'GIF': 'image/gif'
                }
                content_type = format_map.get(image.format, 'image/jpeg')
            except Exception:
                content_type = 'image/jpeg'
            
            # Handle filename conflicts
            counter = 1
            original_storage_path = storage_path
            while await storage.file_exists(storage_path):
                name, ext_part = os.path.splitext(original_storage_path.split('/')[-1])
                # Remove existing counter if present
                if name.endswith(f"-{counter-1}"):
                    name = name[:-len(f"-{counter-1}")]
                storage_path = f"{'/'.join(original_storage_path.split('/')[:-1])}/{name}-{counter}{ext_part}"
                counter += 1
                if counter > 100:  # Safety limit
                    break
            
            # Save file
            public_url = await storage.save_file(image_bytes, storage_path, content_type)
            logger.info(f"Saved image {index} to: {storage_path} -> {public_url}")
            
            # Build metadata dict for response
            metadata = {
                "category": category,
                "item_type": analysis.get("item_type", ""),
                "color": analysis.get("color", "unknown"),
                "style": analysis.get("style", "casual"),
                "short_description": analysis.get("short_description", ""),
                "description": analysis.get("short_description", ""),  # Alias for compatibility
                "tags": analysis.get("tags", []),
                "original_filename": original_name,
            }
            
            # Build response matching frontend expectations
            item_type = analysis.get("item_type", "")
            short_description = analysis.get("short_description", "")
            
            return {
                "status": "success",
                "index": index,
                "original_filename": original_name,
                "saved_filename": storage_path.split('/')[-1],  # Just the filename
                "filename": storage_path.split('/')[-1],  # Alias for compatibility
                "file_url": public_url,
                "url": public_url,  # Alias for compatibility
                "storage_path": storage_path,
                # Top-level fields that frontend expects
                "category": category,
                "subcategory": item_type,  # Frontend maps this to analysis.item_type
                "description": short_description,
                "color": analysis.get("color", "unknown"),
                "style": analysis.get("style", "casual"),
                "tags": analysis.get("tags", []),
                "recommended_filename": analysis.get("suggested_filename", ""),
                # Full analysis object (for detailed metadata)
                "analysis": {
                    "category": category,
                    "item_type": item_type,
                    "color": analysis.get("color", "unknown"),
                    "style": analysis.get("style", "casual"),
                    "description": short_description,
                    "short_description": short_description,
                    "tags": analysis.get("tags", []),
                    "suggested_filename": analysis.get("suggested_filename", ""),
                },
                "metadata": metadata
            }
            
        except Exception as e:
            logger.error(f"Error processing image {index} ({original_name}): {e}", exc_info=True)
            return {
                "status": "error",
                "index": index,
                "original_filename": original_name,
                "error": str(e),
                "analysis": {
                    "category": "UPPER_BODY",  # Safe fallback
                    "item_type": "unknown",
                    "description": "Failed to analyze",
                }
            }
    
    # Process all images in parallel
    tasks = [
        process_one(image_bytes, original_name, idx)
        for idx, (image_bytes, original_name) in enumerate(zip(image_files, original_filenames))
    ]
    
    results = await asyncio.gather(*tasks)
    
    logger.info(f"Batch preprocessing complete: {len(results)} items processed")
    
    # Log summary of categories
    categories = [r.get("analysis", {}).get("category", "unknown") for r in results if r.get("status") == "success"]
    logger.info(f"Categories detected: {categories}")
    
    return results
