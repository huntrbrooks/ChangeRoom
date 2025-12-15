---
name: Production readiness plan
overview: Implement credits ledger, billing, abuse controls, UX paywall, logging, and Stripe pricing to make the app launch-ready.
todos:
  - id: ledger-schema
    content: Add ledger/holds schema+migration+config
    status: completed
  - id: ledger-dal
    content: Implement ledger helpers with idempotency
    status: completed
    dependencies:
      - ledger-schema
  - id: tryon-hold
    content: Update try-on+cancel flow hold→debit/release
    status: completed
    dependencies:
      - ledger-dal
  - id: stripe-pricing
    content: Create prices, script, config, checkout defaults
    status: completed
  - id: abuse-limits
    content: Rate limits, verified email checks, upload caps, freeze
    status: completed
    dependencies:
      - ledger-dal
  - id: ux-paywall
    content: Result/paywall UX updates (watermark, buttons, Xmas default)
    status: completed
    dependencies:
      - tryon-hold
      - stripe-pricing
  - id: ops-logging
    content: Logging, timeouts, user-friendly errors, status toggle
    status: completed
---

# Production-Ready Launch Plan

## Stack assumptions

- Frontend/backend: Next.js App Router (`frontend/app`), Clerk auth; DB via Neon/Postgres (`frontend/lib/db.ts` uses @vercel/postgres). Python FastAPI on Render is separate; credit/billing will stay in Next API routes.

## Credits ledger and billing logic

- Add append-only ledger + holds tables and request idempotency (`database/schema.sql`, new migration file) supporting hold→debit→release and requestId uniqueness; track free-trial flag and optional account freeze.
- Implement data layer helpers for holds, debits, releases, refunds, and credit snapshots with transactions and requestId idempotency (`frontend/lib/db-access.ts`). Enforce one free verified try-on, hold-then-debit on generate, release on cancel/timeouts, and retry-safe semantics.
- Update try-on flow to use holds/debits: accept `requestId`, create hold before generation, finalize debit after success, release on cancel/error; expose cancel endpoint (`frontend/app/api/try-on/route.ts` and new cancel route) and ensure bypass users remain allowed.

## Stripe pricing and webhooks

- Add price IDs for Starter normal, Xmas promo, Value, Pro, and optional Creator/Power; script to create prices in existing Stripe account (`frontend/scripts/setup-stripe.js`, `frontend/lib/config.ts`).
- Extend Stripe webhook to award credits per price, handle `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed` (freeze generating), and idempotent request handling (`frontend/app/api/webhooks/stripe/route.ts`).
- Update checkout session creation to include correct price IDs/metadata and default Xmas promo selection in UI (`frontend/app/api/billing/create-checkout-session/route.ts`, related UI in `frontend/app/pricing` or paywall component).

## Abuse prevention and limits

- Enforce auth-required on APIs (review middleware if present); add per-user and per-IP rate limiting for try-on, uploads, and billing routes using a shared limiter (e.g., Upstash or Postgres) (`frontend/app/api/**` and middleware).
- Require verified email before granting free credit; block multiple free tries; cap wardrobe uploads per day for new accounts (`frontend/app/api/upload-urls/route.ts`, `frontend/app/api/save-person-image/route.ts`, clothing endpoints) with configurable limits.

## UX monetization

- For free try-on, return watermarked preview only; gate clean download behind credits. Adjust result screen to show only two actions (Download clean, Try another outfit) both leading to paywall with Xmas deal preselected (`frontend/app/components/*` result view, `frontend/app/page.tsx` or relevant result page).
- Map credit costs: 1 credit standard (~1536px), 2 credits HD export. Enforce in try-on/save flows and display in UI (`frontend/app/pricing`, `frontend/app/api/try-on`, download endpoint if exists).

## Ops and reliability

- Add structured logging + error capture (e.g., Sentry) for API routes and Gemini calls; surface user-friendly error messages and handle timeouts gracefully (`frontend/lib/tryOnGemini3.ts`, API routes). 
- Add service-status banner toggle via env/config and optional status endpoint; expose degraded-mode flag to UI (`frontend/lib/config.ts`, layout/header component).

## Data flow (ledger)

```mermaid
flowchart TD
  client[Client requestId] --> hold[CreateHold(requestId, userId, amount)]
  hold --> gen[Generate image]
  gen --> success{Success?}
  success -- yes --> debit[FinalizeDebit(requestId)] --> returnOk[Return result]
  success -- no/cancel --> release[ReleaseHold(requestId)] --> returnErr[Return error]
```

## Testing and verification

- Add unit/integration coverage for ledger idempotency, free-trial constraints, webhook handling, rate limits, and hold→debit→release transitions (Next API route tests in `frontend/__tests__`).

## Implementation todos

- ledger-schema: Add ledger/holds schema + migration and config wiring.
- ledger-dal: Implement ledger/holds helpers with idempotency in `db-access`.
- tryon-hold: Update try-on + cancel flow to use hold→debit/release and credit tiers.
- stripe-pricing: Create prices/script, update config and checkout creation defaults.
- abuse-limits: Add rate limits, verified-email checks, upload/day caps, and freeze handling.
- ux-paywall: Update result/paywall UX (watermark preview, two buttons, Xmas default).
- ops-logging: Add logging/timeout handling, user-friendly errors, status toggle.