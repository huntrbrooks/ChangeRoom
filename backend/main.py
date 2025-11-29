from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from typing import List, Optional
import uvicorn
import os
import sys
import logging
import json
import asyncio
from pathlib import Path
from dotenv import load_dotenv

# Add current directory to path to find services module
sys.path.insert(0, str(Path(__file__).parent))

from services import vton, gemini, shop, analyze_clothing

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Change Room API")

# Configure CORS
# Note: allow_origins=["*"] with allow_credentials=True is invalid
# For production, specify exact origins. For now, remove credentials.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=False,  # Cannot use credentials with wildcard origins
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory if it doesn't exist
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)

# Mount static files for serving uploaded images
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

@app.get("/")
async def root():
    return {"message": "Change Room API is running"}

@app.post("/api/try-on")
async def try_on(
    user_image: UploadFile = File(...),
    clothing_image: UploadFile = File(...),  # Single image (backward compatibility, required)
    category: Optional[str] = Form(None),
    garment_metadata: Optional[str] = Form(None),  # JSON string of metadata
    clothing_file_url: Optional[str] = Form(None)  # URL to saved clothing file (alternative to upload)
):
    """
    Virtual try-on endpoint. Accepts user image and clothing image(s).
    Can accept either uploaded file or URL to saved file.
    For multiple clothing items, send multiple requests or update to accept list.
    Currently supports single clothing image for backward compatibility.
    """
    try:
        # Parse metadata if provided
        metadata = None
        if garment_metadata:
            try:
                import json
                metadata = json.loads(garment_metadata)
            except Exception as e:
                logger.warning(f"Could not parse garment_metadata: {e}")
        
        # Handle clothing image - use saved file if URL provided, otherwise use uploaded file
        clothing_file_handle = None
        if clothing_file_url:
            # Load file from saved location
            try:
                # Remove /uploads prefix if present, get just filename
                filename = clothing_file_url.replace("/uploads/", "").split("/")[-1]
                file_path = UPLOADS_DIR / filename
                if file_path.exists():
                    clothing_file_handle = open(file_path, 'rb')
                    clothing_image_files = [clothing_file_handle]
                    logger.info(f"Using saved file: {file_path}")
                else:
                    raise HTTPException(status_code=404, detail=f"Clothing file not found: {filename}")
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Error loading saved clothing file: {e}")
                raise HTTPException(status_code=500, detail=f"Could not load saved clothing file: {str(e)}")
        else:
            # Use uploaded file
            clothing_image_files = [clothing_image.file]
        
        # Use category from metadata if available, otherwise use provided or default
        final_category = category or (metadata.get('category') if metadata else None) or "upper_body"
        
        logger.info(f"Try-on request received for category: {final_category} with {len(clothing_image_files)} clothing item(s)")
        if metadata:
            logger.info(f"Using metadata: {list(metadata.keys())}")
        
        result_url = await vton.generate_try_on(
            user_image.file, 
            clothing_image_files, 
            final_category,
            metadata
        )
        logger.info(f"Try-on completed successfully. Result URL: {result_url}")
        
        # Close file if we opened it
        if clothing_file_handle:
            try:
                clothing_file_handle.close()
            except:
                pass
        
        return {"image_url": result_url}
    except HTTPException:
        raise
    except Exception as e:
        error_detail = str(e)
        logger.error(f"Error in try-on endpoint: {e}", exc_info=True)
        # Provide more helpful error messages
        if "ImportError" in str(type(e)) or "google-genai" in error_detail:
            error_detail = f"Missing dependency: {error_detail}. Ensure google-genai is installed on Render."
        elif "GOOGLE_API_KEY" in error_detail:
            error_detail = "Google API key not configured. Set GOOGLE_API_KEY environment variable."
        raise HTTPException(status_code=500, detail=error_detail)

@app.post("/api/identify-products")
async def identify_products(
    clothing_image: UploadFile = File(...),
):
    try:
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
                    
                    # Get the saved file path and URL
                    saved_file_path = result.get("saved_file", "")
                    saved_filename = result.get("saved_filename", "")
                    file_url = f"/uploads/{saved_filename}" if saved_filename else ""
                    
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
    clothing_images: List[UploadFile] = File(...),
    save_files: bool = Form(True)
):
    """
    Analyzes multiple clothing items with real-time progress updates.
    Saves files with embedded metadata and proper naming by default.
    Returns a streaming response with progress and final results including file URLs.
    """
    try:
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
async def read_image_metadata(image_path: str):
    """
    Reads embedded metadata from a saved image file.
    
    Args:
        image_path: Path to the image file (relative to uploads directory or absolute)
    """
    try:
        # If relative path, assume it's in uploads directory
        if not os.path.isabs(image_path):
            image_path = os.path.join("uploads", image_path)
        
        if not os.path.exists(image_path):
            raise HTTPException(status_code=404, detail="Image file not found")
        
        metadata = analyze_clothing.read_metadata_from_image(image_path)
        
        if metadata is None:
            return {"message": "No metadata found in image", "image_path": image_path}
        
        return {"metadata": metadata, "image_path": image_path}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading image metadata: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/shop")
async def shop_endpoint(
    query: str = Form(...),
    budget: Optional[float] = Form(None)
):
    try:
        logger.info(f"Shop request received. Query: {query}, Budget: {budget}")
        results = shop.search_products(query, budget)
        logger.info(f"Shop search completed. Found {len(results)} results")
        return {"results": results}
    except Exception as e:
        logger.error(f"Error in shop endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=True,
        timeout_keep_alive=600,  # 10 minutes for long-running requests
        timeout_graceful_shutdown=30  # 30 seconds for graceful shutdown
    )

