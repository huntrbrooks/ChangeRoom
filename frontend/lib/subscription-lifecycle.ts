import type Stripe from 'stripe';
import { offerForPrice, type Offer, type Pack } from './billing-catalog';
type Prices = Parameters<typeof offerForPrice>[0];
type Row = Record<string, unknown>;
const row = (v: unknown): Row => v && typeof v === 'object' ? v as Row : {};
export const stripeId = (v: unknown): string => typeof v === 'string' ? v : typeof row(v).id === 'string' ? row(v).id as string : '';
export function invoiceSubscription(invoice: unknown) {
  const i = row(invoice);
  return stripeId(row(row(i.parent).subscription_details).subscription) || stripeId(i.subscription);
}
export type Award = {invoiceId: string; created: number; subscription: string; periodStart: number; periodEnd: number; credits: number; price: string};
export function paidAllowance(invoice: unknown, prices: Prices): Award | null {
  const i = row(invoice);
  if (i.status !== 'paid' || !['subscription_create','subscription_cycle'].includes(String(i.billing_reason))) return null;
  if (Number(i.amount_paid) <= 0) return null; // no card trial or complimentary invoice grants
  const subscription = invoiceSubscription(i);
  if (!subscription) throw new Error('invoice_subscription_missing');
  const lines = row(i.lines);
  if (lines.has_more || !Array.isArray(lines.data)) throw new Error('invoice_lines_need_reconciliation');
  const matches = lines.data.map(row).filter(l =>
    !row(row(l.parent).subscription_item_details).proration && !l.proration &&
    offerForPrice(prices, stripeId(row(row(l.pricing).price_details).price) || stripeId(l.price))?.mode === 'subscription');
  if (matches.length !== 1) throw new Error('invoice_allowance_price_unresolved');
  const line = matches[0];
  const price = stripeId(row(row(line.pricing).price_details).price) || stripeId(line.price);
  const offer = offerForPrice(prices, price)!;
  const start = Number(row(line.period).start), end = Number(row(line.period).end);
  if (i.currency !== 'aud' || line.quantity !== 1 || !Number.isInteger(start) || !(end > start) || !stripeId(i) || !Number.isSafeInteger(i.created)) throw new Error('invoice_allowance_invalid');
  return { invoiceId: stripeId(i), created: Number(i.created), subscription, periodStart: start, periodEnd: end, credits: offer.credits, price };
}
export type SubscriptionSnapshot = { id: string | null; plan: 'free'|'standard'|'pro'; frozen: boolean; endsAt: string | null };
export const terminal = (status: string) => status === 'canceled' || status === 'incomplete_expired';
// Read Stripe's current state, rather than applying a possibly delayed event snapshot.
export async function liveSnapshot(stripe: Stripe, customer: string, prices: Prices): Promise<SubscriptionSnapshot> {
  let current: SubscriptionSnapshot | null = null;
  for await (const sub of stripe.subscriptions.list({customer, status:'all', limit:100, expand:['data.latest_invoice']})) {
    if (terminal(sub.status)) continue;
    const item = sub.items.data.find(i => offerForPrice(prices, i.price.id)?.mode === 'subscription');
    if (!item) {
      if (sub.metadata?.clerkUserId) throw new Error('unknown_app_subscription_price');
      continue;
    }
    if (current || sub.items.data.length !== 1 || item.quantity !== 1) throw new Error('ambiguous_active_subscriptions');
    const plan = offerForPrice(prices, item.price.id)!.plan;
    const end = Number(row(item).current_period_end ?? row(sub).current_period_end);
    const invoice = row(sub.latest_invoice);
    current = {id:sub.id, plan, endsAt: end > 0 ? new Date(end*1000).toISOString() : null,
      frozen: !['active','trialing'].includes(sub.status) ||
        invoice.status === 'uncollectible' || (invoice.status === 'open' && Number(invoice.attempt_count) > 0 && Number(invoice.amount_remaining) > 0)};
  }
  return current || {id:null,plan:'free',frozen:false,endsAt:null};
}
export function priceMatchesOffer(p: Stripe.Price, offer: Offer): boolean {
  return p.active && p.unit_amount === offer.cents && p.currency === 'aud' &&
    (offer.mode === 'payment' ? p.type === 'one_time' : p.type === 'recurring' &&
      p.recurring?.interval === 'month' && p.recurring.interval_count === 1 &&
      p.recurring.usage_type === 'licensed');
}

// Callers must expand product when looking up a public pack. The amount, currency,
// cadence, credit count and product must still match the approved offer at checkout time.
export function validPackPrice(price: Stripe.Price, pack: Pack): boolean {
  const product = price.product;
  return priceMatchesOffer(price, pack) && price.metadata?.credits === String(pack.credits) &&
    Boolean(product && typeof product === 'object' && 'active' in product && product.active);
}
