import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { NEW_PURCHASES_ENABLED, pausedCheckoutResponse } from "@/lib/purchase-availability";
import { z } from "zod";
import { stripeConfig, appConfig } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveCheckout } from "@/lib/billing-catalog";
import { priceMatchesOffer } from "@/lib/subscription-lifecycle";
import { subscriptionCheckout, CheckoutConflict } from "@/lib/subscription-checkout";
import { logger } from "@/lib/logger";

const checkoutRequestSchema = z.union([z.object({sku:z.string().min(1).max(40)}).strict(), z.object({
  priceId: z.string().trim().regex(/^price_/, "Invalid price ID"),
  mode: z.enum(["subscription", "payment"]),
}).strict()]);

// Lazy Stripe client initialization (only created when route handler runs, not during build)
function getStripe() {
  return new Stripe(stripeConfig.secretKey, {
    apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
  });
}

/**
 * POST /api/billing/create-checkout-session
 * Creates a Stripe Checkout Session for subscription or one-time payment
 * 
 * Body: { priceId: string, mode: "subscription" | "payment" }
 */
export async function POST(req: NextRequest) {
  if (!NEW_PURCHASES_ENABLED) return pausedCheckoutResponse();
  try {
    let userId: string | null = null;
    try {
      ({ userId } = await auth());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("checkout_session_auth_failed", { error: err });
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

    const db = await import(
      "@/lib/db-access"
    );
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rlUser = checkRateLimit(`checkout-session:user:${userId}`, 10, 60_000);
    const rlIp = checkRateLimit(`checkout-session:ip:${ip}`, 30, 60_000);
    if (!rlUser.allowed || !rlIp.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: 60_000 },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = checkoutRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "invalid_request",
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    // Validate Stripe configuration
    if (!stripeConfig.secretKey || !stripeConfig.secretKey.trim()) {
      logger.error("stripe_secret_key_missing");
      return NextResponse.json(
        { 
          error: "Payment system configuration error. Please contact support.",
          details: "Stripe is not properly configured"
        },
        { status: 500 }
      );
    }

    // Validate app URL for redirects
    if (!appConfig.appUrl || !appConfig.appUrl.startsWith("http")) {
      logger.error("app_url_invalid", { appUrl: appConfig.appUrl });
      return NextResponse.json(
        { 
          error: "Configuration error. Please contact support.",
          details: "App URL is not properly configured"
        },
        { status: 500 }
      );
    }

    const selection = resolveCheckout(stripeConfig, parsed.data);
    if (!selection) {
      return NextResponse.json({ error: 'This price is not available.' }, { status: 400 });
    }
    const {offer,priceId,mode} = selection;
    const stripe = getStripe();
    if (!priceMatchesOffer(await stripe.prices.retrieve(priceId), offer))
      throw new Error('Stripe price disagrees with the published offer');
    const billing = await db.getOrCreateUserBilling(userId);
    let customerId = billing.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({metadata:{clerkUserId:userId}},
        {idempotencyKey:'changeroom-customer:'+userId});
      customerId = customer.id;
      await db.setStripeCustomerIdForUser(userId,customerId);
    }
    const metadata = {clerkUserId:userId,priceId,mode,creditAmount:String(offer.credits)};
    const session = mode === 'subscription'
      ? await subscriptionCheckout(stripe, db, userId, customerId, priceId, appConfig.appUrl)
      : await stripe.checkout.sessions.create({
        customer:customerId,mode,line_items:[{price:priceId,quantity:1}],metadata,
        payment_intent_data:{metadata},client_reference_id:userId,
        success_url:appConfig.appUrl+'/billing?session_id={CHECKOUT_SESSION_ID}',cancel_url:appConfig.appUrl+'/pricing',
      });
    if (!session.url) {
      logger.error("stripe_checkout_session_missing_url", { sessionId: session.id });
      return NextResponse.json(
        {
          error: "Failed to create checkout session. Please try again.",
          details: "No checkout URL returned from Stripe"
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    if (err instanceof CheckoutConflict) return NextResponse.json({error: err.message, manageBilling: err.manageBilling}, {status: 409});
    logger.error("create_checkout_session_failed", { error: err });
    return NextResponse.json(
      {error: "Unable to start checkout right now. Please retry or contact support."},
      {status: 503}
    );
  }
}
