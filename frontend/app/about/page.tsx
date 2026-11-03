import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';

// Force dynamic rendering to avoid Clerk initialization issues during build
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'About | IGetDressed.Online',
  description: 'Learn how IGetDressed.Online powers AI try-on, wardrobe uploads, and shop-the-look results.',
  openGraph: {
    title: 'About | IGetDressed.Online',
    description: 'Discover the mission behind IGetDressed.Online, AI try-on, and shop-the-look.',
    url: 'https://igetdressed.online/about',
  },
};

export default function About() {
  return (
    <main className="min-h-screen bg-[#FAF9F6] text-black font-sans">
      {/* Header */}
      <header className="border-b border-gray-100 sticky top-0 bg-[#FAF9F6]/95 backdrop-blur-md z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Image
              src="/main logo Black.png"
              alt="IGetDressed.Online logo"
              width={40}
              height={40}
              priority
            />
            <h1 className="text-xl font-bold tracking-tight">IGetDressed.Online</h1>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <Link href="/how-it-works" className="hover:text-black transition-colors">How it Works</Link>
            <Link href="/about" className="hover:text-black transition-colors">About</Link>
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-gray-600 hover:text-black mb-8 transition-colors"
        >
          <ArrowLeft size={18} />
          Back to Home
        </Link>

        <h1 className="text-4xl font-bold mb-4">About IGetDressed.Online</h1>
        <p className="text-lg text-gray-600 mb-8">See how garments might look together before you decide what to wear or buy.</p>
        <div className="space-y-8">
          <section><h2 className="text-2xl font-bold mb-3">A visual fitting room</h2>
            <p>Choose your photo and up to five garments for the current session. When you generate a look, AI uses those images to make a styling preview. It can change details and cannot measure fit, predict size or guarantee how an item will look in person.</p>
          </section>
          <section><h2 className="text-2xl font-bold mb-3">Your photos and looks</h2>
            <p>Choosing files keeps them in your browser until you generate. Completed looks are private to your account and can be reopened for 24 hours. Download the image to keep it. Garments do not form a permanent online wardrobe. Read our <Link className="underline" href="/privacy-policy">privacy policy</Link> for details.</p>
          </section>
          <section><h2 className="text-2xl font-bold mb-3">Credits and shopping</h2>
            <p>A standard generation uses one credit after any available trial; failed generation restores the reserved credit or trial. Shopping matches are optional and depend on retailer availability. See <Link className="underline" href="/pricing">current pricing</Link> or visit <Link className="underline" href="/billing">billing</Link> to manage a subscription.</p>
          </section>
          <section className="p-6 bg-blue-50 rounded-xl border border-blue-200">
            <h2 className="text-2xl font-bold mb-4">Get Started</h2>
            <p className="text-gray-700 mb-6">
              Try the studio with your photos or the sample garments.
            </p>
            <Link
              href="/"
              className="inline-block bg-black text-white px-8 py-4 rounded-xl font-bold hover:bg-gray-900 transition-colors"
            >
              Start Trying On
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
