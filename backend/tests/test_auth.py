import asyncio
import base64
import hashlib
import hmac
import json
import time

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from services import auth


@pytest.fixture
def signing_key(monkeypatch):
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    numbers = private.public_key().public_numbers()
    def number(value):
        return base64.urlsafe_b64encode(value.to_bytes((value.bit_length()+7)//8, 'big')).rstrip(b'=').decode()
    key = {'kty':'RSA','alg':'RS256','use':'sig','kid':'test-key','n':number(numbers.n),'e':number(numbers.e)}
    async def jwks(): return [key]
    monkeypatch.setattr(auth, '_fetch_jwks', jwks)
    monkeypatch.setenv('CLERK_ISSUER', 'https://test.clerk.accounts.dev')
    monkeypatch.delenv('CLERK_AUDIENCE', raising=False)
    return private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()), private.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)


@pytest.mark.parametrize('invalid', [None, 'expired', 'issuer'])
def test_real_rs256_signature_and_claims(signing_key, invalid):
    claims = {'sub':'test-user', 'iss':'https://test.clerk.accounts.dev', 'exp':int(time.time())+60}
    if invalid == 'expired': claims['exp'] = int(time.time())-60
    if invalid == 'issuer': claims['iss'] = 'https://other.clerk.accounts.dev'
    token = auth.jwt.encode(claims, signing_key[0], algorithm='RS256', headers={'kid':'test-key'})
    if invalid:
        with pytest.raises(HTTPException) as error: asyncio.run(auth._verify_clerk_token(token))
        assert error.value.status_code == 401
    else:
        assert asyncio.run(auth._verify_clerk_token(token))['sub'] == 'test-user'


def test_rejects_hs256_forgery_using_public_rsa_key(signing_key):
    # Regression for python-jose GHSA-3qf3-8w2g-rqmx: the DER public key is
    # attacker-known. The application must always pin RS256 rather than trust alg.
    def part(value): return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b'=')
    message = part({'alg':'HS256','kid':'test-key'}) + b'.' + part({'sub':'forged','iss':'https://test.clerk.accounts.dev','exp':int(time.time())+60})
    signature = base64.urlsafe_b64encode(hmac.new(signing_key[1], message, hashlib.sha256).digest()).rstrip(b'=')
    with pytest.raises(HTTPException) as error:
        asyncio.run(auth._verify_clerk_token((message+b'.'+signature).decode()))
    assert error.value.status_code == 401


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
