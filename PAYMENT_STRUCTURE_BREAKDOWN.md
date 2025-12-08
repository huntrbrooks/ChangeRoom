# Payment Structure Breakdown

## Overview
The Change Room app uses **Stripe** for payment processing with a hybrid model:
- **Subscription plans** (recurring monthly payments)
- **One-time credit packs** (pay-as-you-go option)

---

## 1. Subscription Plans

### Free Plan (Default)
- **Cost**: $0/month
- **Credits**: 10 credits (one-time, no refresh)
- **Features**: Basic try-on functionality
- **No Stripe customer created** until user upgrades

### Standard Plan
- **Cost**: Set in Stripe Dashboard (configured via `STRIPE_STANDARD_PRICE_ID`)
- **Credits**: 50 credits/month (refreshes monthly)
- **Features**: Standard try-on features
- **Stripe Price ID**: `STRIPE_STANDARD_PRICE_ID` (from `.env`)

### Pro Plan
- **Cost**: Set in Stripe Dashboard (configured via `STRIPE_PRO_PRICE_ID`)
- **Credits**: 250 credits/month (refreshes monthly)
- **Features**: Pro try-on features
- **Stripe Price ID**: `STRIPE_PRO_PRICE_ID` (from `.env`)

---

## 2. One-Time Credit Packs

Users can purchase credits without a subscription:

### Small Credit Pack
- **Credits**: 20 credits
- **Stripe Price ID**: `STRIPE_CREDIT_PACK_SMALL_PRICE_ID`
- **Mode**: One-time payment (not subscription)

### Large Credit Pack
- **Credits**: 100 credits
- **Stripe Price ID**: `STRIPE_CREDIT_PACK_LARGE_PRICE_ID`
- **Mode**: One-time payment (not subscription)

---

## 3. Database Structure

### `users_billing` Table
```sql
- user_id (TEXT, PRIMARY KEY) - Clerk userId
- stripe_customer_id (TEXT) - Stripe customer ID
- stripe_subscription_id (TEXT) - Stripe subscription ID (null for free/credit-only)
- plan (TEXT) - 'free', 'standard', or 'pro'
- credits_available (INTEGER) - Current credit balance
- credits_refresh_at (TIMESTAMPTZ) - When monthly credits refresh (for paid plans)
- created_at, updated_at (TIMESTAMPTZ)
```

---

## 4. Credit System Logic

### Credit Refresh (Monthly Plans)
- **Standard Plan**: Credits reset to 50 at `credits_refresh_at`
- **Pro Plan**: Credits reset to 250 at `credits_refresh_at`
- **Free Plan**: No refresh (one-time 10 credits)
- **Credit Packs**: Added to existing balance, no refresh

### Credit Deduction
- Each try-on operation deducts credits
- Credits are checked before allowing try-on
- Negative credits are not allowed

---

## 5. API Endpoints

### `/api/billing/create-checkout-session` (POST)
**Purpose**: Create Stripe Checkout Session

**Request Body**:
```json
{
  "priceId": "price_xxxxx",  // Stripe Price ID
  "mode": "subscription" | "payment"  // subscription for plans, payment for credit packs
}
```

**Flow**:
1. Gets/creates user billing record
2. Creates Stripe customer if needed
3. Creates checkout session with appropriate mode
4. Returns checkout URL

---

### `/api/billing/portal` (POST)
**Purpose**: Access Stripe Billing Portal

**Flow**:
1. Gets user billing record
2. Creates Stripe Billing Portal session
3. Returns portal URL (for managing subscription)

---

### `/api/my/billing` (GET)
**Purpose**: Get user's billing info

**Response**:
```json
{
  "plan": "free" | "standard" | "pro",
  "creditsAvailable": 50,
  "creditsRefreshAt": "2024-02-01T00:00:00Z"
}
```

---

### `/api/webhooks/stripe` (POST)
**Purpose**: Handle Stripe webhook events

**Events Handled**:

1. **`checkout.session.completed`**
   - **Subscription mode**: Updates user plan, sets subscription ID
   - **Payment mode**: Adds credits to user account

2. **`customer.subscription.created`**
   - Updates user plan when subscription is created

3. **`customer.subscription.updated`**
   - Updates user plan when subscription changes (e.g., upgrade/downgrade)

4. **`customer.subscription.deleted`**
   - Downgrades user to free plan when subscription is cancelled

---

## 6. Environment Variables Required

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Subscription Price IDs (from Stripe Dashboard)
STRIPE_STANDARD_PRICE_ID=price_xxxxx
STRIPE_PRO_PRICE_ID=price_xxxxx

# Credit Pack Price IDs (from Stripe Dashboard)
STRIPE_CREDIT_PACK_SMALL_PRICE_ID=price_xxxxx
STRIPE_CREDIT_PACK_LARGE_PRICE_ID=price_xxxxx

# Optional: Credit amounts (defaults in config.ts)
TRYON_FREE_CREDITS=10
TRYON_STANDARD_MONTHLY_CREDITS=50
TRYON_PRO_MONTHLY_CREDITS=250
```

---

## 7. Stripe Dashboard Setup

### Required Products & Prices

1. **Standard Plan Product**
   - Create a product in Stripe
   - Create a recurring price (monthly)
   - Copy the Price ID → `STRIPE_STANDARD_PRICE_ID`

2. **Pro Plan Product**
   - Create a product in Stripe
   - Create a recurring price (monthly)
   - Copy the Price ID → `STRIPE_PRO_PRICE_ID`

3. **Small Credit Pack Product**
   - Create a product in Stripe
   - Create a one-time price
   - Copy the Price ID → `STRIPE_CREDIT_PACK_SMALL_PRICE_ID`

4. **Large Credit Pack Product**
   - Create a product in Stripe
   - Create a one-time price
   - Copy the Price ID → `STRIPE_CREDIT_PACK_LARGE_PRICE_ID`

### Webhook Configuration

1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://yourdomain.com/api/webhooks/stripe`
3. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the webhook signing secret → `STRIPE_WEBHOOK_SECRET`

---

## 8. User Flow

### Subscription Purchase Flow
1. User clicks "Upgrade to Standard/Pro"
2. Frontend calls `/api/billing/create-checkout-session` with `mode: "subscription"`
3. User redirected to Stripe Checkout
4. User completes payment
5. Stripe sends `checkout.session.completed` webhook
6. Backend updates user plan and sets monthly credit refresh
7. User redirected back to app with updated credits

### Credit Pack Purchase Flow
1. User clicks "Buy Credits"
2. Frontend calls `/api/billing/create-checkout-session` with `mode: "payment"`
3. User redirected to Stripe Checkout
4. User completes payment
5. Stripe sends `checkout.session.completed` webhook
6. Backend adds credits to user account
7. User redirected back to app with updated credits

### Subscription Management Flow
1. User clicks "Manage Subscription"
2. Frontend calls `/api/billing/portal`
3. User redirected to Stripe Billing Portal
4. User can update payment method, cancel, etc.
5. Stripe sends webhook events for changes
6. Backend updates user plan accordingly

---

## 9. Credit Refresh Logic

### When Credits Refresh
- **Standard Plan**: Credits reset to 50 on the same day each month (based on subscription start date)
- **Pro Plan**: Credits reset to 250 on the same day each month (based on subscription start date)
- **Free Plan**: No refresh (one-time 10 credits)

### Implementation
- `credits_refresh_at` is set when subscription is created
- On each credit operation, system checks if `credits_refresh_at` has passed
- If passed, credits are reset to plan's monthly amount
- `credits_refresh_at` is updated to next month

---

## 10. Security Considerations

1. **Webhook Verification**: All webhook requests are verified using Stripe signature
2. **User Authentication**: All billing endpoints require Clerk authentication (except webhooks)
3. **Customer Linking**: Stripe customer ID is linked to Clerk userId via metadata
4. **Idempotency**: Webhook handlers are idempotent (safe to retry)

---

## 11. Testing

### Test Mode
- Use Stripe test mode API keys
- Use Stripe test price IDs
- Test webhook events using Stripe CLI:
  ```bash
  stripe listen --forward-to localhost:3000/api/webhooks/stripe
  ```

### Test Cards
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

---

## Summary

The payment structure supports:
- ✅ **3 subscription tiers** (Free, Standard, Pro)
- ✅ **2 credit pack options** (Small, Large)
- ✅ **Monthly credit refresh** for paid plans
- ✅ **One-time credit purchases** without subscription
- ✅ **Stripe Billing Portal** for subscription management
- ✅ **Webhook-based updates** for real-time plan changes








