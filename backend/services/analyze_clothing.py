import os
import base64
import asyncio
import json
import re
import logging
import hashlib
from typing import Dict, Any, Optional
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
import io
from datetime import datetime

logger = logging.getLogger(__name__)

# Try to import piexif for better EXIF support
try:
    import piexif
    PIEXIF_AVAILABLE = True
except ImportError:
    PIEXIF_AVAILABLE = False
    logger.warning("piexif not available. EXIF embedding will be limited. Install with: pip install piexif")

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
        Analyze this clothing item image thoroughly and extract comprehensive metadata. Pay special attention to the item type and all visual characteristics.
        
        CATEGORY CLASSIFICATION RULES (CRITICAL - be accurate):
        - "shoes": Any footwear (boots, sneakers, sandals, heels, flats, etc.) - even if only part of the shoe is visible
        - "lower_body": Pants, jeans, shorts, skirts, leggings, trousers - anything worn on legs/waist down
        - "upper_body": Shirts, t-shirts, blouses, tops, sweaters, hoodies - anything worn on torso/upper body
        - "outerwear": Jackets, coats, blazers, cardigans worn over other clothing
        - "dresses": Full-body garments (dresses, jumpsuits, rompers)
        - "accessories": Hats, caps, bags, belts, jewelry, scarves, gloves
        
        IMPORTANT: Look carefully at what the item actually is. If you see boots, shoes, or any footwear, use "shoes". 
        If you see pants, jeans, or legwear, use "lower_body". Do NOT default to "upper_body" unless it's actually a top/shirt.
        
        Provide comprehensive information in JSON format:
        {
            "category": "upper_body" | "lower_body" | "dresses" | "outerwear" | "accessories" | "shoes",
            "detailed_description": "A very detailed description including: exact color(s), style (casual/formal/sporty/etc.), specific type (t-shirt, jeans, dress, boots, sneakers, etc.), material/fabric, fit (slim/loose/regular), patterns, brand if visible, and any distinctive features. This description will be used for AI image generation, so be very specific.",
            "color": "primary color(s) - be specific (e.g., 'navy blue', 'charcoal gray', 'beige')",
            "style": "style description (casual, formal, sporty, vintage, modern, etc.)",
            "material": "fabric/material type (leather, cotton, denim, polyester, wool, etc.)",
            "fit": "fit type (slim, loose, regular, oversized, relaxed, etc.)",
            "patterns": "any patterns or prints (solid, striped, floral, graphic, logo, etc.)",
            "brand": "brand name if visible, otherwise 'unknown'",
            "season": "appropriate season (spring, summer, fall, winter, all-season)",
            "occasion": "suitable occasions (casual, formal, party, work, athletic, etc.)",
            "pose": "describe how the item is displayed (laid flat, on hanger, on model, folded, etc.)",
            "background": "describe the background (white, textured, outdoor, indoor, studio, etc.)",
            "lighting": "describe the lighting (natural, studio, soft, harsh, etc.)",
            "angle": "camera angle (front view, side view, top down, detail shot, etc.)",
            "texture": "visible texture details (smooth, rough, distressed, shiny, matte, etc.)",
            "details": "notable details (buttons, zippers, pockets, seams, stitching, logos, etc.)",
            "condition": "item condition (new, worn, vintage, distressed, etc.)"
        }
        
        Be extremely detailed in all fields - include every visible detail that would help identify and recreate this clothing item accurately.
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
        
        # Validate and correct category if needed (fallback logic)
        valid_categories = ["upper_body", "lower_body", "dresses", "outerwear", "accessories", "shoes"]
        if category not in valid_categories:
            # Try to infer from description if category is invalid
            description_lower = analysis.get("detailed_description", "").lower()
            if any(word in description_lower for word in ["boot", "shoe", "sneaker", "heel", "sandal", "footwear"]):
                category = "shoes"
                logger.info(f"Corrected category to 'shoes' based on description for {original_filename}")
            elif any(word in description_lower for word in ["pant", "jean", "trouser", "short", "skirt", "legging"]):
                category = "lower_body"
                logger.info(f"Corrected category to 'lower_body' based on description for {original_filename}")
            elif any(word in description_lower for word in ["dress", "jumpsuit", "romper"]):
                category = "dresses"
                logger.info(f"Corrected category to 'dresses' based on description for {original_filename}")
            elif any(word in description_lower for word in ["jacket", "coat", "blazer", "cardigan"]):
                category = "outerwear"
                logger.info(f"Corrected category to 'outerwear' based on description for {original_filename}")
            elif any(word in description_lower for word in ["hat", "cap", "bag", "belt", "scarf", "glove"]):
                category = "accessories"
                logger.info(f"Corrected category to 'accessories' based on description for {original_filename}")
            else:
                category = "upper_body"  # Default fallback
                logger.warning(f"Using default category 'upper_body' for {original_filename}")
        
        color = analysis.get("color", "unknown").lower().replace(" ", "_").replace("/", "_")
        style = analysis.get("style", "unknown").lower().replace(" ", "_").replace("/", "_")
        
        # Create a clean filename (remove special characters)
        color = re.sub(r'[^a-z0-9_]', '', color)
        style = re.sub(r'[^a-z0-9_]', '', style)
        
        # Use a simple hash for uniqueness
        filename_hash = hashlib.md5(original_filename.encode()).hexdigest()[:8]
        suggested_filename = f"{category}_{color}_{style}_{filename_hash}.jpg"
        
        # Create comprehensive metadata for Gemini 3 Pro and embedding
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
            "pose": analysis.get("pose", "unknown"),
            "background": analysis.get("background", "unknown"),
            "lighting": analysis.get("lighting", "unknown"),
            "angle": analysis.get("angle", "unknown"),
            "texture": analysis.get("texture", "unknown"),
            "details": analysis.get("details", "none"),
            "condition": analysis.get("condition", "unknown"),
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


def embed_metadata_in_image(image_bytes: bytes, metadata: Dict[str, Any]) -> bytes:
    """
    Embeds metadata into an image file using EXIF and XMP data.
    
    Args:
        image_bytes: Original image file bytes
        metadata: Dictionary containing metadata to embed
        
    Returns:
        bytes: Image bytes with embedded metadata
    """
    try:
        # Open image from bytes
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert metadata to JSON string for embedding
        metadata_json = json.dumps(metadata, indent=2)
        
        # Create a new image with embedded metadata
        output = io.BytesIO()
        
        # For JPEG images, use EXIF to embed metadata
        if image.format == 'JPEG':
            if PIEXIF_AVAILABLE:
                try:
                    # Load existing EXIF or create new
                    try:
                        exif_dict = piexif.load(image_bytes)
                    except:
                        exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
                    
                    # Embed metadata in EXIF UserComment (tag 37510)
                    # Store JSON in ImageDescription (tag 270) and UserComment
                    exif_dict["0th"][piexif.ImageIFD.ImageDescription] = metadata_json.encode('utf-8')
                    exif_dict["Exif"][piexif.ExifIFD.UserComment] = metadata_json.encode('utf-8')
                    
                    # Add custom tags for key metadata fields
                    # Store category, color, style in EXIF tags
                    if metadata.get("category"):
                        exif_dict["0th"][piexif.ImageIFD.Software] = f"ChangeRoom-{metadata['category']}".encode('utf-8')
                    
                    # Convert EXIF dict to bytes
                    exif_bytes = piexif.dump(exif_dict)
                    
                    # Save image with EXIF
                    image.save(output, format='JPEG', quality=95, exif=exif_bytes)
                except Exception as e:
                    logger.warning(f"Error embedding EXIF with piexif: {e}. Falling back to basic save.")
                    # Fallback: save without EXIF
                    image.save(output, format='JPEG', quality=95)
            else:
                # Fallback: try to preserve existing EXIF
                exif_bytes = image.info.get('exif')
                if exif_bytes:
                    image.save(output, format='JPEG', quality=95, exif=exif_bytes)
                else:
                    image.save(output, format='JPEG', quality=95)
            
        elif image.format == 'PNG':
            # PNG supports text chunks
            # Store metadata as a text chunk
            png_info = image.info.copy()
            png_info['clothing_metadata'] = metadata_json
            # Also add individual fields as text chunks for better compatibility
            for key, value in metadata.items():
                if isinstance(value, (str, int, float)):
                    png_info[f'clothing_{key}'] = str(value)
            image.save(output, format='PNG', **png_info)
        else:
            # For other formats, just save the image
            image.save(output, format=image.format or 'JPEG')
        
        output.seek(0)
        return output.read()
        
    except Exception as e:
        logger.error(f"Error embedding metadata in image: {e}", exc_info=True)
        # Return original bytes if embedding fails
        return image_bytes


async def save_image_with_metadata(
    image_bytes: bytes,
    metadata: Dict[str, Any],
    output_dir: str = "uploads",
    suggested_filename: Optional[str] = None
) -> Dict[str, Any]:
    """
    Saves an image with embedded metadata and proper naming.
    
    Args:
        image_bytes: Original image file bytes
        metadata: Metadata dictionary to embed
        output_dir: Directory to save the image
        suggested_filename: Suggested filename from analysis (optional)
        
    Returns:
        Dictionary with saved file path and metadata
    """
    try:
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate filename if not provided
        if not suggested_filename:
            category = metadata.get("category", "unknown")
            color = metadata.get("color", "unknown").lower().replace(" ", "_")
            style = metadata.get("style", "unknown").lower().replace(" ", "_")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename_hash = hashlib.md5(image_bytes).hexdigest()[:8]
            suggested_filename = f"{category}_{color}_{style}_{timestamp}_{filename_hash}.jpg"
        
        # Clean filename (remove invalid characters)
        suggested_filename = re.sub(r'[<>:"/\\|?*]', '_', suggested_filename)
        
        # Ensure .jpg extension
        if not suggested_filename.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
            suggested_filename = f"{os.path.splitext(suggested_filename)[0]}.jpg"
        
        # Embed metadata into image
        image_with_metadata = embed_metadata_in_image(image_bytes, metadata)
        
        # Save image
        file_path = os.path.join(output_dir, suggested_filename)
        with open(file_path, 'wb') as f:
            f.write(image_with_metadata)
        
        # Also save metadata as separate JSON file for easy retrieval
        metadata_file_path = os.path.join(output_dir, f"{os.path.splitext(suggested_filename)[0]}_metadata.json")
        with open(metadata_file_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Saved image with metadata: {file_path}")
        
        return {
            "file_path": file_path,
            "filename": suggested_filename,
            "metadata_file": metadata_file_path,
            "metadata": metadata,
            "size_bytes": len(image_with_metadata)
        }
        
    except Exception as e:
        logger.error(f"Error saving image with metadata: {e}", exc_info=True)
        raise


async def analyze_and_save_clothing_item(
    image_bytes: bytes,
    original_filename: str = "",
    output_dir: str = "uploads",
    save_file: bool = True
) -> Dict[str, Any]:
    """
    Complete workflow: analyze clothing item, embed metadata, and save with proper naming.
    
    Args:
        image_bytes: Image file bytes
        original_filename: Original filename for context
        output_dir: Directory to save processed images
        save_file: Whether to save the file to disk (default: True)
        
    Returns:
        Dictionary with analysis results and file information
    """
    # Analyze the clothing item
    analysis_result = await analyze_clothing_item(image_bytes, original_filename)
    
    if save_file and "error" not in analysis_result:
        # Save image with embedded metadata
        save_result = await save_image_with_metadata(
            image_bytes,
            analysis_result.get("metadata", {}),
            output_dir,
            analysis_result.get("suggested_filename")
        )
        
        # Merge save results with analysis results
        analysis_result["saved_file"] = save_result.get("file_path")
        analysis_result["saved_filename"] = save_result.get("filename")
        analysis_result["metadata_file"] = save_result.get("metadata_file")
    
        return analysis_result


def read_metadata_from_image(image_path: str) -> Optional[Dict[str, Any]]:
    """
    Reads embedded metadata from an image file.
    
    Args:
        image_path: Path to the image file
        
    Returns:
        Dictionary with metadata if found, None otherwise
    """
    try:
        image = Image.open(image_path)
        
        # Try to read from EXIF (JPEG)
        if image.format == 'JPEG' and PIEXIF_AVAILABLE:
            try:
                exif_dict = piexif.load(image_path)
                # Try to read from UserComment
                if piexif.ExifIFD.UserComment in exif_dict.get("Exif", {}):
                    metadata_json = exif_dict["Exif"][piexif.ExifIFD.UserComment]
                    if isinstance(metadata_json, bytes):
                        metadata_json = metadata_json.decode('utf-8')
                    return json.loads(metadata_json)
                # Try ImageDescription
                elif piexif.ImageIFD.ImageDescription in exif_dict.get("0th", {}):
                    metadata_json = exif_dict["0th"][piexif.ImageIFD.ImageDescription]
                    if isinstance(metadata_json, bytes):
                        metadata_json = metadata_json.decode('utf-8')
                    return json.loads(metadata_json)
            except Exception as e:
                logger.debug(f"Could not read EXIF metadata: {e}")
        
        # Try to read from PNG text chunks
        if image.format == 'PNG' and 'clothing_metadata' in image.info:
            try:
                metadata_json = image.info['clothing_metadata']
                return json.loads(metadata_json)
            except Exception as e:
                logger.debug(f"Could not read PNG metadata: {e}")
        
        # Try to read from associated JSON file
        json_path = f"{os.path.splitext(image_path)[0]}_metadata.json"
        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        return None
        
    except Exception as e:
        logger.error(f"Error reading metadata from image: {e}", exc_info=True)
        return None

