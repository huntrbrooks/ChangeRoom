# IGetDressed.Online

Try on clothes & Save from the comfort of your own home

## Deployment context (read this first)

- **Backend** is deployed on **Render**
- **Frontend** is deployed on **Vercel**

Start here:
- `DEPLOYMENT.md` (source of truth)
- `ENVIRONMENT_VARIABLES.md` (all env vars + where they live)

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- OpenAI API key for try-on generation
- Optional Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey) for safety rewrite helpers

### Environment Variables

Create a `.env` file in the `backend` directory with the following:

```bash
# Required: OpenAI API key for try-on image generation
OPENAI_API_KEY=your_api_key_here

# Optional: Gemini API key for rewrite / safety helpers
GEMINI_API_KEY=your_api_key_here

# Optional: Fallback to GOOGLE_API_KEY for backward compatibility
# GOOGLE_API_KEY=your_api_key_here
```

Create a `.env.local` file in the `frontend` directory with the following:

```bash
# Optional: Paywall bypass emails (comma-separated list)
# Users with these emails will have unlimited access while paywall remains visible
# Example: NEXT_PUBLIC_PAYWALL_BYPASS_EMAILS=gerard.grenville@gmail.com
NEXT_PUBLIC_PAYWALL_BYPASS_EMAILS=gerard.grenville@gmail.com
```

**Note:** The try-on flow uses direct REST API calls to OpenAI image edits with API key authentication. No OAuth2 setup is required.

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`

## API Endpoints

- `POST /api/try-on` - Virtual try-on with person and clothing images
- `POST /api/analyze-clothing` - Analyze clothing items with metadata extraction
- `POST /api/identify-products` - Identify and search for similar products
- `POST /api/shop` - Search for products online

## Architecture

### AI API Integration

This application uses direct API calls with API key authentication:

- **Try-on generation** - OpenAI image edits via `OPENAI_API_KEY` and `gpt-image-1.5`
- **Analysis / helpers** - OpenAI and optional Gemini helpers for metadata, product identification, and safety rewrite support
- **No OAuth required** - Uses `httpx` / OpenAI SDK calls where appropriate
- **Multiple models** - Automatically falls back between models for reliability
- **Image support** - Normalizes uploaded images server-side before model calls

Key service files:
- `backend/services/vton.py` - Virtual try-on image generation
- `backend/services/gemini.py` - Clothing analysis and product identification

## Deployment

### Render.com

1. Set `OPENAI_API_KEY` environment variable in Render dashboard
2. Optionally set `GEMINI_API_KEY` for rewrite / safety helper paths
3. Deploy backend service
4. Update frontend `NEXT_PUBLIC_API_URL` to point to your Render backend

### YOLOv8 Demo Services

The repository now includes `my-yolov8-app/`, a standalone Flask + React experience for running YOLOv8 detections. To deploy it:

1. Provision the `yolo-backend` service defined in `render.yaml` (Docker runtime pointing at `my-yolov8-app/backend`).
2. Create a Render Static Site (or add to `render.yaml`) for `my-yolov8-app/frontend`, setting `REACT_APP_API_URL` to the backend URL.
3. Review `my-yolov8-app/README.md` for local setup, environment variables, and health checks.

## License

MIT
