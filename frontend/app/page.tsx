'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useUser, useAuth } from '@clerk/nextjs';
import { httpClient } from '@/lib/httpClient';
import { UploadZone } from './components/UploadZone';
import { BulkUploadZone } from './components/BulkUploadZone';
import { TryOnFromUrl } from './components/TryOnFromUrl';
import { VirtualMirror } from './components/VirtualMirror';
import { SocialShareButtons } from './components/SocialShareButtons';
import { ProductCard } from './components/ProductCard';
import { PaywallModal } from './components/PaywallModal';
import { MyOutfits } from './components/MyOutfits';
import { ShopSaveModal, type ShopSaveResult, type ShopSaveClothingItem } from './components/ShopSaveModal';
import { Sparkles, Search, Loader2, CreditCard, Zap, Shirt } from 'lucide-react';
import { getWearingStylePromptText } from '@/lib/wearingStyles';
import { isBypassUser } from '@/lib/bypass-config';
import { ensureAbsoluteUrl } from '@/lib/url';
import { resolveBackendApiUrl } from '@/lib/backend-url';
import { ANALYTICS_EVENTS, captureEvent } from '@/lib/analytics';
import { trackTrialConsumed, trackOutfitGenerated } from '@/lib/userEvents';

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
  hasPurchase?: boolean;
}

const formatCurrency = (value?: number | null, currency?: string | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'N/A';
  }
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency || 'AUD',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
};

function HomeContent() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const [userImages, setUserImages] = useState<File[]>([]);
  
  // Updated state structure to track images with their analyses
  interface ImageWithAnalysis {
    file: File;
    analysis?: AnalyzedItem;
    clothingItemId?: string;
  }
  const [wardrobeItems, setWardrobeItems] = useState<ImageWithAnalysis[]>([]);
  
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [modestyApplied, setModestyApplied] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [isProductSearchLoading, setIsProductSearchLoading] = useState(false);
  const [productSearchAttempted, setProductSearchAttempted] = useState(false);
  const [productSearchError, setProductSearchError] = useState<string | null>(
    null
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTryOnLoading, setIsTryOnLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [isPreviewResult, setIsPreviewResult] = useState(false);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [billingStatus, setBillingStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [billingError, setBillingError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [hasShownPaywallAfterResult, setHasShownPaywallAfterResult] = useState(false);
  const [activeTab, setActiveTab] = useState<'try-on' | 'my-outfits'>('try-on');
  const [isShopSaveOpen, setIsShopSaveOpen] = useState(false);
  const [shopSaveResults, setShopSaveResults] = useState<ShopSaveResult[]>([]);
  const [pendingSavedItem, setPendingSavedItem] = useState<ShopSaveClothingItem | null>(null);
  const [showWardrobeLimitModal, setShowWardrobeLimitModal] = useState(false);
  const [isAddingSavedItem, setIsAddingSavedItem] = useState(false);
  const [blockedWardrobeIndices, setBlockedWardrobeIndices] = useState<Set<number>>(new Set());
  const [adjustingDescriptionIndices, setAdjustingDescriptionIndices] = useState<Set<number>>(new Set());
  const [lastSafetyBlockDetail, setLastSafetyBlockDetail] = useState<string | null>(null);
  const [adjustDescriptionFeedback, setAdjustDescriptionFeedback] = useState<
    Map<number, { tone: 'success' | 'warning' | 'error'; message: string }>
  >(new Map());
  const cardClass =
    "rounded-2xl border border-black/10 bg-white/95 shadow-[0_12px_40px_rgba(0,0,0,0.06)] backdrop-blur-sm";
  const cardPadding = "p-3 sm:p-4 md:p-6";
  const resultImageLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creditLoggedRef = useRef(false);
  const trialConsumedRef = useRef(false);
  const contentBlockWarnedRef = useRef(false);
  const creditHoldAppliedRef = useRef(false);
  const virtualMirrorSectionRef = useRef<HTMLElement | null>(null);
  const stickyHeaderRef = useRef<HTMLElement | null>(null);
  const mobileActionBarRef = useRef<HTMLDivElement | null>(null);

  const withRetry = useCallback(
    async function withRetryFn<T>(fn: () => Promise<T>, retries = 2, delayMs = 1500): Promise<T> {
      let lastError: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await fn();
        } catch (err) {
          lastError = err;
          if (attempt === retries) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    },
    []
  );

  const scrollToVirtualMirror = useCallback(() => {
    const el = virtualMirrorSectionRef.current;
    if (!el) return;

    const headerH = stickyHeaderRef.current?.getBoundingClientRect().height ?? 0;
    const bottomBarH = mobileActionBarRef.current?.getBoundingClientRect().height ?? 0;
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const availableH = Math.max(0, viewportH - headerH - bottomBarH);

    const rect = el.getBoundingClientRect();
    const elTopAbs = window.scrollY + rect.top;
    const padding = 12; // small breathing room so it matches the "framed" look

    // If the mirror card fits inside the available area (between header and bottom bar),
    // center it within that area. Otherwise, align it just under the header.
    const fits = rect.height <= Math.max(0, availableH - padding * 2);
    const targetTop = fits
      ? elTopAbs - headerH - (availableH - rect.height) / 2
      : elTopAbs - headerH - padding;

    const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewportH);
    const clamped = Math.min(maxScroll, Math.max(0, Math.round(targetTop)));
    window.scrollTo({ top: clamped, behavior: 'smooth' });
  }, []);

  const backendApi = useMemo(() => resolveBackendApiUrl(), []);

  const getBackendAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const token = await getToken({ template: 'backend' });
      if (token) {
        return { Authorization: `Bearer ${token}` };
      }
    } catch {
      // Fallback to default token below.
    }

    try {
      const fallback = await getToken();
      if (fallback) {
        return { Authorization: `Bearer ${fallback}` };
      }
    } catch {
      // No-op: unauthenticated or token unavailable.
    }

    return {} as Record<string, string>;
  }, [getToken]);

  const getBackendApiUrl = useCallback(
    (context: string) => {
      if (backendApi.apiUrl) {
        return backendApi.apiUrl;
      }
      const reason = backendApi.reason ? ` ${backendApi.reason}` : '';
      setError(`${context} is unavailable.${reason} Please set NEXT_PUBLIC_API_URL.`);
      return null;
    },
    [backendApi.apiUrl, backendApi.reason, setError]
  );

  const handleLoaderStageChange = useCallback((stageId: number) => {
    console.info('try-on-stage', { stageId, ts: Date.now() });
  }, []);

  const handleResultImageLoaded = useCallback(() => {
    if (resultImageLoadTimerRef.current) {
      clearTimeout(resultImageLoadTimerRef.current);
      resultImageLoadTimerRef.current = null;
    }
    setIsTryOnLoading(false);
  }, []);

  useEffect(() => {
    router.prefetch('/pricing');
    router.prefetch('/billing');
  }, [router]);

  // Fetch billing info on mount and when user changes
  useEffect(() => {
    if (isLoaded && user) {
      fetchBilling();
    }
  }, [isLoaded, user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      isPreviewResult &&
      generatedImage &&
      !isGenerating &&
      !hasShownPaywallAfterResult
    ) {
      setShowPaywall(true);
      setHasShownPaywallAfterResult(true);
      captureEvent(ANALYTICS_EVENTS.PAYWALL_VIEW_AFTER_RESULT, {
        request_id: lastRequestId,
        plan: billing?.plan ?? 'free',
        credits_available: billing?.creditsAvailable ?? null,
        used_free_trial: true,
      });
    }
  }, [
    billing?.creditsAvailable,
    billing?.plan,
    generatedImage,
    hasShownPaywallAfterResult,
    isGenerating,
    isPreviewResult,
    lastRequestId,
  ]);

  // Check for Stripe checkout session completion
  useEffect(() => {
    if (typeof window !== 'undefined' && isLoaded && user) {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session_id');
      if (sessionId) {
        // Verify paid checkout server-side (idempotent) then refresh billing
        (async () => {
          try {
            await httpClient.post('/api/billing/verify-checkout-session', { sessionId });
          } catch (error) {
            // Verification is a best-effort fallback (webhook is primary)
            // eslint-disable-next-line no-console
            console.warn('verify-checkout-session failed', error);
          } finally {
            // Always refresh billing and clean URL
            setTimeout(() => {
              fetchBilling();
              window.history.replaceState({}, '', window.location.pathname);
            }, 500);
          }
        })();
      }
    }
  }, [isLoaded, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBilling = async () => {
    try {
      setBillingStatus('loading');
      setBillingError(null);
      const response = await httpClient.get('/api/my/billing');
      setBilling({
        ...response.data,
        hasPurchase: Boolean(response.data?.hasPurchase),
      });
      setBillingStatus('ready');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // Only log error if it's not a 401 (unauthorized) - that's expected when not logged in
      if (error.response?.status !== 401) {
        console.error('Error fetching billing:', error.response?.data || error.message);
      }
      if (error.response?.status !== 401) {
        const data = error.response?.data;
        const detail =
          (typeof data?.hint === 'string' && data.hint) ||
          (typeof data?.details === 'string' && data.details) ||
          (typeof data?.error === 'string' && data.error) ||
          (typeof error.message === 'string' && error.message) ||
          'Billing is temporarily unavailable.';
        setBillingError(detail);
      }
      setBillingStatus('error');
    }
  };

  // Check if user email is in bypass list
  const userEmail = user?.emailAddresses?.[0]?.emailAddress;
  const isBypass = isBypassUser(userEmail);
  const redirectToPricing = useCallback(() => {
    router.push('/pricing?promo=xmas');
  }, [router]);

  const isOnTrial = billing && !billing.trialUsed && !isBypass;
  const isAuthenticated = isLoaded && !!user;
  const hasCreditsAvailable = billing ? billing.creditsAvailable > 0 : false;
  const hasPaidPlan = billing ? billing.plan !== 'free' : false;
  const hasPaidAccess = Boolean(billing?.hasPurchase || hasPaidPlan);
  const lacksCredits =
    !isBypass && !isOnTrial && billingStatus === 'ready' && (!billing || !hasCreditsAvailable);
  const shouldLockMyOutfits = useMemo(
    () =>
      isLoaded &&
      !!user &&
      !isBypass &&
      billingStatus === 'ready' &&
      billing !== null &&
      (billing.trialUsed ?? false) &&
      !hasPaidAccess,
    [billing, billingStatus, hasPaidAccess, isBypass, isLoaded, user]
  );

  useEffect(() => {
    if (activeTab === 'my-outfits' && shouldLockMyOutfits) {
      setActiveTab('try-on');
      router.push('/pricing?ref=my-outfits');
    }
  }, [activeTab, router, shouldLockMyOutfits]);

  const canAttemptTryOn = isAuthenticated && !isGenerating;

  const requireAuth = useCallback(() => {
    if (!isLoaded || !user) {
      setError('Please sign in to upload images.');
      return false;
    }
    return true;
  }, [isLoaded, setError, user]);

  const handleMyOutfitsTab = useCallback(() => {
    if (shouldLockMyOutfits) {
      router.push('/pricing?ref=my-outfits');
      return;
    }
    setActiveTab('my-outfits');
  }, [router, shouldLockMyOutfits]);

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
      brand?: string;
      tags?: string[];
    };
    error?: string;
    status?: 'analyzing' | 'success' | 'error';
    file_url?: string;
    saved_filename?: string;
    saved_file?: string;
    storage_path?: string;
  }

  interface FileWithMetadata extends File {
    metadata?: Record<string, unknown>;
    detailed_description?: string;
    category?: string;
    item_type?: string;
    brand?: string;
    wearing_style?: string;
    file_url?: string;
    saved_filename?: string;
    storage_path?: string;
    clothing_item_id?: string;
  }

  const persistClothingItems = useCallback(async (itemsToPersist: ImageWithAnalysis[]) => {
    if (!itemsToPersist || itemsToPersist.length === 0) {
      return;
    }

    const payload = itemsToPersist
      .map((entry) => {
        const analysisMeta = entry.analysis?.analysis;
        const fileMeta = entry.file as FileWithMetadata;
        const storageKey =
          fileMeta.storage_path ||
          entry.analysis?.storage_path ||
          entry.analysis?.saved_filename;
        const publicUrl = ensureAbsoluteUrl(
          fileMeta.file_url || entry.analysis?.file_url || null
        );

        if (
          entry.clothingItemId ||
          fileMeta.clothing_item_id ||
          !analysisMeta ||
          !storageKey ||
          !publicUrl
        ) {
          return null;
        }

        return {
          storageKey,
          publicUrl,
          category:
            analysisMeta.body_region ||
            analysisMeta.category ||
            entry.analysis?.analysis?.category ||
            "unknown",
          subcategory: analysisMeta.item_type || null,
          color: analysisMeta.color || null,
          style: analysisMeta.style || null,
          brand:
            analysisMeta.brand ||
            (fileMeta.metadata &&
              typeof (fileMeta.metadata as { brand?: unknown }).brand === "string"
              ? (fileMeta.metadata as { brand?: string }).brand
              : null),
          description:
            analysisMeta.description ||
            analysisMeta.short_description ||
            entry.analysis?.analysis?.detailed_description ||
            "",
          tags: analysisMeta.tags || [],
          originalFilename:
            entry.analysis?.original_filename || entry.file.name,
          mimeType: entry.file.type || null,
        };
      })
      .filter(
        (item): item is NonNullable<typeof item> => item !== null
      );

    if (payload.length === 0) {
      return;
    }

    try {
      const response = await httpClient.post("/api/my/clothing-items", {
        items: payload,
      });
      const savedItems = response.data?.clothingItems || [];
      if (savedItems.length === 0) {
        return;
      }

      const savedMap = new Map<string, (typeof savedItems)[number]>();
      savedItems.forEach((saved: (typeof savedItems)[number]) => {
        if (saved.storage_key) {
          savedMap.set(saved.storage_key, saved);
        }
      });

      setWardrobeItems((prev) =>
        prev.map((entry) => {
          const fileMeta = entry.file as FileWithMetadata;
          const storageKey =
            fileMeta.storage_path ||
            entry.analysis?.storage_path ||
            entry.analysis?.saved_filename;
          const saved = storageKey ? savedMap.get(storageKey) : undefined;

          if (saved) {
          fileMeta.clothing_item_id = saved.id;
          fileMeta.file_url =
            ensureAbsoluteUrl(saved.public_url) || fileMeta.file_url;
            return {
              ...entry,
              clothingItemId: saved.id,
            };
          }

          return entry;
        })
      );
    } catch (error) {
      console.error("Failed to persist clothing items", error);
    }
  }, []);

  const handleBulkUpload = (
    files: File[],
    analyses: AnalyzedItem[],
    shouldReplace: boolean = false
  ) => {
    if (!requireAuth()) {
      return;
    }

    const newItems: ImageWithAnalysis[] = files.map((file, idx) => ({
      file,
      analysis: analyses[idx],
    }));

    if (shouldReplace) {
      // Replace all existing items with new batch
      setWardrobeItems(newItems);
      setBlockedWardrobeIndices(new Set());
      setAdjustingDescriptionIndices(new Set());
      setLastSafetyBlockDetail(null);
      setAdjustDescriptionFeedback(new Map());
    } else {
      // Append new items to existing ones
      setWardrobeItems((prev) => [...prev, ...newItems]);
    }

    void persistClothingItems(newItems);
    console.log('Bulk upload complete. Analyzed items:', analyses);
  };

  const handleItemRemove = (index: number) => {
    setWardrobeItems(prev => prev.filter((_, idx) => idx !== index));
    setBlockedWardrobeIndices(prev => {
      if (prev.size === 0) return prev;
      const next = new Set<number>();
      prev.forEach((value) => {
        if (value === index) return;
        next.add(value > index ? value - 1 : value);
      });
      return next;
    });
    setAdjustingDescriptionIndices(prev => {
      if (prev.size === 0) return prev;
      const next = new Set<number>();
      prev.forEach((value) => {
        if (value === index) return;
        next.add(value > index ? value - 1 : value);
      });
      return next;
    });
    setAdjustDescriptionFeedback(prev => {
      if (prev.size === 0) return prev;
      const next = new Map<number, { tone: 'success' | 'warning' | 'error'; message: string }>();
      prev.forEach((value, key) => {
        if (key === index) return;
        next.set(key > index ? key - 1 : key, value);
      });
      return next;
    });
  };

  const handleItemReplace = (index: number, file: File, analysis: AnalyzedItem) => {
    setWardrobeItems(prev => {
      const newItems = [...prev];
      newItems[index] = { file, analysis };
      return newItems;
    });
    setBlockedWardrobeIndices(prev => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    setAdjustingDescriptionIndices(prev => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    setAdjustDescriptionFeedback(prev => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      next.delete(index);
      return next;
    });
  };

  const handleAdjustDescription = useCallback(async (index: number) => {
    if (!requireAuth()) {
      return;
    }
    const entry = wardrobeItems[index];
    if (!entry) {
      return;
    }

    const fileMeta = entry.file as FileWithMetadata;
    const analysisMeta = entry.analysis?.analysis;
    const baseDescription =
      (
        analysisMeta?.description ||
        analysisMeta?.short_description ||
        fileMeta.detailed_description ||
        (typeof fileMeta.metadata?.description === 'string'
          ? fileMeta.metadata.description
          : '') ||
        ''
      )
        .toString()
        .trim();

    const metadata: Record<string, unknown> = {
      ...(fileMeta.metadata && typeof fileMeta.metadata === 'object' ? fileMeta.metadata : {}),
    };

    if (analysisMeta?.category) metadata.category = analysisMeta.category;
    if (analysisMeta?.item_type) metadata.item_type = analysisMeta.item_type;
    if (analysisMeta?.color) metadata.color = analysisMeta.color;
    if (analysisMeta?.style) metadata.style = analysisMeta.style;
    if (analysisMeta?.brand) metadata.brand = analysisMeta.brand;
    if (analysisMeta?.tags) metadata.tags = analysisMeta.tags;
    if (baseDescription) metadata.description = baseDescription;

    setAdjustingDescriptionIndices(prev => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    setAdjustDescriptionFeedback(prev => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      next.delete(index);
      return next;
    });

    try {
      const backendAuthHeaders = await getBackendAuthHeaders();
      const API_URL = getBackendApiUrl('Description adjustments');
      if (!API_URL) {
        return;
      }
      const response = await httpClient.post(
        `${API_URL}/api/clothing/adjust-description`,
        {
          description: baseDescription,
          metadata,
          strictness: contentBlockWarnedRef.current ? 'max' : 'moderate',
          last_failure: {
            reason: 'content_safety_block',
            detail: lastSafetyBlockDetail || undefined,
          },
        },
        {
          headers: {
            ...backendAuthHeaders,
          },
        }
      );

      const updatedMetadata =
        response?.data?.metadata && typeof response.data.metadata === 'object'
          ? (response.data.metadata as Record<string, unknown>)
          : metadata;
      const updatedDescription =
        typeof response?.data?.description === 'string'
          ? response.data.description
          : typeof updatedMetadata.description === 'string'
          ? (updatedMetadata.description as string)
          : baseDescription;

      setWardrobeItems(prev => {
        if (!prev[index]) return prev;
        const next = [...prev];
        const prevEntry = prev[index];
        const prevFile = prevEntry.file as FileWithMetadata;
        
        // Create a new file object with updated metadata (File objects can't be cloned, so we mutate the existing one)
        // but create a new entry object to ensure React detects the change
        const nextFile = prevFile;
        nextFile.metadata = { ...updatedMetadata };
        if (updatedDescription) {
          nextFile.detailed_description = updatedDescription;
        }
        if (typeof updatedMetadata.category === 'string') {
          nextFile.category = updatedMetadata.category;
        }
        if (typeof updatedMetadata.item_type === 'string') {
          nextFile.item_type = updatedMetadata.item_type;
        }
        if (typeof updatedMetadata.brand === 'string') {
          nextFile.brand = updatedMetadata.brand;
        }

        const fallbackItemType =
          typeof updatedMetadata.item_type === 'string'
            ? updatedMetadata.item_type
            : analysisMeta?.item_type ||
              (updatedDescription
                ? updatedDescription.split(/\s+/).slice(0, 4).join(' ')
                : '');
        const normalizedTags = Array.isArray(updatedMetadata.tags)
          ? updatedMetadata.tags.filter((tag): tag is string => typeof tag === 'string')
          : analysisMeta?.tags || [];
        const nextCategory =
          typeof updatedMetadata.category === 'string'
            ? updatedMetadata.category
            : analysisMeta?.category || analysisMeta?.body_region || 'unknown';

        let updatedAnalysis: AnalyzedItem;
        if (prevEntry.analysis?.analysis) {
          // Create a new analysis object with updated fields
          const newAnalysis = { 
            ...prevEntry.analysis.analysis,
          };
          // Always update description fields when updatedDescription is provided
          if (updatedDescription) {
            newAnalysis.description = updatedDescription;
            newAnalysis.short_description = updatedDescription;
            newAnalysis.detailed_description = updatedDescription;
          }
          if (fallbackItemType) newAnalysis.item_type = fallbackItemType;
          newAnalysis.category = nextCategory;
          newAnalysis.body_region = newAnalysis.body_region || nextCategory;
          newAnalysis.tags = normalizedTags;
          newAnalysis.metadata = { ...(newAnalysis.metadata || {}), ...updatedMetadata };
          if (typeof updatedMetadata.color === 'string') newAnalysis.color = updatedMetadata.color;
          if (typeof updatedMetadata.style === 'string') newAnalysis.style = updatedMetadata.style;
          if (typeof updatedMetadata.brand === 'string') newAnalysis.brand = updatedMetadata.brand;
          
          updatedAnalysis = { 
            ...prevEntry.analysis, 
            analysis: newAnalysis, 
            status: 'success' as const 
          };
        } else {
          updatedAnalysis = {
            index,
            original_filename:
              prevEntry.analysis?.original_filename || prevEntry.file.name,
            analysis: {
              body_region: nextCategory,
              category: nextCategory,
              item_type: fallbackItemType || undefined,
              brand:
                typeof updatedMetadata.brand === 'string'
                  ? updatedMetadata.brand
                  : analysisMeta?.brand || undefined,
              short_description: updatedDescription || undefined,
              description: updatedDescription || undefined,
              detailed_description: updatedDescription || undefined,
              suggested_filename:
                prevEntry.analysis?.analysis?.suggested_filename ||
                prevEntry.analysis?.saved_filename ||
                prevEntry.file.name,
              color:
                typeof updatedMetadata.color === 'string'
                  ? updatedMetadata.color
                  : analysisMeta?.color || undefined,
              style:
                typeof updatedMetadata.style === 'string'
                  ? updatedMetadata.style
                  : analysisMeta?.style || undefined,
              tags: normalizedTags,
              metadata: { ...updatedMetadata },
            },
            file_url: prevEntry.analysis?.file_url,
            saved_filename: prevEntry.analysis?.saved_filename,
            storage_path: prevEntry.analysis?.storage_path,
            status: 'success' as const,
          };
        }

        // Create a completely new entry object to ensure React detects the change
        next[index] = { 
          file: nextFile, 
          analysis: updatedAnalysis,
          clothingItemId: prevEntry.clothingItemId
        };
        return next;
      });

      const clothingItemId = entry.clothingItemId || fileMeta.clothing_item_id;
      let persistFailure: unknown = null;
      if (clothingItemId) {
        const resolvedTags = Array.isArray(updatedMetadata.tags)
          ? updatedMetadata.tags.filter((tag): tag is string => typeof tag === 'string')
          : analysisMeta?.tags || [];
        const resolvedCategory =
          typeof updatedMetadata.category === 'string'
            ? updatedMetadata.category
            : analysisMeta?.category || analysisMeta?.body_region || null;
        const resolvedSubcategory =
          typeof updatedMetadata.subcategory === 'string'
            ? updatedMetadata.subcategory
            : typeof updatedMetadata.item_type === 'string'
            ? updatedMetadata.item_type
            : analysisMeta?.item_type || null;
        const resolvedColor =
          typeof updatedMetadata.color === 'string' ? updatedMetadata.color : analysisMeta?.color || null;
        const resolvedStyle =
          typeof updatedMetadata.style === 'string' ? updatedMetadata.style : analysisMeta?.style || null;
        const resolvedBrand =
          typeof updatedMetadata.brand === 'string' ? updatedMetadata.brand : analysisMeta?.brand || null;

        try {
          await httpClient.patch(`/api/my/clothing-items/${clothingItemId}`, {
            description: updatedDescription || baseDescription,
            category: resolvedCategory,
            subcategory: resolvedSubcategory,
            color: resolvedColor,
            style: resolvedStyle,
            brand: resolvedBrand,
            tags: resolvedTags,
          });
        } catch (persistError) {
          console.warn("Failed to persist adjusted description", persistError);
          persistFailure = persistError;
        }
      }

      setBlockedWardrobeIndices(prev => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      setAdjustDescriptionFeedback(prev => {
        const next = new Map(prev);
        if (persistFailure) {
          next.set(index, {
            tone: 'warning',
            message: 'Updated locally, but failed to save. Try again.',
          });
        } else {
          next.set(index, {
            tone: 'success',
            message: 'Description updated.',
          });
        }
        return next;
      });
    } catch (error) {
      console.error("Failed to adjust description", error);
      setError("Could not adjust the description. Please try again.");
      setAdjustDescriptionFeedback(prev => {
        const next = new Map(prev);
        next.set(index, {
          tone: 'error',
          message: 'Adjustment failed. Please try again.',
        });
        return next;
      });
    } finally {
      setAdjustingDescriptionIndices(prev => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  }, [getBackendAuthHeaders, lastSafetyBlockDetail, requireAuth, wardrobeItems]);

  // Handler for "Try On Any URL" feature - when a product is scraped from a URL
  const handleProductScraped = useCallback(async (
    product: { title: string; price?: string; currency?: string; imageUrl: string; description?: string; brand?: string; category?: string; productUrl: string },
    imageFile: File
  ) => {
    if (!requireAuth()) return;

    // Check wardrobe limit
    if (wardrobeItems.length >= 5) {
      const confirmed = window.confirm(
        'Your wardrobe is full (5 items). Would you like to start a new wardrobe with this item?'
      );
      if (!confirmed) return;
      // Clear existing items to make room
      setWardrobeItems([]);
      setBlockedWardrobeIndices(new Set());
      setAdjustingDescriptionIndices(new Set());
      setLastSafetyBlockDetail(null);
      setAdjustDescriptionFeedback(new Map());
    }

    // Create analysis object from scraped product data
    const analysis: AnalyzedItem = {
      index: wardrobeItems.length >= 5 ? 0 : wardrobeItems.length,
      original_filename: imageFile.name,
      analysis: {
        body_region: product.category?.toLowerCase().includes('pant') || product.category?.toLowerCase().includes('jean') || product.category?.toLowerCase().includes('skirt') 
          ? 'lower_body' 
          : product.category?.toLowerCase().includes('shoe') || product.category?.toLowerCase().includes('boot')
          ? 'shoes'
          : 'upper_body',
        category: product.category?.toLowerCase().includes('pant') || product.category?.toLowerCase().includes('jean') || product.category?.toLowerCase().includes('skirt') 
          ? 'lower_body' 
          : product.category?.toLowerCase().includes('shoe') || product.category?.toLowerCase().includes('boot')
          ? 'shoes'
          : 'upper_body',
        item_type: product.category || undefined,
        brand: product.brand || undefined,
        short_description: product.title || undefined,
        description: product.description || product.title || undefined,
        suggested_filename: imageFile.name,
        tags: product.brand ? [product.brand] : [],
      },
      file_url: product.imageUrl,
      saved_filename: imageFile.name,
      status: 'success',
    };

    // Add metadata to file
    const fileWithMeta = imageFile as FileWithMetadata;
    fileWithMeta.category = analysis.analysis?.category;
    fileWithMeta.item_type = analysis.analysis?.item_type;
    fileWithMeta.brand = product.brand;
    fileWithMeta.detailed_description = product.description || product.title;
    fileWithMeta.file_url = product.imageUrl;

    const newEntry: ImageWithAnalysis = {
      file: fileWithMeta,
      analysis,
    };

    if (wardrobeItems.length >= 5) {
      setWardrobeItems([newEntry]);
    } else {
      setWardrobeItems(prev => [...prev, newEntry]);
    }

    // Persist the clothing item
    void persistClothingItems([newEntry]);

    console.log('Product added from URL:', product.title, product.productUrl);
  }, [requireAuth, wardrobeItems.length, persistClothingItems]);

  const shopSaveReadyItems = useMemo<ShopSaveClothingItem[]>(() => {
    return wardrobeItems.reduce<ShopSaveClothingItem[]>((acc, entry) => {
      const analysisMeta = entry.analysis?.analysis;
      const fileMeta = entry.file as FileWithMetadata;
      const id = entry.clothingItemId || fileMeta.clothing_item_id;
      const publicUrl = ensureAbsoluteUrl(
        fileMeta.file_url || entry.analysis?.file_url || null
      );

      if (!analysisMeta || !id || !publicUrl) {
        return acc;
      }

      acc.push({
        id,
        public_url: publicUrl || '',
        category:
          analysisMeta.body_region ||
          analysisMeta.category ||
          'unknown',
        subcategory: analysisMeta.item_type || null,
        color: analysisMeta.color || null,
        style: analysisMeta.style || null,
        brand:
          analysisMeta.brand ||
          (fileMeta.metadata &&
            typeof (fileMeta.metadata as { brand?: unknown }).brand === "string"
            ? (fileMeta.metadata as { brand?: string }).brand
            : null),
        description:
          analysisMeta.description ||
          analysisMeta.short_description ||
          '',
        tags: analysisMeta.tags || [],
        original_filename:
          entry.analysis?.original_filename || entry.file.name,
        created_at: new Date().toISOString(),
      });

      return acc;
    }, []);
  }, [wardrobeItems]);

  const createWardrobeEntryFromSavedItem = useCallback(
    async (item: ShopSaveClothingItem): Promise<ImageWithAnalysis> => {
      const fileUrl = ensureAbsoluteUrl(item.public_url) || item.public_url;
      if (!fileUrl) {
        throw new Error("Saved item is missing a file URL.");
      }
      const response = await fetch(fileUrl);
      if (!response.ok) {
        let host = "unknown";
        try {
          host = new URL(fileUrl).host || host;
        } catch {
          // ignore invalid URL parsing; keep fallback
        }
        throw new Error(
          `Could not download saved item (status ${response.status}) from ${host}.`
        );
      }
      const blob = await response.blob();
      const filename =
        item.original_filename ||
        item.subcategory ||
        item.description ||
        "saved-item.jpg";
      const file = new File([blob], filename, {
        type: blob.type || "image/jpeg",
      }) as FileWithMetadata;
      file.clothing_item_id = item.id;
      file.file_url = fileUrl;
      if (item.brand) {
        file.brand = item.brand;
      }

      const analysis: AnalyzedItem = {
        index: 0,
        original_filename: filename,
        analysis: {
          body_region: item.category || "unknown",
          category: item.category || "unknown",
          item_type: item.subcategory || undefined,
          brand: item.brand || undefined,
          short_description:
            item.description || item.subcategory || filename || "Saved item",
          description: item.description || undefined,
          suggested_filename: filename,
          color: item.color || undefined,
          style: item.style || undefined,
          tags: item.tags || [],
        },
        file_url: fileUrl,
        saved_filename: filename,
      storage_path: undefined,
      };

      return {
        file,
        analysis,
        clothingItemId: item.id,
      };
    },
    []
  );

  const addSavedItemToWardrobe = useCallback(
    async (item: ShopSaveClothingItem, replaceAll = false) => {
      const entry = await createWardrobeEntryFromSavedItem(item);
      if (replaceAll) {
        setBlockedWardrobeIndices(new Set());
        setAdjustingDescriptionIndices(new Set());
        setLastSafetyBlockDetail(null);
        setAdjustDescriptionFeedback(new Map());
      }
      setWardrobeItems((prev) => (replaceAll ? [entry] : [...prev, entry]));
    },
    [createWardrobeEntryFromSavedItem]
  );

  const handleTryAgainFromSaved = useCallback(
    async (item: ShopSaveClothingItem) => {
      if (!requireAuth()) {
        return;
      }
      if (!item?.id) {
        setError("Saved item is missing required data.");
        return;
      }
      try {
        setIsAddingSavedItem(true);
        if (wardrobeItems.length >= 5) {
          setPendingSavedItem(item);
          setShowWardrobeLimitModal(true);
          return;
        }
        await addSavedItemToWardrobe(item);
      } catch (error) {
        console.error("Failed to re-add saved item", error);
        setError("Could not add saved item. Please try again.");
      } finally {
        setIsAddingSavedItem(false);
      }
    },
    [addSavedItemToWardrobe, requireAuth, wardrobeItems.length]
  );

  const handleConfirmNewWardrobe = useCallback(async () => {
    if (!pendingSavedItem) {
      setShowWardrobeLimitModal(false);
      return;
    }
    try {
      setIsAddingSavedItem(true);
      await addSavedItemToWardrobe(pendingSavedItem, true);
    } catch (error) {
      console.error("Failed to start new wardrobe with saved item", error);
      setError("Could not start a new wardrobe. Please try again.");
    } finally {
      setIsAddingSavedItem(false);
      setPendingSavedItem(null);
      setShowWardrobeLimitModal(false);
    }
  }, [addSavedItemToWardrobe, pendingSavedItem]);

  const handleDismissWardrobeLimit = useCallback(() => {
    setPendingSavedItem(null);
    setShowWardrobeLimitModal(false);
  }, []);

  // Save outfit to My Outfits (persistent storage via API)
  const saveOutfitToMyOutfits = async (imageUrl: string, clothingFiles: File[], wardrobeItemsData: typeof wardrobeItems) => {
    try {
      const clothingItems = wardrobeItemsData.map((item, _idx) => ({
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
      const response = await httpClient.post('/api/my/outfits', {
        imageUrl,
        clothingItems,
      });

      // Dispatch custom event to notify MyOutfits component to refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('outfitSaved'));
      }
      
      console.log('Outfit saved to My Outfits:', response.data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error saving outfit to My Outfits:', error);
      // Don't throw - this is non-critical, but log for debugging
      if (error.response?.status === 401) {
        console.warn('User not authenticated, outfit not saved');
      }
    }
  };

  const handleGenerate = async () => {
    console.log("handleGenerate called", { userImagesCount: userImages.length, wardrobeItems: wardrobeItems.length, billing, isOnTrial });
    
    // Prevent multiple simultaneous calls
    if (isGenerating) {
      console.log("Already generating, ignoring duplicate call");
      return;
    }

    if (!requireAuth()) {
      return;
    }
    if (isGenerating) {
      return;
    }

    if (lacksCredits) {
      redirectToPricing();
      return;
    }
    
    if (userImages.length === 0) {
      const errorMsg = "Please upload at least one photo of yourself.";
      console.log("Validation failed:", errorMsg);
      setError(errorMsg);
      return;
    }
    
    const activeWardrobeItems = wardrobeItems.slice(0, 5);
    const activeFiles = activeWardrobeItems.map(item => item.file);

    if (activeFiles.length === 0) {
      const errorMsg = "Please upload at least one clothing item.";
      console.log("Validation failed:", errorMsg);
      setError(errorMsg);
      return;
    }

    // Check credits before proceeding (unless on trial or bypass user)
    if (lacksCredits) {
      console.log("No credits available, redirecting to pricing");
      redirectToPricing();
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
        redirectToPricing();
        return;
      }
    }

    // Cancel any existing request
    if (abortController) {
      abortController.abort();
    }

    // Reset state for new generation
    creditLoggedRef.current = false;
    trialConsumedRef.current = false;
    creditHoldAppliedRef.current = false;
    if (resultImageLoadTimerRef.current) {
      clearTimeout(resultImageLoadTimerRef.current);
      resultImageLoadTimerRef.current = null;
    }
    setIsTryOnLoading(true);
    setIsGenerating(true);

    // Scroll to Virtual Mirror after loading state is set so user sees the loader
    requestAnimationFrame(() => {
      scrollToVirtualMirror();
    });
    setError(null);
    setProducts([]);
    setIsProductSearchLoading(false);
    setProductSearchAttempted(false);
    setProductSearchError(null);
    // Clear previous image to show loading state immediately
    setGeneratedImage(null);
    setIsPreviewResult(false);
    setHasShownPaywallAfterResult(false);
    setShowPaywall(false);

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

    let preparedTryOnFiles: File[] = [];

    let requestId: string | null = null;

    try {
      const ingestUrl = process.env.NEXT_PUBLIC_INGEST_URL;
      const logIngest = (payload: Record<string, unknown>) => {
        if (!ingestUrl) return;
        fetch(ingestUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {});
      };
      // Get API URL from environment or fail with guidance
      const API_URL = getBackendApiUrl('Try-on');
      if (!API_URL) {
        setIsTryOnLoading(false);
        setIsGenerating(false);
        console.error = originalError;
        return;
      }
      console.log("Using API URL:", API_URL);
      
      // Wake up Render service first (health check)
      console.log("Waking up Render service...");
      try {
        const healthCheck = await httpClient.get(`${API_URL}/`, { timeout: 180000 }); // 3 minutes
        console.log("Service is awake:", healthCheck.data);
      } catch (wakeError: unknown) {
        const error = wakeError instanceof Error ? wakeError : new Error(String(wakeError));
        console.warn("Health check failed (service may be waking up):", error.message);
        // Continue anyway - service might still be waking up
      }

      // Step 1: Call Try-On API (sequential execution - must succeed before product search)
      let tryOnRes;
      try {
        requestId = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `req-${Date.now()}`;
        const tryOnFormData = new FormData();
        // Append all user images
        userImages.forEach((img) => {
          tryOnFormData.append('user_images', img);
        });
        
        // Also append the first one as 'user_image' for backward compatibility
        if (userImages.length > 0) {
           tryOnFormData.append('user_image', userImages[0]);
        }

      // Send main reference index (current first image after any reordering)
      tryOnFormData.append('main_index', '0');

        preparedTryOnFiles = activeWardrobeItems.map(item => item.file);

        setLastRequestId(requestId);
        captureEvent(ANALYTICS_EVENTS.TRY_ON_ATTEMPT, {
          request_id: requestId,
          wardrobe_items: activeWardrobeItems.length,
          user_images: userImages.length,
          plan: billing?.plan ?? 'free',
          credits_available: billing?.creditsAvailable ?? null,
          free_trial_eligible: isOnTrial,
          bypass: isBypass,
          is_authenticated: isAuthenticated,
        });

        preparedTryOnFiles.forEach((file, index) => {
          if (!file) {
            throw new Error(`Missing file for wardrobe item index ${index}`);
          }
          tryOnFormData.append('clothing_images', file);
        });
        
        console.log(`Trying on ${preparedTryOnFiles.length} item(s) using direct file uploads to preserve ordering`);

        tryOnFormData.append('requestId', requestId);
        tryOnFormData.append('quality', 'standard');

        // Step 1a: Place a credit hold (Next.js API) before the long-running Render request.
        // This ensures credits decrement immediately and are recorded server-side.
        try {
          const holdRes = await httpClient.post(
            '/api/try-on/hold',
            { requestId, quality: 'standard' },
            { headers: { ...(requestId ? { 'X-Request-Id': requestId } : {}) } }
          );
          creditHoldAppliedRef.current = true;
          const creditsAvailable = holdRes?.data?.creditsAvailable;
          const usedFreeTrial = Boolean(holdRes?.data?.usedFreeTrial);
          setIsPreviewResult(usedFreeTrial);
          if (typeof creditsAvailable === 'number') {
            setBilling((prev) => (prev ? { ...prev, creditsAvailable } : prev));
          }
          if (usedFreeTrial) {
            setBilling((prev) => (prev ? { ...prev, trialUsed: true } : prev));
          }
        } catch (holdErr: unknown) {
          // If user has no credits, this endpoint returns 402 + { error: 'no_credits' }
          const h = holdErr as {
            response?: { status?: number; data?: { error?: string; creditsAvailable?: number } };
          };
          if (h.response?.status === 402 || h.response?.data?.error === 'no_credits') {
            redirectToPricing();
            setIsTryOnLoading(false);
            setIsGenerating(false);
            console.error = originalError;
            return;
          }
          throw holdErr;
        }
        
        // Build metadata with per-item wearing styles
        const metadata: Record<string, unknown> = {
          strict_wearing_enforcement: true,
          wearing_instruction_policy: 'non_negotiable',
        };
        const firstWardrobeItem = activeWardrobeItems[0];
        const firstItem = firstWardrobeItem?.file as FileWithMetadata | undefined;
        const firstItemAnalysis = firstWardrobeItem?.analysis?.analysis;
        // Build metadata in the format expected by the system prompt
        if (
          firstItem?.metadata ||
          firstItem?.category ||
          firstItem?.detailed_description ||
          firstItemAnalysis
        ) {
          const metaRecord =
            (firstItem?.metadata && typeof firstItem.metadata === 'object'
              ? (firstItem.metadata as Record<string, unknown>)
              : {}) || {};

          const derivedStyle =
            (metaRecord.style as string | undefined) ||
            firstItemAnalysis?.style ||
            undefined;
          if (derivedStyle) {
            metadata.style = derivedStyle; // e.g., "studio", "streetwear", "mirror selfie"
          }
          
          // Default to full body framing for fashion try-on
          metadata.framing = "full_body"; // or "three_quarter", "waist_up"
          
          // Include any additional metadata as "extras"
          const extras: Record<string, unknown> = {};
          if (metaRecord.color) extras.color = metaRecord.color;
          if (metaRecord.material) extras.material = metaRecord.material;
          if (metaRecord.fit) extras.fit = metaRecord.fit;
          if (!extras.color && firstItemAnalysis?.color) extras.color = firstItemAnalysis.color;
          if (!extras.material && firstItemAnalysis?.tags?.length) {
            extras.tags = firstItemAnalysis.tags;
          }
          if (!extras.fit && firstItemAnalysis?.style) {
            extras.style_hint = firstItemAnalysis.style;
          }
          if (firstItem?.detailed_description) {
            extras.detailed_description = firstItem.detailed_description;
          }
          if (!extras.detailed_description && firstWardrobeItem?.analysis?.analysis?.description) {
            extras.detailed_description = firstWardrobeItem.analysis.analysis.description;
          }
          if (Object.keys(extras).length > 0) {
            metadata.extras = extras;
          }
        }
        
        type WearingContext = {
          index: number;
          descriptor: string;
          promptText: string;
          wearingStyle: string;
          category: string;
          itemType: string;
        };
        
        const wearingContexts: WearingContext[] = activeWardrobeItems
          .map((wardrobeItem, index) => {
            const fileItem = wardrobeItem.file as FileWithMetadata;
            const wearingStyle = fileItem?.wearing_style;
            if (!wearingStyle) {
              return null;
            }

            const analysisData = wardrobeItem.analysis?.analysis;
            const rawCategory =
              fileItem?.category ||
              analysisData?.category ||
              analysisData?.body_region ||
              "unknown";
            const rawItemType =
              fileItem?.item_type ||
              analysisData?.item_type ||
              "";
            const descriptor =
              (rawItemType ||
                analysisData?.short_description ||
                analysisData?.detailed_description ||
                rawCategory ||
                `item ${index + 1}`).replace(/\s+/g, " ").trim();

            const promptText =
              getWearingStylePromptText(
                rawCategory,
                rawItemType || analysisData?.item_type,
                wearingStyle
              ) || wearingStyle.replace(/_/g, " ");
            const normalizedPrompt = promptText.replace(/\s+/g, " ").trim();

            if (!normalizedPrompt) {
              return null;
            }

            return {
              index,
              descriptor,
              promptText: normalizedPrompt,
              wearingStyle,
              category: rawCategory || "unknown",
              itemType: rawItemType || rawCategory || "",
            };
          })
          .filter((ctx): ctx is WearingContext => Boolean(ctx));
        
        const itemWearingInstructions = wearingContexts.map(
          (ctx) =>
            `MANDATORY: The ${ctx.descriptor} must be ${ctx.promptText}. This overrides any defaults—do not depict it differently.`
        );
        
        if (itemWearingInstructions.length > 0) {
          metadata.wearing_instructions = itemWearingInstructions;
          metadata.wearing_instruction_summary = itemWearingInstructions.join(' ');
          metadata.enforced_items_count = itemWearingInstructions.length;
        }
        
        // Add per-item wearing styles metadata
        const itemsMetadata = wearingContexts.map((ctx) => ({
          index: ctx.index,
          category: ctx.category || 'unknown',
          item_type: ctx.itemType || '',
          wearing_style: ctx.wearingStyle,
          descriptor: ctx.descriptor,
          prompt_text: ctx.promptText,
        }));
        
        if (itemsMetadata.length > 0) {
          metadata.items_wearing_styles = itemsMetadata;
        }
        
        const inferredCategory =
          firstItem?.category ||
          firstItemAnalysis?.category ||
          firstItemAnalysis?.body_region ||
          'upper_body';
        
        tryOnFormData.append('garment_metadata', JSON.stringify(metadata));
        tryOnFormData.append('category', inferredCategory);
        console.log("Using analyzed metadata for try-on:", metadata);

        console.log("Starting try-on generation...");
        // #region agent log
        logIngest({location:'page.tsx:640',message:'Frontend try-on request starting',data:{apiUrl:API_URL,userImagesCount:userImages.length,clothingItemsCount:preparedTryOnFiles.length,metadataKeys:Object.keys(metadata)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'});
        // #endregion
        const backendAuthHeaders = await getBackendAuthHeaders();
        tryOnRes = await withRetry(
          () =>
            httpClient.post(`${API_URL}/api/try-on`, tryOnFormData, {
              headers: {
                'Content-Type': 'multipart/form-data',
                ...(requestId ? { 'X-Request-Id': requestId } : {}),
                ...backendAuthHeaders,
              },
              timeout: 600000, // 10 minutes for Render wake-up + VTON generation
              signal: controller.signal,
            }),
          1,
          2000
        );
        // #region agent log
        logIngest({location:'page.tsx:646',message:'Frontend try-on request succeeded',data:{status:tryOnRes?.status,hasImageUrl:!!tryOnRes?.data?.image_url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'});
        // #endregion

        // Render stack does not manage billing; keep preview state from the hold call above.
        // (If Render happens to return usedFreeTrial, we still respect it.)
        setIsPreviewResult(Boolean(tryOnRes?.data?.usedFreeTrial) || isPreviewResult);
        setModestyApplied(Boolean(tryOnRes?.data?.modesty_applied));
        setBlockedWardrobeIndices(new Set());
        setLastSafetyBlockDetail(null);

        if (tryOnRes.data.image_url) {
          // Reset content-block warning state after a successful generation
          contentBlockWarnedRef.current = false;
          const imageUrl = tryOnRes.data.image_url;
          
          captureEvent(ANALYTICS_EVENTS.TRY_ON_SUCCESS, {
            request_id: requestId,
            used_free_trial: Boolean(tryOnRes?.data?.usedFreeTrial),
            plan: billing?.plan ?? 'free',
            credits_available: billing?.creditsAvailable ?? null,
            wardrobe_items: preparedTryOnFiles.length,
            user_images: userImages.length,
          });
          if (tryOnRes?.data?.usedFreeTrial) {
            captureEvent(ANALYTICS_EVENTS.FREE_TRY_ON_COMPLETED, {
              request_id: requestId,
              plan: billing?.plan ?? 'free',
              credits_available: billing?.creditsAvailable ?? null,
            });
          }
          
          // For data URLs (base64), we can't add a timestamp, but React will update if the URL changes
          // For regular URLs, add timestamp to force refresh on repeated uses
          let finalImageUrl = imageUrl;
          if (!imageUrl.startsWith('data:')) {
            finalImageUrl = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
          }
          
          // Force state update by setting to null first, then to new URL
          // Finalize the hold for audit purposes (idempotent; does not change visible balance).
          if (creditHoldAppliedRef.current && requestId) {
            httpClient
              .post('/api/try-on/finalize', { requestId })
              .catch((e) => console.warn('Failed to finalize credit hold', e));
          }
          if (resultImageLoadTimerRef.current) {
            clearTimeout(resultImageLoadTimerRef.current);
            resultImageLoadTimerRef.current = null;
          }
          resultImageLoadTimerRef.current = setTimeout(() => {
            setIsTryOnLoading(false);
          }, 20000);
          setGeneratedImage(null);
          // Use requestAnimationFrame to ensure DOM update
          requestAnimationFrame(() => {
            setGeneratedImage(finalImageUrl);
            console.log("Try-on completed successfully");
          });
          
          // Save to My Outfits (use original URL)
          saveOutfitToMyOutfits(imageUrl, preparedTryOnFiles, wardrobeItems);
          
          // Mark trial as used if backend reported free trial consumption (idempotent)
          if (tryOnRes?.data?.usedFreeTrial || (billing && !billing.trialUsed)) {
            try {
              await httpClient.post('/api/my/trial/consume');
          trialConsumedRef.current = true;
          setBilling((prev) => (prev ? { ...prev, trialUsed: true } : prev));
          // Track trial consumption for n8n automation
          trackTrialConsumed(requestId || undefined);
            } catch (consumeErr) {
              console.warn('Failed to mark trial consumed client-side', consumeErr);
            }
          }

          // Track outfit generation for n8n automation
          trackOutfitGenerated(requestId || '', preparedTryOnFiles.length);

          // Refresh billing info after successful try-on
          if (isLoaded && user) {
            fetchBilling();
          }
        } else {
          throw new Error("No image URL returned from try-on API");
        }
      } catch (tryOnError: unknown) {
        const error = tryOnError as { name?: string; code?: string; response?: { status?: number; data?: { error?: string; detail?: string } }; message?: string };
        // #region agent log
        logIngest({location:'page.tsx:683',message:'Frontend try-on request failed',data:{errorName:error?.name,errorCode:error?.code,status:error?.response?.status,errorDetail:error?.response?.data?.detail,errorData:error?.response?.data,errorMessage:error?.message,fullError:JSON.stringify(error?.response?.data||{})},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'});
        // #endregion
        if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
          try {
            if (requestId) {
              await httpClient.post('/api/try-on/cancel', { requestId });
            }
          } catch {
            // ignore
          }
          setError('Operation cancelled');
          setIsTryOnLoading(false);
          setIsGenerating(false);
          console.error = originalError;
          return;
        }
        
        // Handle no credits error
        if (error.response?.status === 402 || error.response?.data?.error === 'no_credits') {
          redirectToPricing();
          setIsTryOnLoading(false);
          setIsGenerating(false);
          console.error = originalError;
          return;
        }

        // On non-cancel failure, release the hold so the user gets credits back.
        if (creditHoldAppliedRef.current && requestId) {
          try {
            await httpClient.post('/api/try-on/cancel', { requestId });
          } catch (releaseErr) {
            console.warn('Failed to release credit hold after try-on failure', releaseErr);
          }
        }

        const detail = error.response?.data?.detail || error.response?.data?.error || '';
        const detailText = typeof detail === 'string' ? detail : '';
        const status = error.response?.status;
        const looksLikeBlockedByPolicy =
          /blocked|safety filter|image_safety|content/i.test(detailText.toLowerCase());
        const looksLikeNoImageAfterRetries =
          /no image generated after\s*4\s*attempts/i.test(detailText) ||
          /finish reason:\s*image_/i.test(detailText);

        // Some backend failures currently surface as 500 with the "No image generated after 4 attempts..."
        // string. Treat those as content blocks for the warning/penalty flow as well.
        const isContentBlocked =
          (status === 422 || status === 500) &&
          (looksLikeBlockedByPolicy || looksLikeNoImageAfterRetries);

        if (isContentBlocked) {
          setBlockedWardrobeIndices(new Set(activeWardrobeItems.map((_, idx) => idx)));
          setAdjustDescriptionFeedback(new Map());
          if (detailText) {
            setLastSafetyBlockDetail(detailText);
          } else if (typeof error?.message === 'string') {
            setLastSafetyBlockDetail(error.message);
          }
          // First content-block after backend automatic retries: warn user.
          if (!contentBlockWarnedRef.current) {
            contentBlockWarnedRef.current = true;
            setError(
              "Your try-on was blocked by content safety filters (after automatic retries). " +
                "Please choose a more modest item or adjust the clothing description. " +
                "Warning: if your next attempt is blocked again for the same reason, 1 credit will be deducted."
            );
            setIsTryOnLoading(false);
            setIsGenerating(false);
            console.error = originalError;
            return;
          }

          // Second (or later) blocked attempt after warning: apply 1-credit penalty (idempotent by requestId).
          try {
            if (requestId) {
              const penaltyRes = await httpClient.post('/api/my/credits/content-block-penalty', { requestId });
              const creditsAvailable = penaltyRes?.data?.creditsAvailable;
              if (typeof creditsAvailable === 'number') {
                setBilling((prev) => (prev ? { ...prev, creditsAvailable } : prev));
              } else {
                // Fallback to a refresh
                if (isLoaded && user) fetchBilling();
              }
            }
            setError(
              "Your try-on was blocked again by content safety filters. " +
                "1 credit has been deducted. Please choose a different (more modest) item or adjust the description and try again."
            );
          } catch (penaltyErr: unknown) {
            const pErr = penaltyErr as { response?: { status?: number; data?: { error?: string } } };
            if (pErr.response?.status === 402 || pErr.response?.data?.error === 'no_credits') {
              redirectToPricing();
            } else {
              setError(
                "Your try-on was blocked again by content safety filters. " +
                  "We could not apply the credit deduction automatically—please refresh and try again."
              );
            }
          } finally {
            setIsTryOnLoading(false);
            setIsGenerating(false);
            console.error = originalError;
          }
          return;
        }
        
        console.error("Error in try-on:", tryOnError);
        // Log full error response for debugging
        if (error.response?.data) {
          console.error("Full error response:", JSON.stringify(error.response.data, null, 2));
        }
        const errorMessage = error.code === 'ECONNABORTED' || error.message?.includes('timeout')
          ? `The try-on is taking longer than expected. This usually means our servers are busy. Please try again in a few moments.`
          : error.response?.data?.detail || error.response?.data?.error || error.message || "We couldn't generate your try-on. Please check your photos and try again.";
        setError(`Try-on failed: ${errorMessage}`);
        setIsTryOnLoading(false);
        setIsGenerating(false);
        console.error = originalError; // Restore original error handler
        return; // Stop execution if try-on fails
      }

      // Step 2: Call Identify & Shop API (only if try-on succeeded)
      try {
        setIsProductSearchLoading(true);
        setProductSearchAttempted(true);
        setProductSearchError(null);

        console.log("Starting product identification...");
        const identifyFormData = new FormData();
        const primaryTryOnFile = preparedTryOnFiles[0] || activeWardrobeItems[0]?.file;
        if (!primaryTryOnFile) {
          throw new Error('No clothing item available for product identification');
        }
        identifyFormData.append('clothing_image', primaryTryOnFile);
        const identifyAuthHeaders = await getBackendAuthHeaders();
        const analysisRes = await withRetry(
          () =>
            httpClient.post(`${API_URL}/api/identify-products`, identifyFormData, {
              headers: { 'Content-Type': 'multipart/form-data', ...identifyAuthHeaders },
              timeout: 600000, // 10 minutes for Render wake-up + Gemini processing
              signal: controller.signal,
            }),
          1,
          2000
        );
        
        const searchQueryRaw =
          typeof analysisRes.data?.search_query === 'string'
            ? analysisRes.data.search_query
            : '';

        // Fallback query if Gemini didn't return `search_query`
        const fallbackQuery = (() => {
          const wardrobePrimary = activeWardrobeItems[0];
          const analysis = wardrobePrimary?.analysis?.analysis;
          const fileMeta = wardrobePrimary?.file as FileWithMetadata | undefined;

          const brand = (analysis?.brand || fileMeta?.brand || '').toString().trim();
          const color = (analysis?.color || '').toString().trim();
          const itemType = (analysis?.item_type || '').toString().trim();
          const category = (analysis?.category || analysis?.body_region || '').toString().trim();
          const desc = (
            analysis?.short_description ||
            analysis?.description ||
            ''
          )
            .toString()
            .trim();

          const parts = [brand, color, itemType || category, desc]
            .map((p) => p.trim())
            .filter(Boolean)
            .filter((p) => p.toLowerCase() !== 'unknown');

          const q = parts.join(' ').replace(/\s+/g, ' ').trim();
          return q.length >= 6 ? q : '';
        })();

        const queryToUse = searchQueryRaw.trim() || fallbackQuery;

        if (queryToUse) {
          console.log("Product identification successful, searching for products...");
          const shopFormData = new FormData();
          shopFormData.append('query', queryToUse);
          const shopAuthHeaders = await getBackendAuthHeaders();
          const shopRes = await withRetry(
            () =>
              httpClient.post(`${API_URL}/api/shop`, shopFormData, {
                headers: { 'Content-Type': 'multipart/form-data', ...shopAuthHeaders },
                timeout: 60000, // 1 minute for product search
                signal: controller.signal,
              }),
            1,
            1500
          );
          
          const results = Array.isArray(shopRes.data?.results)
            ? (shopRes.data.results as Product[])
            : [];
          setProducts(results);
          if (results.length > 0) {
            console.log("Product search completed successfully");
          } else {
            setProductSearchError("No products found for this item.");
            console.warn("Product search returned 0 results", { queryToUse });
          }
        } else {
          console.warn("No search query returned from product identification");
          const geminiError =
            typeof analysisRes.data?.error === 'string' ? analysisRes.data.error : null;
          setProductSearchError(
            geminiError
              ? `Product identification failed: ${geminiError}`
              : "Could not identify this item well enough to search for it."
          );
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
          setProductSearchError("Shop the look timed out. Please try again in a moment.");
        } else if (typeof error.message === 'string' && error.message.trim()) {
          setProductSearchError(error.message);
        } else {
          setProductSearchError("Shop the look failed to load. Your try-on is still saved.");
        }
      } finally {
        setIsProductSearchLoading(false);
      }

    } catch (err: unknown) {
      const error = err as { name?: string; code?: string; response?: { status?: number; data?: { detail?: string } }; message?: string };
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        setError('Operation cancelled');
        setIsTryOnLoading(false);
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
      setIsTryOnLoading(false);
    } finally {
      setIsGenerating(false);
      // Clean up abort controller
      if (controller) {
        setAbortController(null);
      }
      if (!creditLoggedRef.current && !trialConsumedRef.current) {
        setIsTryOnLoading(false);
      }
      console.error = originalError; // Restore original error handler
    }
  };

  return (
    <main className="min-h-screen bg-white text-black font-sans">
      {/* Header */}
      <header
        ref={stickyHeaderRef}
        className="border-b border-white/10 sticky top-0 bg-[#2C2C2C]/95 backdrop-blur-md z-50 safe-area-inset text-white"
      >
        <div className="w-full px-3 sm:px-6 lg:px-10 py-2.5 sm:py-3 md:py-4 flex items-center justify-between gap-4">
          <div className="flex items-center flex-shrink-0">
            <Image 
              src="/main logo.png" 
              alt="IGETDRESSED.ONLINE logo" 
              width={5065}
              height={1042}
              priority
              className="h-8 sm:h-10 w-auto object-contain"
              sizes="(max-width: 640px) 180px, 260px"
            />
          </div>
          <nav className="flex items-center gap-2 sm:gap-4 md:gap-6 text-xs sm:text-sm font-medium flex-shrink-0 text-white">
            {isLoaded && user && (
              <>
                {billing ? (
                  <>
                    {isBypass ? (
                      <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-1.5 bg-white/10 border border-white/20 rounded-lg text-white min-h-[36px] sm:min-h-[40px]">
                        <Zap size={14} className="sm:w-4 sm:h-4 flex-shrink-0 text-white" />
                        <span className="hidden sm:inline whitespace-nowrap font-semibold">Unlimited Access</span>
                        <span className="sm:hidden font-semibold">∞</span>
                      </div>
                    ) : (
                      <Link 
                        href="/pricing" 
                        className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-1.5 bg-white/10 hover:bg-white/20 border border-white/30 rounded-lg transition-colors text-white min-h-[36px] sm:min-h-[40px] touch-manipulation"
                      >
                        <CreditCard size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="hidden sm:inline whitespace-nowrap">
                          {isOnTrial ? 'Free Trial' : `${billing.creditsAvailable} credits`}
                        </span>
                        <span className="sm:hidden font-semibold">{billing.creditsAvailable}</span>
                      </Link>
                    )}
                  </>
                ) : billingStatus === 'error' ? (
                  <Link
                    href="/billing"
                    onClick={() => fetchBilling()}
                    title={billingError || 'Billing is temporarily unavailable.'}
                    className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-1.5 bg-white/10 hover:bg-white/20 border border-white/30 rounded-lg transition-colors text-white min-h-[36px] sm:min-h-[40px] touch-manipulation"
                  >
                    <CreditCard size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="hidden sm:inline whitespace-nowrap">Credits unavailable</span>
                    <span className="sm:hidden font-semibold">--</span>
                  </Link>
                ) : null}
              </>
            )}
            <div className="hidden md:flex items-center gap-6">
              <Link href="/pricing" className="hover:text-gray-200 transition-colors whitespace-nowrap">Pricing</Link>
              <Link href="/how-it-works" className="hover:text-gray-200 transition-colors whitespace-nowrap">How it Works</Link>
              <Link href="/about" className="hover:text-gray-200 transition-colors whitespace-nowrap">About</Link>
            </div>
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-6 md:py-8 pb-28 sm:pb-12 lg:pb-10">
        
        {/* Main Heading */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="sr-only">Virtual Try-On & Shopping</h1>
          <div className="flex justify-center mb-3 sm:mb-4">
            <Link href="/" aria-label="Home" className="inline-flex items-center justify-center">
              <Image
                src="/main logo Black.png"
                alt="IGetDressed.Online"
                width={5065}
                height={1042}
                priority
                className="h-10 sm:h-12 md:h-14 w-auto object-contain"
              />
            </Link>
          </div>
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
              onClick={handleMyOutfitsTab}
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
        
        {/* Admin Billing Diagnostics (bypass users only) */}
        {isBypass && billingStatus === 'error' && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-700 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_15px_rgba(255,0,0,0.15)]">
            <div className="flex items-start gap-2 sm:gap-3 flex-1">
              <CreditCard size={18} className="sm:w-5 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold text-sm sm:text-base">Billing diagnostics (admin)</p>
                <p className="text-xs sm:text-sm text-red-600 mt-0.5">
                  {billingError || 'Billing lookup failed. Check CLERK_SECRET_KEY and DATABASE_URL in Vercel.'}
                </p>
                <p className="text-[11px] sm:text-xs text-red-600/80 mt-1">
                  This panel is visible only to bypass users.
                </p>
              </div>
            </div>
            <button
              onClick={() => fetchBilling()}
              className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              Retry billing
            </button>
          </div>
        )}

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
              href="/pricing"
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-black text-white rounded-lg font-semibold hover:bg-[#7C3AED] transition-colors text-sm shadow-[0_0_15px_rgba(0,0,0,0.5)] text-center min-h-[44px] flex items-center justify-center touch-manipulation"
            >
              Go to Pricing
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
            <Link
              href="/pricing"
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-yellow-500 text-black rounded-lg font-semibold hover:bg-yellow-400 transition-colors text-sm shadow-[0_0_15px_rgba(255,255,0,0.3)] text-center min-h-[44px] flex items-center justify-center touch-manipulation"
            >
              Go to Pricing
            </Link>
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
            <Link
              href="/pricing"
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-400 transition-colors text-sm shadow-[0_0_15px_rgba(255,165,0,0.3)] text-center min-h-[44px] flex items-center justify-center touch-manipulation"
            >
              Go to Pricing
            </Link>
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
            
            <section
              id="choose-wardrobe"
              className={`${cardClass} ${cardPadding} space-y-4`}
            >
              <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2 text-black">
                <span className="bg-black text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-xs font-bold shadow-[0_0_10px_rgba(0,0,0,0.5)]">1</span>
                Upload Yourself
              </h2>
              <UploadZone 
                label="Your Photos" 
                multiple={true}
                maxFiles={5}
                selectedFiles={userImages} 
                showInlineTip={true}
                highlightMainReference={true}
                onOrderChange={(files) => setUserImages(files)}
                onFilesSelect={(files) => {
                  if (!requireAuth()) {
                    return;
                  }
                  setUserImages(files);
                }}
                onClear={() => setUserImages([])}
                isAuthenticated={isAuthenticated}
                onAuthRequired={requireAuth}
                blockedMessage="Please sign in to upload your photo."
                optimizeConfig={{
                  enabled: true,
                  maxSizeMB: 9.5,
                  maxDimension: 2200,
                  // Prevent over-downscaling (keeps faces/details clearer).
                  absoluteMinDimension: 1200,
                  preferredMimeType: 'image/jpeg',
                }}
              />
              <p className="mt-2 text-[11px] sm:text-xs text-black/70">
                Tip: Drag to reorder; the first photo is used as the main reference. Aim for front / 45° / profile in good light.
              </p>
            </section>

            <section className={`${cardClass} ${cardPadding} space-y-4`}>
              <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2 text-black">
                <span className="bg-black text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-xs font-bold shadow-[0_0_10px_rgba(0,0,0,0.5)]">2</span>
                Choose Wardrobe
              </h2>

              {/* Try On Any URL - Competitive Differentiator */}
              <div className="p-3 sm:p-4 rounded-xl border-2 border-dashed border-black/20 bg-gradient-to-r from-violet-50/50 to-purple-50/50">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded-full bg-black text-white text-[10px] font-bold uppercase tracking-wide">New</span>
                  <h3 className="text-sm font-semibold text-black">Try On Any URL</h3>
                </div>
                <TryOnFromUrl
                  onProductScraped={handleProductScraped}
                  isAuthenticated={isAuthenticated}
                  onAuthRequired={requireAuth}
                  disabled={wardrobeItems.length >= 5}
                />
              </div>

              <div className="relative flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-black/10"></div>
                <span className="text-xs font-medium text-black/40 uppercase tracking-wide">or upload images</span>
                <div className="flex-1 h-px bg-black/10"></div>
              </div>

              <BulkUploadZone 
                existingImages={wardrobeItems.map(item => item.file)}
                existingAnalyses={wardrobeItems.map(item => item.analysis).filter((a): a is AnalyzedItem => a !== undefined)}
                onFilesUploaded={handleBulkUpload}
                onItemRemove={handleItemRemove}
                onItemReplace={handleItemReplace}
                blockedItemIndices={blockedWardrobeIndices}
                adjustingItemIndices={adjustingDescriptionIndices}
                adjustDescriptionFeedback={adjustDescriptionFeedback}
                onAdjustDescription={handleAdjustDescription}
                getBackendAuthHeaders={getBackendAuthHeaders}
                isAuthenticated={isAuthenticated}
                onAuthRequired={requireAuth}
                blockedMessage="Please sign in to upload clothing items."
              />
              {wardrobeItems.length > 1 && (
                <div className="mt-3 p-3 bg-black/10 border border-black/30 rounded-lg shadow-[0_0_10px_rgba(0,0,0,0.2)]">
                  <p className="text-sm text-black">
                    💡 <strong>Tip:</strong> You can try on up to 5 items at once for a complete outfit!
                  </p>
                </div>
              )}
            </section>

            <div className={`${cardClass} ${cardPadding} space-y-3`}>
              <button
                onClick={(e) => {
                  try {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log("Try-on button clicked");
                    if (!isAuthenticated) {
                      setError('Please sign in to try on.');
                      return;
                    }
                    if (isGenerating) {
                      console.log("Button clicked but already generating, ignoring");
                      return;
                    }
                    if (lacksCredits) {
                      redirectToPricing();
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
                disabled={!canAttemptTryOn}
                type="button"
                aria-label="Try on clothes"
                className={`
                  w-full py-3.5 sm:py-4 rounded-xl font-bold text-base sm:text-lg flex items-center justify-center gap-2 sm:gap-3 transition-all uppercase tracking-wider
                  min-h-[52px] touch-manipulation select-none
                  ${isGenerating 
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300 pointer-events-none' 
                    : !isAuthenticated
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                    : 'bg-black text-white hover:bg-gray-900 active:bg-gray-800 active:scale-[0.98] border-2 border-black'
                  }
                `}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={18} className="sm:w-5 sm:h-5 animate-spin" />
                    <span>Generating your look...</span>
                  </>
                ) : !isAuthenticated ? (
                  <>
                    <Sparkles size={18} className="sm:w-5 sm:h-5" />
                    <span>Sign in to try on</span>
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
                  className="text-sm text-black hover:text-[#7C3AED] underline w-full text-center"
                  aria-label="Cancel operation"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-5 space-y-3 sm:space-y-4 md:space-y-6 lg:space-y-8">
            
            <section
              ref={virtualMirrorSectionRef}
              id="virtual-mirror"
              className={`${cardClass} ${cardPadding} space-y-4 scroll-mt-24`}
            >
              <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2 text-black">
                <span className="bg-black text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-xs font-bold shadow-[0_0_10px_rgba(0,0,0,0.5)]">3</span>
                Virtual Mirror
              </h2>
              <VirtualMirror
                imageUrl={generatedImage}
                isLoading={isTryOnLoading}
                errorMessage={error}
                onStageChange={handleLoaderStageChange}
                isPreview={isPreviewResult}
                onDownloadClean={redirectToPricing}
                onTryAnother={redirectToPricing}
                onImageLoaded={handleResultImageLoaded}
              />
              {generatedImage && modestyApplied && (
                <div className="rounded-lg border border-black/15 bg-black/5 p-3 text-xs text-black/70">
                  For safety, we automatically add tasteful coverage/lining for intimate or minimal-coverage items.
                </div>
              )}
              
              {/* Social Share Buttons - appears after successful try-on */}
              {generatedImage && !isGenerating && (
                <div className="mt-4 p-4 rounded-lg border border-black/10 bg-gradient-to-r from-violet-50/50 to-purple-50/50">
                  <h3 className="text-sm font-semibold text-black mb-3 flex items-center gap-2">
                    📸 Share Your Look
                    <span className="px-2 py-0.5 rounded-full bg-black/10 text-[10px] font-medium uppercase tracking-wide">
                      Get 2 free credits
                    </span>
                  </h3>
                  <SocialShareButtons
                    imageUrl={generatedImage}
                    isPreview={isPreviewResult}
                    onUpgradeClick={redirectToPricing}
                  />
                  <p className="mt-3 text-[11px] text-black/60">
                    Tag @igetdressed.online on Instagram for a chance to be featured! 🌟
                  </p>
                </div>
              )}

              {generatedImage && !isGenerating && user && (
                <div className="mt-4 rounded-lg border border-black/20 bg-black/5 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide text-black/70">
                        Shop &amp; Save
                      </p>
                      <p className="text-xs text-black/60">
                        Compare prices for up to 5 wardrobe items using Google Shopping data.
                      </p>
                    </div>
                    <button
                      onClick={() => setIsShopSaveOpen(true)}
                      className="w-full sm:w-auto rounded-none border border-black bg-black px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-[#111]"
                    >
                      Open Selector
                    </button>
                  </div>
                </div>
              )}
            </section>

            {(Boolean(generatedImage) ||
              isProductSearchLoading ||
              productSearchAttempted) && (
              <section className={`${cardClass} ${cardPadding} space-y-4`}>
                <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2 text-black">
                  <Search size={18} className="sm:w-5 sm:h-5 text-black" />
                  Shop the Look
                </h2>
                <div className="space-y-3 sm:space-y-4">
                  {isProductSearchLoading ? (
                    [0, 1, 2].map((idx) => (
                      <ProductCard key={`skeleton-${idx}`} loading />
                    ))
                  ) : products.length > 0 ? (
                    products.map((product, idx) => (
                      <ProductCard key={idx} product={product} />
                    ))
                  ) : (
                    <div className="rounded-xl border border-black/10 bg-black/5 p-4 text-sm text-black/70">
                      {productSearchError ? (
                        <p>{productSearchError}</p>
                      ) : (
                        <p>No matching products found yet.</p>
                      )}
                      <p className="mt-2 text-xs text-black/60">
                        Tip: Try a different item or use{" "}
                        <span className="font-semibold">Shop &amp; Save</span> to
                        price match specific wardrobe pieces.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {shopSaveResults.length > 0 && (
              <section className={`${cardClass} ${cardPadding} space-y-4`}>
                <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2 text-black">
                  <Search size={18} className="sm:w-5 sm:h-5 text-black" />
                  Shop &amp; Save Deals
                </h2>
                <div className="space-y-4">
                  {shopSaveResults.map((result) => {
                    const itemImageUrl = ensureAbsoluteUrl(result.item.public_url);
                    return (
                    <div
                      key={result.item.id}
                      className="rounded-lg border border-black/15 bg-white/80 p-3 sm:p-4 shadow-[0_5px_20px_rgba(0,0,0,0.08)]"
                    >
                      <div className="flex gap-3">
                        {itemImageUrl && (
                          <div className="relative h-20 w-20 rounded-md border border-black/10 overflow-hidden">
                            <Image
                              src={itemImageUrl}
                              alt={result.item.description || result.item.subcategory || 'Wardrobe item'}
                              fill
                              sizes="80px"
                              className="object-cover"
                              loading="lazy"
                            />
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-black/60">
                            {result.item.category?.replace('_', ' ') || 'Item'}
                          </p>
                          <p className="text-sm font-bold">
                            {result.item.subcategory || result.item.description || result.item.original_filename}
                          </p>
                          {(result.item.color || result.item.style) && (
                            <p className="text-xs text-black/60">
                              {result.item.color}
                              {result.item.color && result.item.style ? ' · ' : ''}
                              {result.item.style}
                            </p>
                          )}
                          {result.item.tags && result.item.tags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {result.item.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={`${result.item.id}-${tag}`}
                                  className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-black/70"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {result.offers.length > 0 ? (
                        <div className="mt-4 space-y-2">
                          {result.offers.map((offer, idx) => {
                            const offerKey = `${result.item.id}-${offer.source}-${offer.merchant || 'merchant'}-${idx}`;
                            return (
                              <a
                                key={offerKey}
                                href={offer.affiliateUrl || offer.productUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2 text-xs sm:text-sm transition-colors hover:border-black/40"
                              >
                                <div className="flex flex-col pr-3">
                                  <span className="font-semibold">
                                    {offer.merchant || offer.source}
                                  </span>
                                  <span className="text-[11px] text-black/60 line-clamp-2">
                                    {offer.title}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-black">
                                    {formatCurrency(
                                      typeof offer.totalPrice === 'number' ? offer.totalPrice : offer.price,
                                      offer.currency
                                    )}
                                  </p>
                                  {offer.shippingPrice && offer.shippingPrice > 0 && (
                                    <p className="text-[11px] text-black/50">
                                      + {formatCurrency(offer.shippingPrice, offer.currency)} ship
                                    </p>
                                  )}
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-black/60">
                          We couldn&apos;t find live offers for this item yet. Try again later.
                        </p>
                      )}
                    </div>
                    );
                  })}
                </div>
              </section>
            )}

          </div>
        </div>
        )}
      </div>

      <ShopSaveModal
        isOpen={isShopSaveOpen}
        onClose={() => setIsShopSaveOpen(false)}
        onResults={(results) => setShopSaveResults(results)}
        clientItems={shopSaveReadyItems}
        onTryAgain={handleTryAgainFromSaved}
      />

      {showWardrobeLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-black/10">
            <h3 className="text-lg font-bold text-black">Start a new wardrobe?</h3>
            <p className="mt-2 text-sm text-black/70">
              If not, an item needs to be removed in order to add this item.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleConfirmNewWardrobe}
                disabled={isAddingSavedItem}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold uppercase tracking-wide border border-black transition-colors ${
                  isAddingSavedItem
                    ? "bg-black/10 text-black/40 cursor-not-allowed"
                    : "bg-black text-white hover:bg-black/90"
                }`}
              >
                {isAddingSavedItem ? "Adding..." : "Start new wardrobe"}
              </button>
              <button
                onClick={handleDismissWardrobeLimit}
                disabled={isAddingSavedItem}
                className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold uppercase tracking-wide border border-black/20 bg-white hover:border-black/60 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'try-on' && (
        <div
          ref={mobileActionBarRef}
          className="lg:hidden fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3 bg-white/95 backdrop-blur-md border-t border-black/10 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-black/70">Ready to try-on?</p>
              <p className="text-[11px] text-black/60 truncate">
                {userImages.length ? `${userImages.length} selfie${userImages.length !== 1 ? 's' : ''}` : 'Add a selfie'}
                {" • "}
                {wardrobeItems.length ? `${wardrobeItems.length} item${wardrobeItems.length !== 1 ? 's' : ''}` : 'Add clothing items'}
              </p>
            </div>
            <button
              onClick={() => {
                if (!isAuthenticated) {
                  setError('Please sign in to try on.');
                  return;
                }
                if (isGenerating) return;
                if (lacksCredits) {
                  redirectToPricing();
                  return;
                }
                void handleGenerate();
              }}
              disabled={!canAttemptTryOn}
              className={`
                rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wider min-w-[120px]
                ${isGenerating ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : !isAuthenticated ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-900 active:bg-gray-800'}
              `}
            >
              {isGenerating ? 'Working...' : !isAuthenticated ? 'Sign in to try on' : 'Try it on'}
            </button>
          </div>
        </div>
      )}

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
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Render the same loading shell during SSR and the first client render
  // to avoid hydration mismatches while Clerk initializes.
  if (!isClient) {
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
