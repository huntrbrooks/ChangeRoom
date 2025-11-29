from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import uvicorn
import os
import sys
import logging
from pathlib import Path
from dotenv import load_dotenv

# Add current directory to path to find services module
sys.path.insert(0, str(Path(__file__).parent))

from services import vton, gemini, shop

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
    clothing_image: UploadFile = File(...), # Currently handling single item for simplicity in MVP, can expand to list
    category: str = Form("upper_body")
):
    try:
        logger.info(f"Try-on request received for category: {category}")
        # UploadFile.file is a SpooledTemporaryFile which works with Replicate
        result_url = await vton.generate_try_on(
            user_image.file, 
            clothing_image.file, 
            category
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

