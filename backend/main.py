from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import uvicorn
import os
from dotenv import load_dotenv
from services import vton, gemini, shop

load_dotenv()

app = FastAPI(title="Change Room API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

