'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { aud, purchasablePacks, type Pack } from '@/lib/billing-catalog';
import { hasUsableClerkPublishableKey } from '@/lib/clerk-public-config';

export function PricingTable({ showCreditPacks = true }: { showCreditPacks?: boolean }) {
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
  async function buy(offer: Pack) {
    if (!signedIn) { window.location.assign('/sign-in?redirect_url=%2Fpricing'); return; }
    setPending(offer.key); setMessage('');
    try {
      const response = await fetch('/api/billing/create-checkout-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: offer.sku }),
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
    {showCreditPacks && <section><h2 className="mb-3 text-xl font-semibold">One-time credit packs</h2>
      <div className="grid gap-3 sm:grid-cols-3">{purchasablePacks.map(offer =>
        <article key={offer.key} className="rounded-xl border border-gray-300 p-4">
          <h3 className="font-semibold">{offer.name}</h3>
          <p>{aud(offer.cents)} once · {offer.credits} credits</p>
          <button disabled={!!pending} onClick={() => buy(offer)} className="mt-3 rounded-lg bg-black px-5 py-2 text-white disabled:opacity-60">
            {pending === offer.key ? 'Opening checkout…' : 'Buy pack'}
          </button>
        </article>)}</div></section>}
    <p>Each pack is a single payment with no automatic renewal. Credits are added to your account after payment. Existing subscribers can manage billing or cancel in <Link className="underline" href="/billing">billing</Link>.</p>
    <p>Your garments stay in this session. Download results you want to keep; they are recoverable in your account for 24 hours.</p>
    {message && <p role="alert">{message}</p>}
  </section>;
}
