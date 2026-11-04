#!/usr/bin/env bash
# Run on a Linux Docker host. No network, registry push or provider credentials.
set -euo pipefail
image=${1:?pass the tag of a locally built subscriber worker}
name="changeroom-worker-ci-${RANDOM}-$$"
cleanup() { docker rm --force "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

settings=(--env PORT=9876 --env K_SERVICE=rehearsal
  --env ALLOWED_ORIGINS=https://studio.example.invalid
  --env TRYON_DATABASE_URL=postgresql://worker@db.example.invalid/jobs)
restrictions=(--pull=never --network=none --read-only --tmpfs /tmp:rw,nosuid,nodev)
run_with_deadline() {
  # Python is already required by the checks; avoid a GNU timeout dependency on macOS.
  python3 - "$@" <<'PY'
import subprocess,sys
try:
    sys.exit(subprocess.run(sys.argv[1:], timeout=15).returncode)
except subprocess.TimeoutExpired:
    sys.exit(124)
PY
}
# All other required settings exist, but no Clerk issuer is supplied. A secure
# worker must exit deliberately, rather than merely failing the build or timing out.
status=0
run_with_deadline docker run --name "$name" "${restrictions[@]}" "${settings[@]}" "$image" || status=$?
if [[ "$status" != 1 ]]; then
  echo "Expected an immediate configuration error without a Clerk issuer; got $status" >&2
  exit 1
fi
docker logs "$name" 2>&1 | grep -F "Invalid worker settings" >/dev/null
cleanup

# Uvicorn must fail its FastAPI lifespan even when only a fallback is configured.
# The fake keys are literal fixtures; --network=none is still in force.
status=0
run_with_deadline docker run --name "$name" "${restrictions[@]}" "${settings[@]}" \
  --env CLERK_ISSUER=https://identity.example.invalid \
  --env GEMINI_API_KEY=ci-fake-fallback-not-a-provider-key "$image" || status=$?
if [[ "$status" != 3 ]]; then
  echo "Expected Uvicorn startup to reject a fallback-only worker; got $status" >&2
  exit 1
fi
docker logs "$name" 2>&1 | grep -F "Primary image provider is not configured" >/dev/null
cleanup
docker run --name "$name" --detach "${restrictions[@]}" "${settings[@]}" \
  --env CLERK_ISSUER=https://identity.example.invalid \
  --env OPENAI_API_KEY=ci-fake-primary-not-a-provider-key "$image" >/dev/null

# Only the container's loopback interface exists; the test cannot reach an AI
# model, Clerk, Postgres, Stripe, or any other remote provider.
docker exec -i "$name" python - <<'PY'
import http.client
import importlib.util
import io
import json
import os
import time
from pathlib import Path
from PIL import Image
import psycopg
from backend.main import ensure_heif_registered, normalize_image_bytes

assert os.geteuid() == 10001
for installer in ("pip", "setuptools", "pkg_resources", "wheel"):
    assert importlib.util.find_spec(installer) is None, installer
assert psycopg.pq.__impl__ == "binary"
uid_line = next(line for line in Path("/proc/1/status").read_text().splitlines() if line.startswith("Uid:"))
assert set(uid_line.split()[1:]) == {"10001"}, uid_line

def request(method, path, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", int(os.environ["PORT"]), timeout=3)
    try:
        conn.request(method, path, headers=headers or {})
        response = conn.getresponse()
        return response.status, response.read(), response.getheader("Access-Control-Allow-Origin")
    finally:
        conn.close()

for _ in range(40):
    try:
        status, body, _ = request("GET", "/")
        break
    except (OSError, http.client.HTTPException):
        time.sleep(.25)
else:
    raise RuntimeError("worker did not bind its configured port")
assert status == 200 and "running" in json.loads(body)["message"]
assert request("POST", "/api/try-on")[0] == 401
for origin, allowed in [("https://studio.example.invalid", True), ("https://other.example.invalid", False)]:
    status, _, allow_origin = request("OPTIONS", "/api/try-on", {
        "Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,x-request-id"})
    assert (status, allow_origin) == ((200, origin) if allowed else (400, None))

assert ensure_heif_registered()
photo = io.BytesIO()
Image.new("RGB", (64, 48), "navy").save(photo, format="HEIF")
data, mime, width, height = normalize_image_bytes(photo.getvalue())
assert mime == "image/jpeg" and (width, height) == (64, 48)
with Image.open(io.BytesIO(data)) as result:
    result.load()
    assert result.format == "JPEG" and result.size == (64, 48)
print("Passed: UID, installer removal, binary DB driver, config, port, liveness, auth, CORS and HEIF decoding.")
PY
