## Plan: Productionize YOLO App (Option A - Separate Render Services)

1. **Backend Hardening (`my-yolov8-app/backend/app.py`)**
   - Extract config (model path, max sizes, storage, CORS origins) into env-driven settings.
   - Replace on-disk temp directory with stream-to-tmp and optional S3/R2 persistence stub.
   - Add structured logging, request IDs, and better error responses (using `werkzeug.middleware.proxy_fix` + Flask logging config).
   - Ensure `/upload` validates file size/type before saving and keeps originals only if needed.

2. **Dependencies & Runtime (`my-yolov8-app/backend/requirements.txt`)**
   - Pin exact versions (Flask, Pillow, ultralytics, torch, python-multipart) and add `gunicorn`, `uvicorn`, `boto3` (for future storage), `python-dotenv`.
   - Provide `requirements.lock` or `poetry`/`pip-tools` export for reproducibility.
   - Add `env.example` (YOLO_MODEL_PATH, MAX_FILE_SIZE, STORAGE_BUCKET, etc.).

3. **Backend Container & Render Service**
   - Create `my-yolov8-app/backend/Dockerfile` (multi-stage, installs system deps like `libgl1`, caches model optionally, runs `gunicorn`).
   - Add `.dockerignore`, runtime scripts, and healthcheck.
   - Update root [`render.yaml`](render.yaml) with a new web service referencing this Dockerfile, env vars, secrets, volume for `/tmp`.

4. **Frontend Production Build (`my-yolov8-app/frontend/…`)**
   - Add `.env.example` with `REACT_APP_API_URL`.
   - Enhance UX: drag-drop, file size hints, inference duration, display detection table (update `src/App.js`/`App.css`).
   - Optimize build (CRA build, asset compression) and add lint/test scripts.
   - Create `render.yaml` static-site entry (build: `npm ci && npm run build`, publish `build/`).

5. **Docs & Operations**
   - Write `my-yolov8-app/README.md` covering local setup, Docker usage, Render deployment, env vars, testing.
   - Update root [`README.md`](README.md) + [`DEPLOY_TO_RENDER.md`](DEPLOY_TO_RENDER.md) to mention the new YOLO services, required env vars, and deployment flow.
   - Document logging/monitoring expectations and how to rotate models.

6. **Verification & Testing**
   - Add backend smoke tests (pytest) and sample image fixtures.
   - Add frontend CI (GitHub Action) to build/test before deploy.
   - Provide manual validation checklist (upload success, CORS, health check) before Render deploy.

