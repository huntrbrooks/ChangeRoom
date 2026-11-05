import Stripe from 'stripe';
import { sql } from './db';
import { flagUndeliveredPackOnClosure } from './db-access';

// Either the Clerk account or the actual Stripe customer must prove ownership.
// An app-side customer id alone is insufficient for canceling a recurring charge.
export function cancellationDecision(
  userId: string, customerUser: string | null | undefined,
  subUser: string | undefined, prices: string[], launchPrices: Set<string>, recordedIdMatches: boolean,
): 'cancel' | 'ignore' | 'review' {
  const relevant = prices.some(id => launchPrices.has(id));
  if (!relevant) return recordedIdMatches || subUser === userId ? 'review' : 'ignore';
  if ((customerUser && customerUser !== userId) || (subUser && subUser !== userId)) return 'review';
  if (!prices.length || !prices.every(id => launchPrices.has(id))) return 'review';
  return subUser === userId || customerUser === userId ? 'cancel' : 'review';
}

export async function closeDeletedAccount(userId: string) {
  // Transactional tombstone and removal; safe on duplicate signed deletion events.
  await sql`SELECT public.request_account_closure(${userId})`;
  await flagUndeliveredPackOnClosure(userId);
  const record = (await sql`
    SELECT b.stripe_customer_id, b.stripe_subscription_id FROM public.users_billing b WHERE user_id=${userId}
  `).rows[0];
  let needsReview = false;
  try {
    if (record?.stripe_customer_id) {
      const key = process.env.STRIPE_SECRET_KEY;
      const listed = [process.env.STRIPE_CREATOR_PRICE_ID, process.env.STRIPE_POWER_PRICE_ID].filter(Boolean) as string[];
      if (!key) throw new Error('billing_configuration_unavailable');
      const recurring = new Set(listed);
      const recurringCatalogComplete = recurring.size === 2;
      const appPrices = new Set([...listed, ...[process.env.STRIPE_STARTER_PRICE_ID, process.env.STRIPE_STARTER_XMAS_PRICE_ID,
        process.env.STRIPE_VALUE_PRICE_ID, process.env.STRIPE_PRO_PRICE_ID].filter(Boolean) as string[]]);
      const stripe = new Stripe(key);
      const customer = await stripe.customers.retrieve(record.stripe_customer_id);
      const customerUser = customer.deleted ? null : customer.metadata?.clerkUserId;
      // A packs-only deployment might not map historical recurring prices. Still
      // expire proven pack checkouts, but do not silently ignore a subscription
      // belonging to this customer when its price cannot be identified.
      const unmappedOwnedRecurring = (owner: string | undefined) =>
        !recurringCatalogComplete && (customerUser === userId || owner === userId);
      // An open Checkout could otherwise create a subscription after this check.
      for await (const session of stripe.checkout.sessions.list({customer: record.stripe_customer_id, status: 'open', limit: 100})) {
        const items = await stripe.checkout.sessions.listLineItems(session.id, {limit: 100});
        const priceIds = items.data.map(i => i.price?.id || '');
        const decision = cancellationDecision(userId, customerUser, session.metadata?.clerkUserId,
          priceIds, appPrices, false);
        if (decision === 'review' || (items.has_more && decision !== 'ignore') ||
            (session.mode === 'subscription' && unmappedOwnedRecurring(session.metadata?.clerkUserId))) needsReview = true;
        else if (decision === 'cancel') await stripe.checkout.sessions.expire(session.id);
      }
      for await (const sub of stripe.subscriptions.list({ customer: record.stripe_customer_id, status: 'all', limit: 100 })) {
        if (sub.status === 'canceled' || sub.status === 'incomplete_expired') continue;
        const decision = cancellationDecision(userId, customerUser, sub.metadata?.clerkUserId,
          sub.items.data.map(i=>i.price.id), recurring, sub.id === record.stripe_subscription_id);
        if (decision === 'review' || (sub.items.has_more && decision !== 'ignore') ||
            unmappedOwnedRecurring(sub.metadata?.clerkUserId)) needsReview = true;
        else if (decision === 'cancel') await stripe.subscriptions.cancel(sub.id, {invoice_now: false, prorate: false});
      }
    } else if (record?.stripe_subscription_id) {
      needsReview = true;
    }
    await sql`UPDATE public.account_closures SET billing_state=CASE WHEN last_error='pack_payment_manual_review' THEN 'review' ELSE ${needsReview ? 'review' : 'resolved'} END,
      last_attempt_at=now(),last_error=CASE WHEN last_error='pack_payment_manual_review' THEN last_error ELSE NULL END WHERE user_id=${userId}`;
    if (needsReview) console.warn('account_closure_requires_billing_review');
  } catch {
    await sql`UPDATE public.account_closures SET billing_state=CASE WHEN last_error='pack_payment_manual_review' THEN 'review' ELSE 'pending' END, last_attempt_at=now(),
      last_error=CASE WHEN last_error='pack_payment_manual_review' THEN last_error ELSE 'billing_retry_required' END WHERE user_id=${userId}`;
    throw new Error('account_closure_billing_retry_required');
  }
}
