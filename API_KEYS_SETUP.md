# API Keys Setup Guide

This guide explains where to get all the API keys needed for the Change Room application.

## Required API Keys

### 1. 🔵 Gemini API Key (Google)

**Purpose**: Image generation for virtual try-on and clothing analysis

**Where to get it**:
1. Go to: https://aistudio.google.com/apikey
2. Click **"Get API Key"** or **"Create API Key"**
3. Select or create a Google Cloud Project
4. Copy the API key

**Environment Variable**:
- Backend: `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- Frontend: `GEMINI_API_KEY`

**Important**:
- Make sure the **Generative Language API** is enabled in Google Cloud Console
- Enable it here: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com
- The API key needs access to image generation models

**Free tier**: Limited free requests per day

---

### 2. 🤖 OpenAI API Key

**Purpose**: Clothing image analysis and classification

**Where to get it**:
1. Go to: https://platform.openai.com/api-keys
2. Sign in or create an account
3. Click **"Create new secret key"**
4. Copy the API key (you can only see it once!)

**Environment Variable**:
- Backend: `OPENAI_API_KEY`

**Important**:
- You need a paid OpenAI account (or free trial credits)
- The key should have access to `gpt-4o-mini` or `gpt-4o` models

**Pricing**: Pay-per-use (gpt-4o-mini is cheaper than gpt-4o)

---

### 3. 👤 Clerk API Keys (Authentication)

**Purpose**: User authentication and user management

**Where to get it**:
1. Go to: https://dashboard.clerk.com
2. Sign in or create an account
3. Create a new application
4. Go to **"API Keys"** section
5. Copy:
   - **Publishable Key** (starts with `pk_`)
   - **Secret Key** (starts with `sk_`)

**Environment Variables**:
- Frontend: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- Frontend: `CLERK_SECRET_KEY`

**Free tier**: 10,000 monthly active users (free tier)

---

### 4. 💳 Stripe API Keys (Payments)

**Purpose**: Payment processing for subscriptions and credit packs

**Where to get it**:
1. Go to: https://dashboard.stripe.com
2. Sign in or create an account
3. Make sure you're in **Test Mode** for development
4. Go to **"Developers" → "API keys"**
5. Copy:
   - **Publishable key** (starts with `pk_test_` for test mode)
   - **Secret key** (starts with `sk_test_` for test mode)

**Environment Variables**:
- Frontend: `STRIPE_SECRET_KEY`
- Frontend: `STRIPE_WEBHOOK_SECRET` (get this after setting up webhook endpoint)
- Frontend: Price IDs for your products (create products first)

**Additional Setup**:
- Create products/prices in Stripe Dashboard
- Set up webhook endpoint: `https://yourdomain.com/api/webhooks/stripe`
- Get webhook signing secret from webhook settings

**Free tier**: No monthly fee, pay per transaction (2.9% + $0.30 per transaction)

---

### 5. 🗄️ Database Connection (Vercel Postgres)

**Purpose**: Store user data, billing, images, sessions

**Where to get it**:
1. Go to: https://vercel.com/dashboard
2. Create a new project or open existing
3. Go to **"Storage"** → **"Create Database"** → **"Postgres"**
4. Copy the **Connection String**

**Environment Variable**:
- Frontend: `DATABASE_URL`

**Free tier**: Limited storage (512 MB free on Hobby plan)

---

### 6. ☁️ Cloudflare R2 (or AWS S3) - Optional

**Purpose**: Store uploaded images (person photos, clothing items, generated try-ons)

**Where to get it**:
1. Go to: https://dash.cloudflare.com
2. Go to **"R2"** → **"Create Bucket"**
3. Create API token: **"Manage R2 API Tokens"**
4. Copy:
   - **Access Key ID**
   - **Secret Access Key**
   - **Account ID**
   - **Bucket Name**
   - Set up **Public Domain** for bucket

**Environment Variables**:
- Frontend: `R2_ACCESS_KEY_ID`
- Frontend: `R2_SECRET_ACCESS_KEY`
- Frontend: `R2_ACCOUNT_ID`
- Frontend: `R2_BUCKET_NAME`
- Frontend: `R2_PUBLIC_BASE_URL`

**Free tier**: 10 GB storage, 1 million Class A operations/month

---

### 7. 🔍 SerpAPI (Optional - Product Search)

**Purpose**: Search for similar products online

**Where to get it**:
1. Go to: https://serpapi.com
2. Sign up for free account
3. Go to **"API Key"** section
4. Copy your API key

**Environment Variable**:
- Backend: `SERPAPI_API_KEY`

**Free tier**: 100 searches/month free

---

## Environment Variables Summary

### Backend (.env file)
```env
GEMINI_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
SERPAPI_API_KEY=your_key_here  # Optional
```

### Frontend (Vercel Environment Variables)
```env
# Gemini
GEMINI_API_KEY=your_key_here

# OpenAI (if used directly in frontend)
OPENAI_API_KEY=your_key_here

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STANDARD_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_CREDIT_PACK_SMALL_PRICE_ID=price_...
STRIPE_CREDIT_PACK_LARGE_PRICE_ID=price_...

# Database
DATABASE_URL=postgresql://...

# R2 Storage (or S3)
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ACCOUNT_ID=...
R2_BUCKET_NAME=...
R2_PUBLIC_BASE_URL=https://...

# App Config
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_API_URL=https://your-backend-url.com
```

## Quick Start Checklist

- [ ] Get Gemini API Key from Google AI Studio
- [ ] Enable Generative Language API in Google Cloud Console
- [ ] Get OpenAI API Key
- [ ] Set up Clerk account and get API keys
- [ ] Set up Stripe account and get API keys
- [ ] Create Vercel Postgres database
- [ ] (Optional) Set up Cloudflare R2 for image storage
- [ ] (Optional) Get SerpAPI key for product search
- [ ] Add all keys to Vercel environment variables
- [ ] Add backend keys to Render environment variables (or wherever backend is hosted)

## Where to Add Environment Variables

### Vercel (Frontend)
1. Go to your project: https://vercel.com/dashboard
2. Click **"Settings"** → **"Environment Variables"**
3. Add each variable
4. Select environments (Production, Preview, Development)
5. Redeploy for changes to take effect

### Render (Backend)
1. Go to your service: https://dashboard.render.com
2. Click **"Environment"** tab
3. Add each variable
4. Save and restart service

## Troubleshooting

**"Model not found" errors**:
- Make sure Generative Language API is enabled in Google Cloud Console
- Check that your API key has proper permissions
- Verify the API key is correctly set in environment variables

**"API key invalid" errors**:
- Check for typos in the key
- Make sure there are no extra spaces
- Verify you're using the correct key (test vs production)

**"Unauthorized" errors**:
- Check that all required keys are set
- Verify keys haven't expired
- Check API quotas/limits

## Security Notes

⚠️ **Never commit API keys to Git!**
- All keys should be in `.env` files (which are in `.gitignore`)
- Use environment variables in production
- Rotate keys if they're accidentally exposed
- Use different keys for development and production

## Need Help?

- Gemini API: https://ai.google.dev/docs
- OpenAI API: https://platform.openai.com/docs
- Clerk: https://clerk.com/docs
- Stripe: https://stripe.com/docs
- Vercel: https://vercel.com/docs








