import asyncio

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from services import auth


def _request_with_bearer(token: str | None = None) -> Request:
    headers = []
    if token is not None:
        headers.append((b"authorization", f"Bearer {token}".encode("utf-8")))
    return Request({"type": "http", "method": "POST", "path": "/", "headers": headers})


def test_api_key_mode_accepts_matching_key(monkeypatch):
    monkeypatch.setenv("BACKEND_AUTH_MODE", "api_key")
    monkeypatch.setenv("BACKEND_API_KEY", "test-backend-key")

    asyncio.run(auth.require_backend_auth(_request_with_bearer("test-backend-key")))


def test_api_key_mode_rejects_missing_key(monkeypatch):
    monkeypatch.setenv("BACKEND_AUTH_MODE", "api_key")
    monkeypatch.setenv("BACKEND_API_KEY", "test-backend-key")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth.require_backend_auth(_request_with_bearer()))

    assert exc.value.status_code == 401


def test_hybrid_mode_accepts_backend_api_key(monkeypatch):
    monkeypatch.setenv("BACKEND_AUTH_MODE", "clerk_or_api_key")
    monkeypatch.setenv("BACKEND_API_KEY", "test-backend-key")

    async def fail_if_called(_token: str):
        raise AssertionError("Clerk verification should not run for a valid backend API key")

    monkeypatch.setattr(auth, "_verify_clerk_token", fail_if_called)

    asyncio.run(auth.require_backend_auth(_request_with_bearer("test-backend-key")))


def test_hybrid_mode_falls_back_to_clerk_token(monkeypatch):
    monkeypatch.setenv("BACKEND_AUTH_MODE", "clerk_or_api_key")
    monkeypatch.setenv("BACKEND_API_KEY", "test-backend-key")
    seen: dict[str, str] = {}

    async def fake_verify(token: str):
        seen["token"] = token
        return {"sub": "user_123"}

    monkeypatch.setattr(auth, "_verify_clerk_token", fake_verify)

    asyncio.run(auth.require_backend_auth(_request_with_bearer("clerk-session-token")))

    assert seen["token"] == "clerk-session-token"


def test_jwks_url_can_be_derived_from_frontend_api(monkeypatch):
    monkeypatch.delenv("CLERK_JWKS_URL", raising=False)
    monkeypatch.delenv("CLERK_ISSUER", raising=False)
    monkeypatch.setenv("CLERK_FRONTEND_API", "clerk.igetdressed.online")

    assert auth._get_jwks_url() == "https://clerk.igetdressed.online/.well-known/jwks.json"


def test_clerk_issuer_can_be_derived_from_frontend_api(monkeypatch):
    monkeypatch.delenv("CLERK_ISSUER", raising=False)
    monkeypatch.setenv("NEXT_PUBLIC_CLERK_FRONTEND_API", "clerk.igetdressed.online")

    assert auth._get_clerk_issuer() == "https://clerk.igetdressed.online"
