import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";
import { appConfig, stripeConfig } from "@/lib/config";
import { ANALYTICS_EVENTS, captureServerEvent } from "@/lib/server-analytics";
import { logger } from "@/lib/logger";
import type { Plan } from "@/lib/db-access";

// Lazy Stripe client initialization (only created when route handler runs, not during build)
function getStripe() {
  return new Stripe(stripeConfig.secretKey, {
    apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
  });
}

function planForPriceId(priceId: string | null | undefined): Exclude<Plan, "free"> | null {
  if (priceId === stripeConfig.creatorPriceId) return "standard";
  if (priceId === stripeConfig.powerPriceId) return "pro";
  return null;
}

function monthlyCreditsForPlan(plan: Plan): number {
  if (plan === "standard") return appConfig.standardMonthlyCredits;
  if (plan === "pro") return appConfig.proMonthlyCredits;
  return 0;
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | undefined {
  const raw = (invoice as Stripe.Invoice & { subscription?: unknown }).subscription;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "id" in raw && typeof raw.id === "string") {
    return raw.id;
  }
  return undefined;
}

async function planForSubscription(subscriptionId: string): Promise<Plan | null> {
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  return planForPriceId(subscription.items.data[0]?.price.id) || null;
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

  const asRecord = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : null;

  const asArray = <T = unknown>(v: unknown): T[] | null => (Array.isArray(v) ? (v as T[]) : null);

  try {
    // Clerk SDK typing varies by version; use a tolerant access pattern without `any`.
    const cc = clerkClient as unknown as {
      users?: {
        getUserList?: (args: { emailAddress: string[]; limit: number }) => Promise<unknown>;
      };
    };

    const getUserList = cc?.users?.getUserList;
    if (typeof getUserList !== "function") {
      return null;
    }

    const result = await getUserList({
      emailAddress: [email],
      limit: 10,
    });

    const resultRec = asRecord(result);
    const users = Array.isArray(result) ? result : (resultRec?.data ?? []);
    if (!Array.isArray(users) || users.length !== 1) {
      return null;
    }

    const userRec = asRecord(users[0]);
    const userIdRaw = userRec?.id ?? userRec?.userId;
    const userId = typeof userIdRaw === "string" ? userIdRaw : undefined;
    if (!userId) return null;

    const emailAddresses =
      asArray(userRec?.emailAddresses) ?? asArray(userRec?.email_addresses) ?? [];

    const match = emailAddresses.find((entry) => {
      const entryRec = asRecord(entry);
      const addr = (entryRec?.emailAddress ?? entryRec?.email_address ?? "")
        .toString()
        .toLowerCase();
      return addr === email;
    });

    // If Clerk provides verification status, require it to be verified.
    const matchRec = asRecord(match);
    const verificationRec = asRecord(matchRec?.verification);
    const statusRaw = verificationRec?.status ?? matchRec?.verification_status ?? null;
    const status = typeof statusRaw === "string" ? statusRaw : null;
    if (status && status !== "verified") {
      return null;
    }

    return userId;
  } catch (err) {
    logger.warn("stripe_webhook_resolve_clerk_user_by_email_failed", { email, error: err });
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
  const {
    getUserBillingByStripeCustomer,
    updateUserBillingPlan,
    grantCredits,
    setUserBillingFrozen,
    setStripeCustomerIdForUser,
  } = await import("@/lib/db-access");
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
    logger.warn("stripe_webhook_signature_verification_failed", { error });
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
          logger.error("stripe_checkout_completed_user_unresolved", {
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
          const plan = planForPriceId(priceIdFromSession);
          if (!plan) {
            logger.error("stripe_checkout_completed_unknown_subscription_price", {
              session_id: session.id,
              price_id: priceIdFromSession || null,
              event_id: event.id,
            });
            break;
          }
          derivedPlan = plan;

          await updateUserBillingPlan(
            clerkUserId,
            plan,
            customerId,
            subscriptionId,
            {
              resetCredits: true,
              ledgerReason: "subscription_checkout_completed",
              frozen: false,
            }
          );

          logger.info("stripe_subscription_checkout_completed", {
            user_id: clerkUserId,
            plan,
            subscription_id: subscriptionId,
            event_id: event.id,
          });
          await captureServerEvent(
            ANALYTICS_EVENTS.SUBSCRIPTION_STARTED,
            {
              plan,
              price_id: priceIdFromSession,
              subscription_id: subscriptionId,
              session_id: session.id,
            },
            clerkUserId
          );
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
            logger.info("stripe_checkout_completed_not_paid", {
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
            logger.info("stripe_credit_pack_granted_from_checkout", {
              user_id: clerkUserId,
              credits: creditAmount,
              payment_intent_id: paymentIntentId,
              event_id: event.id,
            });
            await captureServerEvent(
              ANALYTICS_EVENTS.CREDIT_GRANTED,
              {
                reason: "credit_pack_purchase",
                credits: creditAmount,
                payment_intent_id: paymentIntentId,
                session_id: session.id,
              },
              clerkUserId
            );
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
        const receiptEmail = (() => {
          const receiptEmailRaw = (pi as unknown as { receipt_email?: unknown }).receipt_email;
          return typeof receiptEmailRaw === "string" ? receiptEmailRaw : undefined;
        })();
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
              const customerEmailRaw = (s as unknown as { customer_email?: unknown }).customer_email;
              sessionEmail =
                (s.customer_details?.email as string | undefined) ||
                (typeof customerEmailRaw === "string" ? customerEmailRaw : undefined) ||
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
          logger.warn("stripe_payment_intent_checkout_session_resolve_failed", {
            payment_intent_id: paymentIntentId,
            event_id: event.id,
            error: err,
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
                  logger.warn("stripe_payment_intent_customer_mapping_persist_failed", {
                    userIdFromEmail,
                    customerId,
                    error: e,
                  });
                }
              }
            }
          }
        }

        if (!targetUserId) {
          logger.error("stripe_payment_intent_target_user_unresolved", {
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
        await captureServerEvent(
          ANALYTICS_EVENTS.CREDIT_GRANTED,
          {
            reason: "credit_pack_purchase",
            credits: inferredCreditAmount,
            payment_intent_id: paymentIntentId,
            session_id: sessionId,
            price_id: priceId,
          },
          targetUserId
        );
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const billing = await getUserBillingByStripeCustomer(customerId);
        if (!billing) {
          logger.error("stripe_subscription_billing_record_missing", {
            customer_id: customerId,
            subscription_id: subscription.id,
            event_id: event.id,
          });
          break;
        }

        // Determine plan from price ID (subscriptions mapped via Creator/Power)
        const priceId = subscription.items.data[0]?.price.id;
        const plan = planForPriceId(priceId);
        if (!plan) {
          logger.error("stripe_subscription_unknown_price", {
            customer_id: customerId,
            subscription_id: subscription.id,
            price_id: priceId || null,
            event_id: event.id,
          });
          break;
        }
        const shouldFreeze = ["past_due", "unpaid", "incomplete_expired"].includes(
          subscription.status
        );

        await updateUserBillingPlan(
          billing.user_id,
          plan,
          customerId,
          subscription.id,
          {
            resetCredits: false,
            ledgerReason: "subscription_metadata_sync",
            frozen: shouldFreeze,
          }
        );

        logger.info("stripe_subscription_synced", {
          user_id: billing.user_id,
          plan,
          status: subscription.status,
          subscription_id: subscription.id,
          event_id: event.id,
        });
        await captureServerEvent(
          ANALYTICS_EVENTS.SUBSCRIPTION_CHANGED,
          {
            plan,
            status: subscription.status,
            price_id: priceId,
            subscription_id: subscription.id,
          },
          billing.user_id
        );
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const billing = await getUserBillingByStripeCustomer(customerId);
        if (billing) {
          // Downgrade to free plan
          await updateUserBillingPlan(billing.user_id, "free", customerId, undefined, {
            resetCredits: false,
            clearStripeSubscriptionId: true,
            ledgerReason: "subscription_deleted",
            frozen: false,
          });
          logger.info("stripe_subscription_deleted", {
            user_id: billing.user_id,
            subscription_id: subscription.id,
            event_id: event.id,
          });
          await captureServerEvent(
            ANALYTICS_EVENTS.SUBSCRIPTION_CANCELLED,
            {
              subscription_id: subscription.id,
              customer_id: customerId,
            },
            billing.user_id
          );
        }
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.paid": {
        // Unfreeze on successful payment
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const billing = await getUserBillingByStripeCustomer(customerId);
        if (billing) {
          await setUserBillingFrozen(billing.user_id, false);

          const billingReason = String(
            (invoice as Stripe.Invoice & { billing_reason?: unknown }).billing_reason || ""
          );
          if (billingReason === "subscription_cycle") {
            const subscriptionId = subscriptionIdFromInvoice(invoice);
            const plan =
              subscriptionId ? (await planForSubscription(subscriptionId)) || billing.plan : billing.plan;
            const credits = monthlyCreditsForPlan(plan);

            if (credits > 0) {
              await grantCredits(
                billing.user_id,
                credits,
                {
                  source: "stripe",
                  reason: "subscription_cycle",
                  invoice_id: invoice.id,
                  subscription_id: subscriptionId || billing.stripe_subscription_id,
                  plan,
                  event_id: event.id,
                },
                `stripe_invoice:${invoice.id}:subscription_cycle`
              );
            }

            await updateUserBillingPlan(
              billing.user_id,
              plan,
              customerId,
              subscriptionId || billing.stripe_subscription_id || undefined,
              {
                resetCredits: false,
                ledgerReason: "subscription_cycle_sync",
                frozen: false,
              }
            );
          }

          logger.info("stripe_invoice_payment_succeeded", {
            user_id: billing.user_id,
            invoice_id: invoice.id,
            billing_reason: billingReason || null,
            event_type: event.type,
            event_id: event.id,
          });
          await captureServerEvent(
            ANALYTICS_EVENTS.SUBSCRIPTION_PAYMENT_SUCCEEDED,
            {
              invoice_id: invoice.id,
              billing_reason: billingReason || null,
              event_type: event.type,
            },
            billing.user_id
          );
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const billing = await getUserBillingByStripeCustomer(customerId);
        if (billing) {
          await setUserBillingFrozen(billing.user_id, true);
          logger.warn("stripe_invoice_payment_failed", {
            user_id: billing.user_id,
            invoice_id: invoice.id,
            event_id: event.id,
          });
          await captureServerEvent(
            ANALYTICS_EVENTS.SUBSCRIPTION_PAYMENT_FAILED,
            {
              invoice_id: invoice.id,
              customer_id: customerId,
            },
            billing.user_id
          );
        }
        break;
      }

      default:
        logger.info("stripe_webhook_event_unhandled", { event_type: event.type, event_id: event.id });
    }

    return NextResponse.json({ received: true, eventId: event.id });
  } catch (err: unknown) {
    logger.error("stripe_webhook_handler_failed", { error: err, event_id: event.id });
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json(
      { error: "Webhook handler failed", details: error.message, eventId: event.id },
      { status: 500 }
    );
  }
}
