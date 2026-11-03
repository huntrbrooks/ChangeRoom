import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripeConfig } from '@/lib/config';
import { offerForPrice, packCredits } from '@/lib/billing-catalog';
import { invoiceSubscription, liveSnapshot, paidAllowance, stripeId } from '@/lib/subscription-lifecycle';
import { logger } from '@/lib/logger';
import { grantCredits, getUserBillingByStripeCustomer, syncSubscriptionBilling } from '@/lib/db-access';

async function pack(stripe: Stripe, sessionId: string) {
  const s = await stripe.checkout.sessions.retrieve(sessionId,{expand:['line_items.data.price']});
  if (s.mode !== 'payment' || s.payment_status !== 'paid') return;
  const line = s.line_items?.data[0];
  const price = line?.price?.id;
  const amount = packCredits(stripeConfig, price);
  if (!amount) {
    if (s.metadata?.clerkUserId) throw new Error('app_pack_price_unmapped');
    return; // unrelated merchant products
  }
  const owner = await getUserBillingByStripeCustomer(stripeId(s.customer));
  if (!owner || (s.metadata?.clerkUserId && owner.user_id !== s.metadata.clerkUserId) ||
      (s.client_reference_id && owner.user_id !== s.client_reference_id))
    throw new Error('paid_pack_owner_needs_reconciliation');
  const payment = stripeId(s.payment_intent);
  if (!payment || line?.quantity !== 1 || s.line_items?.data.length !== 1 || s.line_items.has_more)
    throw new Error('paid_pack_line_needs_reconciliation');
  await grantCredits(owner.user_id,amount,{source:'stripe',reason:'credit_pack_purchase',
    price_id:price,payment_intent_id:payment,session_id:s.id},payment);
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe(stripeConfig.secretKey,{apiVersion:'2026-02-25.clover' as Stripe.LatestApiVersion,timeout:8000,maxNetworkRetries:1});
  const signature=req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({error:'Missing signature'},{status:400});
  let event: Stripe.Event;
  try { event=stripe.webhooks.constructEvent(await req.text(),signature,stripeConfig.webhookSecret); }
  catch { return NextResponse.json({error:'Invalid signature'},{status:400}); }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const s=event.data.object;
        if (s.mode === 'payment') await pack(stripe,s.id);
        // Subscriptions are fulfilled only by a settled subscription invoice.
        break;
      }
      case 'payment_intent.succeeded': {
        const pi=event.data.object;
        // This fallback is for application-labelled packs, including delayed methods.
        // Subscription/non-Checkout PIs do not imply an allowance.
        if (!packCredits(stripeConfig, pi.metadata.priceId)) break;
        const matches=await stripe.checkout.sessions.list({payment_intent:pi.id,limit:1});
        if (!matches.data.length) throw new Error('paid_pack_session_unresolved');
        await pack(stripe,matches.data[0].id);
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
