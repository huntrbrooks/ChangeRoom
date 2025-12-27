import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripeConfig } from "@/lib/config";
import {
  getUserBillingByStripeCustomer,
  updateUserBillingPlan,
  grantCredits,
  setUserBillingFrozen,
} from "@/lib/db-access";
import { ANALYTICS_EVENTS, captureServerEvent } from "@/lib/server-analytics";

// Lazy Stripe client initialization (only created when route handler runs, not during build)
function getStripe() {
  return new Stripe(stripeConfig.secretKey, {
    apiVersion: "2025-03-31.basil",
  });
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * POST /api/webhooks/stripe
 * Handles Stripe webhook events for billing and subscriptions
 * 
 * Events handled:
 * - checkout.session.completed (for subscriptions and one-time payments)
 * - customer.subscription.created
 * - customer.subscription.updated
 * - payment_intent.succeeded (fallback for one-time payments; uses payment_intent id for idempotency)
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
        const customerId = typeof session.customer === "string" ? session.customer : "";
        const clerkUserIdFromMetadata = session.metadata?.clerkUserId;
        const clerkUserId =
          clerkUserIdFromMetadata ||
          // If metadata is missing, recover via DB mapping from customer id (if present)
          (customerId ? (await getUserBillingByStripeCustomer(customerId))?.user_id : undefined);

        if (!clerkUserId) {
          console.error("checkout.session.completed: cannot resolve user", {
            session_id: session.id,
            customer_id: customerId || null,
            has_metadata_user: Boolean(clerkUserIdFromMetadata),
            mode: session.mode,
            payment_status: (session as { payment_status?: unknown }).payment_status,
            event_id: event.id,
          });
          break;
        }

        const priceIdFromSession = session.metadata?.priceId || session.line_items?.data?.[0]?.price?.id || "";
        const creditAmountMap: Record<string, number> = {
          [stripeConfig.starterPriceId]: 10,
          [stripeConfig.starterXmasPriceId]: 20,
          [stripeConfig.valuePriceId]: 30,
          [stripeConfig.proPriceId]: 100,
        };

        let derivedPlan: "free" | "standard" | "pro" | "credit-pack" = "credit-pack";

        if (session.mode === "subscription") {
          // Handle subscription creation (Creator/Power)
          const subscriptionId = session.subscription as string;
          let plan: "free" | "standard" | "pro" = "free";

          if (priceIdFromSession === stripeConfig.creatorPriceId) {
            plan = "standard";
          } else if (priceIdFromSession === stripeConfig.powerPriceId) {
            plan = "pro";
          }
          derivedPlan = plan;

          await updateUserBillingPlan(
            clerkUserId,
            plan,
            customerId,
            subscriptionId
          );

          console.log(`Updated user ${clerkUserId} to plan ${plan}`);
        } else if (session.mode === "payment") {
          // Handle one-time credit pack purchase
          // Idempotency key MUST be consistent across events: prefer payment_intent id
          const paymentIntentId =
            typeof session.payment_intent === "string" ? session.payment_intent : null;
          const creditRequestId = paymentIntentId || session.id;

          // IMPORTANT: checkout.session.completed can fire before funds are captured
          // for async payment methods. Only grant on "paid"; otherwise PI handler will grant later.
          const paymentStatus =
            (session as unknown as { payment_status?: string }).payment_status || "unknown";
          if (paymentStatus !== "paid") {
            console.log("checkout.session.completed: not paid yet, skipping credit grant", {
              session_id: session.id,
              payment_intent_id: paymentIntentId,
              payment_status: paymentStatus,
              event_id: event.id,
            });
            break;
          }

          const creditAmount =
            parseInt(session.metadata?.creditAmount || "0", 10) ||
            creditAmountMap[priceIdFromSession] ||
            0;

          if (creditAmount > 0) {
            const creditMetadata = {
              source: "stripe",
              reason: "credit_pack_purchase",
              price_id: priceIdFromSession,
              session_id: session.id,
              payment_intent_id: paymentIntentId,
              event_id: event.id,
              mode: session.mode,
              currency: session.currency,
              amount_total: typeof session.amount_total === "number" ? session.amount_total : null,
            };

            // Get or create billing to ensure customer ID is set
            await grantCredits(clerkUserId, creditAmount, creditMetadata, creditRequestId);
            console.log(`Added ${creditAmount} credits to user ${clerkUserId}`);
          }
        }
        await captureServerEvent(
          ANALYTICS_EVENTS.PURCHASE_COMPLETED,
          {
            mode: session.mode,
            price_id: priceIdFromSession,
            plan: derivedPlan,
            credit_amount:
              session.mode === "payment"
                ? parseInt(session.metadata?.creditAmount || "0", 10) ||
                  creditAmountMap[priceIdFromSession] ||
                  0
                : undefined,
            session_id: session.id,
            currency: session.currency,
            amount_total: typeof session.amount_total === "number" ? session.amount_total / 100 : undefined,
            user_id: clerkUserId,
          },
          clerkUserId || customerId
        );
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const paymentIntentId = pi.id;

        // Prefer metadata on the PaymentIntent (we'll ensure this is set at Checkout creation).
        let clerkUserId = (pi.metadata?.clerkUserId as string | undefined) || undefined;
        let priceId = (pi.metadata?.priceId as string | undefined) || undefined;
        let creditAmountStr = (pi.metadata?.creditAmount as string | undefined) || undefined;
        let sessionId: string | undefined = (pi.metadata?.sessionId as string | undefined) || undefined;
        let customerId = typeof pi.customer === "string" ? pi.customer : undefined;

        // Backward-compat: older payments may not have PI metadata.
        // Resolve owning Checkout Session by payment_intent id.
        if (!clerkUserId || !creditAmountStr || !priceId) {
          const sessions = await getStripe().checkout.sessions.list({
            payment_intent: paymentIntentId,
            limit: 1,
          });
          const session = sessions.data[0];
          if (session) {
            clerkUserId = clerkUserId || session.metadata?.clerkUserId || undefined;
            priceId = priceId || session.metadata?.priceId || undefined;
            creditAmountStr = creditAmountStr || session.metadata?.creditAmount || undefined;
            sessionId = sessionId || session.id;
            customerId = customerId || (typeof session.customer === "string" ? session.customer : undefined);
          }
        }

        if (!clerkUserId) {
          console.error("payment_intent.succeeded: cannot resolve clerkUserId", {
            payment_intent_id: paymentIntentId,
            event_id: event.id,
            parsed_body: safeJsonParse(body),
          });
          break;
        }

        const creditAmount = parseInt(creditAmountStr || "0", 10);
        if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
          // Not a credit-pack purchase, or missing metadata. Ignore.
          break;
        }

        const creditMetadata = {
          source: "stripe",
          reason: "credit_pack_purchase",
          price_id: priceId,
          session_id: sessionId,
          payment_intent_id: paymentIntentId,
          event_id: event.id,
          mode: "payment_intent",
          currency: pi.currency,
          amount_received: typeof pi.amount_received === "number" ? pi.amount_received : null,
        };

        // Idempotency: always use payment_intent id
        if (customerId) {
          const billing = await getUserBillingByStripeCustomer(customerId);
          if (billing) {
            await grantCredits(billing.user_id, creditAmount, creditMetadata, paymentIntentId);
            break;
          }
        }
        await grantCredits(clerkUserId, creditAmount, creditMetadata, paymentIntentId);
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

    return NextResponse.json({ received: true, eventId: event.id });
  } catch (err: unknown) {
    console.error("Webhook handler error:", err);
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json(
      { error: "Webhook handler failed", details: error.message, eventId: event.id },
      { status: 500 }
    );
  }
}

