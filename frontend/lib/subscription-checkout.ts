import type Stripe from 'stripe';
import type { CheckoutAttempt } from './db-access';
import { terminal } from './subscription-lifecycle';

type Repository = {
 reserveCheckout: (user: string, price: string)=>Promise<CheckoutAttempt>;
 recordCheckout: (user: string, attempt: string, session: string)=>Promise<void>;
 retireCheckout: (user: string, attempt: string)=>Promise<void>;
}
export class CheckoutConflict extends Error {
  constructor(message: string, public manageBilling = false) { super(message); }
}
export async function subscriptionCheckout(
  stripe: Stripe, repo: Repository, user:string, customer:string, requestedPrice:string, appUrl:string
): Promise<Stripe.Checkout.Session> {
  // Check Stripe too: a completed checkout's webhook may still be in flight.
  for await (const sub of stripe.subscriptions.list({customer, status:'all', limit:100})) {
    if (!terminal(sub.status)) throw new CheckoutConflict('A subscription is already associated with this account. Manage it in billing.', true);
  }
  for (let tries=0; tries<3; tries++) {
    const attempt = await repo.reserveCheckout(user, requestedPrice);
    let session: Stripe.Checkout.Session | undefined;
    if (attempt.session_id) {
      session = await stripe.checkout.sessions.retrieve(attempt.session_id);
    } else {
      // Covers a crash after Stripe accepted creation, and open sessions made before cutover.
      for await (const open of stripe.checkout.sessions.list({customer, status:'open', limit:100})) {
        if (open.mode !== 'subscription') continue;
        if (open.metadata?.attemptId !== attempt.attempt_id)
          throw new CheckoutConflict('An earlier subscription checkout is open. Complete it or wait for it to expire.');
        session = open; break;
      }
      if (!session && Date.now()-new Date(attempt.created_at).getTime() > 23*3600_000) {
        // Outside the safe idempotency retry window. Inspect the original session, even if
        // completed, before rotating. Never blindly recreate an old request.
        for await (const previous of stripe.checkout.sessions.list({customer,
          created:{gte:Math.floor(new Date(attempt.created_at).getTime()/1000)-60}, limit:100})) {
          if (previous.metadata?.attemptId === attempt.attempt_id) {session=previous; break;}
        }
        if (!session) {await repo.retireCheckout(user,attempt.attempt_id); continue;}
      }
      if (!session) {
        const metadata = {clerkUserId:user,priceId:attempt.price_id,attemptId:attempt.attempt_id,mode:'subscription'};
        session = await stripe.checkout.sessions.create({
          customer, mode:'subscription', client_reference_id:user, metadata, subscription_data:{metadata},
          line_items:[{price:attempt.price_id,quantity:1}],
          success_url:appUrl+'/billing?session_id={CHECKOUT_SESSION_ID}', cancel_url:appUrl+'/pricing',
        },{idempotencyKey:'changeroom-sub:'+attempt.attempt_id});
      }
      await repo.recordCheckout(user,attempt.attempt_id,session.id);
    }
    if (session.status === 'complete') {
      const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (!subId || !terminal((await stripe.subscriptions.retrieve(subId)).status))
        throw new CheckoutConflict('Your subscription checkout has already completed. Manage it in billing.', true);
    } else if (session.status === 'open') {
      if (attempt.price_id === requestedPrice && session.url) return session;
      // A different plan was selected: Stripe must confirm expiry before replacement.
      await stripe.checkout.sessions.expire(session.id);
    } else if (session.status !== 'expired') {
      throw new Error('unexpected_checkout_status');
    }
    await repo.retireCheckout(user,attempt.attempt_id);
  }
  throw new CheckoutConflict('Checkout changed in another tab. Please try again.');
}
