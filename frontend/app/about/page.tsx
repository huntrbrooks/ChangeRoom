import React from 'react';
import Link from 'next/link';
import { Shirt, ArrowLeft, Sparkles, Zap, Shield } from 'lucide-react';

export default function About() {
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

        <h1 className="text-4xl font-bold mb-4">About Change Room</h1>
        <p className="text-lg text-gray-600 mb-12">
          Revolutionizing online fashion shopping with cutting-edge AI technology.
        </p>

        <div className="prose prose-lg max-w-none">
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
            <p className="text-gray-700 leading-relaxed">
              Change Room was created to solve a fundamental problem in online shopping: you can't try on clothes before buying them. 
              We use advanced AI and machine learning to create realistic virtual try-on experiences, helping you make confident 
              fashion choices from the comfort of your home.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">How It Works</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Our platform combines several cutting-edge technologies:
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <Sparkles className="text-blue-500" size={24} />
                  <h3 className="text-xl font-bold">AI-Powered Analysis</h3>
                </div>
                <p className="text-gray-600">
                  Our AI automatically analyzes your clothing items, detecting style, color, material, and fit to ensure 
                  the most accurate virtual try-on experience.
                </p>
              </div>
              <div className="p-6 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <Zap className="text-yellow-500" size={24} />
                  <h3 className="text-xl font-bold">Virtual Try-On</h3>
                </div>
                <p className="text-gray-600">
                  Advanced computer vision and deep learning models create realistic try-on images that match clothing 
                  to your body shape and pose.
                </p>
              </div>
              <div className="p-6 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <Shield className="text-green-500" size={24} />
                  <h3 className="text-xl font-bold">Privacy First</h3>
                </div>
                <p className="text-gray-600">
                  Your photos and data are processed securely. We don't store your images permanently and respect your privacy.
                </p>
              </div>
              <div className="p-6 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <Shirt className="text-purple-500" size={24} />
                  <h3 className="text-xl font-bold">Smart Shopping</h3>
                </div>
                <p className="text-gray-600">
                  Our product search engine finds similar items from trusted retailers, helping you discover new styles 
                  and compare prices.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Technology Stack</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Change Room is built with modern, reliable technologies:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li><strong>Frontend:</strong> Next.js, React, TypeScript, Tailwind CSS</li>
              <li><strong>Backend:</strong> FastAPI, Python</li>
              <li><strong>AI/ML:</strong> Google Gemini, Replicate, Computer Vision models</li>
              <li><strong>Infrastructure:</strong> Cloud-based, scalable architecture</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Future Features</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We're constantly improving. Coming soon:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>Multi-item try-on (combine multiple clothing pieces)</li>
              <li>Style recommendations based on your preferences</li>
              <li>Virtual wardrobe management</li>
              <li>Social sharing and community features</li>
              <li>Mobile app for iOS and Android</li>
            </ul>
          </section>

          <section className="p-6 bg-blue-50 rounded-xl border border-blue-200">
            <h2 className="text-2xl font-bold mb-4">Get Started</h2>
            <p className="text-gray-700 mb-6">
              Ready to revolutionize your online shopping experience? Try Change Room today!
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

