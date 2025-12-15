import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ArrowLeft, Sparkles, Zap, ShoppingBag, Download } from 'lucide-react';

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
        <p className="text-lg text-gray-600 mb-12">
          AI try-on that lets you upload yourself, build a small wardrobe, and shop the look from a single flow.
        </p>

        <div className="prose prose-lg max-w-none">
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
            <p className="text-gray-700 leading-relaxed">
              We&apos;re fixing the gap between inspiration and confidence to buy. IGetDressed.Online blends realistic AI try-on with shop-the-look results so you can see an outfit on yourself, save it, and buy similar pieces without leaving the flow.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">What You Can Do</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <Sparkles className="text-blue-500" size={24} />
                  <h3 className="text-xl font-bold">Photoreal Try-On</h3>
                </div>
                <p className="text-gray-600">
                  Upload yourself plus up to five clothing items per look. We keep your main reference photo first, enforce wearing rules, and generate realistic results you can download or share.
                </p>
              </div>
              <div className="p-6 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <Zap className="text-yellow-500" size={24} />
                  <h3 className="text-xl font-bold">Wardrobe Intelligence</h3>
                </div>
                <p className="text-gray-600">
                  Batch uploads run through AI analysis to tag color, style, category, and brand. You can reorder items, replace them, and reuse saved looks later.
                </p>
              </div>
              <div className="p-6 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <ShoppingBag className="text-purple-500" size={24} />
                  <h3 className="text-xl font-bold">Shop the Look</h3>
                </div>
                <p className="text-gray-600">
                  After each try-on we fetch similar products from trusted retailers so you can compare options without retyping what you see.
                </p>
              </div>
              <div className="p-6 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <Download className="text-green-600" size={24} />
                  <h3 className="text-xl font-bold">Save & Share</h3>
                </div>
                <p className="text-gray-600">
                  Every result can be downloaded, shared, and stored in My Outfits. Saved outfits can be reused to generate new looks or re-run shopping suggestions.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">How It Works Under the Hood</h2>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>
                - Clothing analysis via our batch preprocessing pipeline (Python/FastAPI) to extract category, color, style, brand, and recommended wearing styles.<br />
                - Try-on service pairs your reference photo with up to five wardrobe items, enforces wearing instructions, then renders a photorealistic result.<br />
                - Product search runs after try-on to find similar items you can shop immediately.<br />
                - Outfits and wardrobe items stay linked so you can re-run looks without re-uploading.
              </p>
              <p>
                Built with Next.js, React, TypeScript, Tailwind, Clerk for auth, Stripe for billing, and Google Gemini/OpenAI-powered pipelines for analysis and try-on.
              </p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Reliability & Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              Sign-in is required to upload and save outfits. We run a wake-up check on the try-on service, provide progress feedback while your look generates, and give you full control to download, share, or delete saved outfits.
            </p>
          </section>

          <section className="p-6 bg-blue-50 rounded-xl border border-blue-200">
            <h2 className="text-2xl font-bold mb-4">Get Started</h2>
            <p className="text-gray-700 mb-6">
              Upload your photo, drop in a few wardrobe pieces, and see the outfit on you with shop-the-look suggestions in one flow.
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

