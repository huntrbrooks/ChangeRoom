import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { stripeConfig, appConfig } from "@/lib/config";
import { getOrCreateUserBilling } from "@/lib/db-access";

// Lazy Stripe client initialization (only created when route handler runs, not during build)
function getStripe() {
  return new Stripe(stripeConfig.secretKey, {
    apiVersion: "2025-02-24.acacia",
  });
}

/**
 * POST /api/billing/portal
 * Creates a Stripe Billing Portal session for managing subscription
 */
export async function POST(_req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
    console.error("billing-portal error:", err);
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

