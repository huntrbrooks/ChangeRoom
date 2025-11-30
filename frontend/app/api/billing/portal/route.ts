import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { stripeConfig, appConfig } from "@/lib/config";
import { getOrCreateUserBilling } from "@/lib/db-access";

const stripe = new Stripe(stripeConfig.secretKey, {
  apiVersion: "2025-02-24.acacia",
});

/**
 * POST /api/billing/portal
 * Creates a Stripe Billing Portal session for managing subscription
 */
export async function POST(req: NextRequest) {
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

    const session = await stripe.billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: `${appConfig.appUrl}/`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("billing-portal error:", err);
    return NextResponse.json(
      {
        error: "Failed to create billing portal session",
        details: err.message,
      },
      { status: 500 }
    );
  }
}

