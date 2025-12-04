import base64
import logging
import os
import shutil
import tempfile
import uuid
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import List, Sequence

import numpy as np
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image
from ultralytics import YOLO
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.utils import secure_filename


def _env_bool(key: str, default: bool = False) -> bool:
    value = os.getenv(key)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _env_list(key: str, default: Sequence[str] | None = None) -> List[str]:
    value = os.getenv(key)
    if not value:
        return list(default or [])
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(slots=True)
class Settings:
    base_dir: Path = field(default_factory=lambda: Path(__file__).resolve().parent)
    model_path: str = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")
    upload_dir: Path = field(init=False)
    archive_dir: Path | None = field(init=False)
    allowed_extensions: set[str] = field(
        default_factory=lambda: {"png", "jpg", "jpeg", "bmp", "gif", "webp"}
    )
    max_file_size_bytes: int = int(float(os.getenv("YOLO_MAX_FILE_MB", "15")) * 1024 * 1024)
    confidence_threshold: float = float(os.getenv("YOLO_CONFIDENCE", "0.25"))
    max_detections: int = int(os.getenv("YOLO_MAX_DETECTIONS", "100"))
    device: str | None = os.getenv("YOLO_DEVICE")
    cors_origins: List[str] = field(default_factory=list)
    persist_uploads: bool = _env_bool("YOLO_PERSIST_UPLOADS", False)
    environment: str = os.getenv("YOLO_ENVIRONMENT", "development")
    port: int = int(os.getenv("PORT", "5000"))
    debug: bool = _env_bool("YOLO_DEBUG", False)
    use_mock_model: bool = _env_bool("YOLO_USE_MOCK_MODEL", False)

    def __post_init__(self):
        uploads_path = os.getenv("YOLO_UPLOAD_DIR", str(self.base_dir / "uploads"))
        self.upload_dir = Path(uploads_path)
        self.upload_dir.mkdir(parents=True, exist_ok=True)

        archive_path = os.getenv("YOLO_ARCHIVE_DIR")
        if archive_path:
            archive = Path(archive_path)
            archive.mkdir(parents=True, exist_ok=True)
            self.archive_dir = archive
        else:
            self.archive_dir = None

        default_origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
        configured_origins = _env_list("YOLO_ALLOWED_ORIGINS", default_origins)
        self.cors_origins = configured_origins

        # Ensure extensions are lowercase
        self.allowed_extensions = {ext.lower().lstrip(".") for ext in self.allowed_extensions}


load_dotenv()
settings = Settings()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("yolo-backend")

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)  # type: ignore
CORS(app, origins=settings.cors_origins)


class _MockBox:
    def __init__(self, coords, confidence, cls_idx):
        self.xyxy = np.array([coords], dtype=float)
        self.conf = np.array([confidence], dtype=float)
        self.cls = np.array([cls_idx], dtype=float)


class _MockResult:
    def __init__(self):
        self.boxes = [_MockBox([32, 32, 256, 256], 0.97, 0)]

    def plot(self):
        return np.zeros((360, 640, 3), dtype=np.uint8)


class _MockModel:
    names = {0: "mock-object"}

    def predict(self, *_, **__):
        return [_MockResult()]


def _build_model():
    if settings.use_mock_model:
        logger.warning("Using mock YOLO model (YOLO_USE_MOCK_MODEL=1)")
        return _MockModel()
    try:
        model_instance = YOLO(settings.model_path)
        logger.info("Loaded YOLO model from %s", settings.model_path)
        return model_instance
    except Exception as exc:  # pragma: no cover - startup failure
        logger.exception("Failed to load YOLO model: %s", exc)
        raise


model = _build_model()


def _allowed_file(filename: str) -> bool:
    if "." not in filename:
        return False
    return filename.rsplit(".", 1)[1].lower() in settings.allowed_extensions


def _encode_image(image_array) -> str:
    """Convert a numpy image array (RGB) into base64 PNG."""
    image = Image.fromarray(image_array)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def _persist_original(temp_path: Path, filename: str | None) -> None:
    if not settings.persist_uploads or not settings.archive_dir:
        return

    destination = settings.archive_dir / (filename or temp_path.name)
    try:
        shutil.copy2(temp_path, destination)
        logger.info("Saved original upload to %s", destination)
    except Exception as exc:  # pragma: no cover - best effort
        logger.warning("Failed to persist original file: %s", exc)


def _build_response(payload: dict, status_code: int = 200):
    return jsonify(payload), status_code


@app.get("/health")
def health_check():
    """Basic readiness probe exposed to Render."""
    return jsonify(
        {
            "status": "ok",
            "model": settings.model_path,
            "confidence": settings.confidence_threshold,
            "environment": settings.environment,
        }
    )


@app.post("/upload")
def upload_file():
    request_id = request.headers.get("X-Request-Id", uuid.uuid4().hex)

    if "image" not in request.files:
        return _build_response({"error": "No image part in the request", "request_id": request_id}, 400)

    file = request.files["image"]
    filename = secure_filename(file.filename or "")

    if not filename:
        return _build_response({"error": "No selected file", "request_id": request_id}, 400)

    if not _allowed_file(filename):
        return _build_response({"error": "Unsupported file type", "request_id": request_id}, 400)

    suffix = f".{filename.rsplit('.', 1)[1].lower()}"
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=settings.upload_dir)
    temp_path = Path(temp_file.name)
    temp_file.close()

    try:
        file.save(temp_path)
        file_size = temp_path.stat().st_size
        logger.info("Upload received (%s bytes) [request_id=%s]", file_size, request_id)

        if file_size > settings.max_file_size_bytes:
            temp_path.unlink(missing_ok=True)
            return _build_response(
                {
                    "error": f"File too large. Limit: {settings.max_file_size_bytes / (1024 * 1024):.1f} MB",
                    "request_id": request_id,
                },
                413,
            )

        results = model.predict(
            source=str(temp_path),
            conf=settings.confidence_threshold,
            max_det=settings.max_detections,
            device=settings.device,
            verbose=False,
        )

        if not results:
            raise RuntimeError("Model returned no results")

        first_result = results[0]
        plotted = first_result.plot()  # returns BGR image
        processed_image_base64 = _encode_image(plotted[..., ::-1])

        detections = []
        for box in first_result.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            confidence = round(float(box.conf[0]), 2)
            cls = int(box.cls[0])
            detections.append(
                {
                    "box": [x1, y1, x2, y2],
                    "confidence": confidence,
                    "class": model.names.get(cls, str(cls)),
                }
            )

        _persist_original(temp_path, filename)

        return _build_response(
            {
                "message": "File uploaded and processed successfully",
                "processed_image": processed_image_base64,
                "detections": detections,
                "request_id": request_id,
            }
        )
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Failed to process upload [request_id=%s]: %s", request_id, exc)
        return _build_response(
            {"error": "Unable to process image at this time", "request_id": request_id}, 500
        )
    finally:
        temp_path.unlink(missing_ok=True)


@app.get("/")
def index():
    return jsonify({"message": "YOLOv8 Flask backend is running.", "environment": settings.environment})


if __name__ == "__main__":  # pragma: no cover
    app.run(host="0.0.0.0", port=settings.port, debug=settings.debug)

