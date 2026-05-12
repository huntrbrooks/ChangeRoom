import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { stripeConfig, appConfig } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Lazy Stripe client initialization (only created when route handler runs, not during build)
function getStripe() {
  return new Stripe(stripeConfig.secretKey, {
    apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
  });
}

/**
 * POST /api/billing/portal
 * Creates a Stripe Billing Portal session for managing subscription
 */
export async function POST(_req: NextRequest) {
  try {
    let userId: string | null = null;
    try {
      ({ userId } = await auth());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("billing_portal_auth_failed", { error: err });
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

    const { getOrCreateUserBilling } = await import("@/lib/db-access");
    const ip =
      _req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      _req.headers.get("x-real-ip") ||
      "unknown";
    const rlUser = checkRateLimit(`billing-portal:user:${userId}`, 10, 60_000);
    const rlIp = checkRateLimit(`billing-portal:ip:${ip}`, 30, 60_000);
    if (!rlUser.allowed || !rlIp.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: 60_000 },
        { status: 429 }
      );
    }

    const billing = await getOrCreateUserBilling(userId);

    if (!billing.stripe_customer_id) {
      return NextResponse.json(
        { error: "No Stripe customer found. Please create a subscription first." },
        { status: 400 }
      );
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: `${appConfig.appUrl}/`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    logger.error("billing_portal_failed", { error: err });
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json(
      {
        error: "Failed to create billing portal session",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
