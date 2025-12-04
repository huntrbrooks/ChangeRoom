import io
import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest
from PIL import Image

TEMP_UPLOAD_DIR = tempfile.mkdtemp(prefix="yolo-test-")
os.environ.setdefault("YOLO_UPLOAD_DIR", TEMP_UPLOAD_DIR)
os.environ.setdefault("YOLO_ALLOWED_ORIGINS", "http://localhost:3000")
os.environ.setdefault("YOLO_MAX_FILE_MB", "5")
os.environ.setdefault("YOLO_USE_MOCK_MODEL", "1")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_module  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def cleanup_upload_dir():
    yield
    shutil.rmtree(TEMP_UPLOAD_DIR, ignore_errors=True)


@pytest.fixture()
def client():
    return app_module.app.test_client()


def _create_image_bytes():
    image = Image.new("RGB", (64, 64), color="teal")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.get_json()
    assert body["status"] == "ok"
    assert "model" in body


def test_upload_without_file_is_rejected(client):
    response = client.post("/upload")
    assert response.status_code == 400
    assert "error" in response.get_json()


def test_upload_success(client):
    buffer = _create_image_bytes()
    response = client.post(
        "/upload",
        data={"image": (buffer, "sample.png")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    body = response.get_json()
    assert body["detections"]
    assert body["processed_image"].startswith("iVBOR")

