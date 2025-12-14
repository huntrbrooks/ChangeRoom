import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { stripeConfig, appConfig } from "@/lib/config";
import {
  getOrCreateUserBilling,
  updateUserBillingPlan,
  isUserOnFreeTrial,
} from "@/lib/db-access";

// Lazy Stripe client initialization (only created when route handler runs, not during build)
function getStripe() {
  return new Stripe(stripeConfig.secretKey, {
    apiVersion: "2025-03-31.basil",
  });
}

/**
 * POST /api/billing/create-checkout-session
 * Creates a Stripe Checkout Session for subscription or one-time payment
 * 
 * Body: { priceId: string, mode: "subscription" | "payment", startTrial?: boolean }
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { priceId, mode, startTrial } = body as {
      priceId: string;
      mode: "subscription" | "payment";
      startTrial?: boolean;
    };

    if (!priceId || !mode) {
      return NextResponse.json(
        { error: "Missing priceId or mode" },
        { status: 400 }
      );
    }

    // Validate price ID is not empty and has correct format
    if (!priceId.trim() || !priceId.startsWith("price_")) {
      console.error("Invalid price ID:", priceId);
      return NextResponse.json(
        { 
          error: "Invalid price ID. Please contact support if this issue persists.",
          details: "Price ID is missing or incorrectly configured"
        },
        { status: 400 }
      );
    }

    if (mode !== "subscription" && mode !== "payment") {
      return NextResponse.json(
        { error: "mode must be 'subscription' or 'payment'" },
        { status: 400 }
      );
    }

    // Validate Stripe configuration
    if (!stripeConfig.secretKey || !stripeConfig.secretKey.trim()) {
      console.error("Stripe secret key is not configured");
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
      console.error("Invalid app URL:", appConfig.appUrl);
      return NextResponse.json(
        { 
          error: "Configuration error. Please contact support.",
          details: "App URL is not properly configured"
        },
        { status: 500 }
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

      // Update billing record with customer ID
      await updateUserBillingPlan(userId, billing.plan, customerId);
    }

    // Determine credit amount for one-time payments
    let creditAmount = 0;
    if (mode === "payment") {
      if (priceId === stripeConfig.creditPackSmallPriceId) {
        creditAmount = appConfig.creditPackSmallAmount;
      } else if (priceId === stripeConfig.creditPackLargePriceId) {
        creditAmount = appConfig.creditPackLargeAmount;
      }
    }

    // Build subscription data for free trial (Stripe trial period)
    // Note: Our app logic uses trial_used flag, but we can still offer Stripe trial period
    const subscriptionData: {
      subscription_data?: {
        trial_period_days: number;
        metadata: Record<string, string>;
      };
    } = {};
    if (shouldStartTrial) {
      // Offer 7-day Stripe trial period for subscriptions
      subscriptionData.subscription_data = {
        trial_period_days: 7,
        metadata: {
          clerkUserId: userId,
          isTrial: "true",
        },
      };
    }

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
      success_url: `${appConfig.appUrl}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appConfig.appUrl}/?canceled=true`,
      metadata: {
        clerkUserId: userId,
        priceId,
        mode,
        ...(mode === "payment" && { creditAmount: creditAmount.toString() }),
        ...(shouldStartTrial && { startTrial: "true" }),
      },
    });

    if (!session.url) {
      console.error("Stripe session created but no URL returned");
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
    console.error("create-checkout-session error:", err);
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

