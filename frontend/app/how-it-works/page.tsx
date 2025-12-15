import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Shirt, Upload, Sparkles, ShoppingBag, ArrowLeft } from 'lucide-react';

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

        <h1 className="text-4xl font-bold mb-4">How It Works</h1>
        <p className="text-lg text-gray-600 mb-12">
          Upload yourself once, add up to five wardrobe pieces, generate a realistic try-on, and shop similar looks without leaving the flow.
        </p>

        <div className="space-y-12">
          {/* Step 1 */}
          <div className="flex gap-6">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center text-xl font-bold">
                1
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <Upload className="text-blue-500" size={24} />
                <h2 className="text-2xl font-bold">Sign In & Upload Yourself</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Create or sign in to your account, then upload a clear full-body photo. The first photo you upload becomes your main reference.
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 ml-4">
                <li>Use a full-body photo with your face visible</li>
                <li>Bright, even lighting works best</li>
                <li>Plain backgrounds avoid artifacts</li>
                <li>Upload multiple references if you want options</li>
              </ul>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-6">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center text-xl font-bold">
                2
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <Shirt className="text-green-500" size={24} />
                <h2 className="text-2xl font-bold">Upload Wardrobe Items</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Add up to five items per look. Drag to reorder, replace any item, and use bulk upload for faster processing.
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 ml-4">
                <li>AI auto-tags category, color, style, brand, and fit hints</li>
                <li>First clothing item is treated as the primary piece</li>
                <li>Wearing style options appear when available (e.g., tuck vs. untuck)</li>
              </ul>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-6">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center text-xl font-bold">
                3
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <Sparkles className="text-yellow-500" size={24} />
                <h2 className="text-2xl font-bold">Generate Your Look</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Hit the try-on button to start the pipeline. We wake the service, apply wearing rules, and render a photorealistic result—usually in a couple of minutes.
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 ml-4">
                <li>AI matches each item to your body shape and pose</li>
                <li>Progress loader keeps you updated during generation</li>
                <li>Errors are surfaced early so you can retry fast</li>
              </ul>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-6">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center text-xl font-bold">
                4
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <ShoppingBag className="text-purple-500" size={24} />
                <h2 className="text-2xl font-bold">Shop & Save the Look</h2>
              </div>
              <p className="text-gray-600 mb-4">
                After your try-on renders, browse similar products and keep what you like.
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 ml-4">
                <li>Shop comparable items from multiple retailers</li>
                <li>Download or share the try-on image instantly</li>
                <li>Save the outfit to My Outfits and re-run it later without re-uploading</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Tips Section */}
        <div className="mt-16 p-6 bg-blue-50 rounded-xl border border-blue-200">
          <h3 className="text-xl font-bold mb-4">Pro Tips</h3>
          <ul className="space-y-2 text-gray-700">
            <li>• <strong>Main references:</strong> Keep your best self photo first; drag to reorder anytime.</li>
            <li>• <strong>Wardrobe slots:</strong> Use up to 5 items per look—great for full outfits.</li>
            <li>• <strong>Reuse outfits:</strong> Saved looks stay linked to your wardrobe so you can rerun them quickly.</li>
            <li>• <strong>Fast retries:</strong> If something looks off, replace a single item and try again.</li>
          </ul>
        </div>

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

