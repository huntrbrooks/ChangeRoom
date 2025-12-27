"""
Tests for main FastAPI application endpoints
"""
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import os


def test_root_endpoint(client: TestClient):
    """Test the root endpoint returns a valid response"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "IGetDressed.Online API" in data["message"]
    assert response.headers.get("X-ChangeRoom-Stack") == "fastapi-render"
    assert response.headers.get("X-Request-Id")


def test_try_on_missing_user_image(client: TestClient):
    """Test try-on endpoint with missing user image"""
    response = client.post("/api/try-on")
    # Endpoint enforces at least one user image and returns a 400 HTTPException
    assert response.status_code == 400
    assert response.headers.get("X-Request-Id")


def test_try_on_missing_clothing(client: TestClient, sample_image_bytes):
    """Test try-on endpoint with missing clothing images"""
    files = {"user_image": ("user.jpg", sample_image_bytes, "image/jpeg")}
    response = client.post("/api/try-on", files=files)
    assert response.status_code == 422
    assert "clothing" in response.json()["detail"].lower()


def test_try_on_accepts_heic_inputs_via_normalization(client: TestClient, sample_image_bytes, monkeypatch):
    """
    iPhone photos are often HEIC/HEIF. Even if the bytes are not actually HEIC in this test fixture,
    the endpoint should accept the declared mime/extension and normalize before calling the model.
    """
    from services import vton
    from services import analyze_user

    async def fake_user_attrs(_files):
        return {}

    async def fake_generate_try_on(*_args, **_kwargs):
        return {"image_url": "data:image/png;base64,AAAA", "retry_info": []}

    monkeypatch.setattr(analyze_user, "analyze_user_attributes", fake_user_attrs)
    monkeypatch.setattr(vton, "generate_try_on", fake_generate_try_on)

    files = {
        "user_image": ("user.heic", sample_image_bytes, "image/heic"),
        "clothing_image": ("garment.heic", sample_image_bytes, "image/heic"),
    }
    data = {"category": "upper_body"}
    resp = client.post("/api/try-on", files=files, data=data)
    assert resp.status_code == 200
    payload = resp.json()
    assert payload.get("image_url", "").startswith("data:image/")
    assert resp.headers.get("X-Request-Id")


def test_request_id_is_echoed_when_provided(client: TestClient):
    rid = "test-request-id-123"
    resp = client.get("/", headers={"X-Request-Id": rid})
    assert resp.status_code == 200
    assert resp.headers.get("X-Request-Id") == rid


def test_identify_products_missing_image(client: TestClient):
    """Test identify-products endpoint with missing image"""
    response = client.post("/api/identify-products")
    assert response.status_code == 422


def test_identify_products_valid(client: TestClient, sample_image_bytes):
    """Test identify-products endpoint with valid image"""
    files = {"clothing_image": ("clothing.jpg", sample_image_bytes, "image/jpeg")}
    # Note: This will fail without actual API key, but tests the endpoint structure
    response = client.post("/api/identify-products", files=files)
    # Should either succeed (200) or fail with API error (500), not validation error
    assert response.status_code in [200, 500]
    if response.status_code == 500:
        # Check it's an API error, not a validation error
        assert "GEMINI_API_KEY" in response.json()["detail"] or "api" in response.json()["detail"].lower()


def test_analyze_clothing_empty(client: TestClient):
    """Test analyze-clothing endpoint with no files"""
    response = client.post("/api/analyze-clothing", files={})
    assert response.status_code == 422


def test_analyze_clothing_too_many_files(client: TestClient, sample_image_bytes):
    """Test analyze-clothing endpoint with more than 5 files"""
    files = [
        ("clothing_images", (f"item_{i}.jpg", sample_image_bytes, "image/jpeg"))
        for i in range(6)
    ]
    response = client.post("/api/analyze-clothing", files=files)
    assert response.status_code == 400
    assert "5" in response.json()["detail"]


def test_preprocess_clothing_empty(client: TestClient):
    """Test preprocess-clothing endpoint with no files"""
    response = client.post("/api/preprocess-clothing", files={})
    assert response.status_code == 422


def test_preprocess_clothing_too_many_files(client: TestClient, sample_image_bytes):
    """Test preprocess-clothing endpoint with more than 5 files"""
    files = [
        ("clothing_images", (f"item_{i}.jpg", sample_image_bytes, "image/jpeg"))
        for i in range(6)
    ]
    response = client.post("/api/preprocess-clothing", files=files)
    assert response.status_code == 400
    assert "5" in response.json()["detail"]


def test_shop_endpoint_missing_query(client: TestClient):
    """Test shop endpoint with missing query"""
    response = client.post("/api/shop")
    assert response.status_code == 422


def test_shop_endpoint_valid(client: TestClient):
    """Test shop endpoint with valid query"""
    data = {"query": "blue jeans"}
    response = client.post("/api/shop", data=data)
    # Should return 200 with results or handle gracefully
    assert response.status_code in [200, 500]


def test_read_metadata_missing_path(client: TestClient):
    """Test read-image-metadata endpoint with missing path"""
    response = client.get("/api/read-image-metadata")
    assert response.status_code == 422


def test_read_metadata_nonexistent_file(client: TestClient):
    """Test read-image-metadata endpoint with nonexistent file"""
    response = client.get("/api/read-image-metadata?image_path=nonexistent.jpg")
    assert response.status_code == 404


def test_read_metadata_rejects_absolute_path(client: TestClient):
    """Should reject absolute paths to prevent arbitrary file reads."""
    response = client.get("/api/read-image-metadata?image_path=/etc/passwd")
    assert response.status_code == 400


def test_read_metadata_rejects_path_traversal(client: TestClient):
    """Should reject path traversal attempts."""
    response = client.get("/api/read-image-metadata?image_path=../secrets.txt")
    assert response.status_code == 400

