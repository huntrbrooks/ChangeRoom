# Deployment Guide (Source of Truth)

This repository is deployed as **two separate services**:

- **Backend (API)**: **Render** (Python / FastAPI)
- **Frontend (Web)**: **Vercel** (Next.js)

If you're a fresh agent or new contributor: start here. This document exists to prevent “where is this deployed?” confusion.

## High-level architecture

- Users load the **Vercel** Next.js app.
- The frontend calls:
  - **Render backend** directly for authenticated multipart `/api/try-on`. The older baseline also uses `/api/preprocess-clothing`; the subscriber candidate prepares files locally.
  - Next.js **API routes** (server-side) for authenticated flows, billing, and storage (R2).

## Important: there are two stacks for similar features

This repo currently contains **two implementations** of “try-on” and “preprocessing”:

- **FastAPI (Render) endpoints**:
  - `POST ${NEXT_PUBLIC_API_URL}/api/try-on` receives multipart images on Generate. In the subscriber candidate it requires a Clerk token and a server-issued job.
  - Do not infer preprocessing from a legacy component: verify its mount/props in the current homepage. In the candidate, choosing photos is local; there is no separate AI preprocessing call in the subscriber flow.

- **Next.js (Vercel) API routes**:
  - The older baseline has `/api/try-on/hold`, `/finalize`, `/cancel`; the subscriber candidate adds server-issued jobs and recent-result recovery.
  - `POST /api/save-person-image`, `GET /api/wardrobe`, and billing routes are separate from the FastAPI generation endpoint.

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



## Subscriber release gate (November 2026 candidate)

See [worker and web database roles](database/TRYON_JOBS.md). Follow [subscriber deployment and incident operations](docs/operations/subscriber-launch.md) and the [recovery drill](docs/operations/restore.md) before reopening sales. The current baseline build has Next.js credit hold/finalize/cancel subroutes but **no** root Next.js `POST /api/try-on` or `/api/upload-urls` handler. Verify the candidate’s built routes and deployed revisions; subscriber authorization, settlement and recent-result recovery require the matching Render worker and database migrations. A successful static build or `GET /` is not proof of a paid flow.
