import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";
import { stripeConfig } from "@/lib/config";
import {
  getUserBillingByStripeCustomer,
  updateUserBillingPlan,
  grantCredits,
  setUserBillingFrozen,
  setStripeCustomerIdForUser,
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

async function resolveClerkUserIdByVerifiedEmail(emailRaw: string): Promise<string | null> {
  const email = (emailRaw || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;

  try {
    // Clerk SDK typing varies by version; use a tolerant access pattern.
    const result = await (clerkClient as unknown as any).users.getUserList({
      emailAddress: [email],
      limit: 10,
    });

    const users = Array.isArray(result) ? result : (result?.data ?? []);
    if (!Array.isArray(users) || users.length !== 1) {
      return null;
    }

    const user = users[0] as any;
    const userId = (user?.id as string | undefined) || (user?.userId as string | undefined);
    if (!userId) return null;

    const emailAddresses: any[] =
      (Array.isArray(user?.emailAddresses) ? user.emailAddresses : null) ||
      (Array.isArray(user?.email_addresses) ? user.email_addresses : null) ||
      [];

    const match = emailAddresses.find((entry) => {
      const addr = (entry?.emailAddress ?? entry?.email_address ?? "").toString().toLowerCase();
      return addr === email;
    });

    // If Clerk provides verification status, require it to be verified.
    const status = (match?.verification?.status ?? match?.verification_status ?? null) as
      | "verified"
      | "unverified"
      | string
      | null;
    if (status && status !== "verified") {
      return null;
    }

    return userId;
  } catch (err) {
    console.warn("resolveClerkUserIdByVerifiedEmail failed", { email, err });
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
        let receiptEmail =
          (typeof (pi as any).receipt_email === "string" ? (pi as any).receipt_email : undefined) ||
          undefined;
        let sessionEmail: string | undefined;

        // Backward-compat + "off-site" flows:
        // Resolve the owning Checkout Session by payment_intent id and expand line_items so we can infer priceId.
        // This covers Stripe Checkout / Payment Links where PI metadata may be empty.
        let expandedSession: Stripe.Checkout.Session | null = null;
        try {
          if (!sessionId || !priceId || !creditAmountStr || !clerkUserId || !customerId) {
            const sessions = await getStripe().checkout.sessions.list({
              payment_intent: paymentIntentId,
              limit: 1,
            });
            const s = sessions.data[0];
            if (s) {
              sessionId = sessionId || s.id;
              customerId =
                customerId || (typeof s.customer === "string" ? s.customer : undefined);
              sessionEmail =
                (s.customer_details?.email as string | undefined) ||
                (typeof (s as any).customer_email === "string" ? (s as any).customer_email : undefined) ||
                undefined;

              // Retrieve with expansions for robust price inference.
              try {
                expandedSession = await getStripe().checkout.sessions.retrieve(s.id, {
                  expand: ["line_items.data.price"],
                });
              } catch {
                expandedSession = s;
              }

              clerkUserId =
                clerkUserId || expandedSession?.metadata?.clerkUserId || undefined;
              priceId =
                priceId ||
                expandedSession?.metadata?.priceId ||
                (expandedSession?.line_items?.data?.[0]?.price?.id as string | undefined) ||
                undefined;
              creditAmountStr =
                creditAmountStr || expandedSession?.metadata?.creditAmount || undefined;
              customerId =
                customerId ||
                (typeof expandedSession?.customer === "string"
                  ? expandedSession.customer
                  : undefined);
              sessionEmail =
                sessionEmail ||
                (expandedSession?.customer_details?.email as string | undefined) ||
                undefined;
            }
          }
        } catch (err) {
          console.warn("payment_intent.succeeded: failed to resolve checkout session", {
            payment_intent_id: paymentIntentId,
            event_id: event.id,
            err,
          });
        }

        // Infer credit amount if missing but we have priceId.
        const creditAmountMap: Record<string, number> = {
          [stripeConfig.starterPriceId]: 10,
          [stripeConfig.starterXmasPriceId]: 20,
          [stripeConfig.valuePriceId]: 30,
          [stripeConfig.proPriceId]: 100,
        };

        const inferredCreditAmount =
          parseInt(creditAmountStr || "0", 10) ||
          (priceId ? creditAmountMap[priceId] || 0 : 0);
        if (!Number.isFinite(inferredCreditAmount) || inferredCreditAmount <= 0) {
          // Not a credit-pack purchase, or we cannot infer credits safely.
          break;
        }

        // Determine the target user:
        // 1) clerkUserId from metadata (best)
        // 2) map via known Stripe customer id (good)
        // 3) last-resort: match a VERIFIED Clerk email to receipt/customer email (best-effort)
        let targetUserId: string | undefined = clerkUserId || undefined;

        if (!targetUserId && customerId) {
          const billing = await getUserBillingByStripeCustomer(customerId);
          if (billing) {
            targetUserId = billing.user_id;
          }
        }

        const candidateEmail = (sessionEmail || receiptEmail || "").trim();
        if (!targetUserId && candidateEmail) {
          const userIdFromEmail = await resolveClerkUserIdByVerifiedEmail(candidateEmail);
          if (userIdFromEmail) {
            targetUserId = userIdFromEmail;
            // Persist customer mapping if available and not already mapped.
            if (customerId) {
              const existing = await getUserBillingByStripeCustomer(customerId);
              if (!existing) {
                try {
                  await setStripeCustomerIdForUser(userIdFromEmail, customerId);
                } catch (e) {
                  console.warn("Failed to persist stripe_customer_id for inferred user", {
                    userIdFromEmail,
                    customerId,
                    e,
                  });
                }
              }
            }
          }
        }

        if (!targetUserId) {
          console.error("payment_intent.succeeded: cannot resolve target user", {
            payment_intent_id: paymentIntentId,
            event_id: event.id,
            customer_id: customerId || null,
            receipt_email: candidateEmail || null,
            price_id: priceId || null,
            session_id: sessionId || null,
            parsed_body: safeJsonParse(body),
          });
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
          attribution:
            clerkUserId
              ? "payment_intent_metadata"
              : customerId
                ? "stripe_customer_id"
                : candidateEmail
                  ? "verified_email"
                  : "unknown",
          receipt_email: candidateEmail || null,
        };

        // Idempotency: always use payment_intent id
        await grantCredits(targetUserId, inferredCreditAmount, creditMetadata, paymentIntentId);
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

