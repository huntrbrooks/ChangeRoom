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

# Valid body_regions - these match what the frontend expects
VALID_BODY_REGIONS = {
    "UPPER_BODY", "LOWER_BODY", "SHOES", "ACCESSORIES", "FULL_BODY",
    "upper_body", "lower_body", "shoes", "accessories", "full_body",
    # Legacy support
    "FOOTWEAR", "ACCESSORY", "footwear", "accessory"
}

CLOTHING_UPLOAD_SUBDIR = "clothing"


def normalize_clothing_classification(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Fix obviously wrong categories using simple keyword rules.
    
    This uses the item_type and description text that the model provides
    to override obviously wrong body_region classifications.
    """
    body = (data.get("body_region") or data.get("category") or "").upper().strip()
    item_type = (data.get("item_type") or "").lower()
    desc = (data.get("short_description") or "").lower()
    text = f"{item_type} {desc}"
    
    def contains(words):
        """Check if any of the words appear in the text."""
        return any(w in text for w in words)
    
    # Strongest constraints first - use keyword matching to force correct category
    
    # Shoes vocabulary - strongest keywords
    if contains(["boot", "boots", "shoe", "shoes", "sneaker", "sneakers",
                 "trainer", "trainers", "heel", "heels", "sandal", "sandals",
                 "loafer", "loafers", "high heel", "high-heels", "footwear",
                 "lace-up", "lace up", "sole", "soles"]):
        body = "SHOES"
        logger.info(f"Keyword correction: forced body_region to SHOES based on text: '{text[:100]}'")
    
    # Lower body vocabulary
    elif contains(["jean", "jeans", "trouser", "trousers", "pant", "pants",
                   "chino", "chinos", "shorts", "skirt", "skirts", "leggings",
                   "cargo", "waistband", "inseam", "hem"]):
        body = "LOWER_BODY"
        logger.info(f"Keyword correction: forced body_region to LOWER_BODY based on text: '{text[:100]}'")
    
    # Upper body vocabulary
    elif contains(["t shirt", "t-shirt", "tshirt", "tee", "tees", "shirt", "shirts",
                   "blouse", "top", "tops", "hoodie", "hoodies", "sweatshirt",
                   "jumper", "sweater", "jacket", "jackets", "coat", "coats",
                   "cardigan", "pullover", "henley", "polo"]):
        body = "UPPER_BODY"
        logger.info(f"Keyword correction: forced body_region to UPPER_BODY based on text: '{text[:100]}'")
    
    # Accessories vocabulary
    elif contains(["hat", "hats", "cap", "caps", "beanie", "beanies", "beret",
                   "belt", "belts", "scarf", "scarves", "bag", "bags",
                   "backpack", "handbag", "tie", "ties", "sunglasses"]):
        body = "ACCESSORIES"
        logger.info(f"Keyword correction: forced body_region to ACCESSORIES based on text: '{text[:100]}'")
    
    # Full body vocabulary
    elif contains(["dress", "dresses", "jumpsuit", "jumpsuits", "playsuit",
                   "overall", "overalls", "romper", "rompers"]):
        body = "FULL_BODY"
        logger.info(f"Keyword correction: forced body_region to FULL_BODY based on text: '{text[:100]}'")
    
    # Fall back if model gave some garbage
    valid = {"UPPER_BODY", "LOWER_BODY", "SHOES", "ACCESSORIES", "FULL_BODY"}
    if body not in valid:
        logger.warning(f"Invalid body_region '{body}', defaulting to UPPER_BODY")
        body = "UPPER_BODY"
    
    data["body_region"] = body
    # Keep category for backward compatibility
    data["category"] = body
    return data


async def analyze_single_clothing_image(
    image_bytes: bytes,
    api_key: str,
    original_filename: str = ""
) -> Dict[str, Any]:
    """
    Call OpenAI on a single image and return structured clothing metadata.
    
    This processes ONE image independently to ensure accurate categorization.
    Uses improved prompt and rule-based correction layer.
    
    Args:
        image_bytes: Image file bytes
        api_key: OpenAI API key
        original_filename: Original filename for context
        
    Returns:
        Dictionary with body_region, item_type, color, style, tags, etc.
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
    
    # Improved system prompt with explicit definitions
    system_prompt = """You are a fashion classifier for a virtual try on app.
There is exactly ONE primary clothing item in each image. Ignore any background or secondary items.

You must decide which part of the human body this item belongs to.

Allowed body_region values:
  - UPPER_BODY  (t shirts, shirts, hoodies, jumpers, jackets, coats, tops)
  - LOWER_BODY  (jeans, trousers, pants, shorts, skirts, leggings)
  - SHOES       (shoes, boots, sneakers, heels, sandals, trainers, loafers)
  - ACCESSORIES (hats, caps, beanies, belts, scarves, bags, backpacks, ties)
  - FULL_BODY   (dresses, jumpsuits, overalls, two piece sets that must be worn together)

Never label shirts, t shirts, hoodies or jackets as LOWER_BODY or SHOES.
Never label jeans, pants, or skirts as SHOES.
Boots, sneakers and heels are always SHOES.

Return ONLY valid JSON, no text before or after."""
    
    user_prompt = """Look carefully at the image and identify the one main clothing item.
Respond with JSON using exactly these keys:
{
  "body_region": "UPPER_BODY | LOWER_BODY | SHOES | ACCESSORIES | FULL_BODY",
  "item_type": "short plain english name e.g. 'brown leather boots'",
  "color": "main color or colors, e.g. 'dark brown'",
  "style": "short style summary, e.g. 'casual workwear'",
  "tags": ["tag1", "tag2", ...],
  "short_description": "one sentence description",
  "suggested_filename": "snake_case_filename_without_extension"
}
The body_region must strictly match the definitions above."""
    
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
            model="gpt-4o-mini",  # Cost-effective and accurate (can bump to gpt-4o if still misbehaves)
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
        
        # Apply rule-based correction layer to fix obvious misclassifications
        data = normalize_clothing_classification(data)
        
        # Log what we got after normalization
        body_region = data.get("body_region", "").upper()
        item_type = data.get("item_type", "")
        logger.info(f"Final analysis for {original_filename}: body_region={body_region}, item_type='{item_type}'")
        
        return data
        
    except Exception as e:
        logger.error(f"OpenAI analysis failed for {original_filename}: {e}", exc_info=True)
        # Try to infer body_region from filename as last resort
        filename_lower = original_filename.lower()
        inferred_body_region = None
        
        if any(kw in filename_lower for kw in ["boot", "shoe", "sneaker", "footwear", "heel"]):
            inferred_body_region = "SHOES"
        elif any(kw in filename_lower for kw in ["pant", "jean", "short", "skirt", "trouser", "legging"]):
            inferred_body_region = "LOWER_BODY"
        elif any(kw in filename_lower for kw in ["hat", "cap", "bag", "belt", "scarf"]):
            inferred_body_region = "ACCESSORIES"
        elif any(kw in filename_lower for kw in ["dress", "jumpsuit", "overall"]):
            inferred_body_region = "FULL_BODY"
        else:
            inferred_body_region = "UPPER_BODY"  # Default fallback
        
        logger.warning(f"Using inferred body_region '{inferred_body_region}' from filename for {original_filename} due to OpenAI error")
        
        return {
            "body_region": inferred_body_region,
            "category": inferred_body_region,  # For backward compatibility
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
            
            # Get body_region (normalized and validated in analyze_single_clothing_image + normalize function)
            body_region = analysis.get("body_region", analysis.get("category", "UPPER_BODY")).upper()
            
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
            
            # Create unique filename: body_region_base_name_uniqueid.ext
            # Example: shoes_brown_leather_boots_abc12345.jpg or upper_body_hoodie_def67890.jpg
            # Map SHOES to "shoes" for filename (instead of "footwear")
            filename_category_map = {
                "SHOES": "shoes",
                "FOOTWEAR": "shoes",
                "UPPER_BODY": "upper_body",
                "LOWER_BODY": "lower_body",
                "ACCESSORIES": "accessories",
                "ACCESSORY": "accessories",
                "FULL_BODY": "full_body"
            }
            category_for_filename = filename_category_map.get(body_region, body_region.lower())
            unique_suffix = uuid.uuid4().hex[:8]
            saved_filename = f"{category_for_filename}_{base_name}_{unique_suffix}{ext}"
            
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
            item_type = analysis.get("item_type", "")
            short_description = analysis.get("short_description", "")
            
            metadata = {
                "body_region": body_region,
                "category": body_region,  # For backward compatibility
                "item_type": item_type,
                "color": analysis.get("color", "unknown"),
                "style": analysis.get("style", "casual"),
                "short_description": short_description,
                "description": short_description,  # Alias for compatibility
                "tags": analysis.get("tags", []),
                "original_filename": original_name,
            }
            
            # Build response matching frontend expectations
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
                "body_region": body_region,
                "category": body_region,  # For backward compatibility
                "subcategory": item_type,  # Frontend maps this to analysis.item_type
                "description": short_description,
                "color": analysis.get("color", "unknown"),
                "style": analysis.get("style", "casual"),
                "tags": analysis.get("tags", []),
                "recommended_filename": analysis.get("suggested_filename", ""),
                # Full analysis object (for detailed metadata)
                "analysis": {
                    "body_region": body_region,
                    "category": body_region,  # For backward compatibility
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
            # Try to infer body_region from filename even on error
            filename_lower = original_name.lower()
            inferred_body_region = "UPPER_BODY"  # Default fallback
            
            if any(kw in filename_lower for kw in ["boot", "shoe", "sneaker", "footwear", "heel"]):
                inferred_body_region = "SHOES"
            elif any(kw in filename_lower for kw in ["pant", "jean", "short", "skirt", "trouser", "legging"]):
                inferred_body_region = "LOWER_BODY"
            elif any(kw in filename_lower for kw in ["hat", "cap", "bag", "belt", "scarf"]):
                inferred_body_region = "ACCESSORIES"
            elif any(kw in filename_lower for kw in ["dress", "jumpsuit", "overall"]):
                inferred_body_region = "FULL_BODY"
            
            logger.warning(f"Using inferred body_region '{inferred_body_region}' for failed image {original_name}")
            
            return {
                "status": "error",
                "index": index,
                "original_filename": original_name,
                "error": str(e),
                "body_region": inferred_body_region,
                "category": inferred_body_region,  # For backward compatibility
                "analysis": {
                    "body_region": inferred_body_region,
                    "category": inferred_body_region,
                    "item_type": "unknown",
                    "description": f"Failed to analyze: {str(e)}",
                }
            }
    
    # Process all images in parallel
    tasks = [
        process_one(image_bytes, original_name, idx)
        for idx, (image_bytes, original_name) in enumerate(zip(image_files, original_filenames))
    ]
    
    results = await asyncio.gather(*tasks)
    
    logger.info(f"Batch preprocessing complete: {len(results)} items processed")
    
    # Log summary of body_regions
    body_regions = [r.get("body_region") or r.get("analysis", {}).get("body_region") or r.get("category", "unknown") for r in results if r.get("status") == "success"]
    logger.info(f"Body regions detected: {body_regions}")
    
    return results
