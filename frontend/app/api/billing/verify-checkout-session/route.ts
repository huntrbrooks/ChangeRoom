import { packSessionExpansions, reconcilePack } from "@/lib/pack-settlement";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { stripeConfig } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Lazy Stripe client initialization (only created when route handler runs, not during build)
function getStripe() {
  return new Stripe(stripeConfig.secretKey, {
    apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
  });
}

/**
 * POST /api/billing/verify-checkout-session
 *
 * Secure fallback for credit-pack purchases:
 * - Retrieves the Checkout Session from Stripe (server-side)
 * - Verifies it's paid
 * - Idempotently grants credits using payment_intent id as requestId
 *
 * Body: { sessionId: string }
 */
export async function POST(req: NextRequest) {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("verify_checkout_auth_failed", { error: err });
    return NextResponse.json(
      {
        error: "auth_failed",
        details: message,
        hint: "Check Vercel env vars: CLERK_SECRET_KEY must be set for server-side auth.",
      },
      { status: 500 }
    );
  }
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rlUser = checkRateLimit(`verify-checkout:user:${userId}`, 20, 60_000);
  const rlIp = checkRateLimit(`verify-checkout:ip:${ip}`, 60, 60_000);
  if (!rlUser.allowed || !rlIp.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: 60_000 },
      { status: 429 }
    );
  }

  let sessionId: string | undefined;
  try {
    const body = (await req.json()) as { sessionId?: string };
    sessionId = body.sessionId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!sessionId || !sessionId.trim() || !sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
  }

  try {
    const { getOrCreateUserBilling, hasSubscriptionAllowance } = await import("@/lib/db-access");
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: packSessionExpansions,
    });

    // Fail closed: the session must be provably this user's (our checkout sets metadata and
    // client_reference_id; pricing-table/payment-link sessions match on the Stripe customer).
    // Otherwise anyone holding a paid session id could claim its credits first.
    const billingRow = await getOrCreateUserBilling(userId);
    const sessionCustomerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
    const ownsSession = Boolean(sessionCustomerId && billingRow.stripe_customer_id === sessionCustomerId)
      && (!session.metadata?.clerkUserId || session.metadata.clerkUserId === userId)
      && (!session.client_reference_id || session.client_reference_id === userId);
    if (!ownsSession) {
      logger.warn("verify_checkout_session_owner_mismatch", { userId, sessionId: session.id });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (session.mode !== "payment") {
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      const settled = Boolean(subId && session.status === "complete" && await hasSubscriptionAllowance(userId, subId));
      return NextResponse.json({ ok:true, settled, granted:false, reason:settled ? "subscription_settled" : "awaiting_invoice" });
    }
    return NextResponse.json(await reconcilePack(stripe, session, 'verify-checkout-session', billingRow));
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("verify_checkout_session_failed", { error });
    return NextResponse.json(
      { error: "Failed to verify checkout session" },
      { status: 500 }
    );
  }
}

