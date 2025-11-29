from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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

@app.get("/")
async def root():
    return {"message": "Change Room API is running"}

@app.post("/api/try-on")
async def try_on(
    user_image: UploadFile = File(...),
    clothing_image: UploadFile = File(...),  # Single image (backward compatibility, required)
    category: Optional[str] = Form(None),
    garment_metadata: Optional[str] = Form(None)  # JSON string of metadata
):
    """
    Virtual try-on endpoint. Accepts user image and clothing image(s).
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
        
        # For now, use single clothing image (can be extended to support list)
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
        return {"image_url": result_url}
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

async def analyze_clothing_stream(clothing_images: List[UploadFile]):
    """
    Generator function that yields progress updates as items are analyzed.
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
                
                logger.info(f"Analyzing item {idx + 1}: {original_filename}")
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
    clothing_images: List[UploadFile] = File(...)
):
    """
    Analyzes multiple clothing items with real-time progress updates.
    Returns a streaming response with progress and final results.
    """
    try:
        logger.info(f"Clothing analysis request received for {len(clothing_images)} items")
        
        if len(clothing_images) > 5:
            raise HTTPException(status_code=400, detail="Maximum 5 clothing items allowed")
        
        return StreamingResponse(
            analyze_clothing_stream(clothing_images),
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

