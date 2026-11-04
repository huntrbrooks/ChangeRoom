"""Launch the subscriber worker, refusing unsafe provider-neutral configuration."""
import os
import sys
from urllib.parse import urlsplit


def https_origin(value):
    try:
        url = urlsplit(value)
        return (url.scheme == "https" and bool(url.hostname) and not url.username and not url.password
                and not (url.path or url.query or url.fragment or "*" in url.netloc)
                and value == "https://" + url.netloc)
    except ValueError:
        return False


def validate(env):
    if env.get("BACKEND_AUTH_MODE", "clerk").lower() != "clerk":
        raise ValueError("BACKEND_AUTH_MODE must be clerk")
    issuer = env.get("CLERK_ISSUER", "")
    if not https_origin(issuer):
        raise ValueError("CLERK_ISSUER must be the HTTPS origin of this deployment's Clerk application")
    if env.get("CLERK_JWKS_URL") not in (None, "", issuer + "/.well-known/jwks.json"):
        raise ValueError("CLERK_JWKS_URL must be derived from CLERK_ISSUER")
    if env.get("ALLOWED_ORIGIN_REGEX") or not all(
        https_origin(origin.strip()) for origin in env.get("ALLOWED_ORIGINS", "").split(",")
    ):
        raise ValueError("ALLOWED_ORIGINS must contain exact HTTPS frontend origins; regexes are disabled")
    db = urlsplit(env.get("TRYON_DATABASE_URL", ""))
    if db.scheme not in {"postgresql", "postgres"} or not db.hostname or not db.path.strip("/"):
        raise ValueError("TRYON_DATABASE_URL must identify the restricted job database")
    port = int(env.get("PORT", "8080"))
    if not 1 <= port <= 65535:
        raise ValueError("PORT is out of range")
    return port


if __name__ == "__main__":
    try:
        port = validate(os.environ)
    except ValueError:
        # Do not log raw environment values or parse exceptions: a value may contain a secret.
        raise SystemExit("Invalid worker settings; check PORT, Clerk, CORS and job database configuration.")
    os.environ["ENVIRONMENT"] = "production"
    os.environ["CHANGEROOM_CONTAINER"] = "1"
    os.execv(sys.executable, [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0",
                          "--port", str(port), "--workers", "1", "--no-access-log",
                          "--timeout-keep-alive", "5", "--timeout-graceful-shutdown", "30"])
