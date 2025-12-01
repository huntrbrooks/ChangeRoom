import React from 'react';
import Link from 'next/link';
import { Shirt, Upload, Sparkles, ShoppingBag, ArrowLeft } from 'lucide-react';

// Force dynamic rendering to avoid Clerk initialization issues during build
export const dynamic = 'force-dynamic';

export default function HowItWorks() {
  return (
    <main className="min-h-screen bg-white text-black font-sans">
      {/* Header */}
      <header className="border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-md z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center rounded-full">
              <Shirt size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Change Room</h1>
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
          Experience the future of online shopping with AI-powered virtual try-on technology.
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
                <h2 className="text-2xl font-bold">Upload Your Photo</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Start by uploading a clear full-body photo of yourself. For best results:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 ml-4">
                <li>Use a full-body photo</li>
                <li>Ensure good lighting</li>
                <li>Plain background works best</li>
                <li>Stand straight with arms at your sides</li>
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
                <h2 className="text-2xl font-bold">Choose Your Wardrobe</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Upload 1-5 clothing items from your wardrobe. Our AI will automatically:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 ml-4">
                <li>Analyze and categorize each item</li>
                <li>Detect style, color, and fit</li>
                <li>Prepare items for virtual try-on</li>
              </ul>
              <p className="text-sm text-blue-600 mt-4 font-medium">
                💡 Try on up to 5 items at once for a complete outfit!
              </p>
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
                Click &quot;Try On &amp; Shop Look&quot; and our AI will:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 ml-4">
                <li>Create a realistic virtual try-on image</li>
                <li>Match the clothing to your body shape and pose</li>
                <li>Generate a natural-looking result</li>
              </ul>
              <p className="text-sm text-gray-500 mt-4">
                This process typically takes 1-3 minutes. You can cancel at any time.
              </p>
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
                <h2 className="text-2xl font-bold">Shop Similar Items</h2>
              </div>
              <p className="text-gray-600 mb-4">
                After seeing your try-on result, browse similar products:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 ml-4">
                <li>Find similar styles from various retailers</li>
                <li>Compare prices and options</li>
                <li>Purchase directly from trusted sellers</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Tips Section */}
        <div className="mt-16 p-6 bg-blue-50 rounded-xl border border-blue-200">
          <h3 className="text-xl font-bold mb-4">Pro Tips</h3>
          <ul className="space-y-2 text-gray-700">
            <li>• <strong>Download your results:</strong> Save your favorite try-on images to compare different looks</li>
            <li>• <strong>Share with friends:</strong> Get feedback before making a purchase</li>
            <li>• <strong>Try multiple items:</strong> Upload different clothing pieces to find your perfect style</li>
            <li>• <strong>Be patient:</strong> High-quality results take a moment to generate</li>
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

