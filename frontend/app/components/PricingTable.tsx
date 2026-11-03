'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { aud, offers, type Offer } from '@/lib/billing-catalog';
import { stripePublicConfig } from '@/lib/config';
import { hasUsableClerkPublishableKey } from '@/lib/clerk-public-config';

export function PricingTable({ showCreditPacks = false }: { showCreditPacks?: boolean }) {
  return hasUsableClerkPublishableKey()
    ? <SignedPricing showCreditPacks={showCreditPacks} />
    : <Cards showCreditPacks={showCreditPacks} signedIn={false} />;
}
function SignedPricing({showCreditPacks}: {showCreditPacks: boolean}) {
  const {isSignedIn} = useUser();
  return <Cards showCreditPacks={showCreditPacks} signedIn={Boolean(isSignedIn)} />;
}
function Cards({showCreditPacks, signedIn}: {showCreditPacks: boolean; signedIn: boolean}) {
  const [pending, setPending] = useState('');
  const [message, setMessage] = useState('');
  async function buy(offer: Offer) {
    if (!signedIn) { window.location.assign('/sign-in?redirect_url=%2Fpricing'); return; }
    setPending(offer.key); setMessage('');
    try {
      const response = await fetch('/api/billing/create-checkout-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: stripePublicConfig[offer.key], mode: offer.mode }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) {
        if (result.manageBilling) { window.location.assign('/billing'); return; }
        throw new Error(result.message || result.error || 'Checkout is unavailable. Please try again.');
      }
      window.location.assign(result.url);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to start checkout.'); }
    finally { setPending(''); }
  }
  return <section className="space-y-6">
    <p>New verified accounts get one free standard try-on. After that, each successful look costs 1 credit. No card is needed for the free try-on.</p>
    {(['subscription', ...(showCreditPacks ? ['payment'] : [])] as const).map(mode =>
      <section key={mode}><h2 className="mb-3 text-xl font-semibold">{mode === 'subscription' ? 'Monthly subscriptions' : 'One-time credit packs'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">{offers.filter(o => o.mode === mode).map(offer =>
          <article key={offer.key} className="rounded-xl border border-gray-300 p-4">
            <h3 className="font-semibold">{offer.name}</h3>
            <p>{aud(offer.cents)} {mode === 'subscription' ? 'per month' : 'once'} · {offer.credits} credits</p>
            <button disabled={!!pending} onClick={() => buy(offer)} className="mt-3 rounded-lg bg-black px-5 py-2 text-white disabled:opacity-60">
              {pending === offer.key ? 'Opening checkout…' : mode === 'subscription' ? 'Subscribe' : 'Buy pack'}
            </button>
          </article>)}</div>
      </section>)}
    <p>Monthly plans renew automatically until cancelled. Credits are added after payment; unused purchased credits carry over. Cancel or update your card in <Link className="underline" href="/billing">billing</Link>.</p>
    <p>Your garments stay in this session. Download results you want to keep; they are recoverable in your account for 24 hours.</p>
    {message && <p role="alert">{message}</p>}
  </section>;
}
