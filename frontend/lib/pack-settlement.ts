import type Stripe from 'stripe';
import { offerForPrice, packCredits } from './billing-catalog';
import { CHECKOUT_MARKET_POLICY, expectedCheckoutLivemode, isCheckoutMarketCountry } from './checkout-market';
import { stripeConfig } from './config';
import { getUserBillingByStripeCustomer, withPackAuthority, type PackAuthority } from './db-access';
import { stripeReceiptUrl } from './pack-receipt';
import { stripeId, validPackPrice } from './subscription-lifecycle';

// Existing financial obligations still settle on their original terms. Sales were paused
// before this boundary; Sessions created after it may not fall back to legacy fulfillment.
const LEGACY_BEFORE = Date.UTC(2026, 10, 5) / 1000;
export const packSessionExpansions = ['line_items.data.price.product'];
type Session = Stripe.Checkout.Session;
type Buyer = {user_id: string; stripe_customer_id: string | null; credits_available: number};
type Source = 'webhook' | 'verify-checkout-session';
const pending = {ok: true, settled: false, granted: false, reason: 'not_paid'} as const;
const notCompleted = {ok: true, settled: false, granted: false, status: 'not_completed'} as const;

function insist(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason); // webhook returns 503 for replay/reconciliation
}

const reviewStatus = {ok: true, settled: false, granted: false, status: 'needs_review'} as const;
const refunded = {ok: true, settled: false, granted: false, status: 'refunded'} as const;
const bounded = {timeout: 4000, maxNetworkRetries: 0};

async function deliver(lock: PackAuthority, s: Session, credits: number, price: string, pi: string, source: Source, receiptUrl: string | null, country?: string) {
  if (!lock.alreadyGranted && (lock.closed || lock.billing.is_frozen)) {
    await lock.review('captured_but_cannot_deliver',s.id);
    return reviewStatus;
  }
  const updated = lock.alreadyGranted ? lock.billing : await lock.grant(credits, {source: 'stripe', reason: 'credit_pack_purchase',
    price_id: price, payment_intent_id: pi, session_id: s.id,
    ...(source === 'verify-checkout-session' ? {verified_via: source} : {}),
    ...(country ? {market_policy: CHECKOUT_MARKET_POLICY, buyer_country: country, origin_country: country, billing_country: country} : {})});
  return {ok: true, settled: true, granted: !lock.alreadyGranted, creditsGranted: credits,
    creditsAvailable: updated.credits_available, sessionId: s.id, paymentIntentId: pi,
    ...(receiptUrl && !lock.closed ? {receiptUrl} : {})};
}

async function reversal(lock: PackAuthority, charge: Stripe.Charge, s: Session) {

  if (charge.refunded && charge.amount_refunded === charge.amount && !charge.disputed) {
    await lock.receipt('fully_refunded',s.id);
    return refunded;
  }
  if (charge.amount_refunded > 0 || charge.refunded || charge.disputed) {
    await lock.review(charge.disputed ? 'disputed_charge' : 'partially_refunded_charge',s.id);
    return reviewStatus;
  }
}

// Inputs must be a freshly retrieved Session, never the event payload or browser-supplied metadata.
// Only authenticated Stripe webhooks can act on authorizations. The owner's return can repair
// delivery of an already captured eligible payment, even while acquisition is paused.
export async function reconcilePack(stripe: Stripe, s: Session, source: Source, viewer?: Buyer, succeededEvent=false) {
  const line = s.line_items?.data[0];
  const priceId = line?.price?.id;
  const credits = packCredits(stripeConfig, priceId);
  const policy = s.metadata?.changeRoomMarketPolicy;
  if (s.mode !== 'payment') return pending;
  if (s.status === 'expired') {insist(!succeededEvent,'paid_event_expired_session');return notCompleted;}
  if (!credits) {
    insist(!policy && !s.metadata?.clerkUserId, 'app_pack_price_unmapped');
    return {ok: true, settled: false, granted: false, reason: 'no_credit_amount'};
  }
  const payment = stripeId(s.payment_intent);
  if (!policy && s.payment_status !== 'paid') {insist(!succeededEvent,'paid_event_session_not_paid_yet');return pending;}
  if (!policy) insist(Number.isSafeInteger(s.created) && s.created > 0 && s.created < LEGACY_BEFORE,
    'untagged_pack_after_market_cutover');
  else insist(policy === CHECKOUT_MARKET_POLICY, 'unknown_pack_market_policy');
  const customer = stripeId(s.customer);
  insist(customer && payment && priceId && line && line.quantity === 1 && s.line_items?.data.length === 1 && !s.line_items.has_more,
    'pack_order_incomplete');
  const owner = viewer ?? await getUserBillingByStripeCustomer(customer);
  insist(owner && owner.stripe_customer_id === customer && (!s.metadata?.clerkUserId || owner.user_id === s.metadata.clerkUserId) &&
    (!s.client_reference_id || s.client_reference_id === owner.user_id), 'pack_customer_owner_mismatch');
  const result = await withPackAuthority(owner.user_id,customer,payment, async lock => {
    // Closure, billing ownership/freeze and concurrent webhook processing cannot cross the
    // locked decision. Refresh the PI *after* taking the lock; never capture from a stale event.
    const pi = await stripe.paymentIntents.retrieve(payment,{expand:['latest_charge']},bounded);
    insist(pi.id === payment && stripeId(pi.customer) === customer, 'pack_payment_owner_mismatch');
    if (succeededEvent) insist(pi.status === 'succeeded','succeeded_event_payment_not_current');
    const buyerReceipt = (charge: Stripe.Charge) => source === 'verify-checkout-session' && viewer &&
      viewer.user_id === owner.user_id && stripeId(charge.customer) === customer && charge.paid &&
      charge.status === 'succeeded' && charge.captured && charge.amount_captured > 0
        ? stripeReceiptUrl(charge.receipt_url) : null;
    if (!policy) {
      insist(!pi.metadata?.changeRoomMarketPolicy && pi.status === 'succeeded' && pi.amount_received > 0 &&
        pi.amount_received === s.amount_total,'legacy_paid_pack_requires_reconciliation');
      const charge = pi.latest_charge;
      insist(charge && typeof charge === 'object' && stripeId(charge.payment_intent) === pi.id &&
        charge.captured && charge.amount_captured === pi.amount_received,'legacy_charge_unsettled');
      return await reversal(lock,charge,s) ?? await deliver(lock,s,credits,priceId,payment,source,buyerReceipt(charge));
    }
    const m = s.metadata!;
    const offer = offerForPrice(stripeConfig, priceId);
    const live = expectedCheckoutLivemode(stripeConfig.secretKey);
    insist(live !== null && s.livemode === live && pi.livemode === live && offer?.mode === 'payment' &&
      s.payment_link === null && !s.subscription && m.clerkUserId === owner.user_id && s.client_reference_id === owner.user_id &&
      m.mode === 'payment' && m.priceId === priceId && m.creditAmount === String(credits) && pi.capture_method === 'manual', 'pack_order_identity_mismatch');
    for (const key of ['changeRoomMarketPolicy','buyerCountry','originCountry','clerkUserId','mode','priceId','creditAmount'])
      insist(pi.metadata[key] === m[key], 'pack_order_metadata_mismatch');
    if (pi.status === 'canceled') return notCompleted;
    if (s.status !== 'complete' || (pi.status !== 'requires_capture' && pi.status !== 'succeeded')) {
      if (source === 'webhook') throw new Error('pack_checkout_not_complete_yet');
      return pending;
    }
    const charge = pi.latest_charge;
    insist(charge && typeof charge === 'object' && charge.id && stripeId(charge.payment_intent) === pi.id &&
      stripeId(charge.customer) === customer && charge.livemode === live && charge.payment_method_details?.type === 'card' &&
      charge.status === 'succeeded' && charge.paid, 'pack_authorization_charge_unresolved');
    const cents = offer.cents;
    insist(s.currency === 'aud' && pi.currency === 'aud' && charge.currency === 'aud' &&
      line.price?.type === 'one_time' && line.price.currency === 'aud' && line.price.unit_amount === cents &&
      s.amount_total === cents && s.amount_subtotal === cents && line.amount_total === cents && line.amount_subtotal === cents &&
      s.total_details?.amount_discount === 0 && s.total_details.amount_tax === 0 &&
      (s.total_details.amount_shipping === 0 || s.total_details.amount_shipping === null) && line.amount_discount === 0 && line.amount_tax === 0 &&
      pi.amount === cents && charge.amount === cents && s.payment_method_types.length === 1 && s.payment_method_types[0] === 'card' &&
      s.billing_address_collection === 'required','pack_price_or_authorization_mismatch');
    const reversed = await reversal(lock,charge,s);
    if (reversed) return reversed;
    insist(s.customer_details && charge.billing_details, 'pack_billing_snapshot_not_available');
    const country = m.buyerCountry;
    const eligible = isCheckoutMarketCountry(country) && m.originCountry === country &&
      charge.billing_details.address?.country === country && s.customer_details.address?.country === country;
    if (pi.status === 'requires_capture') {
      insist(!charge.captured && charge.amount_captured === 0 && pi.amount_received === 0 && pi.amount_capturable === cents,
        'pack_authorization_amount_mismatch');
      if (source !== 'webhook') return pending;
      if (!eligible || !validPackPrice(line.price, offer) || lock.closed || lock.billing.is_frozen) {
        await stripe.paymentIntents.cancel(pi.id, {}, {...bounded,idempotencyKey:'changeroom-pack-cancel-v1:'+pi.id});
        return notCompleted;
      }
      try {
        await stripe.paymentIntents.capture(pi.id, {amount_to_capture:cents}, {...bounded,idempotencyKey:'changeroom-pack-capture-v1:'+pi.id});
      } catch {
        // The provider might have received the request even if our connection failed.
        await lock.review('capture_outcome_unknown',s.id);
        return reviewStatus;
      }
      await lock.receipt('capture_requested',s.id);
      return pending; // succeeded callback or owner return reads fresh evidence before granting
    }
    if (!eligible || !charge.captured || charge.amount_captured !== cents || pi.amount_received !== cents || pi.amount_capturable !== 0) {
      await lock.review('captured_order_mismatch',s.id);return reviewStatus;
    }
    if (s.payment_status !== 'paid') {
      if (source === 'webhook') throw new Error('captured_pack_session_not_paid_yet');
      return pending;
    }
    return deliver(lock,s,credits,priceId,payment,source,buyerReceipt(charge),country);
  });
  // Commit durable review evidence *before* returning a redeliverable failure.
  if ('status' in result && result.status === 'needs_review' && source === 'webhook') throw new Error('pack_payment_manual_review');
  return result;
}
