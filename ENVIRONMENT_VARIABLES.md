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
| `OPENAI_API_KEY` | OpenAI API key for try-on generation and OpenAI analysis/preprocess helpers | `sk-...` |

### Optional

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `PYTHON_VERSION` | Python version for deployment | `3.10.0` | `3.10.0` |
| `PORT` | Server port (set by hosting platform) | `8000` | `8000` |
| `NEXT_PUBLIC_APP_URL` | Frontend URL used in backend responses | (none) | `https://changeroom.vercel.app` |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist for the backend | (built-in defaults) | `https://changeroom.vercel.app,https://www.igetdressed.online` |
| `ALLOWED_ORIGIN_REGEX` | Regex CORS allowlist override | (none) | `^https://.*\.vercel\.app$` |
| `MAX_FILE_SIZE` | Max bytes per uploaded image | `10485760` | `10485760` |
| `MAX_TOTAL_SIZE` | Max bytes per request across all images | `52428800` | `52428800` |
| `GEMINI_API_KEY` | Optional Google Gemini API key for rewrite/safety helpers and Gemini-backed analysis paths | (none) | `AIzaSy...` |
| `GOOGLE_API_KEY` | Alternative name for GEMINI_API_KEY (fallback) | (none) | `AIzaSy...` |
| `OPENAI_TRYON_IMAGE_MODEL` | OpenAI model for main try-on image edits | `gpt-image-2` | `gpt-image-2` |
| `OPENAI_MODEL_PHOTO_ANALYSIS_MODEL` | OpenAI vision model for model-photo metadata extraction | `gpt-5-mini` | `gpt-5-mini` |
| `OPENAI_MODEL_PHOTO_COMPOSITE_MODEL` | OpenAI image model for multi-photo model composites | `gpt-image-2` | `gpt-image-2` |
| `OPENROUTER_API_KEY` | OpenRouter fallback key used when OpenAI billing/quota is exhausted, and for optional safety-rewrite fallback | (none) | `sk-or-...` |
| `OPENROUTER_TRYON_IMAGE_MODEL` | OpenRouter image-output fallback model for try-on generation | `google/gemini-3.1-flash-image-preview` | `google/gemini-3.1-flash-image-preview` |
| `OPENROUTER_VISION_MODEL` | OpenRouter vision/text fallback model for clothing preprocessing | `google/gemini-3.1-flash-lite` | `google/gemini-3.1-flash-lite` |
| `OPENROUTER_TRYON_CONTENT_FALLBACK_ENABLED` | Enable OpenRouter try-on fallback after OpenAI content-safety blocks only after safety rewrites; keeps a general-audience safety contract | `0` | `0` |
| `OPENROUTER_TRYON_IMAGE_SIZE` | OpenRouter fallback image size hint | `1K` | `1K` |
| `OPENROUTER_TRYON_ASPECT_RATIO` | OpenRouter fallback aspect ratio hint | derived from OpenAI size | `2:3` |
| `XAI_API_KEY` | xAI API key for final Grok image fallback | (none) | `xai-...` |
| `XAI_TRYON_IMAGE_MODEL` | xAI/Grok image model for final fallback | `grok-imagine-image-quality` | `grok-imagine-image-quality` |
| `TRYON_PROVIDER_MAX_RETRIES` | Retry count per provider before provider fallback | `2` | `2` |
| `OPENAI_TRYON_IMAGE_SIZE` | Output size for try-on image edits | `1024x1536` | `1024x1536` |
| `OPENAI_TRYON_QUALITY` | Output quality for try-on image edits | `high` | `medium` |
| `OPENAI_TRYON_OUTPUT_FORMAT` | Output format for try-on results | `jpeg` | `png` |
| `OPENAI_TRYON_MODERATION` | OpenAI image moderation setting | `auto` | `auto` |
| `OPENAI_VISION_MAX_IMAGE_BYTES` | Max bytes per image sent to OpenAI vision calls | `4194304` | `6291456` |
| `SERPAPI_API_KEY` | SerpAPI key for product search | (none) | `abc123` |
| `BACKEND_AUTH_MODE` | Protect expensive endpoints: `none`, `clerk`, `api_key`, or `clerk_or_api_key` | `none` | `clerk_or_api_key` |
| `BACKEND_API_KEY` | Shared secret when `BACKEND_AUTH_MODE=api_key` or `clerk_or_api_key` | (none) | `replace_me` |
| `CLERK_ISSUER` | Clerk issuer URL for JWT verification when `BACKEND_AUTH_MODE=clerk` or `clerk_or_api_key` | (none) | `https://your-clerk-issuer` |
| `CLERK_FRONTEND_API` | Clerk frontend API host used to derive issuer/JWKS when `CLERK_ISSUER`/`CLERK_JWKS_URL` are not set | (none) | `clerk.igetdressed.online` |
| `CLERK_JWKS_URL` | JWKS URL (optional override if not using issuer) | (derived) | `https://your-clerk-issuer/.well-known/jwks.json` |
| `CLERK_AUDIENCE` | Optional JWT audience check for Clerk tokens | (none) | `your-audience` |
| `CLERK_JWKS_CACHE_SECONDS` | JWKS cache TTL in seconds | `300` | `600` |
| `STORAGE_TYPE` | Storage backend: `local`, `r2`, or `s3` | `local` | `r2` |
| `R2_ENDPOINT_URL` | Cloudflare R2 endpoint URL | (derived) | `https://<account>.r2.cloudflarestorage.com` |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID | (none) | `abc123...` |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key ID | (none) | `abc123...` |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret access key | (none) | `secret...` |
| `R2_BUCKET_NAME` | Cloudflare R2 bucket name | (none) | `change-room-storage` |
| `R2_PUBLIC_BASE_URL` | Public base URL for R2 bucket | (none) | `https://...` |
| `AWS_S3_BUCKET_NAME` | AWS S3 bucket name (if `STORAGE_TYPE=s3`) | (none) | `change-room` |
| `AWS_S3_REGION` | AWS region for S3 | `us-east-1` | `ap-southeast-2` |
| `AWS_ACCESS_KEY_ID` | AWS access key for S3 | (none) | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for S3 | (none) | `secret...` |
| `GEMINI_USER_ANALYZE_MODEL` | Gemini model for user analysis | (fallback chain) | `gemini-2.5-flash` |
| `GEMINI_GARMENT_ANALYZE_MODEL` | Gemini model for garment analysis | (fallback chain) | `gemini-2.5-flash` |
| `GEMINI_VISION_MODEL` | Gemini vision model override | (fallback chain) | `gemini-2.5-flash-image` |
| `GEMINI_TEXT_MODEL` | Gemini text model override | (fallback chain) | `gemini-2.5-flash` |
| `GEMINI_REWRITE_ENABLED` | Enable content-rewrite fallback | `1` | `0` |
| `GEMINI_REWRITE_MODEL` | Model for rewrite attempts | (fallback chain) | `gemini-2.5-flash` |
| `GEMINI_REWRITE_TIMEOUT_S` | Rewrite timeout in seconds | `12` | `18` |
| `GEMINI_VERIFY_MODEL` | Enable/override verification model | `0` | `1` |
| `GEMINI_INTIMATE_DETECT_ENABLED` | Enable intimate detection step | `1` | `0` |
| `GEMINI_INTIMATE_DETECT_MAX_DIM` | Max dimension for intimate detection | `900` | `1200` |
| `GEMINI_INTIMATE_DETECT_MODEL` | Model for intimate detection | (fallback chain) | `gemini-2.5-flash` |
| `GEMINI_INTIMATE_DETECT_TIMEOUT_S` | Intimate detection timeout | `6` | `8` |
| `VTON_MAX_TOTAL_IMAGE_BYTES` | Max total bytes of images sent to Gemini per try-on | `12582912` (~12MB) | `16777216` |
| `VTON_MIN_MAIN_USER_DIM` | Minimum longest-side dimension for main user image | `1600` | `1800` |
| `VTON_MIN_MAIN_USER_JPEG_QUALITY` | Minimum JPEG quality for main user image | `82` | `86` |

## Frontend Environment Variables

### Frontend (Vercel)

Set these in the **Vercel project** for the frontend (`frontend/`).

### Required (core auth + billing + try-on)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk authentication publishable key | `pk_live_...` |
| `CLERK_SECRET_KEY` | Clerk authentication secret key (server-side auth) | `sk_live_...` |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook signing secret for `/api/webhooks/clerk` | `whsec_...` |
| `DATABASE_URL` | PostgreSQL connection string (or use `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING`) | `postgresql://...` |
| `NEXT_PUBLIC_API_URL` | **Render backend** base URL (homepage calls Render directly) | `https://changeroom.onrender.com` |

### Required (payments)

| Variable | Description | Example |
|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |
| `STRIPE_STARTER_PRICE_ID` | Stripe price ID for Starter plan | `price_...` |
| `STRIPE_STARTER_XMAS_PRICE_ID` | Stripe price ID for Starter Xmas plan | `price_...` |
| `STRIPE_VALUE_PRICE_ID` | Stripe price ID for Value plan | `price_...` |
| `STRIPE_PRO_PRICE_ID` | Stripe price ID for Pro plan | `price_...` |
| `STRIPE_CREATOR_PRICE_ID` | Stripe price ID for Creator plan | `price_...` |
| `STRIPE_POWER_PRICE_ID` | Stripe price ID for Power plan | `price_...` |

### Upload And Preprocess

Upload signing and clothing preprocessing now run through the Render backend. The Vercel frontend no longer requires `R2_*` or `OPENAI_API_KEY` for its deprecated upload/preprocess routes.

### Optional (feature flags + analytics + affiliate)

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `NEXT_PUBLIC_APP_URL` | Frontend application URL | `http://localhost:3000` | `https://changeroom.vercel.app` |
| `NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID` | Client-safe price ID override | (none) | `price_...` |
| `NEXT_PUBLIC_STRIPE_STARTER_XMAS_PRICE_ID` | Client-safe price ID override | (none) | `price_...` |
| `NEXT_PUBLIC_STRIPE_VALUE_PRICE_ID` | Client-safe price ID override | (none) | `price_...` |
| `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` | Client-safe price ID override | (none) | `price_...` |
| `NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID` | Client-safe price ID override | (none) | `price_...` |
| `NEXT_PUBLIC_STRIPE_POWER_PRICE_ID` | Client-safe price ID override | (none) | `price_...` |
| `TRYON_FREE_CREDITS` | Default free credits for new users | `0` | `10` |
| `TRYON_STANDARD_MONTHLY_CREDITS` | Monthly credits for Standard plan | `50` | `50` |
| `TRYON_PRO_MONTHLY_CREDITS` | Monthly credits for Pro plan | `250` | `250` |
| `CREDIT_HOLD_TTL_MINUTES` | Minutes before a credit hold expires | `30` | `45` |
| `ADMIN_API_KEY` | Secret token for admin endpoints | (none) | `your-long-random-token` |
| `METRICS_EMAIL_SECRET` | Secret token to call `/api/metrics-email` | (none) | `your-long-random-token` |
| `METRICS_EMAIL_TO` | Metrics email recipient | (none) | `ops@example.com` |
| `METRICS_EMAIL_FROM` | Metrics email sender | `metrics@igetdressed.online` | `metrics@example.com` |
| `POSTHOG_PROJECT_ID` | PostHog project ID (server) | (none) | `12345` |
| `POSTHOG_KEY` | PostHog API key (server) | (none) | `phc_...` |
| `POSTHOG_HOST` | PostHog host URL (server) | `https://us.i.posthog.com` | `https://app.posthog.com` |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog API key (client) | (none) | `phc_...` |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog host URL (client) | `https://us.i.posthog.com` | `https://app.posthog.com` |
| `NEXT_PUBLIC_STATUS_BANNER` | Optional status banner text | (none) | `Maintenance at 2pm AEST` |
| `NEXT_PUBLIC_ENABLE_TRYON_FROM_URL` | Enable the non-core "Try On Any URL" flow in the UI | `false` | `true` |
| `NEXT_PUBLIC_ENABLE_MY_OUTFITS` | Enable the non-core saved-outfits UI in the homepage flow | `false` | `true` |
| `FRONTRUNNER_DEMO_PASSWORD` | Server-side password for the private `/frontrunnerau` pitch room | `bintang` | `replace_me` |
| `FRONTRUNNER_DEMO_COOKIE_SECRET` | Server-side secret used to sign the private demo session cookie | falls back to `FRONTRUNNER_DEMO_PASSWORD` | `your-long-random-secret` |
| `NEXT_PUBLIC_PAYWALL_BYPASS_EMAILS` | Comma-separated emails to bypass paywall | (none) | `admin@example.com` |
| `FIRECRAWL_API_KEY` | Firecrawl API key (Try-on-from-URL) | (none) | `fc-...` |
| `N8N_EVENTS_WEBHOOK_URL` | n8n webhook URL for user events | (none) | `https://.../webhook/...` |
| `N8N_WEBHOOK_SECRET` | Shared secret for n8n webhook | (none) | `your-secret` |
| `RENDER_WEBHOOK_SECRET` | Shared secret for Render webhooks | (none) | `your-secret` |
| `RESEND_API_KEY` | Resend API key (email) | (none) | `re_...` |
| `NEXT_PUBLIC_AMAZON_AFFILIATE_TAG` | Amazon affiliate tag (client) | (none) | `tag-20` |
| `NEXT_PUBLIC_ASOS_AFFILIATE_ID` | ASOS affiliate ID (client) | (none) | `12345` |
| `NEXT_PUBLIC_SHOPSTYLE_PID` | ShopStyle PID (client) | (none) | `uid123` |
| `NEXT_PUBLIC_CJ_PUBLISHER_ID` | CJ publisher ID (client) | (none) | `1234567` |
| `NEXT_PUBLIC_IMPACT_ID` | Impact ID (client) | (none) | `12345` |
| `AMAZON_ASSOCIATE_TAG_AU` | Amazon AU associate tag (server) | (none) | `tag-21` |
| `SHOP_REDIRECT_BASE_URL` | Optional base URL for shop redirects | (none) | `https://changeroom.vercel.app` |
| `SERPAPI_API_KEY` | SerpAPI key for shopping search | (none) | `abc123` |
| `SERPAPI_TIMEOUT_MS` | SerpAPI request timeout | `12000` | `20000` |
| `SERPAPI_RESULT_COUNT` | SerpAPI result count | `16` | `20` |
| `SERPAPI_HL` | SerpAPI language | `en` | `en` |
| `SERPAPI_LOCATION` | SerpAPI location | (none) | `Australia` |
| `SERPAPI_GOOGLE_DOMAIN` | SerpAPI Google domain | (none) | `google.com.au` |
| `SERPAPI_GL` | SerpAPI geo location | (none) | `au` |
| `EBAY_CAMPAIGN_ID` | eBay campaign ID | (none) | `12345` |
| `EBAY_CUSTOM_ID` | eBay custom ID | (none) | `abc` |
| `EBAY_OAUTH_TOKEN` | eBay OAuth token | (none) | `v1.1.0...` |

## Environment Setup

### Development

1. **Backend** - Create `backend/.env`:
```bash
OPENAI_API_KEY=your_api_key_here
# Optional:
GEMINI_API_KEY=your_gemini_key_here
```

2. **Frontend** - Create `frontend/.env.local`:
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_STARTER_XMAS_PRICE_ID=price_...
STRIPE_VALUE_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_CREATOR_PRICE_ID=price_...
STRIPE_POWER_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_STARTER_XMAS_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_VALUE_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_POWER_PRICE_ID=price_...
CLERK_WEBHOOK_SECRET=whsec_...
DATABASE_URL=postgresql://...
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Production

All environment variables must be set in your hosting platform (e.g., Render, Vercel):

1. **Backend (Render)**
   - Set `OPENAI_API_KEY` in Render dashboard
   - Optionally set `GEMINI_API_KEY` for rewrite/safety helper paths
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
- Backend: Fails fast if `OPENAI_API_KEY` is missing for try-on generation
- Frontend: Uses lazy loading to avoid build-time errors, but fails at runtime if required vars are missing

## Getting API Keys

- **Gemini API Key**: https://makersuite.google.com/app/apikey
- **Clerk Keys**: https://dashboard.clerk.com
- **Stripe Keys**: https://dashboard.stripe.com/apikeys
- **OpenAI Key**: https://platform.openai.com/api-keys
- **R2 Keys**: Cloudflare Dashboard → R2 → Manage R2 API Tokens
