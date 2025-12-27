# Environment Variables Documentation

This document lists all required and optional environment variables for the Change Room application.

## Deployment context (do not skip)

- **Backend** is deployed on **Render**
- **Frontend** is deployed on **Vercel**

If you're working locally:
- Backend runs at `http://localhost:8000`
- Frontend runs at `http://localhost:3000`

## Backend Environment Variables

### Backend (Render)

Set these in the **Render service** for the backend (see `render.yaml`).

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key for image generation and analysis | `AIzaSy...` |
| `GOOGLE_API_KEY` | Alternative name for GEMINI_API_KEY (fallback) | `AIzaSy...` |

### Optional

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `PYTHON_VERSION` | Python version for deployment | `3.10.0` | `3.10.0` |
| `PORT` | Server port (set by hosting platform) | `8000` | `8000` |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist for the backend | (built-in defaults) | `https://igetdressed.online,https://www.igetdressed.online` |
| `MAX_FILE_SIZE` | Max bytes per uploaded image | `10485760` | `10485760` |
| `MAX_TOTAL_SIZE` | Max bytes per request across all images | `52428800` | `52428800` |
| `VTON_MAX_TOTAL_IMAGE_BYTES` | Max total bytes of base64-decoded images sent to Gemini in a single try-on call (auto-downscales refs to stay under budget) | `12582912` (~12MB) | `16777216` |
| `VTON_MIN_MAIN_USER_DIM` | Minimum longest-side dimension (px) for the main user reference image when auto-downscaling to fit Gemini payload budget | `1600` | `1800` |
| `VTON_MIN_MAIN_USER_JPEG_QUALITY` | Minimum JPEG quality for the main user reference image when auto-downscaling to fit Gemini payload budget | `82` | `86` |
| `OPENAI_VISION_MAX_IMAGE_BYTES` | Max bytes per image sent to OpenAI vision calls (analysis/preprocess). Images are auto-normalized/downscaled to fit budget. | `4194304` (~4MB) | `6291456` |

## Frontend Environment Variables

### Frontend (Vercel)

Set these in the **Vercel project** for the frontend (`frontend/`).

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk authentication publishable key | `pk_test_...` |
| `CLERK_SECRET_KEY` | Clerk authentication secret key | `sk_test_...` |
| `STRIPE_SECRET_KEY` | Stripe API secret key | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |
| `STRIPE_STANDARD_PRICE_ID` | Stripe price ID for Standard plan | `price_...` |
| `STRIPE_PRO_PRICE_ID` | Stripe price ID for Pro plan | `price_...` |
| `STRIPE_CREDIT_PACK_SMALL_PRICE_ID` | Stripe price ID for small credit pack | `price_...` |
| `STRIPE_CREDIT_PACK_LARGE_PRICE_ID` | Stripe price ID for large credit pack | `price_...` |
| `DATABASE_URL` | PostgreSQL database connection string | `postgresql://...` |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID | `abc123...` |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key ID | `abc123...` |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret access key | `secret...` |
| `R2_BUCKET_NAME` | Cloudflare R2 bucket name | `change-room-storage` |
| `R2_PUBLIC_BASE_URL` | Public base URL for R2 bucket | `https://...` |
| `OPENAI_API_KEY` | OpenAI API key for batch preprocessing | `sk-...` |
| `GEMINI_API_KEY` | Google Gemini API key (for frontend if needed) | `AIzaSy...` |

### Optional

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `NEXT_PUBLIC_API_URL` | **Render backend** base URL | `http://localhost:8000` | `https://your-render-service.onrender.com` |
| `NEXT_PUBLIC_APP_URL` | Frontend application URL | `http://localhost:3000` | `https://app.example.com` |
| `TRYON_FREE_CREDITS` | Number of free credits for new users | `10` | `10` |
| `TRYON_STANDARD_MONTHLY_CREDITS` | Monthly credits for Standard plan | `50` | `50` |
| `TRYON_PRO_MONTHLY_CREDITS` | Monthly credits for Pro plan | `250` | `250` |
| `METRICS_EMAIL_SECRET` | Secret token to call the admin-only `/api/metrics-email` route | (none) | `your-long-random-token` |

## Environment Setup

### Development

1. **Backend** - Create `backend/.env`:
```bash
GEMINI_API_KEY=your_api_key_here
```

2. **Frontend** - Create `frontend/.env.local`:
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STANDARD_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_CREDIT_PACK_SMALL_PRICE_ID=price_...
STRIPE_CREDIT_PACK_LARGE_PRICE_ID=price_...
DATABASE_URL=postgresql://...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_BASE_URL=...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Production

All environment variables must be set in your hosting platform (e.g., Render, Vercel):

1. **Backend (Render)**
   - Set `GEMINI_API_KEY` in Render dashboard
   - `PORT` is automatically set by Render

2. **Frontend (Vercel/Next.js)**
   - Set all required variables in Vercel dashboard
   - Ensure `NEXT_PUBLIC_*` variables are set for client-side access
   - Use production API keys (not test keys)
   - Set `METRICS_EMAIL_SECRET` to enable the admin-only metrics endpoint

## Security Notes

1. **Never commit `.env` files** - They are in `.gitignore`
2. **Use different keys for development and production**
3. **Rotate keys regularly** - Especially if exposed
4. **Use environment-specific values** - Test keys for dev, live keys for prod
5. **Restrict API key permissions** - Only grant necessary permissions
6. **Monitor API usage** - Set up alerts for unusual activity

## Production hardening checklist (recommended)

### Frontend (Vercel)
- **Set `METRICS_EMAIL_SECRET`**:
  - Call `/api/metrics-email` with `Authorization: Bearer <METRICS_EMAIL_SECRET>` (or `x-metrics-token`)
  - If unset, the endpoint returns **404** (disabled by default)
- **Keep Stripe webhook secret private**: `STRIPE_WEBHOOK_SECRET`
- **R2 + DB secrets**: keep `R2_*` and `DATABASE_URL` server-only (do not expose via `NEXT_PUBLIC_*`)

### Backend (Render)
- **CORS allowlist**: set `ALLOWED_ORIGINS` to your production domains.
- **Uploads limits**: tune `MAX_FILE_SIZE` / `MAX_TOTAL_SIZE` as needed.
- **Endpoint protections**:
  - Expensive endpoints are **rate-limited** per instance (best-effort).
  - `/api/read-image-metadata` is restricted to files **inside `uploads/`** (prevents arbitrary server file reads).

## Validation

The application validates required environment variables at runtime:
- Backend: Fails fast if `GEMINI_API_KEY` is missing
- Frontend: Uses lazy loading to avoid build-time errors, but fails at runtime if required vars are missing

## Getting API Keys

- **Gemini API Key**: https://makersuite.google.com/app/apikey
- **Clerk Keys**: https://dashboard.clerk.com
- **Stripe Keys**: https://dashboard.stripe.com/apikeys
- **OpenAI Key**: https://platform.openai.com/api-keys
- **R2 Keys**: Cloudflare Dashboard → R2 → Manage R2 API Tokens

