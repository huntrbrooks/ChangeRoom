# Onboarding (Fresh Agent / New Contributor)

## One-minute context

- **Backend**: Render (FastAPI) — see `backend/` and `render.yaml`
- **Frontend**: Vercel (Next.js) — see `frontend/`

Start with:
- `DEPLOYMENT.md` (source of truth)
- `ENVIRONMENT_VARIABLES.md` (what to set + where)

## Quick local run

1. Backend
   - `cd backend`
   - `python3 -m venv venv && source venv/bin/activate`
   - `pip install -r requirements.txt`
   - `uvicorn main:app --reload` (serves on `http://localhost:8000`)

2. Frontend
   - `cd frontend`
   - `npm install`
   - `npm run dev` (serves on `http://localhost:3000`)

## Bootstrap helper

Run:
- `./scripts/dev-bootstrap.sh`

It prints the deployment context and checks for common local misconfig (like missing `NEXT_PUBLIC_API_URL`).

## First places to check when something breaks

- **Frontend calling wrong backend**: Vercel env `NEXT_PUBLIC_API_URL`
- **CORS**: Render env `ALLOWED_ORIGINS` includes Vercel domains
- **iPhone HEIC/HEIF uploads**: frontend conversion prompt + backend `pillow-heif` + `libheif-dev` (Render build)




