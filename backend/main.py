from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import uvicorn
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Add current directory to path to find services module
sys.path.insert(0, str(Path(__file__).parent))

from services import vton, gemini, shop

load_dotenv()

app = FastAPI(title="Change Room API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for now to simplify Vercel deployment
    allow_credentials=True,
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
        # UploadFile.file is a SpooledTemporaryFile which works with Replicate
        result_url = await vton.generate_try_on(
            user_image.file, 
            clothing_image.file, 
            category
        )
        return {"image_url": result_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/identify-products")
async def identify_products(
    clothing_image: UploadFile = File(...),
):
    try:
        contents = await clothing_image.read()
        analysis = gemini.analyze_garment(contents)
        return analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/shop")
async def shop_endpoint(
    query: str = Form(...),
    budget: Optional[float] = Form(None)
):
    try:
        results = shop.search_products(query, budget)
        return {"results": results}
    except Exception as e:
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

