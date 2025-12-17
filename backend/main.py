from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from typing import List, Optional
import uvicorn
import os
import sys
import logging
import json
import json as json_lib
import asyncio
from pathlib import Path
from dotenv import load_dotenv
import time

# Ensure UTF-8 encoding for all string operations
import locale
import io
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Add current directory to path to find services module
sys.path.insert(0, str(Path(__file__).parent))

from services import vton, gemini, shop, analyze_clothing, analyze_user
from services import preprocess_clothing

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="IGetDressed.Online API")

# Configure CORS
# For production, specify exact origins in ALLOWED_ORIGINS environment variable
# Format: comma-separated list, e.g., "https://app.example.com,https://www.example.com"
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "")
if allowed_origins_str:
    allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]
else:
    # Default: allow localhost for development and known production URLs
    # For stricter security in production, set ALLOWED_ORIGINS environment variable
    allowed_origins = [
        "http://localhost:3000", 
        "http://127.0.0.1:3000",
        "https://igetdressed.online",
        "https://www.igetdressed.online",
        "https://getdressed.online",
        "https://www.getdressed.online",
    ]
    # Add production frontend URL if NEXT_PUBLIC_APP_URL is set (for custom deployments)
    production_frontend_url = os.getenv("NEXT_PUBLIC_APP_URL", "")
    if production_frontend_url and production_frontend_url.startswith("https://"):
        if production_frontend_url not in allowed_origins:
            allowed_origins.append(production_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,  # Specific origins for production
    allow_credentials=True,  # Can enable when origins are specific
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# Create uploads directory if it doesn't exist
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)

# File upload security limits
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 10 * 1024 * 1024))  # 10MB default
MAX_TOTAL_SIZE = int(os.getenv("MAX_TOTAL_SIZE", 50 * 1024 * 1024))  # 50MB default
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

_rate_buckets: dict[str, tuple[int, float]] = {}

def check_rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    """
    Simple best-effort in-memory rate limiter (per-instance).
    Returns True if allowed, False if rate-limited.
    """
    now = time.time()
    count, expires_at = _rate_buckets.get(key, (0, 0.0))
    if expires_at <= now:
        _rate_buckets[key] = (1, now + window_seconds)
        return True
    if count >= limit:
        return False
    _rate_buckets[key] = (count + 1, expires_at)
    return True

def get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip() or "unknown"
    return request.headers.get("x-real-ip") or request.client.host if request.client else "unknown"

def validate_image_file(file: UploadFile) -> tuple[bool, str]:
    """Validate that uploaded file is a valid image"""
    if not file.content_type or file.content_type.lower() not in ALLOWED_IMAGE_TYPES:
        return False, f"Invalid file type. Allowed types: {', '.join(ALLOWED_IMAGE_TYPES)}"
    
    if not file.filename:
        return False, "Filename is required"
    
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        return False, f"Invalid file extension. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
    
    return True, ""

# Mount static files for serving uploaded images
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

@app.get("/")
async def root():
    return {"message": "IGetDressed.Online API is running"}

@app.post("/api/try-on")
async def try_on(
    request: Request,
    user_image: Optional[UploadFile] = File(None),  # Backward compatibility
    user_images: Optional[List[UploadFile]] = File(None), # New: Multiple user images
    clothing_images: Optional[List[UploadFile]] = File(None),  # Multiple clothing images (up to 5)
    clothing_image: Optional[UploadFile] = File(None),  # Single image for backward compatibility
    category: Optional[str] = Form(None),
    garment_metadata: Optional[str] = Form(None),  # JSON string of metadata
    clothing_file_urls: Optional[str] = Form(None),  # Comma-separated URLs to saved files
    clothing_file_url: Optional[str] = Form(None),  # Single URL for backward compatibility
    main_index: Optional[int] = Form(None)  # Optional main reference index from frontend
):
    """
    Virtual try-on endpoint. Accepts user image(s) and clothing image(s).
    Supports multiple user images (up to 5) for better context.
    Supports multiple clothing items for full outfit try-on.
    """
    # Rate limit per IP to protect expensive endpoint (best-effort)
    ip = get_client_ip(request)
    if not check_rate_limit(f"try-on:{ip}", limit=10, window_seconds=60):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again shortly.")
    try:
        # Collect user images
        user_image_files = []
        user_quality_flags = []
        MIN_DIM_HARD_FAIL = 400  # px
        MIN_DIM_WARN = 900      # px
        total_size = 0
        
        # Handle multiple uploaded user images
        if user_images:
            for img in user_images:
                # Validate user image
                is_valid, error_msg = validate_image_file(img)
                if not is_valid:
                    raise HTTPException(status_code=400, detail=f"User image validation failed: {error_msg}")
                
                # Read and validate size
                img_bytes = await img.read()
                if len(img_bytes) > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413, 
                        detail=f"User image too large. Maximum size: {MAX_FILE_SIZE / (1024*1024):.1f}MB"
                    )
                total_size += len(img_bytes)
                img.file.seek(0)
                # Resolution check
                try:
                    from PIL import Image as PILImage  # type: ignore
                    pil_img = PILImage.open(io.BytesIO(img_bytes))
                    w, h = pil_img.size
                    min_dim = min(w, h)
                    if min_dim < MIN_DIM_HARD_FAIL:
                        raise HTTPException(
                            status_code=422,
                            detail="User image resolution too low. Please upload a higher-resolution photo."
                        )
                    user_quality_flags.append({
                        "name": img.filename or f"user_{len(user_quality_flags)+1}",
                        "width": w,
                        "height": h,
                        "min_dim": min_dim,
                        "low_res": min_dim < MIN_DIM_WARN
                    })
                except HTTPException:
                    raise
                except Exception:
                    user_quality_flags.append({
                        "name": img.filename or f"user_{len(user_quality_flags)+1}",
                        "width": None,
                        "height": None,
                        "min_dim": None,
                        "low_res": False
                    })
                user_image_files.append(img.file)
                
        # Handle single user image (backward compatibility) if no list provided
        elif user_image:
             is_valid, error_msg = validate_image_file(user_image)
             if not is_valid:
                 raise HTTPException(status_code=400, detail=error_msg)
             
             user_image_bytes = await user_image.read()
             if len(user_image_bytes) > MAX_FILE_SIZE:
                 raise HTTPException(
                     status_code=413, 
                     detail=f"User image too large. Maximum size: {MAX_FILE_SIZE / (1024*1024):.1f}MB"
                 )
             total_size += len(user_image_bytes)
             try:
                 from PIL import Image as PILImage  # type: ignore
                 pil_img = PILImage.open(io.BytesIO(user_image_bytes))
                 w, h = pil_img.size
                 min_dim = min(w, h)
                 if min_dim < MIN_DIM_HARD_FAIL:
                     raise HTTPException(
                         status_code=422,
                         detail="User image resolution too low. Please upload a higher-resolution photo."
                     )
                 user_quality_flags.append({
                     "name": user_image.filename or "user_image",
                     "width": w,
                     "height": h,
                     "min_dim": min_dim,
                     "low_res": min_dim < MIN_DIM_WARN
                 })
             except HTTPException:
                 raise
             except Exception:
                 user_quality_flags.append({
                     "name": user_image.filename or "user_image",
                     "width": None,
                     "height": None,
                     "min_dim": None,
                     "low_res": False
                 })
             user_image.file.seek(0)
             user_image_files.append(user_image.file)
             
        if not user_image_files:
             raise HTTPException(status_code=400, detail="At least one user image is required")

        # Limit to 5 user images
        if len(user_image_files) > 5:
            logger.warning(f"Received {len(user_image_files)} user images, limiting to 5")
            user_image_files = user_image_files[:5]
        
        # total_size already includes user images; continue accumulating clothing to enforce MAX_TOTAL_SIZE.
        
        # Collect all clothing images from various sources
        clothing_image_files = []
        
        # Handle multiple uploaded images (new format)
        if clothing_images:
            for img in clothing_images:
                # Validate clothing image
                is_valid, error_msg = validate_image_file(img)
                if not is_valid:
                    raise HTTPException(status_code=400, detail=f"Clothing image validation failed: {error_msg}")
                
                # Validate size
                img_bytes = await img.read()
                if len(img_bytes) > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Clothing image too large. Maximum size: {MAX_FILE_SIZE / (1024*1024):.1f}MB"
                    )
                total_size += len(img_bytes)
                img.file.seek(0)  # Reset file pointer
                clothing_image_files.append(img.file)
        
        # Handle single uploaded image (backward compatibility)
        if clothing_image:
            # Validate clothing image
            is_valid, error_msg = validate_image_file(clothing_image)
            if not is_valid:
                raise HTTPException(status_code=400, detail=f"Clothing image validation failed: {error_msg}")
            
            # Validate size
            img_bytes = await clothing_image.read()
            if len(img_bytes) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"Clothing image too large. Maximum size: {MAX_FILE_SIZE / (1024*1024):.1f}MB"
                )
            total_size += len(img_bytes)
            clothing_image.file.seek(0)  # Reset file pointer
            clothing_image_files.append(clothing_image.file)
        
        # Validate total size
        if total_size > MAX_TOTAL_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"Total upload size too large. Maximum: {MAX_TOTAL_SIZE / (1024*1024):.1f}MB"
            )
        
        # Handle multiple file URLs (new format - comma-separated)
        opened_files = []  # Track opened files for cleanup
        if clothing_file_urls:
            urls = [url.strip() for url in clothing_file_urls.split(",") if url.strip()]
            for url in urls:
                try:
                    filename = url.split("/")[-1].split("?")[0]
                    if "/uploads/" in url:
                        filename = url.split("/uploads/")[-1].split("?")[0]
                    file_path = UPLOADS_DIR / filename
                    if file_path.exists():
                        file_handle = open(file_path, 'rb')
                        clothing_image_files.append(file_handle)
                        opened_files.append(file_handle)
                        logger.info(f"Loaded saved file from URL: {filename}")
                    else:
                        logger.warning(f"File not found for URL: {filename}")
                except Exception as e:
                    logger.warning(f"Could not load file from URL {url}: {e}")
        
        # Handle single file URL (backward compatibility)
        if clothing_file_url:
            try:
                filename = clothing_file_url.split("/")[-1].split("?")[0]
                if "/uploads/" in clothing_file_url:
                    filename = clothing_file_url.split("/uploads/")[-1].split("?")[0]
                file_path = UPLOADS_DIR / filename
                if file_path.exists():
                    file_handle = open(file_path, 'rb')
                    clothing_image_files.append(file_handle)
                    opened_files.append(file_handle)
                    logger.info(f"Loaded saved file from URL: {filename}")
                else:
                    logger.warning(f"File not found for URL: {filename}")
            except Exception as e:
                logger.warning(f"Could not load file from URL {clothing_file_url}: {e}")
        
        # Validate that at least one clothing source is provided
        if not clothing_image_files:
            raise HTTPException(
                status_code=422, 
                detail="At least one clothing image or clothing_file_url must be provided"
            )
        
        # Limit to 5 items
        if len(clothing_image_files) > 5:
            logger.warning(f"Received {len(clothing_image_files)} clothing items, limiting to 5")
            # Close extra files (only those we opened from URLs)
            for extra_file in clothing_image_files[5:]:
                if extra_file in opened_files:
                    try:
                        if hasattr(extra_file, 'close'):
                            extra_file.close()
                        opened_files.remove(extra_file)
                    except Exception as e:
                        logger.warning(f"Error closing extra file: {e}")
            clothing_image_files = clothing_image_files[:5]
        
        # Parse metadata if provided
        metadata = None
        if garment_metadata:
            # #region agent log
            try:
                with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                    f.write(json_lib.dumps({"location":"main.py:241","message":"Before metadata parsing","data":{"metadataType":type(garment_metadata).__name__,"metadataLength":len(str(garment_metadata)) if isinstance(garment_metadata,str) else None},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"D"})+"\n")
            except: pass
            # #endregion
            try:
                import json
                # Handle both string and dict inputs, ensure UTF-8 encoding
                if isinstance(garment_metadata, str):
                    metadata = json.loads(garment_metadata)
                else:
                    metadata = garment_metadata
                # #region agent log
                try:
                    with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                        f.write(json_lib.dumps({"location":"main.py:247","message":"Metadata parsing succeeded","data":{"metadataKeys":list(metadata.keys()) if isinstance(metadata,dict) else None},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"D"})+"\n")
                except: pass
                # #endregion
            except Exception as e:
                logger.warning(f"Could not parse garment_metadata: {e}")
                # #region agent log
                try:
                    with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                        f.write(json_lib.dumps({"location":"main.py:250","message":"Metadata parsing failed","data":{"error":str(e)},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"D"})+"\n")
                except: pass
                # #endregion
                # Try to clean smart quotes if present
                try:
                    if isinstance(garment_metadata, str):
                        cleaned = garment_metadata.replace('\u201c', '"').replace('\u201d', '"').replace('\u2018', "'").replace('\u2019', "'")
                        metadata = json.loads(cleaned)
                except:
                    logger.error(f"Failed to clean and parse metadata: {e}")
        
        # Use category from metadata if available, otherwise use provided or default
        final_category = category or (metadata.get('category') if metadata else None) or "upper_body"
        
        logger.info(f"Try-on request received for category: {final_category} with {len(clothing_image_files)} clothing item(s)")
        if metadata:
            logger.info(f"Using metadata: {list(metadata.keys())}")
            
        # Analyze user attributes using AI (automatic metadata extraction)
        user_attributes = {}
        try:
            # We use a copy of user files list for analysis to avoid seeking issues if not handled carefully,
            # though the analysis function handles seeking.
            logger.info("Starting automatic user attribute analysis...")
            user_attributes = await analyze_user.analyze_user_attributes(user_image_files)
        except Exception as e:
            logger.warning(f"User attribute analysis failed (continuing without it): {e}")
        
        try:
            # #region agent log
            try:
                with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                    f.write(json_lib.dumps({"location":"main.py:267","message":"Calling vton.generate_try_on","data":{"category":final_category,"clothingFilesCount":len(clothing_image_files),"hasMetadata":metadata is not None},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"E"})+"\n")
            except: pass
            # #endregion
            result = await vton.generate_try_on(
                user_image_files, 
                clothing_image_files, 
                final_category,
                metadata,
                user_attributes=user_attributes,
                main_index=main_index if main_index is not None else 0,
                user_quality_flags=user_quality_flags
            )
            result_url = result.get("image_url") if isinstance(result, dict) else result
            # #region agent log
            try:
                with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                    f.write(json_lib.dumps({"location":"main.py:273","message":"vton.generate_try_on succeeded","data":{"hasResultUrl":result_url is not None,"resultUrlLength":len(result_url) if result_url else 0},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"E"})+"\n")
            except: pass
            # #endregion
            logger.info(f"Try-on completed successfully. Result URL: {result_url}")
        finally:
            # Close any files we opened from URLs
            for file_handle in opened_files:
                try:
                    if hasattr(file_handle, 'close'):
                        file_handle.close()
                except Exception as e:
                    logger.warning(f"Error closing file handle: {e}")
        
        # Backward-compatible response: always include image_url; optionally include retry_info
        if isinstance(result, dict):
            return {
                "image_url": result.get("image_url"),
                "retry_info": result.get("retry_info", []),
            }
        return {"image_url": result}
    except HTTPException:
        raise
    except Exception as e:
        error_detail = str(e)
        error_type = type(e).__name__
        # #region agent log
        try:
            with open('/Users/gerardgrenville/Change Room/.cursor/debug.log', 'a') as f:
                f.write(json_lib.dumps({"location":"main.py:286","message":"Backend try-on endpoint error","data":{"errorType":error_type,"errorMessage":error_detail,"hasApiKeyError":"GEMINI_API_KEY" in error_detail or "GOOGLE_API_KEY" in error_detail},"timestamp":int(__import__('time').time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"})+"\n")
        except: pass
        # #endregion
        logger.error(f"Error in try-on endpoint: {error_type}: {error_detail}", exc_info=True)
        # Provide more helpful error messages
        # Treat safety/policy blocks and “no image after retries with IMAGE_* finish reason” as 422 so the UI can warn/penalize.
        if (
            "IMAGE_SAFETY" in error_detail
            or "safety filter" in error_detail.lower()
            or (
                "no image generated after" in error_detail.lower()
                and "finish reason:" in error_detail.lower()
                and "image_" in error_detail.lower()
            )
        ):
            raise HTTPException(
                status_code=422,
                detail="The image request was blocked by safety filters. Please choose less revealing clothing or use a more neutral description."
            )
        if "GEMINI_API_KEY" in error_detail or "GOOGLE_API_KEY" in error_detail or "environment variable is required" in error_detail:
            error_detail = "Gemini API key not configured. Set GEMINI_API_KEY (or GOOGLE_API_KEY) environment variable in Render dashboard."
        elif "ValueError" in error_type and "required" in error_detail.lower():
            # Catch any ValueError about missing required variables
            error_detail = f"Configuration error: {error_detail}. Please check your Render environment variables."
        # Log full error details for debugging (this will appear in Render logs)
        logger.error(f"Full error details - Type: {error_type}, Message: {error_detail}, Exception: {repr(e)}")
        raise HTTPException(status_code=500, detail=error_detail)

@app.post("/api/identify-products")
async def identify_products(
    request: Request,
    clothing_image: UploadFile = File(...),
):
    try:
        ip = get_client_ip(request)
        if not check_rate_limit(f"identify-products:{ip}", limit=30, window_seconds=60):
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again shortly.")
        logger.info("Product identification request received")
        contents = await clothing_image.read()
        analysis = await gemini.analyze_garment(contents)  # Now async
        logger.info(f"Product identification completed. Analysis: {analysis}")
        return analysis
    except Exception as e:
        logger.error(f"Error in identify-products endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

async def analyze_clothing_stream(clothing_images: List[UploadFile], save_files: bool = True):
    """
    Generator function that yields progress updates as items are analyzed and saved.
    """
    total_items = len(clothing_images)
    
    try:
        # Send initial progress
        yield f"data: {json.dumps({'type': 'progress', 'progress': 0, 'current': 0, 'total': total_items, 'message': 'Starting analysis...'})}\n\n"
        
        analyzed_items = []
        for idx, clothing_image in enumerate(clothing_images):
            try:
                contents = await clothing_image.read()
                original_filename = clothing_image.filename or f"item_{idx + 1}"
                
                # Update progress: starting item analysis
                progress = int((idx / total_items) * 100)
                yield f"data: {json.dumps({'type': 'progress', 'progress': progress, 'current': idx + 1, 'total': total_items, 'message': f'Analyzing item {idx + 1}/{total_items}: {original_filename}...'})}\n\n"
                # Small delay to ensure progress is visible
                await asyncio.sleep(0.1)
                
                logger.info(f"Analyzing item {idx + 1}: {original_filename}")
                
                # Analyze and save the item
                if save_files:
                    result = await analyze_clothing.analyze_and_save_clothing_item(
                        contents,
                        original_filename,
                        str(UPLOADS_DIR),
                        save_file=True
                    )
                    analysis = result
                    
                    # Get the saved file path and URL (handle None result)
                    if result:
                        saved_file_path = result.get("saved_file", "")
                        saved_filename = result.get("saved_filename", "")
                        file_url = f"/uploads/{saved_filename}" if saved_filename else ""
                    else:
                        saved_file_path = ""
                        saved_filename = ""
                        file_url = ""
                    
                    item_result = {
                        "index": idx,
                        "original_filename": original_filename,
                        "analysis": analysis,
                        "saved_file": saved_file_path,
                        "saved_filename": saved_filename,
                        "file_url": file_url,
                        "status": "success"
                    }
                else:
                    # Just analyze without saving
                    analysis = await analyze_clothing.analyze_clothing_item(contents, original_filename)
                    item_result = {
                        "index": idx,
                        "original_filename": original_filename,
                        "analysis": analysis,
                        "status": "success"
                    }
                
                analyzed_items.append(item_result)
                
                # Update progress: item completed - send item update
                progress = int(((idx + 1) / total_items) * 100)
                yield f"data: {json.dumps({'type': 'item_complete', 'item': item_result, 'progress': progress, 'current': idx + 1, 'total': total_items, 'message': f'Completed item {idx + 1}/{total_items}'})}\n\n"
                
            except Exception as e:
                logger.error(f"Error analyzing item {idx + 1}: {e}", exc_info=True)
                item_result = {
                    "index": idx,
                    "original_filename": clothing_image.filename or f"item_{idx + 1}",
                    "error": str(e),
                    "status": "error",
                    "analysis": {
                        "category": "unknown",
                        "detailed_description": "clothing item",
                        "suggested_filename": f"unknown_item_{idx + 1}.jpg"
                    }
                }
                analyzed_items.append(item_result)
                # Still update progress even on error - send item update
                progress = int(((idx + 1) / total_items) * 100)
                yield f"data: {json.dumps({'type': 'item_complete', 'item': item_result, 'progress': progress, 'current': idx + 1, 'total': total_items, 'message': f'Error analyzing item {idx + 1}'})}\n\n"
        
        # Send final result
        yield f"data: {json.dumps({'type': 'complete', 'items': analyzed_items})}\n\n"
        
    except Exception as e:
        logger.error(f"Error in analyze-clothing stream: {e}", exc_info=True)
        yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

@app.post("/api/analyze-clothing")
async def analyze_clothing_items(
    request: Request,
    clothing_images: List[UploadFile] = File(...),
    save_files: bool = Form(True)
):
    """
    Analyzes multiple clothing items with real-time progress updates.
    Saves files with embedded metadata and proper naming by default.
    Returns a streaming response with progress and final results including file URLs.
    """
    try:
        ip = get_client_ip(request)
        if not check_rate_limit(f"analyze-clothing:{ip}", limit=20, window_seconds=60):
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again shortly.")
        logger.info(f"Clothing analysis request received for {len(clothing_images)} items (save_files={save_files})")
        
        if len(clothing_images) > 5:
            raise HTTPException(status_code=400, detail="Maximum 5 clothing items allowed")
        
        return StreamingResponse(
            analyze_clothing_stream(clothing_images, save_files=save_files),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"  # Disable buffering for nginx
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in analyze-clothing endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze-and-save-clothing")
async def analyze_and_save_clothing_items(
    clothing_images: List[UploadFile] = File(...),
    save_files: bool = Form(True),
    output_dir: str = Form("uploads")
):
    """
    Analyzes clothing items, embeds metadata, and saves them with proper naming.
    Returns analysis results with file paths.
    """
    try:
        logger.info(f"Analyze and save request received for {len(clothing_images)} items")
        
        if len(clothing_images) > 5:
            raise HTTPException(status_code=400, detail="Maximum 5 clothing items allowed")
        
        results = []
        for idx, clothing_image in enumerate(clothing_images):
            try:
                contents = await clothing_image.read()
                original_filename = clothing_image.filename or f"item_{idx + 1}"
                
                logger.info(f"Processing item {idx + 1}: {original_filename}")
                result = await analyze_clothing.analyze_and_save_clothing_item(
                    contents,
                    original_filename,
                    output_dir,
                    save_files
                )
                
                results.append({
                    "index": idx,
                    "original_filename": original_filename,
                    "analysis": result,
                    "status": "success"
                })
                
            except Exception as e:
                logger.error(f"Error processing item {idx + 1}: {e}", exc_info=True)
                results.append({
                    "index": idx,
                    "original_filename": clothing_image.filename or f"item_{idx + 1}",
                    "error": str(e),
                    "status": "error"
                })
        
        return {"items": results, "total": len(results)}
        
    except Exception as e:
        logger.error(f"Error in analyze-and-save-clothing endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/read-image-metadata")
async def read_image_metadata(request: Request, image_path: str):
    """
    Reads embedded metadata from a saved image file.
    
    Args:
        image_path: Path to the image file (relative to uploads directory or absolute)
    """
    try:
        ip = get_client_ip(request)
        if not check_rate_limit(f"read-metadata:{ip}", limit=60, window_seconds=60):
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again shortly.")

        # Security: only allow reading files within uploads directory (no absolute paths, no traversal)
        if os.path.isabs(image_path):
            raise HTTPException(status_code=400, detail="image_path must be a relative path within uploads")

        uploads_root = (Path(UPLOADS_DIR)).resolve()
        candidate = (uploads_root / image_path).resolve()
        if uploads_root not in candidate.parents and candidate != uploads_root:
            raise HTTPException(status_code=400, detail="Invalid image_path")

        if not candidate.exists() or not candidate.is_file():
            raise HTTPException(status_code=404, detail="Image file not found")
        
        metadata = analyze_clothing.read_metadata_from_image(str(candidate))
        
        if metadata is None:
            return {"message": "No metadata found in image", "image_path": image_path}
        
        return {"metadata": metadata, "image_path": str(candidate.relative_to(uploads_root))}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading image metadata: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/preprocess-clothing")
async def preprocess_clothing_batch(
    request: Request,
    clothing_images: List[UploadFile] = File(...)
):
    """
    Batch preprocessing endpoint for clothing images.
    
    Uses OpenAI to analyze up to 5 images in a single batch call.
    Returns structured metadata and saves files with proper naming.
    
    This endpoint implements the clean architecture:
    - OpenAI: Analyzes images and provides structured metadata + recommended filenames
    - Backend: Saves files, handles storage, wires everything for Gemini
    
    Args:
        clothing_images: List of uploaded image files (max 5)
        
    Returns:
        JSON with items array containing metadata and file URLs
    """
    try:
        ip = get_client_ip(request)
        if not check_rate_limit(f"preprocess-clothing:{ip}", limit=15, window_seconds=60):
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again shortly.")
        logger.info(f"Batch preprocessing request received for {len(clothing_images)} images")
        
        if len(clothing_images) > 5:
            raise HTTPException(status_code=400, detail="Maximum 5 clothing items allowed")
        
        if len(clothing_images) == 0:
            raise HTTPException(status_code=400, detail="At least one image is required")
        
        # Read all images into memory
        image_bytes_list = []
        original_filenames = []
        
        for image_file in clothing_images:
            contents = await image_file.read()
            image_bytes_list.append(contents)
            original_filenames.append(image_file.filename or "unknown")
        
        # Call batch preprocessing service
        processed_items = await preprocess_clothing.preprocess_clothing_batch(
            image_bytes_list,
            original_filenames,
            str(UPLOADS_DIR)
        )
        
        logger.info(f"Batch preprocessing complete: {len(processed_items)} items processed")
        
        # Log body_regions for debugging
        for idx, item in enumerate(processed_items):
            if item.get("status") == "success":
                body_region = item.get("body_region") or item.get("analysis", {}).get("body_region") or item.get("category", "MISSING")
                logger.info(f"Item {idx} body_region: {body_region}")
            else:
                logger.warning(f"Item {idx} failed: {item.get('error', 'Unknown error')}")
        
        return {
            "items": processed_items,
            "total": len(processed_items)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in preprocess-clothing endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to preprocess clothing images: {str(e)}"
        )

@app.post("/api/shop")
async def shop_endpoint(
    request: Request,
    query: str = Form(...),
    budget: Optional[float] = Form(None)
):
    try:
        ip = get_client_ip(request)
        if not check_rate_limit(f"shop:{ip}", limit=60, window_seconds=60):
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again shortly.")
        logger.info(f"Shop request received. Query: {query}, Budget: {budget}")
        results = shop.search_products(query, budget)
        logger.info(f"Shop search completed. Found {len(results)} results")
        return {"results": results}
    except Exception as e:
        logger.error(f"Error in shop endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Set UTF-8 encoding environment variables
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
    os.environ.setdefault('LANG', 'en_US.UTF-8')
    os.environ.setdefault('LC_ALL', 'en_US.UTF-8')
    
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=True,
        timeout_keep_alive=600,  # 10 minutes for long-running requests
        timeout_graceful_shutdown=30  # 30 seconds for graceful shutdown
    )

