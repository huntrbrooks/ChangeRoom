# ChangeRoom

Try on clothes & Save from the comfort of your own home

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- Gemini API Key from [Google AI Studio](https://makersuite.google.com/app/apikey)

### Environment Variables

Create a `.env` file in the `backend` directory with the following:

```bash
# Required: Gemini API Key for image generation and analysis
# Get your API key from: https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your_api_key_here

# Optional: Fallback to GOOGLE_API_KEY for backward compatibility
# GOOGLE_API_KEY=your_api_key_here
```

**Note:** The application uses direct REST API calls to Gemini API with API key authentication. No OAuth2 or SDK setup is required.

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

### Gemini API Integration

This application uses **direct REST API calls** to Google's Gemini API with API key authentication:

- **No SDKs required** - Uses `httpx` for async HTTP requests
- **API Key only** - Simple authentication via `GEMINI_API_KEY` environment variable
- **Multiple models** - Automatically falls back between models for reliability
- **Image support** - Sends images as base64 `inline_data` in requests

All Gemini API calls are implemented in:
- `backend/services/vton.py` - Virtual try-on image generation
- `backend/services/gemini.py` - Clothing analysis and product identification

## Deployment

### Render.com

1. Set `GEMINI_API_KEY` environment variable in Render dashboard
2. Deploy backend service
3. Update frontend `NEXT_PUBLIC_API_URL` to point to your Render backend

## License

MIT
