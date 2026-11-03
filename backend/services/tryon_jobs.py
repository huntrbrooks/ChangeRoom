"""Workers can claim/settle an existing subscriber-issued job, never issue one."""
import asyncio
import base64
import io
import logging
import os
import uuid

from fastapi import HTTPException
from PIL import Image, ImageDraw, ImageOps

logger = logging.getLogger(__name__)


async def _call(statement: str, params: tuple):
    # Kept lazy so offline validation/health never needs a database or a credential.
    import psycopg
    url = os.getenv("TRYON_DATABASE_URL")
    if not url:
        raise RuntimeError("generation billing not configured")
    async with await psycopg.AsyncConnection.connect(url, connect_timeout=5,
            options="-c statement_timeout=8000 -c lock_timeout=4000") as conn:
        async with conn.cursor() as cur:
            await cur.execute(statement, params)
            return (await cur.fetchone())[0]


async def claim(job_id: str, subject: str):
    try:
        parsed = uuid.UUID(job_id)
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(403, "A valid generation authorization is required")
    try:
        funding = await _call("SELECT public.tryon_claim(%s,%s)", (parsed, subject))
    except Exception:
        logger.error("generation billing unavailable during claim")
        raise HTTPException(503, "Generation authorization is temporarily unavailable")
    if funding == "trial_unavailable":
        raise HTTPException(409, "This trial was used by another request. Refresh your balance before generating again.")
    if funding == "frozen":
        raise HTTPException(402, "account_frozen")
    if funding == "no_credits":
        raise HTTPException(402, "no_credits")
    if funding not in ("trial", "credits", "privileged"):
        raise HTTPException(409, "Generation authorization is unavailable or was already used")
    return funding


async def authorize_extra(request, kind):
    subject = getattr(request.state, "user_id", None)
    if not subject:
        raise HTTPException(401, "A verified user session is required")
    try:
        jid = uuid.UUID(request.headers.get("x-request-id", ""))
    except ValueError:
        raise HTTPException(403, "A completed generation is required")
    try:
        ok = await _call("SELECT public.tryon_extra(%s,%s,%s)", (jid, subject, kind))
    except Exception:
        raise HTTPException(503, "Generation authorization is temporarily unavailable")
    if not ok:
        raise HTTPException(403, "This generation does not authorize another lookup")


async def settle(job_id: str, subject: str, image: bytes | None):
    for attempt in range(3):
        try:
            ok = await _call("SELECT public.tryon_settle(%s,%s,%s::bytea)", (uuid.UUID(job_id), subject, image))
            if not ok:
                raise HTTPException(409, "Generation authorization expired")
            return
        except HTTPException:
            raise
        except Exception:
            if attempt == 2:
                logger.error("generation settlement unavailable; reconciliation required job=%s", job_id)
                raise HTTPException(503, "Could not confirm the result. Check recent looks before retrying.")
            await asyncio.sleep(0.15 * (attempt + 1))


def private_jpeg(value: str, trial: bool) -> bytes:
    # Never download an arbitrary provider-returned URL on our network. Fail/refund if
    # a provider stops returning inline results. Re-encoding also strips EXIF and other metadata.
    if not isinstance(value, str) or len(value) > 20_000_000:
        raise ValueError("invalid image response")
    head, sep, payload = value.partition(",")
    if not sep or head.lower() not in ("data:image/png;base64", "data:image/jpeg;base64",
                                       "data:image/jpg;base64", "data:image/webp;base64"):
        raise ValueError("unsupported image response")
    raw = base64.b64decode(payload, validate=True)
    with Image.open(io.BytesIO(raw)) as src:
        if src.width * src.height > 25_000_000:
            raise ValueError("image exceeds size limit")
        image = ImageOps.exif_transpose(src).convert("RGB")
    image.thumbnail((1800, 1800))
    if trial:
        draw = ImageDraw.Draw(image)
        height = max(23, image.height // 18)
        draw.rectangle((0, image.height-height, image.width, image.height), fill="#222222")
        draw.text((8, image.height-height+4), "IGetDressed.Online | Trial preview", fill="white")
    for quality in (88, 75, 60):
        out = io.BytesIO()
        image.save(out, 'JPEG', quality=quality, optimize=True)
        if out.tell() <= 2500000:
            return out.getvalue()
    raise ValueError("image exceeds delivery limit")
