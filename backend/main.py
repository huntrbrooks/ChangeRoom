from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Any, Dict, List, Optional
import uvicorn
import os
import sys
import logging
import json
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import time
import uuid

# Ensure UTF-8 encoding for all string operations
import locale
import io
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Add current directory to path to find services module
sys.path.insert(0, str(Path(__file__).parent))

from services import subscriber_image, gemini, shop
from services import tryon_jobs
from services.image_normalize import normalize_image_bytes, ensure_heif_registered
from services.auth import require_backend_auth

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# Silence httpx INFO logs to avoid leaking API keys in URL query params.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("httpx2").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def worker_lifespan(_app):
    subscriber_image.primary_key()  # Fail startup; never silently deploy a fallback-only worker.
    yield

app = FastAPI(title="IGetDressed.Online API", lifespan=worker_lifespan)

# Add a small “which stack served this response?” marker + request correlation id to all responses.
@app.middleware("http")
async def add_stack_header(request: Request, call_next):
    # Prefer client-provided request id; otherwise generate one.
    rid = (
        request.headers.get("x-request-id")
        or request.headers.get("x-changeroom-request-id")
        or str(uuid.uuid4())
    )
    request.state.request_id = rid

    response = await call_next(request)

    # Helps debugging in browser Network tab + logs.
    response.headers["X-ChangeRoom-Stack"] = "fastapi-worker"
    response.headers["X-Request-Id"] = rid
    response.headers["X-ChangeRoom-Request-Id"] = rid
    return response


def get_request_id(request: Request) -> str:
    rid = getattr(request.state, "request_id", None)
    return rid if isinstance(rid, str) and rid else "unknown"

# Configure CORS
# For production, specify exact origins in ALLOWED_ORIGINS environment variable
# Format: comma-separated list, e.g., "https://app.example.com,https://www.example.com"
#
# IMPORTANT: This backend is called directly by the Vercel frontend (cross-origin).
# The frontend may add request correlation headers (X-Request-Id / X-ChangeRoom-Request-Id),
# which triggers an OPTIONS preflight. If those headers are not allowed, the browser will
# show "TypeError: Failed to fetch" and the UI can appear to loop/retry.

default_allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://igetdressed.online",
    "https://www.igetdressed.online",
    "https://getdressed.online",
    "https://www.getdressed.online",
]

# Add production frontend URL if NEXT_PUBLIC_APP_URL is set (for custom deployments)
production_frontend_url = os.getenv("NEXT_PUBLIC_APP_URL", "")
if production_frontend_url and production_frontend_url.startswith(("https://", "http://")):
    default_allowed_origins.append(production_frontend_url)

allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "")
env_allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

# If ALLOWED_ORIGINS is set but accidentally empty/invalid, fall back to defaults.
# Otherwise, merge env + defaults to avoid foot-guns that break production.
allowed_origins = (env_allowed_origins if os.getenv("CHANGEROOM_CONTAINER") == "1"
                   else sorted(set(default_allowed_origins + env_allowed_origins)))

allowed_origin_regex = os.getenv("ALLOWED_ORIGIN_REGEX", "").strip() or None

# Cap incoming bytes, including chunked requests, before Starlette finishes spooling files.
class RequestBodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "POST":
            return await self.app(scope, receive, send)
        limit = MAX_TOTAL_SIZE + 256 * 1024
        raw = dict(scope.get("headers", [])).get(b"content-length", b"0")
        if not raw.isdigit() or int(raw) > limit:
            return await JSONResponse({"detail": "Upload too large"}, status_code=413)(scope, receive, send)
        used = 0
        async def limited():
            nonlocal used
            event = await receive()
            used += len(event.get("body", b""))
            if used > limit:
                raise HTTPException(413, "Upload too large")
            return event
        return await self.app(scope, limited, send)

app.add_middleware(RequestBodyLimit)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,  # Specific origins for production
    allow_origin_regex=allowed_origin_regex,
    allow_credentials=True,  # Can enable when origins are specific
    # Use "*" so preflight succeeds even when the frontend injects correlation headers.
    allow_methods=["*"],
    allow_headers=["*"],
    # Expose debugging/correlation headers to the browser.
    expose_headers=["X-ChangeRoom-Stack", "X-Request-Id", "X-ChangeRoom-Request-Id"],
)



# File upload security limits
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 10 * 1024 * 1024))  # 10MB default
MAX_TOTAL_SIZE = int(os.getenv("MAX_TOTAL_SIZE", 50 * 1024 * 1024))  # 50MB default
# Accept a wider range of image types; we normalize server-side to JPEG/PNG before model calls.
ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
    "image/heic",
    "image/heif",
    "image/avif",
}
ALLOWED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
    ".heic",
    ".heif",
    ".avif",
}

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
    # Some clients (or proxies) send missing/incorrect content_type.
    # We allow a safe fallback based on filename extension; decode will still be enforced later.
    ct = (file.content_type or "").lower().strip()
    
    if not file.filename:
        return False, "Filename is required"
    
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        return False, f"Invalid file extension. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"

    if ct and ct in ALLOWED_IMAGE_TYPES:
        return True, ""

    # Allow missing/unknown content type when extension is allowed.
    # Downstream decode+normalize will reject non-image bytes.
    if not ct or ct in ("application/octet-stream", "binary/octet-stream"):
        return True, ""

    # If content-type disagrees but extension is allowed, accept and rely on decode step.
    if ct not in ALLOWED_IMAGE_TYPES:
        return True, ""
    
    return True, ""


async def read_and_normalize_upload(
    file: UploadFile,
    *,
    label: str,
    max_dimension: int = 2200,
) -> tuple[bytes, str, Optional[int], Optional[int]]:
    """
    Read an UploadFile, enforce size limits, and normalize to JPEG/PNG for downstream model calls.
    Returns (bytes, mime_type, width, height).
    """
    contents = await file.read(MAX_FILE_SIZE + 1)
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"{label} too large. Maximum size: {MAX_FILE_SIZE / (1024*1024):.1f}MB",
        )

    # Normalize (handles EXIF orientation + downscale + consistent encoding).
    try:
        normalized, mime_type, w, h = await asyncio.to_thread(
            normalize_image_bytes, contents, max_dimension=max_dimension, prefer_mime="image/jpeg"
        )
        return normalized, mime_type, w, h
    except Exception as e:
        # Special-case HEIC/HEIF without pillow-heif
        ct = (file.content_type or "").lower()
        ext = Path(file.filename or "").suffix.lower()
        if ct in ("image/heic", "image/heif") or ext in (".heic", ".heif"):
            if not ensure_heif_registered():
                raise HTTPException(
                    status_code=415,
                    detail=(
                        "This image looks like HEIC/HEIF (iPhone 'High Efficiency'). "
                        "Please convert it to JPEG/PNG (recommended) and re-upload."
                    ),
                )
        raise HTTPException(status_code=415, detail="Could not decode image")

@app.get("/")
async def root():
    return {"message": "IGetDressed.Online API is running"}


# The subscriber path processes uploads in memory. Legacy storage/metadata endpoints
# used public filenames without ownership; retire them rather than expose old media.
@app.post("/api/preprocess-model-photos")
@app.post("/api/preprocess-clothing")
@app.post("/api/analyze-clothing")
@app.post("/api/analyze-and-save-clothing")
@app.get("/api/read-image-metadata")
async def retired_media_endpoint():
    raise HTTPException(410, "Legacy image storage is disabled. Upload photos in the studio.")


_generation_slots = asyncio.Semaphore(max(1,min(8,int(os.getenv("TRYON_CONCURRENCY","1")))))

async def reserve_worker_slot():
    try:
        await asyncio.wait_for(_generation_slots.acquire(), timeout=0.25)
    except asyncio.TimeoutError:
        raise HTTPException(429, "The fitting room is busy. No credit was used; try again shortly.")
    try:
        yield
    finally:
        _generation_slots.release()


@app.post("/api/try-on", dependencies=[Depends(require_backend_auth), Depends(reserve_worker_slot)])
async def try_on(
    request: Request,
    user_image: Optional[UploadFile] = File(None),  # Backward compatibility
    user_images: Optional[List[UploadFile]] = File(None), # New: Multiple user images
    clothing_images: Optional[List[UploadFile]] = File(None),  # Multiple clothing images (up to 5)
    clothing_image: Optional[UploadFile] = File(None),  # Single image for backward compatibility
    category: Optional[str] = Form(None),
    garment_metadata: Optional[str] = Form(None),  # JSON string of metadata
    model_metadata: Optional[str] = Form(None),  # JSON string from /api/preprocess-model-photos
    clothing_file_urls: Optional[str] = Form(None),  # Comma-separated URLs to saved files
    clothing_file_url: Optional[str] = Form(None),  # Single URL for backward compatibility
    main_index: Optional[int] = Form(None)  # Optional main reference index from frontend
):
    """
    Virtual try-on endpoint. Accepts user image(s) and clothing image(s).
    Supports multiple user images (up to 5) for better context.
    Supports multiple clothing items for full outfit try-on.
    """
    rid = request.headers.get("x-request-id", "")
    subject = getattr(request.state, "user_id", None)
    if not subject:
        raise HTTPException(401, "A verified user session is required")
    if clothing_file_urls is not None or clothing_file_url is not None:
        raise HTTPException(400, "Saved file paths are not accepted")
    if not check_rate_limit(f"try-on:{subject}", limit=10, window_seconds=60):
        raise HTTPException(429, "Please try again shortly")
    people = list(user_images or ([user_image] if user_image else []))
    clothes = list(clothing_images or []) + ([clothing_image] if clothing_image else [])
    if not people or not clothes:
        raise HTTPException(422, "A person photo and clothing image are required")
    if len(people) > 5 or len(clothes) > 5:
        raise HTTPException(400, "Maximum 5 person photos and 5 clothing items")
    if sum(f.size or 0 for f in people + clothes) > MAX_TOTAL_SIZE:
        raise HTTPException(413, "Total upload size exceeds limit")

    def parse_meta(value):
        if not value:
            return {}
        if len(value) > 65536:
            raise HTTPException(400, "Metadata exceeds limit")
        try:
            parsed = json.loads(value)
        except ValueError:
            raise HTTPException(400, "Invalid metadata")
        return parsed if isinstance(parsed, dict) else {}

    metadata = parse_meta(garment_metadata)
    # Do not infer or store age, gender, skin tone or body measurements.
    person_inputs, garment_inputs = [], []
    if main_index is not None and not 0 <= main_index < len(people):
        raise HTTPException(400, "Invalid primary person reference")
    for is_person, files in ((True, people), (False, clothes)):
        for f in files:
            valid, _ = validate_image_file(f)
            if not valid:
                raise HTTPException(415, "Unsupported image file")
            contents, mime, w, h = await read_and_normalize_upload(f, label="Photo")
            if is_person and min(w or 0, h or 0) < 400:
                raise HTTPException(422, "User image resolution too low")
            if is_person:
                person_inputs.append(subscriber_image.Reference(contents,mime))
            else:
                garment_inputs.append(subscriber_image.Reference(contents,mime))

    funding = await tryon_jobs.claim(rid, subject)
    try:
        async def generate_private_result():
            value = await subscriber_image.generate(person_inputs,garment_inputs,metadata=metadata,main_index=main_index or 0)
            return await asyncio.to_thread(tryon_jobs.private_jpeg, value, funding == "trial")
        image = await asyncio.wait_for(generate_private_result(), timeout=480)
    except BaseException as exc:
        # Includes task cancellation; a crashed worker is independently reconciled by sweep.
        await asyncio.shield(tryon_jobs.settle(rid, subject, None))
        if isinstance(exc, asyncio.CancelledError):
            raise
        if not isinstance(exc, Exception):
            raise
        is_safety = isinstance(exc, subscriber_image.ImageBlocked)
        logger.warning("generation failed job=%s type=%s", rid, type(exc).__name__)
        raise HTTPException(422 if is_safety else 502,
            "Image blocked by safety filters; no credit was charged." if is_safety else
            "Generation failed; your credit or trial has been restored.")
    await tryon_jobs.settle(rid, subject, image)
    logger.info("generation completed job=%s", rid)
    return {"job_id": rid, "usedFreeTrial": funding == "trial",
            "image_url": f"/api/try-on/jobs/{rid}/result",
            "modesty_applied": False}


@app.post("/api/clothing/adjust-description")
async def retired_rewrite():
    raise HTTPException(410, "Description rewriting is not available.")


@app.post("/api/identify-products", dependencies=[Depends(require_backend_auth)])
async def identify_products(
    request: Request,
    clothing_image: UploadFile = File(...),
):
    try:
        ip = get_client_ip(request)
        if not check_rate_limit(f"identify-products:{ip}", limit=30, window_seconds=60):
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again shortly.")
        logger.info("Product identification request received")
        is_valid, error_msg = validate_image_file(clothing_image)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        contents, _mime, _w, _h = await read_and_normalize_upload(
            clothing_image, label="Clothing image", max_dimension=2200
        )
        await tryon_jobs.authorize_extra(request, "identify")
        analysis = await gemini.analyze_garment(contents)  # Now async
        logger.info("Product identification completed")
        return analysis
    except HTTPException:
        raise
    except Exception:
        logger.error("Error in identify-products endpoint")
        raise HTTPException(status_code=502, detail="Shopping lookup unavailable")

@app.post("/api/shop", dependencies=[Depends(require_backend_auth)])
async def shop_endpoint(
    request: Request,
    query: str = Form(...),
    budget: Optional[float] = Form(None)
):
    try:
        ip = get_client_ip(request)
        if not check_rate_limit(f"shop:{ip}", limit=60, window_seconds=60):
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again shortly.")
        await tryon_jobs.authorize_extra(request, "shop")
        results = await asyncio.to_thread(shop.search_products, query, budget)
        logger.info(f"Shop search completed. Found {len(results)} results")
        return {"results": results}
    except HTTPException:
        raise
    except Exception:
        logger.error("Error in shop endpoint")
        raise HTTPException(status_code=502, detail="Shopping lookup unavailable")

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
