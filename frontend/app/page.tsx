'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { UploadZone } from './components/UploadZone';
import { BulkUploadZone } from './components/BulkUploadZone';
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

  const handleBulkUpload = (files: File[], analyses: any[]) => {
    // Fill wardrobe slots with analyzed files
    const newItems = [...wardrobeItems];
    files.forEach((file, idx) => {
      if (idx < newItems.length) {
        newItems[idx] = file;
      }
    });
    setWardrobeItems(newItems);
    console.log('Bulk upload complete. Analyzed items:', analyses);
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

    // Suppress browser extension message channel errors
    const originalError = console.error;
    console.error = (...args: any[]) => {
      if (args[0]?.toString().includes('message channel closed')) {
        return; // Suppress message channel errors
      }
      originalError.apply(console, args);
    };

    try {
      // Get API URL from environment or default to localhost
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      console.log("Using API URL:", API_URL);
      
      // Wake up Render service first (health check)
      console.log("Waking up Render service...");
      try {
        const healthCheck = await axios.get(`${API_URL}/`, { timeout: 180000 }); // 3 minutes
        console.log("Service is awake:", healthCheck.data);
      } catch (wakeError: any) {
        console.warn("Health check failed (service may be waking up):", wakeError.message);
        // Continue anyway - service might still be waking up
      }

      // Step 1: Call Try-On API (sequential execution - must succeed before product search)
      let tryOnRes;
      try {
        const tryOnFormData = new FormData();
        tryOnFormData.append('user_image', userImage);
        tryOnFormData.append('clothing_image', activeItems[0]); // MVP: First item only for VTON
        
        // Use metadata if available (from analysis)
        // Transform to format expected by system prompt: background, style, framing, pose, camera, extras
        const firstItem = activeItems[0] as any;
        if (firstItem.metadata || firstItem.category || firstItem.detailed_description) {
          // Build metadata in the format expected by the system prompt
          const metadata: any = {};
          
          // Map analyzed metadata to system prompt format
          if (firstItem.metadata?.style) {
            metadata.style = firstItem.metadata.style; // e.g., "studio", "streetwear", "mirror selfie"
          }
          
          // Default to full body framing for fashion try-on
          metadata.framing = "full_body"; // or "three_quarter", "waist_up"
          
          // Include any additional metadata as "extras"
          const extras: any = {};
          if (firstItem.metadata?.color) extras.color = firstItem.metadata.color;
          if (firstItem.metadata?.material) extras.material = firstItem.metadata.material;
          if (firstItem.metadata?.fit) extras.fit = firstItem.metadata.fit;
          if (firstItem.detailed_description) extras.detailed_description = firstItem.detailed_description;
          
          if (Object.keys(extras).length > 0) {
            metadata.extras = extras;
          }
          
          tryOnFormData.append('garment_metadata', JSON.stringify(metadata));
          tryOnFormData.append('category', firstItem.category || 'upper_body');
          console.log("Using analyzed metadata for try-on:", metadata);
        } else {
          tryOnFormData.append('category', 'upper_body'); // Default
        }

        console.log("Starting try-on generation...");
        tryOnRes = await axios.post(`${API_URL}/api/try-on`, tryOnFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 600000, // 10 minutes for Render wake-up + VTON generation
        });

        if (tryOnRes.data.image_url) {
          setGeneratedImage(tryOnRes.data.image_url);
          console.log("Try-on completed successfully");
        }
      } catch (tryOnError: any) {
        console.error("Error in try-on:", tryOnError);
        const errorMessage = tryOnError.code === 'ECONNABORTED' || tryOnError.message?.includes('timeout')
          ? `Try-on request timed out after 10 minutes. This usually means the Replicate service is taking longer than expected. Please try again.`
          : tryOnError.response?.data?.detail || tryOnError.message || "Failed to generate try-on image. Please try again.";
        setError(`Try-on failed: ${errorMessage}`);
        setIsGenerating(false);
        console.error = originalError; // Restore original error handler
        return; // Stop execution if try-on fails
      }

      // Step 2: Call Identify & Shop API (only if try-on succeeded)
      try {
        console.log("Starting product identification...");
        const identifyFormData = new FormData();
        identifyFormData.append('clothing_image', activeItems[0]);
        
        const analysisRes = await axios.post(`${API_URL}/api/identify-products`, identifyFormData, {
           headers: { 'Content-Type': 'multipart/form-data' },
           timeout: 600000, // 10 minutes for Render wake-up + Gemini processing
        });
        
        if (analysisRes.data.search_query) {
          console.log("Product identification successful, searching for products...");
          const shopFormData = new FormData();
          shopFormData.append('query', analysisRes.data.search_query);
          
          const shopRes = await axios.post(`${API_URL}/api/shop`, shopFormData, {
             headers: { 'Content-Type': 'multipart/form-data' },
             timeout: 60000, // 1 minute for product search
          });
          
          if (shopRes.data.results) {
            setProducts(shopRes.data.results);
            console.log("Product search completed successfully");
          }
        } else {
          console.warn("No search query returned from product identification");
        }
      } catch (searchError: any) {
        // Product search failure is non-critical - show try-on result anyway
        console.warn("Error in product search (non-critical):", searchError);
        // Don't set error state - user can still see the try-on result
        // Optionally show a non-blocking warning
        if (searchError.code === 'ECONNABORTED' || searchError.message?.includes('timeout')) {
          console.warn("Product search timed out, but try-on was successful");
        }
      }

    } catch (err: any) {
      console.error("Unexpected error:", err);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      if (err.response?.status === 0 || err.message?.includes('Network Error') || err.code === 'ERR_NETWORK') {
        setError(`Cannot connect to backend at ${API_URL}. Check: 1) Is the service awake? 2) Is NEXT_PUBLIC_API_URL set in Vercel? 3) Try again in 30-60 seconds.`);
      } else if (err.response?.status === 404) {
        setError(`Backend endpoint not found. Check if API URL is correct: ${API_URL}`);
      } else {
        setError(err.response?.data?.detail || err.message || "An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsGenerating(false);
      console.error = originalError; // Restore original error handler
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
              </h2>
              <BulkUploadZone onFilesUploaded={handleBulkUpload} />
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
