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
    apiVersion: "2025-02-24.acacia",
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

    if (mode !== "subscription" && mode !== "payment") {
      return NextResponse.json(
        { error: "mode must be 'subscription' or 'payment'" },
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

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error("create-checkout-session error:", err);
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json(
      {
        error: "Failed to create checkout session",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

