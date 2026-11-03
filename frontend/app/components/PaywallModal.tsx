'use client';
import { NEW_PURCHASES_ENABLED, PURCHASE_PAUSE_NOTICE } from '@/lib/purchase-availability';
import Link from 'next/link';
import { aud, offers } from '@/lib/billing-catalog';

interface Props {
  isOpen: boolean; onClose: () => void; creditsAvailable: number;
  plan: 'free' | 'standard' | 'pro'; onTrial?: boolean;
}
export function PaywallModal({isOpen, onClose, creditsAvailable}: Props) {
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="credits-title" className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 text-black">
      <div className="flex justify-between"><h2 className="text-xl font-semibold" id="credits-title">Try-on credits</h2><button aria-label="Close" onClick={onClose}>Close</button></div>
      {NEW_PURCHASES_ENABLED ? <>
      <p>You have {creditsAvailable} credits available. Each successful standard look uses 1 credit.</p>
      {offers.filter(o => o.mode === 'subscription').map(o => <p key={o.key}><strong>{o.name}</strong> — {o.credits} credits for {aud(o.cents)} per month.</p>)}
      <p>Choose a monthly subscription or a one-time pack. Manage or cancel a subscription in billing.</p>
      <div className="flex gap-4"><Link href="/pricing" className="underline">See prices</Link><Link href="/billing" className="underline">Manage billing</Link></div>
      </> : <><p>{PURCHASE_PAUSE_NOTICE}</p><Link href="/billing" className="underline">Manage billing or cancel</Link></>}
    </section></div>;
}
