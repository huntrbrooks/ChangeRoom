# Deployment Guide (Source of Truth)

This repository is deployed as **two separate services**:

- **Backend (API)**: **Render** (Python / FastAPI)
- **Frontend (Web)**: **Vercel** (Next.js)

If you're a fresh agent or new contributor: start here. This document exists to prevent “where is this deployed?” confusion.

## High-level architecture

- Users load the **Vercel** Next.js app.
- The frontend calls:
  - **Render backend** directly for some endpoints (e.g. `NEXT_PUBLIC_API_URL` → `/api/try-on`, `/api/preprocess-clothing`).
  - Next.js **API routes** (server-side) for authenticated flows, billing, and storage (R2).

## Important: there are two stacks for similar features

This repo currently contains **two implementations** of “try-on” and “preprocessing”:

- **FastAPI (Render) endpoints**:
  - `POST ${NEXT_PUBLIC_API_URL}/api/try-on` (multipart/form-data)
  - `POST ${NEXT_PUBLIC_API_URL}/api/preprocess-clothing` (multipart/form-data)
  - Used by: `frontend/app/page.tsx` and `frontend/app/components/BulkUploadZone.tsx`

- **Next.js (Vercel) API routes**:
  - `POST /api/try-on` (JSON; uses DB/R2 + credit holds)
  - `POST /api/upload-urls`, `POST /api/save-person-image`, `GET /api/wardrobe`, etc.

When debugging: **first confirm which stack the UI is calling** before editing.

## Backend (Render)

- **Service**: `change-room-backend`
- **Config file**: `render.yaml`
- **Entry point**: `backend/main.py`
- **Start command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT ...`

### Backend environment variables (Render)
See `ENVIRONMENT_VARIABLES.md` → **Backend (Render)** section.

### CORS
Backend CORS allowlist is controlled by `ALLOWED_ORIGINS`.
Make sure it includes your Vercel domains:
- Production domain(s)
- Preview domain(s) if you use previews

## Frontend (Vercel)

- **Project**: Next.js app in `frontend/`
- **Config**: `vercel.json` (if present), `frontend/next.config.ts`

### Frontend environment variables (Vercel)
See `ENVIRONMENT_VARIABLES.md` → **Frontend (Vercel)** section.

### Critical runtime linkage (Frontend → Backend)
The key linkage is:
- `NEXT_PUBLIC_API_URL` = Render backend base URL (prod) OR `http://localhost:8000` (dev)

## Where to look first when debugging

1. **Wrong backend URL?**
   - Check Vercel env var: `NEXT_PUBLIC_API_URL`
2. **CORS errors?**
   - Check Render env var: `ALLOWED_ORIGINS`
3. **Uploads/generation failing (iPhone HEIC/HEIF)?**
   - Frontend now prompts for conversion; backend also normalizes.
   - Check Render build logs installed `libheif-dev` and Python `pillow-heif`.

## Debugging superpower: Request correlation IDs

Both stacks now attach:
- `X-ChangeRoom-Stack`: `fastapi-render` or `nextjs-vercel`
- `X-Request-Id`: stable per request

Use these to correlate:
- Browser Network request → Render logs / Vercel function logs


