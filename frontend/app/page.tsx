'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { UploadZone } from './components/UploadZone';
import { WardrobeSelector } from './components/WardrobeSelector';
import { VirtualMirror } from './components/VirtualMirror';
import { ProductCard } from './components/ProductCard';
import { Shirt, Sparkles, Search } from 'lucide-react';

// Define types locally for now
interface Product {
  title: string;
  price: string;
  link: string;
  thumbnail: string;
  source: string;
}

export default function Home() {
  const [userImage, setUserImage] = useState<File | null>(null);
  const [wardrobeItems, setWardrobeItems] = useState<(File | null)[]>([null, null, null, null, null]);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleWardrobeItemSelect = (index: number, file: File) => {
    const newItems = [...wardrobeItems];
    newItems[index] = file;
    setWardrobeItems(newItems);
  };

  const handleGenerate = async () => {
    if (!userImage) {
      setError("Please upload a photo of yourself.");
      return;
    }
    
    const activeItems = wardrobeItems.filter(item => item !== null) as File[];
    if (activeItems.length === 0) {
      setError("Please upload at least one clothing item.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setProducts([]);

    try {
      // Get API URL from environment or default to localhost
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // 1. Call Try-On API (using first item for MVP VTON)
      const tryOnFormData = new FormData();
      tryOnFormData.append('user_image', userImage);
      tryOnFormData.append('clothing_image', activeItems[0]); // MVP: First item only for VTON
      tryOnFormData.append('category', 'upper_body'); // Default

      const tryOnPromise = axios.post(`${API_URL}/api/try-on`, tryOnFormData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // 2. Call Identify & Shop API for all items
      // We'll do this for the first item for now to demonstrate flow
      const searchPromise = (async () => {
        const identifyFormData = new FormData();
        identifyFormData.append('clothing_image', activeItems[0]);
        
        const analysisRes = await axios.post(`${API_URL}/api/identify-products`, identifyFormData, {
           headers: { 'Content-Type': 'multipart/form-data' },
        });
        
        if (analysisRes.data.search_query) {
          const shopFormData = new FormData();
          shopFormData.append('query', analysisRes.data.search_query);
          
          const shopRes = await axios.post(`${API_URL}/api/shop`, shopFormData, {
             headers: { 'Content-Type': 'multipart/form-data' },
          });
          
          return shopRes.data.results;
        }
        return [];
      })();

      const [tryOnRes, searchResults] = await Promise.all([tryOnPromise, searchPromise]);

      if (tryOnRes.data.image_url) {
        setGeneratedImage(tryOnRes.data.image_url);
      }
      
      if (searchResults) {
        setProducts(searchResults);
      }

    } catch (err: any) {
      console.error("Error generating:", err);
      setError(err.response?.data?.detail || "An error occurred during generation. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="min-h-screen bg-white text-black font-sans">
      {/* Header */}
      <header className="border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center rounded-full">
              <Shirt size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Change Room</h1>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <a href="#" className="hover:text-black">How it Works</a>
            <a href="#" className="hover:text-black">Pricing</a>
            <a href="#" className="hover:text-black">About</a>
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 border border-red-100">
            {error}
          </div>
        )}

        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* Left Column: Inputs */}
          <div className="lg:col-span-7 space-y-8">
            
            <section>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="bg-black text-white w-6 h-6 flex items-center justify-center rounded-full text-xs">1</span>
                Upload Yourself
              </h2>
              <UploadZone 
                label="Your Photo" 
                selectedFile={userImage} 
                onFileSelect={setUserImage} 
              />
            </section>

            <section>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="bg-black text-white w-6 h-6 flex items-center justify-center rounded-full text-xs">2</span>
                Choose Wardrobe
                <span className="text-xs font-normal text-gray-500 ml-2">(Upload up to 5 items)</span>
              </h2>
              <WardrobeSelector 
                items={wardrobeItems} 
                onItemSelect={handleWardrobeItemSelect} 
              />
            </section>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`
                w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all
                ${isGenerating 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-black text-white hover:bg-gray-900 hover:shadow-lg active:scale-[0.99] shadow-blue-500/20'
                }
                shadow-[0_0_15px_rgba(0,0,255,0.15)] // Neon hint
              `}
            >
              {isGenerating ? (
                <>Thinking...</>
              ) : (
                <>
                  <Sparkles size={20} className="text-yellow-300" />
                  Try On & Shop Look
                </>
              )}
            </button>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-5 space-y-8">
            
            <section>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="bg-black text-white w-6 h-6 flex items-center justify-center rounded-full text-xs">3</span>
                Virtual Mirror
              </h2>
              <VirtualMirror imageUrl={generatedImage} isLoading={isGenerating} />
            </section>

            {products.length > 0 && (
              <section>
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Search size={20} />
                  Shop the Look
                </h2>
                <div className="space-y-4">
                  {products.map((product, idx) => (
                    <ProductCard key={idx} product={product} />
                  ))}
                </div>
              </section>
            )}

          </div>
        </div>
      </div>
    </main>
  );
}
