/* eslint-disable no-console */
/**
 * Reconcile historical Stripe credit-pack purchases into the credits ledger.
 *
 * Usage:
 *   node frontend/scripts/reconcile-stripe-credits.js --from=2025-01-01 --dry-run
 *
 * Required env:
 * - STRIPE_SECRET_KEY
 * - DATABASE_URL
 *
 * Notes:
 * - Idempotency is enforced via (request_id, entry_type) unique index.
 * - We use payment_intent id as request_id.
 */

require("dotenv").config();

const Stripe = require("stripe");
const { sql } = require("@vercel/postgres");

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [k, v] = raw.split("=");
    if (!k) continue;
    if (k.startsWith("--")) {
      const key = k.slice(2);
      args[key] = v === undefined ? true : v;
    }
  }
  return args;
}

function toUnixSeconds(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}

async function ensureTables() {
  // Minimal safety: ensure the tables we touch exist.
  await sql`
    CREATE TABLE IF NOT EXISTS users_billing (
      user_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      credits_available INTEGER NOT NULL DEFAULT 0,
      credits_refresh_at TIMESTAMPTZ,
      trial_used BOOLEAN NOT NULL DEFAULT false,
      is_frozen BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS users_billing_stripe_customer_idx ON users_billing (stripe_customer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS users_billing_plan_idx ON users_billing (plan)`;

  await sql`
    CREATE TABLE IF NOT EXISTS credit_ledger_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      request_id TEXT,
      hold_id UUID,
      entry_type TEXT NOT NULL,
      credits_change INTEGER NOT NULL,
      balance_after INTEGER,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_entries_request_type_unique
    ON credit_ledger_entries (request_id, entry_type)
    WHERE request_id IS NOT NULL
  `;
  await sql`CREATE INDEX IF NOT EXISTS credit_ledger_entries_user_created_idx ON credit_ledger_entries (user_id, created_at)`;
}

async function grantCreditsIdempotent({ userId, amount, requestId, metadata, dryRun }) {
  if (!userId || !requestId || !amount || amount <= 0) {
    return { status: "skipped_invalid" };
  }

  if (dryRun) {
    // Check if already granted
    const existing = await sql`
      SELECT 1 FROM credit_ledger_entries
      WHERE request_id = ${requestId} AND entry_type = 'grant'
      LIMIT 1
    `;
    if (existing.rows.length > 0) return { status: "already_credited" };
    return { status: "would_credit" };
  }

  const client = sql;
  const begin = client.begin ? client.begin.bind(client) : null;
  if (!begin) {
    throw new Error("Database client does not support transactions (sql.begin missing).");
  }

  return begin(async (tx) => {
    // Ensure billing row exists and is locked
    await tx`
      INSERT INTO users_billing (user_id, plan, credits_available, trial_used, is_frozen)
      VALUES (${userId}, 'free', 0, false, false)
      ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
    `;
    const locked = await tx`SELECT * FROM users_billing WHERE user_id = ${userId} FOR UPDATE`;
    const before = locked.rows[0].credits_available || 0;

    // Insert ledger row as the idempotency gate
    const inserted = await tx`
      INSERT INTO credit_ledger_entries (
        user_id,
        request_id,
        entry_type,
        credits_change,
        balance_after,
        metadata
      )
      VALUES (
        ${userId},
        ${requestId},
        'grant',
        ${amount},
        NULL,
        ${JSON.stringify(metadata)}::jsonb
      )
      ON CONFLICT (request_id, entry_type) DO NOTHING
      RETURNING id
    `;

    if (inserted.rows.length === 0) {
      return { status: "already_credited" };
    }

    const updated = await tx`
      UPDATE users_billing
      SET credits_available = credits_available + ${amount}, updated_at = now()
      WHERE user_id = ${userId}
      RETURNING credits_available
    `;
    const after = updated.rows[0].credits_available;

    await tx`
      UPDATE credit_ledger_entries
      SET balance_after = ${after}
      WHERE id = ${inserted.rows[0].id}
    `;

    return { status: "credited", before, after };
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const dryRun = Boolean(args["dry-run"] || args.dryRun);
  const limit = args.limit ? parseInt(args.limit, 10) : 100;
  const from = toUnixSeconds(args.from);

  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  // @vercel/postgres uses POSTGRES_URL (or POSTGRES_URL_NON_POOLING) by default.
  // Our app config uses DATABASE_URL, so bridge it here for local scripts.
  if (!process.env.POSTGRES_URL && process.env.DATABASE_URL) {
    process.env.POSTGRES_URL = process.env.DATABASE_URL;
  }
  if (!process.env.POSTGRES_URL && process.env.POSTGRES_URL_NON_POOLING) {
    process.env.POSTGRES_URL = process.env.POSTGRES_URL_NON_POOLING;
  }
  if (!process.env.POSTGRES_URL) {
    throw new Error("Missing POSTGRES_URL (or DATABASE_URL)");
  }

  await ensureTables();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-03-31.basil",
  });

  // Cache Stripe Customer -> clerkUserId lookups (small memory, big API savings)
  const customerToClerkUserId = new Map();

  const creditAmountMap = {
    [process.env.STRIPE_STARTER_PRICE_ID || ""]: 10,
    [process.env.STRIPE_STARTER_XMAS_PRICE_ID || ""]: 20,
    [process.env.STRIPE_VALUE_PRICE_ID || ""]: 30,
    [process.env.STRIPE_PRO_PRICE_ID || ""]: 100,
  };

  const summary = {
    dryRun,
    scanned: 0,
    credited: 0,
    alreadyCredited: 0,
    skipped: 0,
    errors: 0,
    skippedReasons: {},
    samples: [],
  };

  let startingAfter = undefined;
  for (;;) {
    const page = await stripe.checkout.sessions.list({
      limit: Math.min(limit, 100),
      ...(from ? { created: { gte: from } } : {}),
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const session of page.data) {
      summary.scanned += 1;

      try {
        if (session.mode !== "payment") {
          summary.skipped += 1;
          summary.skippedReasons.not_payment_mode =
            (summary.skippedReasons.not_payment_mode || 0) + 1;
          continue;
        }
        if (session.payment_status !== "paid") {
          summary.skipped += 1;
          summary.skippedReasons.not_paid =
            (summary.skippedReasons.not_paid || 0) + 1;
          continue;
        }

        // Always re-fetch a fully expanded session so we can recover missing metadata/line items.
        const full = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items.data.price", "payment_intent", "customer"],
        });

        const paymentIntentId =
          typeof full.payment_intent === "string"
            ? full.payment_intent
            : full.payment_intent && full.payment_intent.id
              ? full.payment_intent.id
              : null;

        // Resolve clerkUserId: prefer session.metadata, then payment_intent.metadata, then customer.metadata
        let clerkUserId =
          (full.metadata && full.metadata.clerkUserId) ||
          (full.payment_intent &&
          typeof full.payment_intent !== "string" &&
          full.payment_intent.metadata
            ? full.payment_intent.metadata.clerkUserId
            : null) ||
          null;

        const customerId =
          typeof full.customer === "string"
            ? full.customer
            : full.customer && full.customer.id
              ? full.customer.id
              : null;

        if (!isNonEmptyString(clerkUserId) && isNonEmptyString(customerId)) {
          if (customerToClerkUserId.has(customerId)) {
            clerkUserId = customerToClerkUserId.get(customerId);
          } else {
            try {
              const customer =
                typeof full.customer === "string"
                  ? await stripe.customers.retrieve(customerId)
                  : full.customer;
              const meta =
                customer && customer.metadata ? customer.metadata : {};
              const fromCustomer = meta && meta.clerkUserId ? meta.clerkUserId : null;
              customerToClerkUserId.set(customerId, fromCustomer);
              clerkUserId = clerkUserId || fromCustomer;
            } catch {
              customerToClerkUserId.set(customerId, null);
            }
          }
        }

        // Last-resort user mapping: look up by Stripe customer id in our DB
        if (!isNonEmptyString(clerkUserId) && isNonEmptyString(customerId)) {
          try {
            const mapped = await sql`
              SELECT user_id
              FROM users_billing
              WHERE stripe_customer_id = ${customerId}
              LIMIT 1
            `;
            if (mapped.rows.length > 0 && isNonEmptyString(mapped.rows[0].user_id)) {
              clerkUserId = mapped.rows[0].user_id;
            }
          } catch {
            // ignore; we'll count missing mapping below
          }
        }

        const priceIdFromSession =
          (full.metadata && full.metadata.priceId) ||
          (full.line_items &&
          full.line_items.data &&
          full.line_items.data[0] &&
          full.line_items.data[0].price &&
          full.line_items.data[0].price.id
            ? full.line_items.data[0].price.id
            : null);

        const creditAmountStr =
          (full.metadata && full.metadata.creditAmount) ||
          (full.payment_intent &&
          typeof full.payment_intent !== "string" &&
          full.payment_intent.metadata
            ? full.payment_intent.metadata.creditAmount
            : null) ||
          null;

        if (!isNonEmptyString(paymentIntentId)) {
          summary.skipped += 1;
          summary.skippedReasons.missing_payment_intent =
            (summary.skippedReasons.missing_payment_intent || 0) + 1;
          if (summary.samples.length < 25) {
            summary.samples.push({
              sessionId: full.id,
              status: "skipped",
              reason: "missing_payment_intent",
              customerId,
            });
          }
          continue;
        }
        if (!isNonEmptyString(clerkUserId)) {
          summary.skipped += 1;
          summary.skippedReasons.missing_user_mapping =
            (summary.skippedReasons.missing_user_mapping || 0) + 1;
          if (summary.samples.length < 25) {
            summary.samples.push({
              sessionId: full.id,
              paymentIntentId,
              status: "skipped",
              reason: "missing_user_mapping",
              customerId,
              hasSessionMetadataUser: Boolean(full.metadata && full.metadata.clerkUserId),
              hasPaymentIntentMetadataUser:
                Boolean(
                  full.payment_intent &&
                    typeof full.payment_intent !== "string" &&
                    full.payment_intent.metadata &&
                    full.payment_intent.metadata.clerkUserId
                ),
            });
          }
          continue;
        }

        const creditAmount =
          parseInt(creditAmountStr || "0", 10) ||
          (priceIdFromSession ? creditAmountMap[priceIdFromSession] || 0 : 0);

        if (!creditAmount || creditAmount <= 0) {
          summary.skipped += 1;
          summary.skippedReasons.missing_credit_amount =
            (summary.skippedReasons.missing_credit_amount || 0) + 1;
          if (summary.samples.length < 25) {
            summary.samples.push({
              sessionId: full.id,
              paymentIntentId,
              userId: clerkUserId,
              status: "skipped",
              reason: "missing_credit_amount",
              priceId: priceIdFromSession,
            });
          }
          continue;
        }

        const metadata = {
          source: "stripe",
          reason: "credit_pack_purchase",
          price_id: priceIdFromSession,
          session_id: full.id,
          payment_intent_id: paymentIntentId,
          reconciled: true,
        };

        const result = await grantCreditsIdempotent({
          userId: clerkUserId,
          amount: creditAmount,
          requestId: paymentIntentId,
          metadata,
          dryRun,
        });

        if (result.status === "credited") summary.credited += 1;
        else if (result.status === "already_credited") summary.alreadyCredited += 1;
        else if (result.status === "would_credit") summary.credited += 1; // dry-run counter
        else summary.skipped += 1;

        if (summary.samples.length < 25) {
          summary.samples.push({
            sessionId: full.id,
            paymentIntentId,
            userId: clerkUserId,
            credits: creditAmount,
            status: result.status,
          });
        }
      } catch (e) {
        summary.errors += 1;
        if (summary.samples.length < 25) {
          summary.samples.push({
            sessionId: session.id,
            status: "error",
            error: e && e.message ? e.message : String(e),
          });
        }
      }
    }

    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("reconcile-stripe-credits failed:", err);
  process.exit(1);
});


