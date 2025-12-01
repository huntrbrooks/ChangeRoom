'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import axios from 'axios';
import { UploadZone } from './components/UploadZone';
import { BulkUploadZone, type AnalyzedItem } from './components/BulkUploadZone';
import { VirtualMirror } from './components/VirtualMirror';
import { ProductCard } from './components/ProductCard';
import { PaywallModal } from './components/PaywallModal';
import { Sparkles, Search, Loader2, CreditCard, Zap } from 'lucide-react';
import { getWearingStylePromptText } from '@/lib/wearingStyles';

// Force dynamic rendering to prevent static generation issues with Clerk
export const dynamic = 'force-dynamic';

// Define types locally for now
interface Product {
  title: string;
  price: string;
  link: string;
  thumbnail: string;
  source: string;
}

interface BillingInfo {
  plan: 'free' | 'standard' | 'pro';
  creditsAvailable: number;
  creditsRefreshAt: Date | null;
  trialUsed?: boolean;
}

function HomeContent() {
  const { user, isLoaded } = useUser();
  const [userImage, setUserImage] = useState<File | null>(null);
  
  // Updated state structure to track images with their analyses
  interface ImageWithAnalysis {
    file: File;
    analysis?: AnalyzedItem;
  }
  const [wardrobeItems, setWardrobeItems] = useState<ImageWithAnalysis[]>([]);
  
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  // Fetch billing info on mount and when user changes
  useEffect(() => {
    if (isLoaded && user) {
      fetchBilling();
    }
  }, [isLoaded, user]);

  // Check for Stripe checkout session completion
  useEffect(() => {
    if (typeof window !== 'undefined' && isLoaded && user) {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session_id');
      if (sessionId) {
        // Refresh billing after successful checkout
        setTimeout(() => {
          fetchBilling();
          // Clean up URL
          window.history.replaceState({}, '', window.location.pathname);
        }, 1000);
      }
    }
  }, [isLoaded, user]);

  const fetchBilling = async () => {
    try {
      const response = await axios.get('/api/my/billing');
      setBilling(response.data);
    } catch (error: any) {
      // Only log error if it's not a 401 (unauthorized) - that's expected when not logged in
      if (error.response?.status !== 401) {
        console.error('Error fetching billing:', error.response?.data || error.message);
      }
      // Set default billing if fetch fails
      if (user) {
        setBilling({
          plan: 'free',
          creditsAvailable: 0,
          creditsRefreshAt: null,
          trialUsed: false,
        });
      }
    }
  };

  // Check if user email is in bypass list
  const BYPASS_EMAILS = ["gerard.grenville@gmail.com"];
  const userEmail = user?.emailAddresses?.[0]?.emailAddress?.toLowerCase();
  const isBypassUser = userEmail && BYPASS_EMAILS.includes(userEmail);

  const isOnTrial = billing && !billing.trialUsed && !isBypassUser;

  interface AnalyzedItem {
    index: number;
    original_filename: string;
    analysis?: {
      body_region?: string;
      category: string;
      detailed_description?: string;
      short_description?: string;
      description?: string;
      suggested_filename: string;
      metadata?: Record<string, unknown>;
      item_type?: string;
      color?: string;
      style?: string;
      tags?: string[];
    };
    error?: string;
    status?: 'analyzing' | 'success' | 'error';
    file_url?: string;
    saved_filename?: string;
    saved_file?: string;
  }

  interface FileWithMetadata extends File {
    metadata?: Record<string, unknown>;
    detailed_description?: string;
    category?: string;
    item_type?: string;
    wearing_style?: string;
    file_url?: string;
  }

  const handleBulkUpload = (files: File[], analyses: AnalyzedItem[], shouldReplace: boolean = false) => {
    if (shouldReplace) {
      // Replace all existing items with new batch
      const newItems: ImageWithAnalysis[] = files.map((file, idx) => ({
        file,
        analysis: analyses[idx]
      }));
      setWardrobeItems(newItems);
    } else {
      // Append new items to existing ones
      const newItems: ImageWithAnalysis[] = files.map((file, idx) => ({
        file,
        analysis: analyses[idx]
      }));
      setWardrobeItems(prev => [...prev, ...newItems]);
    }
    console.log('Bulk upload complete. Analyzed items:', analyses);
  };

  const handleItemRemove = (index: number) => {
    setWardrobeItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleItemReplace = (index: number, file: File, analysis: AnalyzedItem) => {
    setWardrobeItems(prev => {
      const newItems = [...prev];
      newItems[index] = { file, analysis };
      return newItems;
    });
  };

  const handleGenerate = async () => {
    console.log("handleGenerate called", { userImage: !!userImage, wardrobeItems: wardrobeItems.length, billing, isOnTrial });
    
    if (!userImage) {
      const errorMsg = "Please upload a photo of yourself.";
      console.log("Validation failed:", errorMsg);
      setError(errorMsg);
      return;
    }
    
    const activeItems = wardrobeItems.map(item => item.file);
    if (activeItems.length === 0) {
      const errorMsg = "Please upload at least one clothing item.";
      console.log("Validation failed:", errorMsg);
      setError(errorMsg);
      return;
    }

    // Check credits before proceeding (unless on trial or bypass user)
    if (!isBypassUser && !isOnTrial && (!billing || billing.creditsAvailable <= 0)) {
      console.log("No credits available, showing paywall");
      setShowPaywall(true);
      return;
    }

    // Log bypass for admin
    if (isBypassUser) {
      console.log(`Payment bypassed for user: ${userEmail}`);
    }

    // Show paywall if credits are low (3 or less) and not on trial
    if (!isOnTrial && billing && billing.creditsAvailable <= 3 && billing.creditsAvailable > 0) {
      const proceed = window.confirm(
        `You have ${billing.creditsAvailable} credit${billing.creditsAvailable !== 1 ? 's' : ''} remaining. Continue?`
      );
      if (!proceed) {
        setShowPaywall(true);
        return;
      }
    }

    setIsGenerating(true);
    setError(null);
    setProducts([]);

    // Create abort controller for cancellation
    const controller = new AbortController();
    setAbortController(controller);

    // Suppress browser extension message channel errors
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
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
      } catch (wakeError: unknown) {
        const error = wakeError instanceof Error ? wakeError : new Error(String(wakeError));
        console.warn("Health check failed (service may be waking up):", error.message);
        // Continue anyway - service might still be waking up
      }

      // Step 1: Call Try-On API (sequential execution - must succeed before product search)
      let tryOnRes;
      try {
        const tryOnFormData = new FormData();
        tryOnFormData.append('user_image', userImage);
        
        // Limit to 5 items for try-on
        const itemsToTryOn = activeItems.slice(0, 5);
        const fileUrls: string[] = [];
        const filesToUpload: File[] = [];
        
        // Collect all items - separate those with file URLs from those that need upload
        for (const item of itemsToTryOn) {
          const itemData = item as FileWithMetadata;
          if (itemData?.file_url) {
            fileUrls.push(itemData.file_url);
          } else if (item instanceof File) {
            filesToUpload.push(item);
          }
        }
        
        // Send file URLs if we have any
        if (fileUrls.length > 0) {
          tryOnFormData.append('clothing_file_urls', fileUrls.join(','));
          console.log(`Using ${fileUrls.length} saved file URL(s) for try-on`);
        }
        
        // Send uploaded files if we have any
        for (const file of filesToUpload) {
          tryOnFormData.append('clothing_images', file);
        }
        if (filesToUpload.length > 0) {
          console.log(`Uploading ${filesToUpload.length} file(s) for try-on`);
        }
        
        console.log(`Trying on ${itemsToTryOn.length} item(s): ${fileUrls.length} from URLs, ${filesToUpload.length} uploaded`);
        
        // Build metadata with per-item wearing styles
        const metadata: Record<string, unknown> = {};
        const firstItem = itemsToTryOn[0] as FileWithMetadata;
        
        // Build per-item wearing instructions
        const itemWearingInstructions: string[] = [];
        itemsToTryOn.forEach((item: FileWithMetadata, index: number) => {
          if (item?.wearing_style && item?.category && item?.item_type) {
            const promptText = getWearingStylePromptText(
              item.category,
              item.item_type,
              item.wearing_style
            );
            if (promptText) {
              itemWearingInstructions.push(`Item ${index + 1} (${item.item_type || item.category}): ${promptText}`);
            }
          }
        });
        
        // Build metadata in the format expected by the system prompt
        if (firstItem?.metadata || firstItem?.category || firstItem?.detailed_description) {
          // Map analyzed metadata to system prompt format
          if (firstItem.metadata?.style) {
            metadata.style = firstItem.metadata.style; // e.g., "studio", "streetwear", "mirror selfie"
          }
          
          // Default to full body framing for fashion try-on
          metadata.framing = "full_body"; // or "three_quarter", "waist_up"
          
          // Include any additional metadata as "extras"
          const extras: Record<string, unknown> = {};
          if (firstItem.metadata && typeof firstItem.metadata === 'object') {
            const meta = firstItem.metadata as Record<string, unknown>;
            if (meta.color) extras.color = meta.color;
            if (meta.material) extras.material = meta.material;
            if (meta.fit) extras.fit = meta.fit;
          }
          if (firstItem.detailed_description) extras.detailed_description = firstItem.detailed_description;
          
          if (Object.keys(extras).length > 0) {
            metadata.extras = extras;
          }
        }
        
        // Add wearing style instructions
        if (itemWearingInstructions.length > 0) {
          metadata.wearing_instructions = itemWearingInstructions;
        }
        
        // Add per-item wearing styles metadata
        const itemsMetadata: Array<{
          index: number;
          category: string;
          item_type: string;
          wearing_style: string;
        }> = [];
        itemsToTryOn.forEach((item: FileWithMetadata, index: number) => {
          if (item?.wearing_style) {
            itemsMetadata.push({
              index,
              category: item.category || 'unknown',
              item_type: item.item_type || '',
              wearing_style: item.wearing_style,
            });
          }
        });
        
        if (itemsMetadata.length > 0) {
          metadata.items_wearing_styles = itemsMetadata;
        }
        
        tryOnFormData.append('garment_metadata', JSON.stringify(metadata));
        tryOnFormData.append('category', firstItem?.category || 'upper_body');
        console.log("Using analyzed metadata for try-on:", metadata);

        console.log("Starting try-on generation...");
        tryOnRes = await axios.post(`${API_URL}/api/try-on`, tryOnFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 600000, // 10 minutes for Render wake-up + VTON generation
          signal: controller.signal,
        });

        if (tryOnRes.data.image_url) {
          setGeneratedImage(tryOnRes.data.image_url);
          console.log("Try-on completed successfully");
          // Refresh billing info after successful try-on
          if (isLoaded && user) {
            fetchBilling();
          }
        }
      } catch (tryOnError: unknown) {
        const error = tryOnError as { name?: string; code?: string; response?: { status?: number; data?: { error?: string; detail?: string } }; message?: string };
        if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
          setError('Operation cancelled');
          setIsGenerating(false);
          console.error = originalError;
          return;
        }
        
        // Handle no credits error
        if (error.response?.status === 402 || error.response?.data?.error === 'no_credits') {
          setShowPaywall(true);
          setIsGenerating(false);
          console.error = originalError;
          return;
        }
        
        console.error("Error in try-on:", tryOnError);
        const errorMessage = error.code === 'ECONNABORTED' || error.message?.includes('timeout')
          ? `The try-on is taking longer than expected. This usually means our servers are busy. Please try again in a few moments.`
          : error.response?.data?.detail || error.message || "We couldn't generate your try-on. Please check your photos and try again.";
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
      } catch (searchError: unknown) {
        const error = searchError as { name?: string; code?: string; message?: string };
        if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
          // Cancelled, don't show error
          return;
        }
        // Product search failure is non-critical - show try-on result anyway
        console.warn("Error in product search (non-critical):", searchError);
        // Show subtle notification for product search failure
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          console.warn("Product search timed out, but try-on was successful");
        }
      }

    } catch (err: unknown) {
      const error = err as { name?: string; code?: string; response?: { status?: number; data?: { detail?: string } }; message?: string };
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        setError('Operation cancelled');
        setIsGenerating(false);
        console.error = originalError;
        return;
      }
      console.error("Unexpected error:", err);
      
      if (error.response?.status === 0 || error.message?.includes('Network Error') || error.code === 'ERR_NETWORK') {
        setError(`Unable to connect to our servers. Please check your internet connection and try again. If the problem persists, the service may be temporarily unavailable.`);
      } else if (error.response?.status === 404) {
        setError(`The requested service is not available. Please try again later.`);
      } else {
        setError(error.response?.data?.detail || error.message || "An unexpected error occurred. Please try again.");
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
      <header className="border-b border-[#FF13F0]/20 sticky top-0 bg-white/95 backdrop-blur-md z-50 safe-area-inset">
        <div className="container mx-auto px-3 sm:px-4 py-2.5 sm:py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center justify-center gap-2 sm:gap-3 min-w-0 flex-shrink flex-1">
            <img 
              src="/Logo.png" 
              alt="Change Room Logo" 
              className="w-7 h-7 sm:w-10 sm:h-10 object-contain flex-shrink-0"
            />
            <img 
              src="/Font logo.png" 
              alt="Change Room" 
              className="h-5 sm:h-8 object-contain max-w-[120px] sm:max-w-none"
            />
          </div>
          <nav className="flex items-center gap-2 sm:gap-4 md:gap-6 text-xs sm:text-sm font-medium flex-shrink-0">
            {isLoaded && user && billing && (
              <Link 
                href="/billing" 
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-1.5 bg-[#FF13F0]/10 hover:bg-[#FF13F0]/20 border border-[#FF13F0]/30 rounded-lg transition-colors text-[#FF13F0] hover:text-[#FF13F0]/80 min-h-[36px] sm:min-h-[40px] touch-manipulation"
              >
                <CreditCard size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="hidden sm:inline whitespace-nowrap">
                  {isOnTrial ? 'Free Trial' : `${billing.creditsAvailable} credits`}
                </span>
                <span className="sm:hidden font-semibold">{billing.creditsAvailable}</span>
              </Link>
            )}
            <div className="hidden md:flex items-center gap-6 text-[#FF13F0]">
              <Link href="/pricing" className="hover:text-[#FF13F0]/80 transition-colors whitespace-nowrap">Pricing</Link>
              <Link href="/how-it-works" className="hover:text-[#FF13F0]/80 transition-colors whitespace-nowrap">How it Works</Link>
              <Link href="/about" className="hover:text-[#FF13F0]/80 transition-colors whitespace-nowrap">About</Link>
            </div>
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-6 md:py-8 pb-6 sm:pb-8">
        
        {/* Main Heading */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#FF13F0] mb-3 sm:mb-4">
            Virtual Try-On & Shopping
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mb-4">
            Try on clothes virtually and discover similar products to shop
          </p>
          <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-6 text-xs sm:text-sm text-[#FF13F0]">
            <Link 
              href="/terms-of-service" 
              className="hover:text-[#FF13F0]/80 transition-colors underline"
            >
              Terms of Service
            </Link>
            <span className="text-gray-400">|</span>
            <Link 
              href="/privacy-policy" 
              className="hover:text-[#FF13F0]/80 transition-colors underline"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
        
        {/* Free Trial Banner */}
        {isLoaded && user && billing && isOnTrial && (
          <div className="bg-gradient-to-r from-[#FF13F0]/20 to-[#FF13F0]/20 border border-[#FF13F0]/30 text-black p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_20px_rgba(255,19,240,0.3)]">
            <div className="flex items-center gap-2 sm:gap-3 flex-1">
              <Zap size={18} className="sm:w-5 sm:h-5 text-[#FF13F0] flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-[#FF13F0] text-sm sm:text-base">Free Try-On Available!</p>
                <p className="text-xs sm:text-sm text-[#FF13F0]/80 mt-0.5">
                  You have 1 free try-on. Upgrade to get unlimited try-ons with a subscription.
                </p>
              </div>
            </div>
            <Link 
              href="/billing"
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-[#FF13F0] text-white rounded-lg font-semibold hover:bg-[#FF13F0]/90 transition-colors text-sm shadow-[0_0_15px_rgba(255,19,240,0.5)] text-center min-h-[44px] flex items-center justify-center touch-manipulation"
            >
              Upgrade
            </Link>
          </div>
        )}

        {/* Low Credits Warning */}
        {isLoaded && user && billing && !isOnTrial && billing.creditsAvailable <= 3 && billing.creditsAvailable > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_15px_rgba(255,255,0,0.2)]">
            <div className="flex items-center gap-2 sm:gap-3 flex-1">
              <CreditCard size={18} className="sm:w-5 sm:h-5 text-yellow-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-sm sm:text-base">Low Credits</p>
                <p className="text-xs sm:text-sm text-yellow-200 mt-0.5">
                  You have {billing.creditsAvailable} credit{billing.creditsAvailable !== 1 ? 's' : ''} remaining
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowPaywall(true)}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-yellow-500 text-black rounded-lg font-semibold hover:bg-yellow-400 transition-colors text-sm shadow-[0_0_15px_rgba(255,255,0,0.3)] text-center min-h-[44px] flex items-center justify-center touch-manipulation"
            >
              Buy Credits
            </button>
          </div>
        )}

        {/* No Credits Warning */}
        {isLoaded && user && billing && !isOnTrial && billing.creditsAvailable === 0 && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_15px_rgba(255,0,0,0.2)]">
            <div className="flex items-center gap-2 sm:gap-3 flex-1">
              <CreditCard size={18} className="sm:w-5 sm:h-5 text-red-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-sm sm:text-base">No Credits Remaining</p>
                <p className="text-xs sm:text-sm text-red-200 mt-0.5">Upgrade or purchase credits to continue</p>
              </div>
            </div>
            <button
              onClick={() => setShowPaywall(true)}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-400 transition-colors text-sm shadow-[0_0_15px_rgba(255,0,0,0.3)] text-center min-h-[44px] flex items-center justify-center touch-manipulation"
            >
              Upgrade Now
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 text-red-300 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 border border-red-500/30 text-sm sm:text-base shadow-[0_0_15px_rgba(255,0,0,0.2)]">
            {error}
          </div>
        )}

        <div className="grid lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8">
          
          {/* Left Column: Inputs */}
          <div className="lg:col-span-7 space-y-3 sm:space-y-4 md:space-y-6 lg:space-y-8">
            
            <section>
              <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2 text-[#FF13F0]">
                <span className="bg-[#FF13F0] text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-xs font-bold shadow-[0_0_10px_rgba(255,19,240,0.5)]">1</span>
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
              <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2 text-[#FF13F0]">
                <span className="bg-[#FF13F0] text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-xs font-bold shadow-[0_0_10px_rgba(255,19,240,0.5)]">2</span>
                Choose Wardrobe
              </h2>
              <BulkUploadZone 
                existingImages={wardrobeItems.map(item => item.file)}
                existingAnalyses={wardrobeItems.map(item => item.analysis).filter((a): a is AnalyzedItem => a !== undefined)}
                onFilesUploaded={handleBulkUpload}
                onItemRemove={handleItemRemove}
                onItemReplace={handleItemReplace}
              />
              {wardrobeItems.length > 1 && (
                <div className="mt-3 p-3 bg-[#FF13F0]/10 border border-[#FF13F0]/30 rounded-lg shadow-[0_0_10px_rgba(255,19,240,0.2)]">
                  <p className="text-sm text-[#FF13F0]">
                    💡 <strong>Tip:</strong> You can try on up to 5 items at once for a complete outfit!
                  </p>
                </div>
              )}
            </section>

            <button
              onClick={(e) => {
                try {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log("Try-on button clicked");
                  if (isGenerating) {
                    console.log("Button clicked but already generating, ignoring");
                    return;
                  }
                  handleGenerate().catch((error) => {
                    console.error('Error in handleGenerate:', error);
                    setError('An error occurred while trying to generate your look. Please try again.');
                    setIsGenerating(false);
                  });
                } catch (error) {
                  console.error('Error in button onClick handler:', error);
                  setError('An unexpected error occurred. Please try again.');
                  setIsGenerating(false);
                }
              }}
              disabled={isGenerating}
              type="button"
              aria-label="Try on clothes"
              className={`
                w-full py-3.5 sm:py-4 rounded-xl font-bold text-base sm:text-lg flex items-center justify-center gap-2 sm:gap-3 transition-all
                min-h-[48px] touch-manipulation
                ${isGenerating 
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300' 
                  : 'bg-[#FF13F0] text-white hover:bg-[#FF13F0]/90 active:bg-[#FF13F0]/80 hover:shadow-lg active:scale-[0.98] shadow-[0_0_25px_rgba(255,19,240,0.5)] border border-[#FF13F0]'
                }
              `}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={18} className="sm:w-5 sm:h-5 animate-spin" />
                  <span>Generating your look...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} className="sm:w-5 sm:h-5" />
                  <span>Try it on</span>
                </>
              )}
            </button>
            {isGenerating && (
              <button
                onClick={() => abortController?.abort()}
                className="mt-2 text-sm text-[#FF13F0] hover:text-[#FF13F0]/80 underline w-full text-center"
                aria-label="Cancel operation"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-5 space-y-3 sm:space-y-4 md:space-y-6 lg:space-y-8">
            
            <section>
              <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2 text-[#FF13F0]">
                <span className="bg-[#FF13F0] text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-xs font-bold shadow-[0_0_10px_rgba(255,19,240,0.5)]">3</span>
                Virtual Mirror
              </h2>
              <VirtualMirror imageUrl={generatedImage} isLoading={isGenerating} />
            </section>

            {products.length > 0 && (
              <section>
                <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2 text-[#FF13F0]">
                  <Search size={18} className="sm:w-5 sm:h-5 text-[#FF13F0]" />
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

      {/* Paywall Modal */}
      {showPaywall && (
        <PaywallModal
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          creditsAvailable={billing?.creditsAvailable ?? 0}
          plan={billing?.plan ?? 'free'}
          onTrial={isOnTrial || undefined}
        />
      )}
    </main>
  );
}

export default function Home() {
  // During build/SSR, Clerk might not be available
  // Return a loading state that will be replaced at runtime
  if (typeof window === 'undefined') {
    return (
      <main className="min-h-screen bg-white text-black font-sans flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF13F0] mx-auto"></div>
          <p className="mt-4 text-[#FF13F0]">Loading...</p>
        </div>
      </main>
    );
  }
  
  return <HomeContent />;
}
