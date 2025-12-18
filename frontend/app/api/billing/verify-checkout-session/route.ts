import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { stripeConfig } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrCreateUserBilling, grantCredits } from "@/lib/db-access";

// Lazy Stripe client initialization (only created when route handler runs, not during build)
function getStripe() {
  return new Stripe(stripeConfig.secretKey, {
    apiVersion: "2025-03-31.basil",
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
  const { userId } = await auth();
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
    const session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price", "payment_intent"],
    });

    const metadataUserId = session.metadata?.clerkUserId;
    if (metadataUserId && metadataUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Ensure billing row exists (useful for customer id tracking, etc.)
    await getOrCreateUserBilling(userId);

    if (session.mode !== "payment") {
      return NextResponse.json({
        ok: true,
        granted: false,
        reason: "not_one_time_payment",
        sessionId: session.id,
      });
    }

    if (session.payment_status !== "paid") {
      return NextResponse.json({
        ok: true,
        granted: false,
        reason: "not_paid",
        sessionId: session.id,
        paymentStatus: session.payment_status,
      });
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!paymentIntentId) {
      return NextResponse.json(
        { error: "Missing payment_intent on session", sessionId: session.id },
        { status: 500 }
      );
    }

    const priceIdFromSession =
      session.metadata?.priceId ||
      (session.line_items?.data?.[0]?.price?.id ?? "");

    const creditAmountMap: Record<string, number> = {
      [stripeConfig.starterPriceId]: 10,
      [stripeConfig.starterXmasPriceId]: 20,
      [stripeConfig.valuePriceId]: 30,
      [stripeConfig.proPriceId]: 100,
    };

    const creditAmount =
      parseInt(session.metadata?.creditAmount || "0", 10) ||
      creditAmountMap[priceIdFromSession] ||
      0;

    if (creditAmount <= 0) {
      return NextResponse.json({
        ok: true,
        granted: false,
        reason: "no_credit_amount",
        sessionId: session.id,
        priceId: priceIdFromSession,
      });
    }

    const creditMetadata = {
      source: "stripe",
      reason: "credit_pack_purchase",
      price_id: priceIdFromSession,
      session_id: session.id,
      payment_intent_id: paymentIntentId,
      verified_via: "verify-checkout-session",
    };

    // Idempotent: requestId = payment_intent id
    const before = await getOrCreateUserBilling(userId);
    const updated = await grantCredits(userId, creditAmount, creditMetadata, paymentIntentId);
    const granted = updated.credits_available !== before.credits_available;

    return NextResponse.json({
      ok: true,
      granted,
      creditsGranted: creditAmount,
      sessionId: session.id,
      paymentIntentId,
      creditsAvailable: updated.credits_available,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("verify-checkout-session error:", error);
    return NextResponse.json(
      { error: "Failed to verify checkout session", details: error.message },
      { status: 500 }
    );
  }
}


