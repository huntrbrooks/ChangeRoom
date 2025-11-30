# Environment Variables Documentation

This document lists all required and optional environment variables for the Change Room application.

## Backend Environment Variables

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

## Frontend Environment Variables

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
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:8000` | `https://api.example.com` |
| `NEXT_PUBLIC_APP_URL` | Frontend application URL | `http://localhost:3000` | `https://app.example.com` |
| `TRYON_FREE_CREDITS` | Number of free credits for new users | `10` | `10` |
| `TRYON_STANDARD_MONTHLY_CREDITS` | Monthly credits for Standard plan | `50` | `50` |
| `TRYON_PRO_MONTHLY_CREDITS` | Monthly credits for Pro plan | `250` | `250` |

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

## Security Notes

1. **Never commit `.env` files** - They are in `.gitignore`
2. **Use different keys for development and production**
3. **Rotate keys regularly** - Especially if exposed
4. **Use environment-specific values** - Test keys for dev, live keys for prod
5. **Restrict API key permissions** - Only grant necessary permissions
6. **Monitor API usage** - Set up alerts for unusual activity

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

