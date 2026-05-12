import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { z } from "zod";
import { stripeConfig, appConfig } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const checkoutRequestSchema = z.object({
  priceId: z.string().trim().regex(/^price_/, "Invalid price ID"),
  mode: z.enum(["subscription", "payment"]),
  startTrial: z.boolean().optional(),
});

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
 * Body: { priceId: string, mode: "subscription" | "payment", startTrial?: boolean }
 */
export async function POST(req: NextRequest) {
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

    const { getOrCreateUserBilling, setStripeCustomerIdForUser, isUserOnFreeTrial } = await import(
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
    const { priceId, mode, startTrial } = parsed.data;

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

    // Determine allowed prices
    const allowedPriceIds = [
      stripeConfig.starterPriceId,
      stripeConfig.starterXmasPriceId,
      stripeConfig.valuePriceId,
      stripeConfig.proPriceId,
      stripeConfig.creatorPriceId,
      stripeConfig.powerPriceId,
    ].filter(Boolean);

    if (!allowedPriceIds.includes(priceId)) {
      return NextResponse.json(
        { error: "Price is not available", details: "Unsupported priceId" },
        { status: 400 }
      );
    }

    // Map price to credit amounts (one-time)
    const creditAmountMap: Record<string, number> = {
      [stripeConfig.starterPriceId]: 10,
      [stripeConfig.starterXmasPriceId]: 20,
      [stripeConfig.valuePriceId]: 30,
      [stripeConfig.proPriceId]: 100,
    };

    // Identify which prices are subscriptions (Creator/Power)
    const subscriptionPriceIds = new Set(
      [stripeConfig.creatorPriceId, stripeConfig.powerPriceId].filter(Boolean)
    );

    // Default mode if not aligned with price type
    const inferredMode = subscriptionPriceIds.has(priceId) ? "subscription" : "payment";
    if (mode !== inferredMode) {
      return NextResponse.json(
        { error: "Invalid mode for price", details: `Use '${inferredMode}' for this price.` },
        { status: 400 }
      );
    }

    // Get or create user billing
    const billing = await getOrCreateUserBilling(userId);
    
    // Check if user has used their free trial try-on
    const onTrial = await isUserOnFreeTrial(userId);
    const shouldStartTrial = startTrial && !onTrial && mode === "subscription";

    // Create or get Stripe customer
    let customerId = billing.stripe_customer_id;

    if (!customerId) {
      const customer = await getStripe().customers.create({
        metadata: {
          clerkUserId: userId,
        },
      });
      customerId = customer.id;

      // Persist the customer ID without changing plan or credits.
      await setStripeCustomerIdForUser(userId, customerId);
    }

    // Determine credit amount for one-time payments
    const creditAmount = mode === "payment" ? creditAmountMap[priceId] || 0 : 0;

    const baseMetadata: Record<string, string> = {
      clerkUserId: userId,
      priceId,
      mode,
      ...(mode === "payment" && creditAmount > 0 && { creditAmount: creditAmount.toString() }),
      ...(shouldStartTrial && { startTrial: "true" }),
    };

    // Build subscription data (metadata always, optional trial period)
    const subscriptionData: {
      subscription_data?: {
        trial_period_days?: number;
        metadata: Record<string, string>;
      };
    } = mode === "subscription"
      ? {
          subscription_data: {
            ...(shouldStartTrial ? { trial_period_days: 7 } : {}),
            metadata: {
              ...baseMetadata,
              ...(shouldStartTrial && { isTrial: "true" }),
            },
          },
        }
      : {};

    // For one-time payments, also stamp metadata onto the PaymentIntent
    // so payment_intent.succeeded can always resolve the user + credits.
    const paymentIntentData: {
      payment_intent_data?: { metadata: Record<string, string> };
    } =
      mode === "payment"
        ? {
            payment_intent_data: {
              metadata: baseMetadata,
            },
          }
        : {};

    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      ...subscriptionData,
      ...paymentIntentData,
      success_url: `${appConfig.appUrl}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appConfig.appUrl}/?canceled=true`,
      metadata: baseMetadata,
      client_reference_id: userId,
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
    const error = err instanceof Error ? err : new Error(String(err));
    
    // Provide more specific error messages for common Stripe errors
    let errorMessage = "Failed to create checkout session";
    let errorDetails = error.message;
    
    if (error.message.includes("No such price")) {
      errorMessage = "Invalid price configuration. Please contact support.";
      errorDetails = "The selected plan is not available";
    } else if (error.message.includes("Invalid API Key")) {
      errorMessage = "Payment system configuration error. Please contact support.";
      errorDetails = "Stripe API key is invalid";
    } else if (error.message.includes("rate_limit")) {
      errorMessage = "Too many requests. Please try again in a moment.";
      errorDetails = "Rate limit exceeded";
    }
    
    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
      },
      { status: 500 }
    );
  }
}
