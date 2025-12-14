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


def test_try_on_missing_user_image(client: TestClient):
    """Test try-on endpoint with missing user image"""
    response = client.post("/api/try-on")
    assert response.status_code == 422  # Validation error


def test_try_on_missing_clothing(client: TestClient, sample_image_bytes):
    """Test try-on endpoint with missing clothing images"""
    files = {"user_image": ("user.jpg", sample_image_bytes, "image/jpeg")}
    response = client.post("/api/try-on", files=files)
    assert response.status_code == 422
    assert "clothing" in response.json()["detail"].lower()


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

