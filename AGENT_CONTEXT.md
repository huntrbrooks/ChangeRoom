# Agent Context (copy/paste into a fresh Cursor agent chat)

## Deployment
- **Backend**: Render (FastAPI) — service: `change-room-backend`
- **Frontend**: Vercel (Next.js) — app in `frontend/`

## Production linkage
- Frontend → Backend base URL comes from: `NEXT_PUBLIC_API_URL` (Vercel env var)
- Backend must allow Vercel domains via: `ALLOWED_ORIGINS` (Render env var)

## Canonical user flows (verify before changing)
- Homepage (`frontend/app/page.tsx`) currently uses **Render backend directly**:
  - `POST ${NEXT_PUBLIC_API_URL}/api/try-on` (multipart/form-data)
  - `POST ${NEXT_PUBLIC_API_URL}/api/preprocess-clothing` (multipart/form-data)
- There is also a **Next.js API route** `POST /api/try-on` (JSON) that uses DB/R2 and billing holds.
  - Do not assume it’s wired into the homepage unless you confirm call sites.

## Key “gotchas”
- **Two try-on implementations exist** (FastAPI vs Next API). Confirm which is used before editing.
- Render filesystem is ephemeral; rely on R2/DB for persistence when required.
- iPhone photos/screenshots may be HEIC/HEIF; conversion + backend normalization exist.

## Debugging: identify stack + correlate logs

- In browser Network tab, check response headers:
  - `X-ChangeRoom-Stack`: `fastapi-render` or `nextjs-vercel`
  - `X-Request-Id`: use this to find the exact matching Render/Vercel log lines

## Quick local defaults
- Backend local: `http://localhost:8000`
- Frontend local: `http://localhost:3000`

## Where to read first
- `DEPLOYMENT.md`
- `ENVIRONMENT_VARIABLES.md`
- `ONBOARDING.md`


