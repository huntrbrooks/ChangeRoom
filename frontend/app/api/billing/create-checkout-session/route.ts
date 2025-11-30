import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { stripeConfig, appConfig } from "@/lib/config";
import {
  getOrCreateUserBilling,
  updateUserBillingPlan,
  getUserBillingByStripeCustomer,
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
 * Body: { priceId: string, mode: "subscription" | "payment" }
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { priceId, mode } = body as {
      priceId: string;
      mode: "subscription" | "payment";
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
      success_url: `${appConfig.appUrl}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appConfig.appUrl}/?canceled=true`,
      metadata: {
        clerkUserId: userId,
        priceId,
        mode,
        ...(mode === "payment" && { creditAmount: creditAmount.toString() }),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("create-checkout-session error:", err);
    return NextResponse.json(
      {
        error: "Failed to create checkout session",
        details: err.message,
      },
      { status: 500 }
    );
  }
}

