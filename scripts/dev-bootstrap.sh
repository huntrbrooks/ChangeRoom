#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ""
echo "Change Room — Dev Bootstrap"
echo ""
echo "Deployment context:"
echo "- Backend: Render (FastAPI)"
echo "- Frontend: Vercel (Next.js)"
echo ""
echo "Local defaults:"
echo "- Backend:  http://localhost:8000"
echo "- Frontend: http://localhost:3000"
echo ""

backend_env_file="$ROOT_DIR/backend/.env"
frontend_env_file="$ROOT_DIR/frontend/.env.local"
backend_env_example="$ROOT_DIR/backend/env.example"
frontend_env_example="$ROOT_DIR/frontend/env.local.example"

missing=0

echo "Checking local env files (optional but recommended):"
if [[ -f "$backend_env_file" ]]; then
  echo "  ✓ backend/.env exists"
else
  echo "  ⚠ backend/.env missing (copy from backend/env.example for local runs)"
  if [[ -f "$backend_env_example" ]]; then
    echo "    ↳ Found template: backend/env.example"
  fi
fi
if [[ -f "$frontend_env_file" ]]; then
  echo "  ✓ frontend/.env.local exists"
else
  echo "  ⚠ frontend/.env.local missing (copy from frontend/env.local.example for local runs)"
  if [[ -f "$frontend_env_example" ]]; then
    echo "    ↳ Found template: frontend/env.local.example"
  fi
fi

echo ""
echo "Checking critical linkage:"
if [[ -f "$frontend_env_file" ]]; then
  api_url="$(grep -E '^NEXT_PUBLIC_API_URL=' "$frontend_env_file" | tail -n 1 | cut -d'=' -f2- || true)"
  if [[ -n "${api_url:-}" ]]; then
    echo "  ✓ NEXT_PUBLIC_API_URL=$api_url"
  else
    echo "  ⚠ NEXT_PUBLIC_API_URL is not set in frontend/.env.local"
    missing=1
  fi
else
  echo "  ⚠ Cannot check NEXT_PUBLIC_API_URL (frontend/.env.local not found)"
fi

echo ""
echo "Next steps:"
echo "- Docs:"
echo "  - DEPLOYMENT.md"
echo "  - ENVIRONMENT_VARIABLES.md"
echo "- Run locally:"
echo "  - Backend:  cd backend && ./venv/bin/python -m uvicorn main:app --reload"
echo "  - Frontend: cd frontend && npm install && npm run dev"
echo ""

exit "$missing"


