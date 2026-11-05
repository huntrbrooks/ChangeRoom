import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { canCreateCheckout, pausedCheckoutResponse } from "@/lib/purchase-availability";
import { z } from "zod";
import { stripeConfig, appConfig } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveCheckout } from "@/lib/billing-catalog";
import { CHECKOUT_MARKET_COUNTRIES, checkoutMarketEvidence, expectedCheckoutLivemode } from "@/lib/checkout-market";
import { validPackPrice } from "@/lib/subscription-lifecycle";
import { logger } from "@/lib/logger";

const buyer = {buyerCountry: z.enum(CHECKOUT_MARKET_COUNTRIES), personalUse: z.literal(true)};
const checkoutRequestSchema = z.union([z.object({...buyer, sku:z.string().min(1).max(40)}).strict(), z.object({
  ...buyer,
  priceId: z.string().trim().regex(/^price_/, "Invalid price ID"),
  mode: z.literal("payment"),
}).strict()]);

// Lazy Stripe client initialization (only created when route handler runs, not during build)
function getStripe() {
  return new Stripe(stripeConfig.secretKey, {
    apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
  });
}

/**
 * POST /api/billing/create-checkout-session
 * Creates only one-time pack Checkout Sessions. Existing subscriptions are managed separately.
 * 
 * Body: {buyerCountry, personalUse: true} plus {sku} or an allowlisted {priceId, mode: "payment"}.
 */
export async function POST(req: NextRequest) {
  if (!canCreateCheckout()) return pausedCheckoutResponse();
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

    // This endpoint accepts only the documented JSON body. No query can set or override market evidence.
    if (req.nextUrl.search) return NextResponse.json({error: 'invalid_request'}, {status: 400});
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

    const market = checkoutMarketEvidence(parsed.data.buyerCountry, req.headers);
    if (!market) {
      return NextResponse.json({error: 'market_unavailable', message:
        'Purchases are available only to residents buying for personal use while in Australia or New Zealand. Your location must match your country of residence.'}, {status: 403});
    }

    // Validate Stripe configuration
    const livemode = expectedCheckoutLivemode(stripeConfig.secretKey);
    if (livemode === null) {
      logger.error("stripe_checkout_mode_invalid");
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
    const {offer,priceId} = selection;
    const mode = "payment" as const;
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(priceId, {expand:["product"]});
    if (price.livemode !== livemode || !validPackPrice(price, offer))
      throw new Error('Stripe price disagrees with the published offer');
    const db = await import("@/lib/db-access");
    const accountUnavailable = () => NextResponse.json({error:'account_unavailable',
      message:'Purchases are unavailable for this account. Please contact support.'}, {status:403});
    if (await db.isClosedForPackPurchase(userId)) return accountUnavailable();
    const billing = await db.getOrCreateUserBilling(userId);
    if (billing.is_frozen !== false) return accountUnavailable();
    let customerId = billing.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({metadata:{clerkUserId:userId}},
        {idempotencyKey:'changeroom-customer:'+userId});
      customerId = customer.id;
      await db.setStripeCustomerIdForUser(userId,customerId);
    }
    const metadata = {clerkUserId:userId,priceId,mode,creditAmount:String(offer.credits), ...market};
    // Never resume a stored subscription attempt or pass a caller-selected mode to Stripe.
    const session = await stripe.checkout.sessions.create({
        customer:customerId,mode,line_items:[{price:priceId,quantity:1}],metadata,
        // Launch only the verified card flow; account-wide dynamic methods include untested alternatives.
        payment_method_types:["card"],
        billing_address_collection:'required', adaptive_pricing:{enabled:false}, automatic_tax:{enabled:false},
        // Authorization alone does not sell credits. Check the final card billing country before capture.
        payment_intent_data:{capture_method:'manual',metadata,
          description:`${offer.name} — ${offer.credits} ChangeRoom try-on credits. FRESH'N UP AU PTY LTD, ABN 11 678 658 823. No GST charged.`},
        client_reference_id:userId,
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
    logger.error("create_checkout_session_failed", { error: err });
    return NextResponse.json(
      {error: "Unable to start checkout right now. Please retry or contact support."},
      {status: 503}
    );
  }
}
