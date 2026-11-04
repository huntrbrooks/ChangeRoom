# Deployment Guide (Source of Truth)

This repository is deployed as **two separate services**:

- **Backend (API)**: **Render** (Python / FastAPI), production `changeroom-production-worker`
- **Frontend (Web)**: **Vercel** (Next.js)

If you're a fresh agent or new contributor: start here. This document exists to prevent “where is this deployed?” confusion.

## High-level architecture

- Users load the **Vercel** Next.js app.
- The frontend calls:
  - **Render backend** directly for authenticated multipart `/api/try-on`. The older baseline also uses `/api/preprocess-clothing`; the deployed subscriber flow prepares files locally.
  - Next.js **API routes** (server-side) for authenticated billing, job issuance and private result retrieval. The deployed subscriber path stores result bytes in PostgreSQL; retained legacy routes also include R2 integrations.

## Important: there are two stacks for similar features

This repo currently contains **two implementations** of “try-on” and “preprocessing”:

- **FastAPI (Render) endpoints**:
  - `POST ${NEXT_PUBLIC_API_URL}/api/try-on` receives multipart images on Generate. In the deployed subscriber flow it requires a Clerk token and a server-issued job.
  - Do not infer preprocessing from a legacy component: verify its mount/props in the current homepage. In the deployed flow, choosing photos is local; there is no separate AI preprocessing call in the subscriber flow.

- **Next.js (Vercel) API routes**:
  - `POST /api/try-on/hold` issues the authenticated generation job; `/api/try-on/jobs/[id]/result` and `/api/try-on/recent` provide private result recovery. Retained legacy `/finalize` and `/cancel` routes must not be assumed to drive the current homepage.
  - `POST /api/save-person-image`, `GET /api/wardrobe`, and billing routes are separate from the FastAPI generation endpoint.

When debugging: **first confirm which stack the UI is calling** before editing.

## Backend (Render)

- **Production service**: `changeroom-production-worker`
- **Production origin**: `https://changeroom-production-worker.onrender.com`
- **Production reference config**: `render.production.yaml` (Docker context `backend/`, `backend/Dockerfile`)
- **Entry point**: `backend/main.py`
- **Legacy service/config**: `changeroom.onrender.com` / `render.yaml`; the old worker remains suspended. Do not resume or point production back to it to clear an alarm.

The protected staging worker/project is separate. The blueprint is configuration documentation, not proof of the current hosted revision or permission to apply it. See [current launch evidence](docs/operations/launch-readiness-2026-11-04.md) for deployment pins and remaining gates.

### Automatic operations

Render Cron `changeroom-production-operations` runs public availability checks, restricted database cleanup and a success heartbeat on `2-59/5 * * * *` UTC. The final command runs cleanup even when availability fails, and reports success only when both pass. Two natural scheduled runs and actual independent DOWN/UP email delivery were verified. GitHub `SUBSCRIBER_OPS_ENABLED=false` disables the former automatic schedule; protected manual recovery remains available. See [monitoring and cleanup](docs/operations/subscriber-launch.md#monitoring-and-job-cleanup) before any handover or schedule change.

### Backend environment variables (Render)
See `ENVIRONMENT_VARIABLES.md` → **Backend (Render)** section.

### CORS
Backend CORS allowlist is controlled by `ALLOWED_ORIGINS`.
Production allows only `https://igetdressed.online` and `https://www.igetdressed.online`. Staging uses its separate worker and explicit staging origin. Do not add a broad preview-origin allowance to the production worker.

## Frontend (Vercel)

- **Production project**: `changeroom`, Next.js app in `frontend/`, canonical `https://igetdressed.online`
- **Protected staging project**: `changeroom-rehearsal`, alias `https://changeroom-rehearsal-stage.vercel.app`
- **Config**: `vercel.json` (if present), `frontend/next.config.ts`

### Frontend environment variables (Vercel)
See `ENVIRONMENT_VARIABLES.md` → **Frontend (Vercel)** section.

### Critical runtime linkage (Frontend → Backend)
The key linkage is:
- `NEXT_PUBLIC_API_URL` = `https://changeroom-production-worker.onrender.com` in production, the separate staging worker in Preview, OR `http://localhost:8000` (dev)

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
- `X-ChangeRoom-Stack`: `fastapi-worker` (older releases: `fastapi-render`) or `nextjs-vercel`
- `X-Request-Id`: stable per request

Use these to correlate:
- Browser Network request → Render logs / Vercel function logs



## Subscriber release gate (November 2026)

See [worker and web database roles](database/TRYON_JOBS.md). Follow [subscriber deployment and incident operations](docs/operations/subscriber-launch.md) and the [recovery drill](docs/operations/restore.md) before reopening sales. The current baseline build has Next.js credit hold/finalize/cancel subroutes but **no** root Next.js `POST /api/try-on` or `/api/upload-urls` handler. Verify built routes and deployed revisions; subscriber authorization, settlement and recent-result recovery require the matching Render worker and database migrations. A successful static build or `GET /` is not proof of a paid flow.
