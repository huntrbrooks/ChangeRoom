import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';

// Force dynamic rendering to avoid Clerk initialization issues during build
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'How It Works | IGetDressed.Online',
  description: 'See how to upload your photo, try on up to five items, and shop similar looks.',
  openGraph: {
    title: 'How It Works | IGetDressed.Online',
    description: 'Step-by-step guide to AI try-on, wardrobe uploads, and shop-the-look results.',
    url: 'https://igetdressed.online/how-it-works',
  },
};

export default function HowItWorks() {
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

        <h1 className="text-4xl font-bold mb-4">How to try on a look</h1>
        <p className="text-lg text-gray-600 mb-10">Start with a clear photo and up to five garments. The result illustrates styling; it cannot tell you which size fits.</p>
        <ol className="space-y-8 text-gray-700">
          <li><h2 className="font-bold text-xl">1. Sign in and choose your photo</h2><p>Upload a photo of yourself that you have permission to use. Use at least 400 × 400 pixels; full-body photos in even light work best. Keep each file under 10 MB. If your phone cannot select a HEIC photo, export a JPEG and choose it instead.</p></li>
          <li><h2 className="font-bold text-xl">2. Add garments for this session</h2><p>Upload clear garment photos. These selections stay in this browser tab. Remove a selected garment to make room for another.</p></li>
          <li><h2 className="font-bold text-xl">3. Generate the look</h2><p>Press Try it on to send the selected photos for AI processing. A verified account uses an available free trial first, then one credit per standard look. Trial images have a watermark. We restore your trial or credit if generation fails.</p></li>
          <li><h2 className="font-bold text-xl">4. Download or reopen your result</h2><p>Completed images are available under Your recent looks for 24 hours. Download the JPEG to keep it longer. If you close the page, sign in and refresh that list before starting again. Shopping suggestions, when available, link to retailers; prices and sizing are confirmed on the retailer’s site.</p></li>
        </ol>
        <p className="mt-8">Manage renewal or cancellation from <Link className="underline" href="/billing">Billing</Link>. See <Link className="underline" href="/privacy-policy">Privacy</Link> for photo handling.</p>

        {/* CTA */}
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-block bg-black text-white px-8 py-4 rounded-xl font-bold hover:bg-gray-900 transition-colors"
          >
            Try It Now
          </Link>
        </div>
      </div>
    </main>
  );
}
