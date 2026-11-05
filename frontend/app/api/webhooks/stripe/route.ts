import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripeConfig } from '@/lib/config';
import { offerForPrice, packCredits } from '@/lib/billing-catalog';
import { invoiceSubscription, liveSnapshot, paidAllowance, stripeId } from '@/lib/subscription-lifecycle';
import { logger } from '@/lib/logger';
import { syncSubscriptionBilling } from '@/lib/db-access';

import { packSessionExpansions, reconcilePack } from '@/lib/pack-settlement';
import { CHECKOUT_MARKET_POLICY } from '@/lib/checkout-market';

async function pack(stripe: Stripe, sessionId: string, expectedIntent?: string, succeededEvent=false) {
  const s = await stripe.checkout.sessions.retrieve(sessionId, {expand: packSessionExpansions});
  if (expectedIntent && stripeId(s.payment_intent) !== expectedIntent) throw new Error('pack_intent_session_mismatch');
  await reconcilePack(stripe, s, 'webhook', undefined, succeededEvent);
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe(stripeConfig.secretKey,{apiVersion:'2026-02-25.clover' as Stripe.LatestApiVersion,timeout:8000,maxNetworkRetries:1});
  const signature=req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({error:'Missing signature'},{status:400});
  let event: Stripe.Event;
  try { event=stripe.webhooks.constructEvent(await req.text(),signature,stripeConfig.webhookSecret); }
  catch { return NextResponse.json({error:'Invalid signature'},{status:400}); }

  try {
    // This direct-merchant endpoint does not collect payments for Connect accounts.
    if (event.account) return NextResponse.json({received: true});
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const s=event.data.object;
        if (s.mode === 'payment') await pack(stripe,s.id);
        // Subscriptions are fulfilled only by a settled subscription invoice.
        break;
      }
      case 'payment_intent.amount_capturable_updated':
      case 'payment_intent.succeeded': {
        const pi=event.data.object;
        // This fallback is for application-labelled packs, including delayed methods.
        // Subscription/non-Checkout PIs do not imply an allowance.
        if (event.type === 'payment_intent.amount_capturable_updated' && pi.metadata.changeRoomMarketPolicy !== CHECKOUT_MARKET_POLICY) break;
        if (!packCredits(stripeConfig, pi.metadata.priceId) && !pi.metadata.changeRoomMarketPolicy) break;
        const matches=await stripe.checkout.sessions.list({payment_intent:pi.id,limit:2});
        if (matches.data.length !== 1 || matches.has_more) throw new Error('paid_pack_session_unresolved');
        await pack(stripe,matches.data[0].id,pi.id,event.type === 'payment_intent.succeeded');
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        const s=event.data.object;
        if (!s.metadata.clerkUserId && !s.items.data.some(i=>offerForPrice(stripeConfig,i.price.id)?.mode==='subscription')) break;
        const customer=stripeId(s.customer);
        await syncSubscriptionBilling(customer,()=>liveSnapshot(stripe,customer,stripeConfig),null);
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
      case 'invoice.payment_action_required':
      case 'invoice.marked_uncollectible': {
        const invoice=event.data.object;
        const id=invoiceSubscription(invoice);
        if (!id) {
          if (invoice.billing_reason === 'subscription_create' || invoice.billing_reason === 'subscription_cycle') throw new Error('invoice_subscription_unresolved');
          break;
        }
        const sub=await stripe.subscriptions.retrieve(id);
        if (!sub.metadata.clerkUserId && !sub.items.data.some(i=>offerForPrice(stripeConfig,i.price.id)?.mode==='subscription')) break;
        const customer=stripeId(invoice.customer);
        if (!customer || stripeId(sub.customer)!==customer) throw new Error('invoice_customer_mismatch');
        const paid=event.type==='invoice.paid'||event.type==='invoice.payment_succeeded';
        const award=paid ? paidAllowance(invoice,stripeConfig) : null;
        await syncSubscriptionBilling(customer,()=>liveSnapshot(stripe,customer,stripeConfig),award);
        break;
      }
    }
    return NextResponse.json({received:true});
  } catch(e) {
    // Unresolved app payments must be visible for replay; never ACK and discard them.
    logger.error('stripe_billing_event_requires_attention',{event_id:event.id,event_type:event.type,error:e});
    return NextResponse.json({error:'Billing event not settled',eventId:event.id},{status:503});
  }
}
