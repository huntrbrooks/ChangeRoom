'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { UploadZone } from './components/UploadZone';
import { BulkUploadZone } from './components/BulkUploadZone';
import { VirtualMirror } from './components/VirtualMirror';
import { ProductCard } from './components/ProductCard';
import { Shirt, Sparkles, Search, Loader2 } from 'lucide-react';

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
  const [abortController, setAbortController] = useState<AbortController | null>(null);

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

  const handleItemRemove = (index: number) => {
    const newItems = [...wardrobeItems];
    newItems[index] = null;
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

    // Create abort controller for cancellation
    const controller = new AbortController();
    setAbortController(controller);

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
        
        // Use metadata if available (from analysis)
        // Transform to format expected by system prompt: background, style, framing, pose, camera, extras
        const firstItem = activeItems[0] as any;
        
        // Use saved file URL if available, otherwise upload the file
        if (firstItem?.file_url) {
          // Use saved file from server
          tryOnFormData.append('clothing_file_url', firstItem.file_url);
          console.log("Using saved file URL for try-on:", firstItem.file_url);
        } else {
          // Upload file directly
          tryOnFormData.append('clothing_image', activeItems[0]); // MVP: First item only for VTON
        }
        
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
          signal: controller.signal,
        });

        if (tryOnRes.data.image_url) {
          setGeneratedImage(tryOnRes.data.image_url);
          console.log("Try-on completed successfully");
        }
      } catch (tryOnError: any) {
        if (tryOnError.name === 'CanceledError' || tryOnError.code === 'ERR_CANCELED') {
          setError('Operation cancelled');
          setIsGenerating(false);
          console.error = originalError;
          return;
        }
        console.error("Error in try-on:", tryOnError);
        const errorMessage = tryOnError.code === 'ECONNABORTED' || tryOnError.message?.includes('timeout')
          ? `The try-on is taking longer than expected. This usually means our servers are busy. Please try again in a few moments.`
          : tryOnError.response?.data?.detail || tryOnError.message || "We couldn't generate your try-on. Please check your photos and try again.";
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
           signal: controller.signal,
        });
        
        if (analysisRes.data.search_query) {
          console.log("Product identification successful, searching for products...");
          const shopFormData = new FormData();
          shopFormData.append('query', analysisRes.data.search_query);
          
          const shopRes = await axios.post(`${API_URL}/api/shop`, shopFormData, {
             headers: { 'Content-Type': 'multipart/form-data' },
             timeout: 60000, // 1 minute for product search
             signal: controller.signal,
          });
          
          if (shopRes.data.results) {
            setProducts(shopRes.data.results);
            console.log("Product search completed successfully");
          }
        } else {
          console.warn("No search query returned from product identification");
        }
      } catch (searchError: any) {
        if (searchError.name === 'CanceledError' || searchError.code === 'ERR_CANCELED') {
          // Cancelled, don't show error
          return;
        }
        // Product search failure is non-critical - show try-on result anyway
        console.warn("Error in product search (non-critical):", searchError);
        // Show subtle notification for product search failure
        if (searchError.code === 'ECONNABORTED' || searchError.message?.includes('timeout')) {
          console.warn("Product search timed out, but try-on was successful");
        }
      }

    } catch (err: any) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        setError('Operation cancelled');
        setIsGenerating(false);
        console.error = originalError;
        return;
      }
      console.error("Unexpected error:", err);
      
      if (err.response?.status === 0 || err.message?.includes('Network Error') || err.code === 'ERR_NETWORK') {
        setError(`Unable to connect to our servers. Please check your internet connection and try again. If the problem persists, the service may be temporarily unavailable.`);
      } else if (err.response?.status === 404) {
        setError(`The requested service is not available. Please try again later.`);
      } else {
        setError(err.response?.data?.detail || err.message || "An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsGenerating(false);
      setAbortController(null);
      console.error = originalError; // Restore original error handler
    }
  };

  return (
    <main className="min-h-screen bg-white text-black font-sans">
      {/* Header */}
      <header className="border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-md z-50">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-black text-white flex items-center justify-center rounded-full">
              <Shirt size={18} className="sm:w-5 sm:h-5" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">Change Room</h1>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <Link href="/how-it-works" className="hover:text-black transition-colors">How it Works</Link>
            <Link href="/about" className="hover:text-black transition-colors">About</Link>
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
        
        {error && (
          <div className="bg-red-50 text-red-600 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 border border-red-100 text-sm sm:text-base">
            {error}
          </div>
        )}

        <div className="grid lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8">
          
          {/* Left Column: Inputs */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-6 md:space-y-8">
            
            <section>
              <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2">
                <span className="bg-black text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-xs">1</span>
                Upload Yourself
              </h2>
              <UploadZone 
                label="Your Photo" 
                selectedFile={userImage} 
                onFileSelect={setUserImage}
                onClear={() => setUserImage(null)}
              />
            </section>

            <section>
              <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2">
                <span className="bg-black text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-xs">2</span>
                Choose Wardrobe
              </h2>
              <BulkUploadZone 
                onFilesUploaded={handleBulkUpload}
                onItemRemove={handleItemRemove}
              />
              {wardrobeItems.filter(item => item !== null).length > 1 && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    💡 <strong>Note:</strong> Currently trying on the first item. Multi-item try-on coming soon!
                  </p>
                </div>
              )}
            </section>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`
                w-full py-3.5 sm:py-4 rounded-xl font-bold text-base sm:text-lg flex items-center justify-center gap-2 sm:gap-3 transition-all
                min-h-[48px] touch-manipulation
                ${isGenerating 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-black text-white hover:bg-gray-900 active:bg-gray-800 hover:shadow-lg active:scale-[0.98] shadow-blue-500/20'
                }
                shadow-[0_0_15px_rgba(0,0,255,0.15)]
              `}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={18} className="sm:w-5 sm:h-5 animate-spin" />
                  <span>Generating your look...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} className="sm:w-5 sm:h-5 text-yellow-300" />
                  <span>Try On & Shop Look</span>
                </>
              )}
            </button>
            {isGenerating && (
              <button
                onClick={() => abortController?.abort()}
                className="mt-2 text-sm text-gray-600 hover:text-gray-900 underline w-full text-center"
                aria-label="Cancel operation"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-5 space-y-4 sm:space-y-6 md:space-y-8">
            
            <section>
              <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2">
                <span className="bg-black text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-xs">3</span>
                Virtual Mirror
              </h2>
              <VirtualMirror imageUrl={generatedImage} isLoading={isGenerating} />
            </section>

            {products.length > 0 && (
              <section>
                <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2">
                  <Search size={18} className="sm:w-5 sm:h-5" />
                  Shop the Look
                </h2>
                <div className="space-y-3 sm:space-y-4">
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
