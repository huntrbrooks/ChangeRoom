"""
Pytest configuration and shared fixtures
"""
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import sys
import os

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Set test environment variables before importing app
os.environ.setdefault("GEMINI_API_KEY", "test-key")
os.environ.setdefault("GOOGLE_API_KEY", "test-key")

from main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app"""
    return TestClient(app)


@pytest.fixture
def sample_image_bytes():
    """Create sample image bytes for testing"""
    # Create a valid image that passes the backend minimum resolution check (>= 400px min dim)
    from PIL import Image as PILImage  # type: ignore
    import io

    img = PILImage.new("RGB", (512, 512), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def uploads_dir(tmp_path):
    """Create a temporary uploads directory"""
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    return uploads

