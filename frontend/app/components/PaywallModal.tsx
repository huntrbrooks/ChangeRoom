'use client';
import Link from 'next/link';

interface Props {
  isOpen: boolean; onClose: () => void; creditsAvailable: number;
  plan: 'free' | 'standard' | 'pro'; onTrial?: boolean;
}
export function PaywallModal({isOpen, onClose, creditsAvailable}: Props) {
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="credits-title" className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 text-black">
      <div className="flex justify-between"><h2 className="text-xl font-semibold" id="credits-title">Try-on credits</h2><button aria-label="Close" onClick={onClose}>Close</button></div>
      <p>You have {creditsAvailable} credits available. Each successful standard look uses 1 credit.</p>
      <p>Credit packs are single purchases with no automatic renewal.</p>
      <div className="flex flex-wrap gap-4"><Link href="/pricing" className="underline">Check pack availability and prices</Link><Link href="/billing" className="underline">Manage billing or cancel</Link></div>
    </section></div>;
}
