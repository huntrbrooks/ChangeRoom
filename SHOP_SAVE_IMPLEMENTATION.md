# Shop & Save Implementation - Australia First, Affiliate Monetized

## Overview

This implementation adds a "Shop & Save" feature that searches for products across multiple providers (eBay AU, Amazon AU, Google Shopping) with affiliate monetization. The system is designed with Australia-first strategy but can be extended to other regions.

## Architecture

### Provider Abstraction

All shop providers implement the `ShopProvider` interface:

- **Location**: `frontend/lib/shop/providers/`
- **Types**: `types.ts` - Defines `Offer`, `ProviderContext`, `ShopProvider`
- **Orchestrator**: `index.ts` - Aggregates offers from all providers

### Implemented Providers

1. **Google Shopping (SerpAPI)** ✅
   - File: `googleShopping.ts`
   - Uses existing `SERPAPI_API_KEY`
   - Configured for Australia (`gl=au, hl=en`)
   - Supports redirect tracking via `SHOP_REDIRECT_BASE_URL`

2. **eBay AU** ⚠️ (Placeholder)
   - File: `ebay.ts`
   - Requires: `EBAY_OAUTH_TOKEN`, `EBAY_CAMPAIGN_ID`, `EBAY_CUSTOM_ID` (optional)
   - Needs eBay Partner Network setup

3. **Amazon AU** ⚠️ (Placeholder)
   - File: `amazon.ts`
   - Requires: `AMAZON_ASSOCIATE_TAG_AU`
   - Needs Amazon PA API 5.0 implementation (requires signing)

## Database Schema

### Migration File
- **Location**: `database/migration_add_clothing_item_offers.sql`
- **Tables**:
  - `clothing_item_offers` - Stores product offers for each clothing item
  - `affiliate_clicks` - Tracks affiliate link clicks for analytics

### To Apply Migration

Run the SQL migration on your Neon/Postgres database:

```bash
psql $DATABASE_URL -f database/migration_add_clothing_item_offers.sql
```

Or via Neon dashboard SQL editor.

## API Routes

### POST /api/shop-search

Search for products for one or more clothing items.

**Request:**
```json
{
  "clothingItemIds": ["uuid1", "uuid2"]
}
```

**Response:**
```json
{
  "offers": {
    "uuid1": [
      {
        "source": "google_shopping",
        "merchant": "Store Name",
        "title": "Product Title",
        "price": 45.99,
        "currency": "AUD",
        "productUrl": "https://...",
        "affiliateUrl": "https://igetdressed.online/r?url=...",
        "thumbnailUrl": "https://...",
        "shippingPrice": 5.00,
        "totalPrice": 50.99
      }
    ]
  }
}
```

### GET /api/shop-search?clothingItemId=...

Get previously searched offers for a clothing item (from database).

### GET /api/r?url=...&offerId=...

Redirect tracking route for affiliate links. Logs clicks and redirects to target URL.

## Environment Variables

Add these to your `.env` file (server-side only, NOT `NEXT_PUBLIC_`):

```bash
# Google Shopping (already exists)
SERPAPI_API_KEY=your_key_here

# Optional: Redirect tracking base URL
SHOP_REDIRECT_BASE_URL=https://igetdressed.online/r

# eBay (when ready)
EBAY_OAUTH_TOKEN=your_token_here
EBAY_CAMPAIGN_ID=your_campaign_id
EBAY_CUSTOM_ID=optional_tracking_id

# Amazon (when ready)
AMAZON_ASSOCIATE_TAG_AU=your_tag_here
AMAZON_ACCESS_KEY_ID=your_key_here
AMAZON_SECRET_ACCESS_KEY=your_secret_here
```

## Security Note ⚠️

**CRITICAL**: Your `.env` file contains sensitive credentials. Ensure:

1. ✅ `.env` is in `.gitignore` (already done)
2. ✅ `.env.local` and `.env.*.local` are also ignored (just added)
3. ⚠️ **If your `.env` was ever committed or shared, rotate ALL keys immediately:**
   - Stripe keys
   - Clerk keys
   - OpenAI, Gemini, SerpAPI keys
   - Database connection strings
   - R2 credentials
   - All other secrets

4. **In production** (Vercel, Render, etc.), set environment variables in the platform dashboard, NOT in the repo.

## Next Steps

### 1. Apply Database Migration

Run the migration to create the `clothing_item_offers` and `affiliate_clicks` tables.

### 2. Test Google Shopping Provider

The Google Shopping provider is ready to use with your existing `SERPAPI_API_KEY`. Test it:

```typescript
// Example usage
const offers = await findBestOffersForQuery("blue denim jacket", {
  country: "AU",
  currency: "AUD"
});
```

### 3. Set Up eBay Partner Network (Optional)

1. Sign up at https://partnernetwork.ebay.com/
2. Get your Campaign ID
3. Set up OAuth token (see eBay Developer docs)
4. Add credentials to `.env`

### 4. Set Up Amazon Associates AU (Optional)

1. Sign up at https://affiliate-program.amazon.com.au/
2. Get your Associate Tag
3. Apply for PA API access
4. Implement PA API 5.0 signing (see `amazon.ts` TODO)
5. Add credentials to `.env`

### 5. Frontend Integration

Update your frontend to:

1. Call `/api/shop-search` when user wants to find products for clothing items
2. Display offers with "Go to store" buttons using `affiliateUrl`
3. Optionally show "Affiliate link" text for transparency
4. Use `/api/r` redirect route if you want click tracking

### 6. Analytics (Optional)

Query `affiliate_clicks` table to see:
- Which offers get clicked most
- Which providers convert best
- Revenue per provider

## Code Structure

```
frontend/
├── lib/
│   └── shop/
│       └── providers/
│           ├── types.ts           # Type definitions
│           ├── index.ts           # Orchestrator
│           ├── googleShopping.ts  # ✅ Implemented
│           ├── ebay.ts            # ⚠️ Placeholder
│           └── amazon.ts          # ⚠️ Placeholder
├── app/
│   └── api/
│       ├── shop-search/
│       │   └── route.ts           # Search endpoint
│       └── r/
│           └── route.ts            # Redirect tracking
└── lib/
    └── db-access.ts               # Database functions (updated)

database/
└── migration_add_clothing_item_offers.sql
```

## Testing

1. **Test Google Shopping**:
   ```bash
   curl -X POST http://localhost:3000/api/shop-search \
     -H "Content-Type: application/json" \
     -d '{"clothingItemIds": ["your-item-id"]}'
   ```

2. **Test Redirect**:
   ```bash
   curl -L "http://localhost:3000/api/r?url=https://example.com"
   ```

## Notes

- Google Shopping provider is production-ready and uses your existing SerpAPI key
- eBay and Amazon providers are placeholders and need implementation
- The system defaults to Australia (AU) but can be extended
- All affiliate URLs are pre-tagged and ready to use
- Click tracking is optional but recommended for analytics

