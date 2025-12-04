# Manual Validation Checklist

## Backend (Flask YOLO)

1. `GET /health` returns HTTP 200 with `{"status":"ok","model":"..."}`.
2. Uploads larger than `YOLO_MAX_FILE_MB` are rejected with HTTP 413.
3. Uploading a supported image returns:
   - `detections` array populated.
   - `processed_image` base64 string decodes to a PNG with bounding boxes.
   - `request_id` header present in the payload.
4. When `YOLO_PERSIST_UPLOADS=true`, confirm originals are copied to `YOLO_ARCHIVE_DIR`.
5. When `YOLO_ALLOWED_ORIGINS` is set to a single domain, verify CORS headers only allow that origin.

## Frontend (React SPA)

1. Drag-and-drop area accepts files and highlights while dragging.
2. `Upload and Detect` button disables during processing and re-enables on completion/error.
3. Processed image renders with detection stats (counts + inference time).
4. Detection table lists each class, confidence, and bounding box coordinates.
5. Recent history section logs at least the last three successful runs.
6. Invalid uploads show a toast/alert with the backend error message.

Document results (pass/fail) before promoting deployments to production.*** End Patch*** End Patch

