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


def _extract_specific_item_type(description: str, category: str) -> str:
    """
    Extracts specific item type from description for better filename generation.
    Returns user-friendly names like 'boots', 'shirt', 'hat', 'pants', 'shorts', 'dress', 'skirt'.
    """
    description_lower = description.lower()
    
    # Map to specific item types based on category and description
    if category == "shoes":
        if any(word in description_lower for word in ["boot", "combat boot", "hiking boot", "work boot"]):
            return "boots"
        elif any(word in description_lower for word in ["sneaker", "trainer", "athletic shoe", "running shoe"]):
            return "sneakers"
        elif any(word in description_lower for word in ["sandal", "flip-flop"]):
            return "sandals"
        elif any(word in description_lower for word in ["heel", "pump", "stiletto"]):
            return "heels"
        elif any(word in description_lower for word in ["flat", "ballet flat"]):
            return "flats"
        elif any(word in description_lower for word in ["loafer", "oxford"]):
            return "loafers"
        else:
            return "shoes"
    
    elif category == "lower_body":
        if any(word in description_lower for word in ["short", "bermuda", "cargo short"]):
            return "shorts"
        elif any(word in description_lower for word in ["skirt", "mini skirt", "pencil skirt", "a-line skirt"]):
            return "skirt"
        elif any(word in description_lower for word in ["jean", "denim"]):
            return "jeans"
        elif any(word in description_lower for word in ["pant", "trouser", "slack"]):
            return "pants"
        elif any(word in description_lower for word in ["legging", "yoga pant"]):
            return "leggings"
        else:
            return "pants"
    
    elif category == "upper_body":
        if any(word in description_lower for word in ["t-shirt", "tee", "tshirt"]):
            return "tshirt"
        elif any(word in description_lower for word in ["shirt", "button-down", "dress shirt"]):
            return "shirt"
        elif any(word in description_lower for word in ["blouse"]):
            return "blouse"
        elif any(word in description_lower for word in ["sweater", "pullover"]):
            return "sweater"
        elif any(word in description_lower for word in ["tank top", "camisole"]):
            return "tank"
        elif any(word in description_lower for word in ["polo"]):
            return "polo"
        else:
            return "shirt"
    
    elif category == "accessories":
        if any(word in description_lower for word in ["hat", "cap", "baseball cap", "beanie"]):
            return "hat"
        elif any(word in description_lower for word in ["bag", "purse", "backpack", "handbag"]):
            return "bag"
        elif any(word in description_lower for word in ["belt"]):
            return "belt"
        elif any(word in description_lower for word in ["scarf"]):
            return "scarf"
        else:
            return "accessory"
    
    elif category == "dresses":
        if any(word in description_lower for word in ["dress", "gown", "frock"]):
            return "dress"
        elif any(word in description_lower for word in ["jumpsuit"]):
            return "jumpsuit"
        elif any(word in description_lower for word in ["romper"]):
            return "romper"
        else:
            return "dress"
    
    elif category == "outerwear":
        if any(word in description_lower for word in ["jacket", "bomber", "denim jacket"]):
            return "jacket"
        elif any(word in description_lower for word in ["coat", "trench coat", "overcoat"]):
            return "coat"
        elif any(word in description_lower for word in ["blazer"]):
            return "blazer"
        elif any(word in description_lower for word in ["hoodie", "hoody"]):
            return "hoodie"
        else:
            return "jacket"
    
    return "unknown"


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
        You are an expert clothing classifier. Your ONLY job is to identify what clothing item is in this image and classify it correctly.
        
        ⚠️ CRITICAL: DO NOT default to "upper_body". Look at the image carefully and identify the PRIMARY item.
        
        STEP 1: Identify the PRIMARY item in the image. What is it?
        - Is it footwear (boots, shoes, sneakers)? → "shoes"
        - Is it legwear (pants, jeans, shorts, skirt)? → "lower_body"  
        - Is it a hat, cap, bag, or accessory? → "accessories"
        - Is it a jacket, coat, or outer layer? → "outerwear"
        - Is it a dress or full-body garment? → "dresses"
        - Is it a shirt, t-shirt, or top? → "upper_body"
        
        STEP 2: Classify based on these EXACT rules:
        
        "shoes" = ANY footwear visible:
        - Boots (work boots, combat boots, hiking boots, ankle boots, etc.)
        - Sneakers, trainers, athletic shoes, running shoes
        - Sandals, flip-flops, slides
        - Heels, pumps, flats, loafers, oxfords
        - If you see: laces, soles, heels, toe caps, eyelets, shoelaces → "shoes"
        - Even if only part of a boot/shoe is visible → "shoes"
        
        "lower_body" = ANY leg/waist garment:
        - Pants, trousers, jeans, slacks, cargo pants
        - Shorts (any length: bermuda, cargo shorts, etc.)
        - Skirts (mini, midi, maxi, pencil, A-line, etc.)
        - Leggings, tights, yoga pants, sweatpants, joggers
        - If you see: waistband, belt loops, leg openings, inseam, cargo pockets → "lower_body"
        
        "accessories" = Non-garment items:
        - Hats, caps, baseball caps, beanies, berets
        - Bags, purses, backpacks, handbags
        - Belts, watches, jewelry
        - Scarves, gloves, mittens
        - If it's a hat/cap → "accessories" (NOT upper_body!)
        
        "outerwear" = Garments worn OVER other clothing:
        - Jackets (denim, leather, bomber, etc.)
        - Coats (winter, trench, overcoat, etc.)
        - Blazers, suit jackets
        - Hoodies (if clearly outerwear style)
        - Vests, gilets, windbreakers
        
        "dresses" = Full-body garments:
        - Dresses (any style)
        - Jumpsuits, rompers
        - Overalls (if full-body)
        
        "upper_body" = Torso garments ONLY:
        - T-shirts, shirts, blouses, tops
        - Sweaters, pullovers
        - Tank tops, camisoles
        - Polo shirts, button-down shirts
        - ONLY use this if it's clearly a top/shirt, NOT if it's boots, pants, or a hat
        
        ⚠️ COMMON MISTAKES TO AVOID:
        - Boots are NOT "upper_body" → they are "shoes"
        - Pants are NOT "upper_body" → they are "lower_body"
        - Hats/caps are NOT "upper_body" → they are "accessories"
        - If you see boots in the image → "shoes"
        - If you see pants in the image → "lower_body"
        - If you see a hat/cap in the image → "accessories"
        
        EXAMPLES:
        Image shows brown leather boots → category: "shoes" (NOT upper_body)
        Image shows black baseball cap → category: "accessories" (NOT upper_body)
        Image shows blue cargo pants → category: "lower_body" (NOT upper_body)
        Image shows red t-shirt → category: "upper_body" (CORRECT)
        Image shows zip-up hoodie → category: "outerwear" or "upper_body"
        
        Now analyze the image and provide comprehensive information in JSON format:
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
            model="gpt-4o",  # Latest and most capable vision model - best for image classification
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert clothing classifier. Your primary task is to accurately identify and classify clothing items. Always look carefully at what the item actually is - boots are shoes, pants are lower_body, hats are accessories. Do NOT default to upper_body."
                },
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
                                "url": f"data:image/{mime_type};base64,{image_base64}",
                                "detail": "high"  # High detail mode for maximum image analysis accuracy
                            }
                        }
                    ]
                }
            ],
            max_tokens=2000,  # Increased for comprehensive descriptions
            temperature=0.0,  # Zero temperature for most deterministic and consistent classification
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
        category = analysis.get("category", "unknown").strip().lower()
        original_category = category
        
        # Aggregate ALL text fields for comprehensive keyword matching
        # This includes description, material, style, details, item type, etc.
        description_lower = analysis.get("detailed_description", "").lower()
        description_lower += " " + analysis.get("material", "").lower()
        description_lower += " " + analysis.get("style", "").lower()
        description_lower += " " + analysis.get("details", "").lower()
        description_lower += " " + analysis.get("color", "").lower()
        description_lower += " " + analysis.get("texture", "").lower()
        # Add any other descriptive fields that might contain keywords
        
        # Comprehensive category validation and correction
        valid_categories = ["upper_body", "lower_body", "dresses", "outerwear", "accessories", "shoes"]
        corrected = False
        
        # Define comprehensive keyword sets for each category with synonyms and variations
        shoes_keywords = [
            # Core footwear terms
            "boot", "boots", "shoe", "shoes", "sneaker", "sneakers", "footwear", "foot gear",
            # Specific types
            "heel", "heels", "sandal", "sandals", "lace-up", "lace up", "oxford", "oxfords",
            "loafer", "loafers", "pump", "pumps", "flat", "flats", "slipper", "slippers",
            "moccasin", "moccasins", "trainer", "trainers", "athletic shoe", "athletic shoes",
            "running shoe", "running shoes", "hiking boot", "hiking boots", "work boot", "work boots",
            "combat boot", "combat boots", "ankle boot", "ankle boots",
            # Shoe parts (strong indicators)
            "sole", "soles", "tread", "outsole", "outsoles", "insole", "insoles",
            "toe cap", "toe caps", "heel counter", "heel counters", "eyelets", "eyelets",
            "shoelace", "shoelaces", "lace", "laces", "tongue", "toe box", "arch support",
            # Action/context clues
            "worn on feet", "worn on foot", "foot", "feet", "step", "walking", "tread"
        ]
        
        lower_body_keywords = [
            # Core legwear terms
            "pant", "pants", "jean", "jeans", "trouser", "trousers", "short", "shorts",
            "skirt", "skirts", "legging", "leggings", "sweatpant", "sweatpants", "jogger", "joggers",
            # Specific types
            "cargo", "chino", "chinos", "khaki", "khakis", "dress pant", "dress pants",
            "capri", "bermuda short", "bermuda shorts", "bike short", "bike shorts",
            # Parts (strong indicators)
            "waistband", "waistbands", "crotch", "inseam", "inseams", "outseam", "outseams",
            "pant leg", "pant legs", "trouser leg", "trouser legs", "leg opening",
            "hem", "hems", "cuff", "cuffs", "zipper fly", "zipper flies", "button fly",
            "zipper", "zippers", "belt loop", "belt loops", "pocket", "pockets",
            # Context clues
            "worn on legs", "worn on waist", "worn from waist", "leg", "legs", "thigh", "thighs"
        ]
        
        accessories_keywords = [
            # Headwear
            "hat", "hats", "cap", "caps", "beanie", "beanies", "beret", "berets",
            "baseball cap", "baseball caps", "baseball hat", "baseball hats",
            "headband", "headbands", "bandana", "bandanas", "headwear", "head gear",
            # Bags
            "bag", "bags", "purse", "purses", "backpack", "backpacks", "handbag", "handbags",
            "tote", "totes", "clutch", "satchel", "satchels", "briefcase", "briefcases",
            # Belts & Jewelry
            "belt", "belts", "watch", "watches", "jewelry", "jewellery", "necklace", "necklaces",
            "bracelet", "bracelets", "ring", "rings", "earring", "earrings",
            # Other accessories
            "scarf", "scarves", "glove", "gloves", "mitten", "mittens", "sunglass", "sunglasses",
            "tie", "ties", "bow tie", "bow ties", "bowtie", "bowties", "cufflink", "cufflinks",
            "accessory", "accessories", "worn on head", "worn on wrist", "worn on neck"
        ]
        
        outerwear_keywords = [
            # Core outerwear
            "jacket", "jackets", "coat", "coats", "blazer", "blazers", "cardigan", "cardigans",
            "windbreaker", "windbreakers", "rain jacket", "rain jackets", "raincoat", "raincoats",
            # Specific types
            "bomber", "bombers", "parka", "parkas", "trench coat", "trench coats", "trenchcoat",
            "overcoat", "overcoats", "vest", "vests", "gilet", "gilets", "puffer", "puffers",
            "down jacket", "down jackets", "fleece", "hoodie", "hoodies", "sweatshirt", "sweatshirts",
            # Context clues
            "worn over", "worn on top", "outer layer", "outer garment"
        ]
        
        dresses_keywords = [
            # Core dresses
            "dress", "dresses", "gown", "gowns", "frock", "frocks",
            # One-piece garments
            "jumpsuit", "jumpsuits", "romper", "rompers", "overall", "overalls",
            "bodysuit", "bodysuits", "onesie", "onesies",
            # Context clues
            "one-piece", "one piece", "full-body", "full body", "from shoulder to"
        ]
        
        upper_body_keywords = [
            # Core tops
            "shirt", "shirts", "t-shirt", "t-shirts", "tshirt", "tshirts", "tee", "tees",
            "blouse", "blouses", "top", "tops", "sweater", "sweaters", "pullover", "pullovers",
            "tank top", "tank tops", "camisole", "camisoles", "polo", "polos",
            "button-down", "button-downs", "henley", "henleys", "turtleneck", "turtlenecks",
            # Specific types
            "crop top", "crop tops", "tube top", "tube tops", "halter top", "halter tops",
            # Context clues (weak - only use if no other category matches)
            "worn on torso", "worn on chest", "upper body", "upper-body"
        ]
        
        # AGGRESSIVE VALIDATION: Always validate category against description using keyword matching
        # This ensures misclassifications are caught regardless of what OpenAI returns
        logger.info(f"Validating category for {original_filename}: OpenAI returned '{category}'")
        logger.info(f"Description preview: {description_lower[:200]}")
        
        # Count keyword matches for each category
        shoes_matches = sum(1 for keyword in shoes_keywords if keyword in description_lower)
        lower_body_matches = sum(1 for keyword in lower_body_keywords if keyword in description_lower)
        accessories_matches = sum(1 for keyword in accessories_keywords if keyword in description_lower)
        outerwear_matches = sum(1 for keyword in outerwear_keywords if keyword in description_lower)
        dresses_matches = sum(1 for keyword in dresses_keywords if keyword in description_lower)
        upper_body_matches = sum(1 for keyword in upper_body_keywords if keyword in description_lower)
        
        # Create match scores dictionary
        match_scores = {
            "shoes": shoes_matches,
            "lower_body": lower_body_matches,
            "accessories": accessories_matches,
            "outerwear": outerwear_matches,
            "dresses": dresses_matches,
            "upper_body": upper_body_matches
        }
        
        logger.info(f"Keyword match scores for {original_filename}: {match_scores}")
        
        # Find category with highest match score
        max_matches = max(match_scores.values())
        keyword_determined_category = None
        
        # AGGRESSIVE CORRECTION: If we have keyword matches, ALWAYS use them over OpenAI's category
        # This is critical because OpenAI sometimes misclassifies boots/pants/hats as upper_body
        if max_matches > 0:
            # Get category with most keyword matches
            keyword_determined_category = max(match_scores, key=match_scores.get)
            
            # ALWAYS override OpenAI's category if keyword matching found a different category
            # This is especially important when OpenAI returns "upper_body" for boots/pants/hats
            if keyword_determined_category != category:
                logger.warning(f"⚠️ CORRECTING MISCLASSIFICATION: '{category}' → '{keyword_determined_category}' "
                             f"for {original_filename} (keyword matches: {match_scores})")
                category = keyword_determined_category
                corrected = True
            else:
                logger.info(f"✓ Keyword validation confirmed '{category}' for {original_filename} "
                          f"(matches: {match_scores[keyword_determined_category]})")
        else:
            # No keyword matches found - this is suspicious, log it
            if category == "upper_body":
                logger.warning(f"⚠️ WARNING: No keyword matches found and category is 'upper_body' for {original_filename}. "
                             f"This might be a misclassification. Description: {description_lower[:300]}")
            elif category not in valid_categories:
                logger.warning(f"No keyword matches found and invalid category '{category}' for {original_filename}")
                corrected = True
            else:
                logger.info(f"No keyword matches found for {original_filename}, using OpenAI category '{category}'")
        
        # If category is still invalid, try keyword matching as fallback
        if category not in valid_categories:
            if max_matches > 0 and keyword_determined_category:
                category = keyword_determined_category
                logger.info(f"Set category to '{category}' based on keyword matching for {original_filename}")
            else:
                # Last resort: default to upper_body but log warning
                category = "upper_body"
                logger.warning(f"Could not determine category for {original_filename}, defaulting to 'upper_body'. "
                             f"Description: {description_lower[:200]}")
        
        # Final validation
        if category not in valid_categories:
            category = "unknown"
            logger.error(f"Failed to determine valid category for {original_filename}")
        
        # Log final category decision
        logger.info(f"Final category for {original_filename}: '{category}' (corrected: {corrected}, original: {original_category})")
        
        # Extract specific item type from description for better filename
        item_type = _extract_specific_item_type(description_lower, category)
        logger.info(f"Extracted item_type for {original_filename}: '{item_type}'")
        
        color = analysis.get("color", "unknown").lower().replace(" ", "_").replace("/", "_")
        style = analysis.get("style", "unknown").lower().replace(" ", "_").replace("/", "_")
        
        # Create a clean filename (remove special characters)
        color = re.sub(r'[^a-z0-9_]', '', color)
        style = re.sub(r'[^a-z0-9_]', '', style)
        item_type = re.sub(r'[^a-z0-9_]', '', item_type)
        
        # Use a simple hash for uniqueness
        filename_hash = hashlib.md5(original_filename.encode()).hexdigest()[:8]
        
        # Build filename with specific item type if available
        if item_type and item_type != "unknown":
            suggested_filename = f"{category}_{item_type}_{color}_{filename_hash}.jpg"
        else:
            suggested_filename = f"{category}_{color}_{style}_{filename_hash}.jpg"
        
        # Create comprehensive metadata for Gemini 3 Pro and embedding
        metadata = {
            "category": category,
            "item_type": item_type,  # Specific type like "boots", "shirt", "hat", "pants", etc.
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
            "original_filename": original_filename,
            "classification_corrected": corrected  # Flag indicating if category was corrected
        }
        
        result = {
            "category": category,
            "item_type": item_type,  # User-friendly specific type
            "detailed_description": analysis.get("detailed_description", "clothing item"),
            "color": analysis.get("color", "unknown"),
            "style": analysis.get("style", "unknown"),
            "material": analysis.get("material", "unknown"),
            "fit": analysis.get("fit", "regular"),
            "metadata": metadata,
            "suggested_filename": suggested_filename,
            "full_analysis": analysis,
            "classification_corrected": corrected
        }
        
        logger.info(f"Returning analysis result for {original_filename}: category={category}, item_type={item_type}, filename={suggested_filename}")
        return result

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

