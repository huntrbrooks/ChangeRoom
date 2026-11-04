import pytest
from fastapi import HTTPException
from container_entrypoint import validate
from services.auth import _get_auth_mode

ENV = {
    "CLERK_ISSUER": "https://identity.staging.invalid",
    "ALLOWED_ORIGINS": "https://studio.staging.invalid",
    "TRYON_DATABASE_URL": "postgresql://worker@db.staging.invalid/jobs",
}

@pytest.mark.parametrize("changed", [
    {"CLERK_ISSUER": ""}, {"CLERK_ISSUER": "http://identity.staging.invalid"},
    {"CLERK_JWKS_URL": "https://elsewhere.invalid/keys"}, {"BACKEND_AUTH_MODE": "none"},
    {"ALLOWED_ORIGINS": "*"}, {"ALLOWED_ORIGIN_REGEX": ".*"}, {"TRYON_DATABASE_URL": ""},
    {"PORT":"70000"},
])
def test_invalid_container_settings_fail_before_listening(changed):
    with pytest.raises(ValueError):
        validate({**ENV, **changed})

def test_port_and_config():
    assert validate(ENV) == 8080
    assert validate({**ENV, "PORT":"9876"}) == 9876

@pytest.mark.parametrize("mode", ["none", "clerk", "api_key"])
def test_cloud_run_refuses_missing_clerk_config_even_using_uvicorn_directly(monkeypatch, mode):
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.setenv("K_SERVICE", "sandbox-worker")
    for name in ("CLERK_ISSUER", "CLERK_FRONTEND_API", "NEXT_PUBLIC_CLERK_FRONTEND_API"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("BACKEND_AUTH_MODE", mode)
    with pytest.raises(HTTPException) as exc:
        _get_auth_mode()
    assert exc.value.status_code == 503
