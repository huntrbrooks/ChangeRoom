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
import { MyOutfits } from './components/MyOutfits';
import { Sparkles, Search, Loader2, CreditCard, Zap, Shirt } from 'lucide-react';
import { getWearingStylePromptText } from '@/lib/wearingStyles';
import { isBypassUser } from '@/lib/bypass-config';

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
  const [activeTab, setActiveTab] = useState<'try-on' | 'my-outfits'>('try-on');

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
  const userEmail = user?.emailAddresses?.[0]?.emailAddress;
  const isBypass = isBypassUser(userEmail);

  const isOnTrial = billing && !billing.trialUsed && !isBypass;

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

  // Save outfit to My Outfits (persistent storage via API)
  const saveOutfitToMyOutfits = async (imageUrl: string, clothingFiles: File[], wardrobeItemsData: typeof wardrobeItems) => {
    try {
      const clothingItems = wardrobeItemsData.map((item, idx) => ({
        filename: item.file.name,
        category: item.analysis?.analysis?.category || item.analysis?.analysis?.body_region || 'unknown',
        itemType: item.analysis?.analysis?.item_type || '',
        color: item.analysis?.analysis?.color || '',
        style: item.analysis?.analysis?.style || '',
        description: item.analysis?.analysis?.description || item.analysis?.analysis?.short_description || '',
        tags: item.analysis?.analysis?.tags || [],
        fileUrl: (item.file as FileWithMetadata)?.file_url || null,
      }));

      // Save to database via API
      const response = await axios.post('/api/my/outfits', {
        imageUrl,
        clothingItems,
      });

      // Dispatch custom event to notify MyOutfits component to refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('outfitSaved'));
      }
      
      console.log('Outfit saved to My Outfits:', response.data);
    } catch (error: any) {
      console.error('Error saving outfit to My Outfits:', error);
      // Don't throw - this is non-critical, but log for debugging
      if (error.response?.status === 401) {
        console.warn('User not authenticated, outfit not saved');
      }
    }
  };

  const handleGenerate = async () => {
    console.log("handleGenerate called", { userImage: !!userImage, wardrobeItems: wardrobeItems.length, billing, isOnTrial });
    
    // Prevent multiple simultaneous calls
    if (isGenerating) {
      console.log("Already generating, ignoring duplicate call");
      return;
    }
    
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
    if (!isBypass && !isOnTrial && (!billing || billing.creditsAvailable <= 0)) {
      console.log("No credits available, showing paywall");
      setShowPaywall(true);
      return;
    }

    // Log bypass for admin
    if (isBypass) {
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

    // Cancel any existing request
    if (abortController) {
      abortController.abort();
    }

    // Reset state for new generation
    setIsGenerating(true);
    setError(null);
    setProducts([]);
    // Clear previous image to show loading state immediately
    setGeneratedImage(null);

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
          const imageUrl = tryOnRes.data.image_url;
          
          // For data URLs (base64), we can't add a timestamp, but React will update if the URL changes
          // For regular URLs, add timestamp to force refresh on repeated uses
          let finalImageUrl = imageUrl;
          if (!imageUrl.startsWith('data:')) {
            finalImageUrl = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
          }
          
          // Force state update by setting to null first, then to new URL
          setGeneratedImage(null);
          // Use requestAnimationFrame to ensure DOM update
          requestAnimationFrame(() => {
            setGeneratedImage(finalImageUrl);
            console.log("Try-on completed successfully");
          });
          
          // Save to My Outfits (use original URL)
          saveOutfitToMyOutfits(imageUrl, activeItems, wardrobeItems);
          
          // Refresh billing info after successful try-on
          if (isLoaded && user) {
            fetchBilling();
          }
        } else {
          throw new Error("No image URL returned from try-on API");
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
      // Clean up abort controller
      if (controller) {
        setAbortController(null);
      }
      console.error = originalError; // Restore original error handler
    }
  };

  return (
    <main className="min-h-screen bg-white text-black font-sans">
      {/* Header */}
      <header className="border-b border-black/20 sticky top-0 bg-white/95 backdrop-blur-md z-50 safe-area-inset">
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
              <>
                {isBypass ? (
                  <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-1.5 bg-gradient-to-r from-[#8B5CF6]/20 to-[#7C3AED]/20 border border-black/40 rounded-lg text-black min-h-[36px] sm:min-h-[40px]">
                    <Zap size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="hidden sm:inline whitespace-nowrap font-semibold">Unlimited Access</span>
                    <span className="sm:hidden font-semibold">∞</span>
                  </div>
                ) : (
                  <Link 
                    href="/billing" 
                    className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-1.5 bg-black/10 hover:bg-black/20 border border-black/30 rounded-lg transition-colors text-black hover:text-[#7C3AED] min-h-[36px] sm:min-h-[40px] touch-manipulation"
                  >
                    <CreditCard size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="hidden sm:inline whitespace-nowrap">
                      {isOnTrial ? 'Free Trial' : `${billing.creditsAvailable} credits`}
                    </span>
                    <span className="sm:hidden font-semibold">{billing.creditsAvailable}</span>
                  </Link>
                )}
              </>
            )}
            <div className="hidden md:flex items-center gap-6 text-black">
              <Link href="/pricing" className="hover:text-[#7C3AED] transition-colors whitespace-nowrap">Pricing</Link>
              <Link href="/how-it-works" className="hover:text-[#7C3AED] transition-colors whitespace-nowrap">How it Works</Link>
              <Link href="/about" className="hover:text-[#7C3AED] transition-colors whitespace-nowrap">About</Link>
            </div>
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-6 md:py-8 pb-6 sm:pb-8">
        
        {/* Main Heading */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-black mb-3 sm:mb-4 uppercase tracking-tight">
            Virtual Try-On & Shopping
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mb-4">
            Try on clothes virtually and discover similar products to shop
          </p>
          <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-6 text-xs sm:text-sm text-black">
            <Link 
              href="/terms-of-service" 
              className="hover:text-[#7C3AED] transition-colors underline"
            >
              Terms of Service
            </Link>
            <span className="text-gray-400">|</span>
            <Link 
              href="/privacy-policy" 
              className="hover:text-[#7C3AED] transition-colors underline"
            >
              Privacy Policy
            </Link>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-center mb-4 sm:mb-6 md:mb-8 border-b border-black/20 -mx-3 sm:-mx-4 px-3 sm:px-4 overflow-x-auto overscroll-contain">
          <div className="flex items-center min-w-full sm:min-w-0">
            <button
              onClick={() => setActiveTab('try-on')}
              onTouchStart={(e) => {
                if (e.touches.length > 1) {
                  e.preventDefault();
                }
              }}
              className={`
                flex-1 sm:flex-none px-4 sm:px-6 py-3 sm:py-2 md:py-3 font-semibold text-sm sm:text-base transition-colors relative
                min-h-[48px] sm:min-h-[44px] touch-manipulation select-none active:bg-black/5
                ${activeTab === 'try-on'
                  ? 'text-black border-b-2 border-black'
                  : 'text-gray-600 active:text-black/80'
                }
              `}
              aria-label="Try-On tab"
            >
              <span className="flex items-center justify-center gap-2">
                <Sparkles size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                <span className="whitespace-nowrap">Try-On</span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab('my-outfits')}
              onTouchStart={(e) => {
                if (e.touches.length > 1) {
                  e.preventDefault();
                }
              }}
              className={`
                flex-1 sm:flex-none px-4 sm:px-6 py-3 sm:py-2 md:py-3 font-semibold text-sm sm:text-base transition-colors relative
                min-h-[48px] sm:min-h-[44px] touch-manipulation select-none active:bg-black/5
                ${activeTab === 'my-outfits'
                  ? 'text-black border-b-2 border-black'
                  : 'text-gray-600 active:text-black/80'
                }
              `}
              aria-label="My Outfits tab"
            >
              <span className="flex items-center justify-center gap-2">
                <Shirt size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                <span className="whitespace-nowrap">My Outfits</span>
              </span>
            </button>
          </div>
        </div>
        
        {/* Free Trial Banner */}
        {isLoaded && user && billing && isOnTrial && (
          <div className="bg-gradient-to-r from-[#8B5CF6]/20 to-[#8B5CF6]/20 border border-black/30 text-black p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_20px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-2 sm:gap-3 flex-1">
              <Zap size={18} className="sm:w-5 sm:h-5 text-black flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-black text-sm sm:text-base">Free Try-On Available!</p>
                <p className="text-xs sm:text-sm text-[#7C3AED] mt-0.5">
                  You have 1 free try-on. Upgrade to get unlimited try-ons with a subscription.
                </p>
              </div>
            </div>
            <Link 
              href="/billing"
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-black text-white rounded-lg font-semibold hover:bg-[#7C3AED] transition-colors text-sm shadow-[0_0_15px_rgba(0,0,0,0.5)] text-center min-h-[44px] flex items-center justify-center touch-manipulation"
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
          <div className="bg-orange-500/10 border border-orange-500/30 text-orange-700 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_15px_rgba(255,165,0,0.2)]">
            <div className="flex items-center gap-2 sm:gap-3 flex-1">
              <CreditCard size={18} className="sm:w-5 sm:h-5 text-orange-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-sm sm:text-base text-orange-700">No Credits Remaining</p>
                <p className="text-xs sm:text-sm text-orange-600 mt-0.5">Upgrade or purchase credits to continue</p>
              </div>
            </div>
            <button
              onClick={() => setShowPaywall(true)}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-400 transition-colors text-sm shadow-[0_0_15px_rgba(255,165,0,0.3)] text-center min-h-[44px] flex items-center justify-center touch-manipulation"
            >
              Upgrade Now
            </button>
          </div>
        )}

        {error && activeTab === 'try-on' && (
          <div className="bg-red-500/10 text-red-300 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 border border-red-500/30 text-sm sm:text-base shadow-[0_0_15px_rgba(255,0,0,0.2)]">
            {error}
          </div>
        )}

        {activeTab === 'my-outfits' ? (
          <MyOutfits />
        ) : (
          <div className="grid lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8">
          
          {/* Left Column: Inputs */}
          <div className="lg:col-span-7 space-y-3 sm:space-y-4 md:space-y-6 lg:space-y-8">
            
            <section>
              <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2 text-black">
                <span className="bg-black text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-xs font-bold shadow-[0_0_10px_rgba(0,0,0,0.5)]">1</span>
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
              <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2 text-black">
                <span className="bg-black text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-xs font-bold shadow-[0_0_10px_rgba(0,0,0,0.5)]">2</span>
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
                <div className="mt-3 p-3 bg-black/10 border border-black/30 rounded-lg shadow-[0_0_10px_rgba(0,0,0,0.2)]">
                  <p className="text-sm text-black">
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
              onTouchStart={(e) => {
                // Prevent double-tap zoom on mobile
                if (e.touches.length > 1) {
                  e.preventDefault();
                }
              }}
              disabled={isGenerating}
              type="button"
              aria-label="Try on clothes"
              className={`
                w-full py-3.5 sm:py-4 rounded-none font-bold text-base sm:text-lg flex items-center justify-center gap-2 sm:gap-3 transition-all uppercase tracking-wider
                min-h-[48px] touch-manipulation select-none
                ${isGenerating 
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300 pointer-events-none' 
                  : 'bg-black text-white hover:bg-gray-900 active:bg-gray-800 active:scale-[0.98] border-2 border-black'
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
                className="mt-2 text-sm text-black hover:text-[#7C3AED] underline w-full text-center"
                aria-label="Cancel operation"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-5 space-y-3 sm:space-y-4 md:space-y-6 lg:space-y-8">
            
            <section>
              <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2 text-black">
                <span className="bg-black text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-xs font-bold shadow-[0_0_10px_rgba(0,0,0,0.5)]">3</span>
                Virtual Mirror
              </h2>
              <VirtualMirror imageUrl={generatedImage} isLoading={isGenerating} />
            </section>

            {products.length > 0 && (
              <section>
                <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2 text-black">
                  <Search size={18} className="sm:w-5 sm:h-5 text-black" />
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
        )}
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto"></div>
          <p className="mt-4 text-black">Loading...</p>
        </div>
      </main>
    );
  }
  
  return <HomeContent />;
}
