import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripeConfig } from "@/lib/config";
import {
  getUserBillingByStripeCustomer,
  updateUserBillingPlan,
  updateUserBillingCredits,
  setUserBillingFrozen,
} from "@/lib/db-access";

// Lazy Stripe client initialization (only created when route handler runs, not during build)
function getStripe() {
  return new Stripe(stripeConfig.secretKey, {
    apiVersion: "2025-03-31.basil",
  });
}

/**
 * POST /api/webhooks/stripe
 * Handles Stripe webhook events for billing and subscriptions
 * 
 * Events handled:
 * - checkout.session.completed (for subscriptions and one-time payments)
 * - customer.subscription.created
 * - customer.subscription.updated
 * - payment_intent.succeeded (fallback for one-time payments)
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      stripeConfig.webhookSecret
    );
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("Webhook signature verification failed:", error.message);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserId = session.metadata?.clerkUserId;

        if (!clerkUserId) {
          console.error("No clerkUserId in checkout session metadata");
          break;
        }

        const customerId = session.customer as string;

        const priceIdFromSession = session.metadata?.priceId || session.line_items?.data?.[0]?.price?.id || "";
        const creditAmountMap: Record<string, number> = {
          [stripeConfig.starterPriceId]: 10,
          [stripeConfig.starterXmasPriceId]: 20,
          [stripeConfig.valuePriceId]: 30,
          [stripeConfig.proPriceId]: 100,
        };

        if (session.mode === "subscription") {
          // Handle subscription creation (Creator/Power)
          const subscriptionId = session.subscription as string;
          let plan: "free" | "standard" | "pro" = "free";

          if (priceIdFromSession === stripeConfig.creatorPriceId) {
            plan = "standard";
          } else if (priceIdFromSession === stripeConfig.powerPriceId) {
            plan = "pro";
          }

          await updateUserBillingPlan(
            clerkUserId,
            plan,
            customerId,
            subscriptionId
          );

          console.log(`Updated user ${clerkUserId} to plan ${plan}`);
        } else if (session.mode === "payment") {
          // Handle one-time credit pack purchase
          const creditAmount =
            parseInt(session.metadata?.creditAmount || "0", 10) ||
            creditAmountMap[priceIdFromSession] ||
            0;

          if (creditAmount > 0) {
            // Get or create billing to ensure customer ID is set
            const billing = await getUserBillingByStripeCustomer(customerId);
            if (billing) {
              await updateUserBillingCredits(billing.user_id, creditAmount, false);
              console.log(`Added ${creditAmount} credits to user ${billing.user_id}`);
            } else {
              // Fallback: use clerkUserId from metadata
              await updateUserBillingCredits(clerkUserId, creditAmount, false);
              console.log(`Added ${creditAmount} credits to user ${clerkUserId}`);
            }
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const billing = await getUserBillingByStripeCustomer(customerId);
        if (!billing) {
          console.error(`No billing record found for customer ${customerId}`);
          break;
        }

        // Determine plan from price ID (subscriptions mapped via Creator/Power)
        const priceId = subscription.items.data[0]?.price.id;
        let plan: "free" | "standard" | "pro" = "free";
        if (priceId === stripeConfig.creatorPriceId) {
          plan = "standard";
        } else if (priceId === stripeConfig.powerPriceId) {
          plan = "pro";
        }

        await updateUserBillingPlan(
          billing.user_id,
          plan,
          customerId,
          subscription.id
        );

        console.log(`Updated subscription for user ${billing.user_id} to plan ${plan}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const billing = await getUserBillingByStripeCustomer(customerId);
        if (billing) {
          // Downgrade to free plan
          await updateUserBillingPlan(billing.user_id, "free", customerId, undefined);
          console.log(`Downgraded user ${billing.user_id} to free plan`);
        }
        break;
      }

      case "invoice.paid": {
        // Unfreeze on successful payment
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const billing = await getUserBillingByStripeCustomer(customerId);
        if (billing) {
          await setUserBillingFrozen(billing.user_id, false);
          console.log(`Unfroze user ${billing.user_id} after invoice paid`);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const billing = await getUserBillingByStripeCustomer(customerId);
        if (billing) {
          await setUserBillingFrozen(billing.user_id, true);
          console.log(`Froze user ${billing.user_id} due to payment failure`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    console.error("Webhook handler error:", err);
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json(
      { error: "Webhook handler failed", details: error.message },
      { status: 500 }
    );
  }
}

