import os
import time
from typing import Any, Dict, List, Optional

import logging
import httpx
from fastapi import HTTPException, Request
from jose import JWTError, jwt

# Silence httpx INFO logs to avoid leaking API keys in URL query params.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

_AUTH_MODE_VALUES = {"none", "off", "disabled", "clerk", "api_key"}

_JWKS_CACHE: Dict[str, Any] = {"expires_at": 0.0, "keys": []}


def _get_auth_mode() -> str:
    mode = (os.getenv("BACKEND_AUTH_MODE", "none") or "none").strip().lower()
    return mode if mode in _AUTH_MODE_VALUES else "none"


def _get_bearer_token(request: Request) -> Optional[str]:
    header = request.headers.get("authorization") or ""
    parts = header.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def _get_jwks_url() -> str:
    url = (os.getenv("CLERK_JWKS_URL") or "").strip()
    if url:
        return url
    issuer = (os.getenv("CLERK_ISSUER") or "").strip().rstrip("/")
    if issuer:
        return f"{issuer}/.well-known/jwks.json"
    return ""


async def _fetch_jwks() -> List[Dict[str, Any]]:
    url = _get_jwks_url()
    if not url:
        raise RuntimeError("CLERK_JWKS_URL or CLERK_ISSUER is required when BACKEND_AUTH_MODE=clerk")

    cache_seconds = int(os.getenv("CLERK_JWKS_CACHE_SECONDS", "300"))
    now = time.time()
    if _JWKS_CACHE["keys"] and _JWKS_CACHE["expires_at"] > now:
        return _JWKS_CACHE["keys"]

    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()

    keys = data.get("keys") or []
    _JWKS_CACHE["keys"] = keys
    _JWKS_CACHE["expires_at"] = now + max(cache_seconds, 60)
    return keys


async def _verify_clerk_token(token: str) -> Dict[str, Any]:
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    kid = header.get("kid")
    keys = await _fetch_jwks()
    key = next((k for k in keys if k.get("kid") == kid), None)
    if not key:
        raise HTTPException(status_code=401, detail="Invalid token")

    issuer = (os.getenv("CLERK_ISSUER") or "").strip() or None
    audience = (os.getenv("CLERK_AUDIENCE") or "").strip() or None
    options = {"verify_aud": bool(audience)}

    try:
        return jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=issuer,
            audience=audience,
            options=options,
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc


async def require_backend_auth(request: Request) -> None:
    mode = _get_auth_mode()
    if mode in {"none", "off", "disabled"}:
        return

    token = _get_bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if mode == "api_key":
        expected = (os.getenv("BACKEND_API_KEY") or "").strip()
        if not expected or token != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")
        return

    if mode == "clerk":
        await _verify_clerk_token(token)
        return

    raise HTTPException(status_code=500, detail="Invalid auth configuration")
