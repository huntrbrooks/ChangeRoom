import Image from 'next/image';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';

const DynamicPricingTable = nextDynamic(
  () => import('../components/PricingTable').then((m) => m.PricingTable),
  { ssr: false }
);

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pricing | IGetDressed.Online',
  description: 'Choose a subscription or credit pack for AI try-on and shopping.',
  openGraph: {
    title: 'Pricing | IGetDressed.Online',
    description: 'Pick your plan for virtual try-on and shopping tools.',
    url: 'https://igetdressed.online/pricing',
  },
};

function PricingPageContent() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-black">
      <header className="border-b border-[#8B5CF6]/20 sticky top-0 bg-[#FAF9F6]/95 backdrop-blur-md z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-[#8B5CF6] hover:text-[#8B5CF6]/80 transition-colors"
          >
            <ArrowLeft size={20} />
            <span>Back to Home</span>
          </Link>
          <div className="flex-1 flex justify-center">
            <div className="flex flex-col items-center">
              <Image
                src="/Logo.png"
                alt="IGetDressed.Online"
                width={240}
                height={48}
                priority
                className="h-8 md:h-10 w-auto object-contain"
              />
              <span className="sr-only">Pricing & Plans</span>
            </div>
          </div>
          <div className="w-20" aria-hidden />
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 md:py-12 max-w-4xl">
        <div className="text-center mb-8 space-y-3">
          <h1 className="text-3xl md:text-4xl font-semibold text-[#8B5CF6] tracking-tight">
            Pricing &amp; Plans
          </h1>
          <p className="text-base md:text-lg text-black/70">
            Pick a subscription or credit pack and checkout securely via Stripe.
          </p>
          <div className="pt-2 flex justify-center">
            <Link
              href="https://billing.stripe.com/p/login/6oU14n1e8drn28E9D9bMQ00"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-[#8B5CF6] px-5 py-2.5 text-white font-semibold hover:bg-[#7a4ee2] transition-colors"
            >
              Manage billing / login
            </Link>
          </div>
        </div>

        <div className="bg-white border border-[#8B5CF6]/30 rounded-2xl p-4 md:p-6 shadow-sm">
          <DynamicPricingTable showCreditPacks />
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return <PricingPageContent />;
}
