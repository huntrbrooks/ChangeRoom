# YOLOv8 Object Detection Web App

This directory contains a standalone Flask + React implementation that lets users upload images, run YOLOv8 detections, and review annotated outputs. It is designed to run independently from the primary Change Room FastAPI service so it can scale on Render using its own container and static site.

## Project Layout

```
my-yolov8-app/
├── backend/      # Flask + Ultralytics YOLO runtime
│   ├── app.py
│   ├── requirements.txt / requirements.lock
│   ├── env.example
│   ├── Dockerfile / .dockerignore
│   └── uploads/ (ephemeral tmp folder, gitignored)
└── frontend/     # React SPA (create-react-app)
    ├── src/App.js / App.css
    ├── env.example
    └── package.json
```

## Backend (Flask + Ultralytics)

### Local Setup

```bash
cd my-yolov8-app/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp env.example .env  # then edit values (model path, CORS, etc.)
python app.py
```

The backend exposes:

- `GET /health` – readiness probe used by Render
- `POST /upload` – accepts multipart `image`, validates size/type, performs detection, and returns:
  ```json
  {
    "processed_image": "data:image/png;base64,...",
    "detections": [{"box": [x1,y1,x2,y2], "class": "person", "confidence": 0.97}],
    "request_id": "..."
  }
  ```

Key environment variables (see `env.example`):

| Variable | Purpose |
| --- | --- |
| `YOLO_MODEL_PATH` | Weight file to load (defaults to `yolov8n.pt`, downloaded automatically) |
| `YOLO_ALLOWED_ORIGINS` | Comma-separated list used by CORS |
| `YOLO_MAX_FILE_MB` | Upload limit to reject oversized files upfront |
| `YOLO_CONFIDENCE` / `YOLO_MAX_DETECTIONS` | Prediction thresholds |
| `YOLO_UPLOAD_DIR` / `YOLO_ARCHIVE_DIR` | Temp + optional long-term storage locations |
| `YOLO_PERSIST_UPLOADS` | Controls whether originals are kept |
| `YOLO_ENVIRONMENT` / `YOLO_DEBUG` | Logging + diagnostics |

### Docker Runtime

The backend ships with a Dockerfile tailored for Render:

```bash
cd my-yolov8-app/backend
docker build -t yolo-backend .
docker run --rm -p 5000:5000 --env-file env.example yolo-backend
```

Notable Docker details:

- `python:3.10-slim` base, installs `libgl1`/`libglib2.0-0` for Pillow/torch.
- Runs via `gunicorn app:app`.
- Exposes port `5000` and respects the same env vars as local dev.

## Frontend (React SPA)

### Local Setup

```bash
cd my-yolov8-app/frontend
npm install
cp env.example .env
npm start
```

`REACT_APP_API_URL` (default `http://localhost:5000`) must point at the Flask service. The SPA now offers drag-and-drop uploads, inference timing, detection tables, and a short history of recent runs.

### Production Build

For Render's static site:

```bash
npm run build
serve -s build  # optional preview
```

Render build settings:

- **Build Command:** `npm ci && npm run build`
- **Publish Directory:** `my-yolov8-app/frontend/build`
- **Env Vars:** `REACT_APP_API_URL=https://yolo-backend.onrender.com`

## Render Deployment Flow

1. **Backend:** The root `render.yaml` now defines a `yolo-backend` Docker service that uses `my-yolov8-app/backend/Dockerfile`. Configure env vars + secrets in Render and deploy. Health check path is `/health`.
2. **Frontend:** Create a Render Static Site (or add a new entry to `render.yaml`) pointing to `my-yolov8-app/frontend`. Set `REACT_APP_API_URL` to the backend URL so builds bake in the correct endpoint.
3. **Verification:** After both deploys finish, confirm:
   - `https://<backend>/health` returns `{"status":"ok"...}`
   - Uploading via the SPA returns annotated imagery
   - CORS headers limit origins to the frontend domain you configured

## Testing

- Backend: add sample fixtures under `tests/` (see plan) and run `pytest`.
- Frontend: `npm test` for CRA Jest runs.
- Manual smoke: upload small (<15 MB) image, verify detection count, confirm inference time reported.

## Next Steps

- Enable persistent storage for detections (S3/R2) via `YOLO_ARCHIVE_DIR` or a custom adapter.
- Incorporate CI (GitHub Actions) to lint + build both backend and frontend before deploying.
- Hook Render deploys to repository PRs for automatic previews.

