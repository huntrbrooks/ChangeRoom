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
import { ShopSaveModal, type ShopSaveResult, type ShopSaveClothingItem } from './components/ShopSaveModal';
import {
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Expand,
  Heart,
  LayoutGrid,
  Loader2,
  Plus,
  Search,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UserPlus,
  UserRound,
  WandSparkles,
  Zap,
  ZoomIn,
} from 'lucide-react';
import { getWearingStylePromptText } from '@/lib/wearingStyles';
import { getUserPrimaryEmail, isBypassUser } from '@/lib/bypass-config';
import { hasUsableClerkPublishableKey } from '@/lib/clerk-public-config';
import { ensureAbsoluteUrl } from '@/lib/url';
import { resolveBackendApiUrl } from '@/lib/backend-url';
import { probeBackendHealth } from '@/lib/backendHealth';
import { isMyOutfitsEnabled, isTryOnFromUrlEnabled } from '@/lib/featureFlags';
import { ANALYTICS_EVENTS, captureEvent } from '@/lib/analytics';
import { trackTrialConsumed, trackOutfitGenerated } from '@/lib/userEvents';
import { getBillingBannerState } from '@/lib/billingBanner';
import { getDemoTryOnImageUrl, getDemoTryOnProducts } from '@/lib/pitchDemo';
import { logger } from '@/lib/logger';
import { recordClientDiagnostic } from '@/lib/clientDiagnostics';

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

type WardrobeAudience = 'Women' | 'Men' | 'Unisex';
type MirrorMode = 'fit' | 'zoom';
type LookFeedback = 'liked' | 'disliked' | null;
type ActionFeedbackTone = 'info' | 'success' | 'warning' | 'error';

interface ActionFeedback {
  id: number;
  tone: ActionFeedbackTone;
  message: string;
}

interface BillingInfo {
  plan: 'free' | 'standard' | 'pro';
  creditsAvailable: number;
  creditsRefreshAt: Date | null;
  trialsRemaining: number;
  hasPurchase?: boolean;
  unlimitedCredits?: boolean;
  isPrivileged?: boolean;
}

type BackendAvailability = 'checking' | 'healthy' | 'unavailable';
type ClerkUser = ReturnType<typeof useUser>['user'];
type ClerkGetToken = ReturnType<typeof useAuth>['getToken'];

interface HomeAuthState {
  user: ClerkUser | null;
  isLoaded: boolean;
  getToken: ClerkGetToken;
  isSignedIn: boolean | undefined;
  isAuthLoaded: boolean;
}

const hasUsableClerkKey = hasUsableClerkPublishableKey;

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

const PREVIEW_SAMPLE_MODELS = [
  {
    label: 'Studio front',
    src: '/preview-assets/sample-woman-1.png',
    filename: 'studio-front-sample.png',
  },
  {
    label: 'Menswear fit',
    src: '/preview-assets/sample-man.png',
    filename: 'menswear-sample.png',
  },
  {
    label: 'Denim casual',
    src: '/preview-assets/sample-woman-2.png',
    filename: 'denim-casual-sample.png',
  },
];

const PREVIEW_WARDROBE_ITEMS = [
  {
    label: 'Classic Trench Coat',
    src: '/preview-assets/wardrobe-coat.png',
    filename: 'classic-trench-coat.png',
    category: 'upper_body',
    audience: ['Women', 'Unisex'] as WardrobeAudience[],
  },
  {
    label: 'Black Blazer',
    src: '/preview-assets/wardrobe-blazer.png',
    filename: 'black-blazer.png',
    category: 'upper_body',
    audience: ['Women', 'Men', 'Unisex'] as WardrobeAudience[],
  },
  {
    label: 'Ribbed Tank Top',
    src: '/preview-assets/wardrobe-tank.png',
    filename: 'ribbed-tank-top.png',
    category: 'upper_body',
    audience: ['Women', 'Unisex'] as WardrobeAudience[],
  },
  {
    label: 'High Rise Straight Jeans',
    src: '/preview-assets/wardrobe-jeans.png',
    filename: 'high-rise-straight-jeans.png',
    category: 'lower_body',
    audience: ['Women', 'Men', 'Unisex'] as WardrobeAudience[],
  },
  {
    label: 'Leather Shoulder Bag',
    src: '/preview-assets/wardrobe-bag.png',
    filename: 'leather-shoulder-bag.png',
    category: 'accessories',
    audience: ['Women', 'Unisex'] as WardrobeAudience[],
  },
  {
    label: 'Slingback Heels',
    src: '/preview-assets/wardrobe-heels.png',
    filename: 'slingback-heels.png',
    category: 'shoes',
    audience: ['Women'] as WardrobeAudience[],
  },
];

const PREVIEW_MIRROR_THUMBNAILS = [
  { src: '/preview-assets/mirror-look.png', alt: 'Front look' },
  { src: '/preview-assets/thumb-back.png', alt: 'Back look' },
  { src: '/preview-assets/thumb-detail.png', alt: 'Detail look' },
];

function buildShoppingSearchUrl(query: string): string {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`;
}

const PREVIEW_SHOP_PRODUCTS = [
  {
    title: 'Classic Trench Coat',
    price: '$129.00',
    thumbnail: '/preview-assets/product-coat.png',
    source: 'Preview',
    link: buildShoppingSearchUrl('Classic Trench Coat'),
  },
  {
    title: 'High Rise Straight Jeans',
    price: '$89.00',
    thumbnail: '/preview-assets/product-jeans.png',
    source: 'Preview',
    link: buildShoppingSearchUrl('High Rise Straight Jeans'),
  },
  {
    title: 'Ribbed Tank Top',
    price: '$29.00',
    thumbnail: '/preview-assets/product-tank.png',
    source: 'Preview',
    link: buildShoppingSearchUrl('Ribbed Tank Top'),
  },
  {
    title: 'Leather Shoulder Bag',
    price: '$79.00',
    thumbnail: '/preview-assets/product-bag.png',
    source: 'Preview',
    link: buildShoppingSearchUrl('Leather Shoulder Bag'),
  },
  {
    title: 'Slingback Heels',
    price: '$99.00',
    thumbnail: '/preview-assets/product-heels.png',
    source: 'Preview',
    link: buildShoppingSearchUrl('Slingback Heels'),
  },
];

function HomeContentWithClerk() {
  const { user, isLoaded } = useUser();
  const { getToken, isSignedIn, isLoaded: isAuthLoaded } = useAuth();

  return (
    <HomeContent
      auth={{
        user,
        isLoaded,
        getToken,
        isSignedIn,
        isAuthLoaded,
      }}
    />
  );
}

function HomeContentWithoutClerk() {
  const getToken = useCallback(async () => null, []) as ClerkGetToken;

  return (
    <HomeContent
      auth={{
        user: null,
        isLoaded: true,
        getToken,
        isSignedIn: false,
        isAuthLoaded: true,
      }}
    />
  );
}

function HomeContent({ auth }: { auth: HomeAuthState }) {
  const { user, isLoaded, getToken, isSignedIn, isAuthLoaded } = auth;
  const router = useRouter();
  const backendApi = useMemo(() => resolveBackendApiUrl(), []);
  const myOutfitsEnabled = useMemo(() => isMyOutfitsEnabled(), []);
  const pitchDemoEnabled = false;
  const tryOnFromUrlEnabled = useMemo(() => isTryOnFromUrlEnabled(), []);
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
  const [guestPreviewConsumed, setGuestPreviewConsumed] = useState(false);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [billingStatus, setBillingStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [billingError, setBillingError] = useState<string | null>(null);
  const [backendAvailability, setBackendAvailability] = useState<BackendAvailability>(
    backendApi.apiUrl ? 'checking' : 'unavailable'
  );
  const [backendAvailabilityMessage, setBackendAvailabilityMessage] = useState<string | null>(
    backendApi.reason ?? null
  );
  const [showPaywall, setShowPaywall] = useState(false);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [hasShownPaywallAfterResult, setHasShownPaywallAfterResult] = useState(false);
  const [isShopSaveOpen, setIsShopSaveOpen] = useState(false);
  const [shopSaveResults, setShopSaveResults] = useState<ShopSaveResult[]>([]);
  const [pendingSavedItem, setPendingSavedItem] = useState<ShopSaveClothingItem | null>(null);
  const [showWardrobeLimitModal, setShowWardrobeLimitModal] = useState(false);
  const [isAddingSavedItem, setIsAddingSavedItem] = useState(false);
  const [blockedWardrobeIndices, setBlockedWardrobeIndices] = useState<Set<number>>(new Set());
  const [adjustingDescriptionIndices, setAdjustingDescriptionIndices] = useState<Set<number>>(new Set());
  const [lastSafetyBlockDetail, setLastSafetyBlockDetail] = useState<string | null>(null);
  const [activeWardrobeAudience, setActiveWardrobeAudience] = useState<WardrobeAudience>('Women');
  const [showWardrobeFilters, setShowWardrobeFilters] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [lookFeedback, setLookFeedback] = useState<LookFeedback>(null);
  const [mirrorMode, setMirrorMode] = useState<MirrorMode>('fit');
  const [activeMirrorThumb, setActiveMirrorThumb] = useState(0);
  const [isMirrorExpanded, setIsMirrorExpanded] = useState(false);
  const [shopProductOffset, setShopProductOffset] = useState(0);
  const [adjustDescriptionFeedback, setAdjustDescriptionFeedback] = useState<
    Map<number, { tone: 'success' | 'warning' | 'error'; message: string }>
  >(new Map());
  const cardClass =
    "rounded-lg border border-slate-200/80 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm";
  const cardPadding = "p-4 sm:p-5 md:p-6";
  const resultImageLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creditLoggedRef = useRef(false);
  const trialConsumedRef = useRef(false);
  const contentBlockWarnedRef = useRef(false);
  const creditHoldAppliedRef = useRef(false);
  const virtualMirrorSectionRef = useRef<HTMLElement | null>(null);
  const stickyHeaderRef = useRef<HTMLElement | null>(null);
  const mobileActionBarRef = useRef<HTMLDivElement | null>(null);
  const selfUploadInputRef = useRef<HTMLInputElement | null>(null);
  const wardrobeUploadInputRef = useRef<HTMLInputElement | null>(null);
  const actionFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (actionFeedbackTimerRef.current) {
        clearTimeout(actionFeedbackTimerRef.current);
      }
    };
  }, []);

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

  const adminDiagnosticsEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('admin') === '1';
  }, []);

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
      if (backendApi.apiUrl && backendAvailability !== 'unavailable') {
        return backendApi.apiUrl;
      }
      const reason = backendAvailabilityMessage || backendApi.reason;
      setError(
        reason
          ? `${context} is unavailable. ${reason}`
          : `${context} is unavailable. Please set NEXT_PUBLIC_API_URL.`
      );
      return null;
    },
    [backendApi.apiUrl, backendApi.reason, backendAvailability, backendAvailabilityMessage, setError]
  );

  const handleLoaderStageChange = useCallback((stageId: number) => {
    logger.info('try_on_stage', { stageId, ts: Date.now() });
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
    if (hasUsableClerkKey() && isAuthLoaded && isSignedIn) {
      router.prefetch('/billing');
    }
  }, [isAuthLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!pitchDemoEnabled || typeof window === 'undefined') {
      return;
    }

    setGuestPreviewConsumed(window.sessionStorage.getItem('pitch-demo-preview-consumed') === '1');
  }, [pitchDemoEnabled]);

  useEffect(() => {
    if (!backendApi.apiUrl) {
      setBackendAvailability('unavailable');
      setBackendAvailabilityMessage(
        backendApi.reason || 'Try-on is unavailable because NEXT_PUBLIC_API_URL is missing.'
      );
      return;
    }

    let cancelled = false;
    setBackendAvailability('checking');
    setBackendAvailabilityMessage('Checking try-on service availability...');

    probeBackendHealth(backendApi.apiUrl)
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (result.ok) {
          setBackendAvailability('healthy');
          setBackendAvailabilityMessage(null);
          return;
        }

        setBackendAvailability('unavailable');
        setBackendAvailabilityMessage(
          result.message || 'Try-on is temporarily unavailable.'
        );
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setBackendAvailability('unavailable');
        setBackendAvailabilityMessage(
          'Try-on is unavailable because the backend health check failed.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [backendApi.apiUrl, backendApi.reason]);

  const isSignedInReady = isAuthLoaded && isSignedIn;

  const fetchBilling = useCallback(async () => {
    try {
      setBillingStatus('loading');
      setBillingError(null);
      const response = await httpClient.get('/api/my/billing');
      setBilling({
        ...response.data,
        hasPurchase: Boolean(response.data?.hasPurchase),
        unlimitedCredits: Boolean(response.data?.unlimitedCredits),
        isPrivileged: Boolean(response.data?.isPrivileged),
      });
      setBillingStatus('ready');
    } catch (error: unknown) {
      const err =
        typeof error === 'object' && error !== null
          ? (error as { response?: { status?: number; data?: unknown }; message?: string })
          : { message: String(error) };
      const response = err.response;
      // Only log error if it's not a 401 (unauthorized) - that's expected when not logged in
      if (response?.status !== 401) {
        console.error('Error fetching billing:', response?.data || err.message);
      }
      if (response?.status === 401 && !isSignedInReady) {
        setBillingStatus('idle');
        setBillingError(null);
        return;
      }
      if (response?.status !== 401) {
        const data = response?.data;
        const dataObj =
          typeof data === 'object' && data !== null
            ? (data as Record<string, unknown>)
            : null;
        const detail =
          (typeof dataObj?.hint === 'string' && dataObj.hint) ||
          (typeof dataObj?.details === 'string' && dataObj.details) ||
          (typeof dataObj?.error === 'string' && dataObj.error) ||
          (typeof err.message === 'string' && err.message) ||
          'Billing is temporarily unavailable.';
        setBillingError(detail);
      } else if (isSignedInReady) {
        setBillingError(
          'Unauthorized while signed in. Check Clerk publishable/secret key pairing in Vercel.'
        );
      }
      setBillingStatus('error');
    }
  }, [isSignedInReady]);

  // Fetch billing info on mount and when auth changes
  useEffect(() => {
    if (isSignedInReady) {
      fetchBilling();
      return;
    }
    if (isAuthLoaded && !isSignedIn) {
      setBilling(null);
      setBillingStatus('idle');
      setBillingError(null);
    }
  }, [fetchBilling, isAuthLoaded, isSignedIn, isSignedInReady]);

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
    if (typeof window !== 'undefined' && isSignedInReady) {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session_id');
      if (sessionId) {
        // Verify paid checkout server-side (idempotent) then refresh billing
        (async () => {
          try {
            await httpClient.post('/api/billing/verify-checkout-session', { sessionId });
          } catch (error) {
            // Verification is a best-effort fallback (webhook is primary)
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
  }, [fetchBilling, isSignedInReady]);


  // Check if user email is in bypass list
  const userEmail = getUserPrimaryEmail(user);
  const isBypass = isBypassUser(userEmail) || Boolean(billing?.unlimitedCredits);
  const redirectToPricing = useCallback(() => {
    router.push('/pricing?promo=xmas');
  }, [router]);

  const isOnTrial = billing && (billing.trialsRemaining ?? 0) > 0 && !isBypass;
  const isAuthenticated = isAuthLoaded ? Boolean(isSignedIn) : isLoaded && !!user;
  const isGuestPitchDemo = pitchDemoEnabled && !isAuthenticated;
  const hasCreditsAvailable = billing ? billing.unlimitedCredits || billing.creditsAvailable > 0 : false;
  const billingBannerState = getBillingBannerState({
    isAuthenticated,
    billing,
    isOnTrial: Boolean(isOnTrial),
    isGenerating,
    isTryOnLoading,
    isPreviewResult,
    hasGeneratedImage: Boolean(generatedImage),
  });
  const lacksCredits =
    !isBypass && !isOnTrial && billingStatus === 'ready' && (!billing || !hasCreditsAvailable);
  const canAttemptTryOn =
    (isAuthenticated || pitchDemoEnabled) &&
    !isGenerating &&
    (backendAvailability === 'healthy' || pitchDemoEnabled);

  const reportUiAction = useCallback(
    (
      action: string,
      status: 'started' | 'completed' | 'blocked' | 'failed',
      fields: Record<string, unknown> = {},
      level: 'info' | 'warn' | 'error' = status === 'failed' ? 'error' : status === 'blocked' ? 'warn' : 'info'
    ) => {
      recordClientDiagnostic(
        'ui_action',
        {
          action,
          status,
          request_id: lastRequestId,
          authenticated: isAuthenticated,
          billing_status: billingStatus,
          ...fields,
        },
        level
      );
    },
    [billingStatus, isAuthenticated, lastRequestId]
  );

  const showActionFeedback = useCallback(
    (
      message: string,
      tone: ActionFeedbackTone = 'info',
      action = 'ui_feedback',
      fields: Record<string, unknown> = {}
    ) => {
      if (actionFeedbackTimerRef.current) {
        clearTimeout(actionFeedbackTimerRef.current);
      }
      setActionFeedback({
        id: Date.now(),
        tone,
        message,
      });
      reportUiAction(
        action,
        tone === 'error' ? 'failed' : tone === 'warning' ? 'blocked' : 'completed',
        { message, ...fields },
        tone === 'error' ? 'error' : tone === 'warning' ? 'warn' : 'info'
      );
      actionFeedbackTimerRef.current = setTimeout(() => {
        setActionFeedback(null);
      }, 7000);
    },
    [reportUiAction]
  );

  const filteredPreviewWardrobeItems = useMemo(
    () =>
      PREVIEW_WARDROBE_ITEMS.filter((item) =>
        item.audience.includes(activeWardrobeAudience)
      ),
    [activeWardrobeAudience]
  );

  const shopProductsForDisplay = useMemo(
    () => (products.length > 0 ? products : PREVIEW_SHOP_PRODUCTS),
    [products]
  );

  const orderedShopProducts = useMemo(() => {
    if (shopProductsForDisplay.length === 0) {
      return [];
    }
    const offset = shopProductOffset % shopProductsForDisplay.length;
    return [
      ...shopProductsForDisplay.slice(offset),
      ...shopProductsForDisplay.slice(0, offset),
    ];
  }, [shopProductOffset, shopProductsForDisplay]);

  const mirrorPlaceholderImage =
    generatedImage || PREVIEW_MIRROR_THUMBNAILS[activeMirrorThumb]?.src || '/preview-assets/mirror-look.png';

  useEffect(() => {
    setShopProductOffset(0);
  }, [products]);

  const handleWardrobeAudienceChange = useCallback(
    (audience: WardrobeAudience) => {
      setActiveWardrobeAudience(audience);
      showActionFeedback(
        `Showing ${audience.toLowerCase()} wardrobe samples.`,
        'success',
        'wardrobe_audience_filter',
        { audience }
      );
    },
    [showActionFeedback]
  );

  const handleViewAllProducts = useCallback(() => {
    if (generatedImage && user) {
      setIsShopSaveOpen(true);
      reportUiAction('shop_view_all', 'completed', { mode: 'shop_save_modal' });
      return;
    }

    const el = document.getElementById('shop-the-look');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showActionFeedback(
      products.length > 0
        ? 'All current matches are visible below.'
        : 'These are preview shopping links. Generate a look to unlock live product matches.',
      products.length > 0 ? 'success' : 'info',
      'shop_view_all',
      { hasGeneratedImage: Boolean(generatedImage), productCount: products.length }
    );
  }, [generatedImage, products.length, reportUiAction, showActionFeedback, user]);

  const handleProductStep = useCallback(
    (direction: 1 | -1) => {
      if (shopProductsForDisplay.length <= 1) {
        showActionFeedback(
          'There is only one product to show right now.',
          'info',
          'shop_carousel_single_product'
        );
        return;
      }
      setShopProductOffset((current) => {
        const next =
          (current + direction + shopProductsForDisplay.length) %
          shopProductsForDisplay.length;
        reportUiAction('shop_carousel_step', 'completed', {
          direction,
          nextOffset: next,
          productCount: shopProductsForDisplay.length,
        });
        return next;
      });
    },
    [reportUiAction, shopProductsForDisplay.length, showActionFeedback]
  );

  const handleProductClick = useCallback(
    (product: Product) => {
      reportUiAction('shop_product_open', 'completed', {
        title: product.title,
        source: product.source,
        hasDirectLink: product.source !== 'Preview',
      });
    },
    [reportUiAction]
  );

  const handleLookFeedback = useCallback(
    (nextFeedback: Exclude<LookFeedback, null>) => {
      setLookFeedback(nextFeedback);
      showActionFeedback(
        nextFeedback === 'liked'
          ? 'Saved that you liked this look.'
          : 'Thanks. Try another wardrobe item or generate a new look.',
        nextFeedback === 'liked' ? 'success' : 'info',
        'look_feedback',
        { feedback: nextFeedback, hasGeneratedImage: Boolean(generatedImage) }
      );
    },
    [generatedImage, showActionFeedback]
  );

  const downloadImage = useCallback(async (imageUrl: string) => {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `igetdressed-look-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  const handleDownloadLook = useCallback(async () => {
    if (!generatedImage) {
      showActionFeedback(
        'Generate a look first, then the download button will save it.',
        'info',
        'download_look_without_result'
      );
      return;
    }

    if (isPreviewResult && !isBypass) {
      showActionFeedback(
        'Upgrade to download the clean, watermark-free result.',
        'warning',
        'download_preview_requires_upgrade'
      );
      redirectToPricing();
      return;
    }

    try {
      reportUiAction('download_look', 'started');
      await downloadImage(generatedImage);
      reportUiAction('download_look', 'completed');
    } catch (downloadError) {
      reportUiAction('download_look', 'failed', { error: downloadError }, 'error');
      window.open(generatedImage, '_blank', 'noopener,noreferrer');
      showActionFeedback(
        'Download was blocked by the browser, so the image opened in a new tab.',
        'warning',
        'download_look_fallback'
      );
    }
  }, [
    downloadImage,
    generatedImage,
    isBypass,
    isPreviewResult,
    redirectToPricing,
    reportUiAction,
    showActionFeedback,
  ]);

  const requireAuth = useCallback(() => {
    if (pitchDemoEnabled) {
      return true;
    }

    if (!isAuthLoaded || !isSignedIn) {
      setError('Please sign in to upload images.');
      return false;
    }
    return true;
  }, [isAuthLoaded, isSignedIn, pitchDemoEnabled, setError]);

  const markGuestPreviewConsumed = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('pitch-demo-preview-consumed', '1');
    }
    setGuestPreviewConsumed(true);
  }, []);

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

  const createPreviewAnalysis = useCallback((
    file: File,
    index: number,
    label?: string,
    category = 'upper_body'
  ): AnalyzedItem => {
    const cleanLabel =
      label ||
      file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() ||
      'Wardrobe item';

    const fileWithMeta = file as FileWithMetadata;
    fileWithMeta.category = category;
    fileWithMeta.item_type = cleanLabel;
    fileWithMeta.detailed_description = cleanLabel;
    fileWithMeta.metadata = {
      ...(fileWithMeta.metadata || {}),
      category,
      item_type: cleanLabel,
      description: cleanLabel,
    };

    return {
      index,
      original_filename: file.name,
      status: 'success',
      analysis: {
        body_region: category,
        category,
        item_type: cleanLabel,
        short_description: cleanLabel,
        description: cleanLabel,
        suggested_filename: file.name,
        metadata: fileWithMeta.metadata,
        tags: ['studio-preview'],
      },
    };
  }, []);

  const persistClothingItems = useCallback(async (itemsToPersist: ImageWithAnalysis[]) => {
    if (!itemsToPersist || itemsToPersist.length === 0) {
      return;
    }

    if (!isAuthenticated) {
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
  }, [isAuthenticated]);

  const handleBulkUpload = useCallback((
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
    logger.info('bulk_upload_complete', { itemCount: analyses.length });
  }, [persistClothingItems, requireAuth]);

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
    if (!isAuthenticated) {
      setError('Description adjustments are available after sign-in.');
      return;
    }

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
  }, [getBackendApiUrl, getBackendAuthHeaders, isAuthenticated, lastSafetyBlockDetail, requireAuth, wardrobeItems]);

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

    logger.info('product_added_from_url', {
      title: product.title,
      productUrl: product.productUrl,
    });
  }, [requireAuth, wardrobeItems.length, persistClothingItems]);

  const userPreviewUrls = useMemo(() => {
    if (typeof URL === 'undefined') return [];
    return userImages.slice(0, 3).map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    }));
  }, [userImages]);

  useEffect(() => {
    return () => {
      userPreviewUrls.forEach(({ url }) => URL.revokeObjectURL(url));
    };
  }, [userPreviewUrls]);

  const wardrobePreviewUrls = useMemo(() => {
    if (typeof URL === 'undefined') return [];
    return wardrobeItems.slice(0, 6).map((entry) => {
      const fileMeta = entry.file as FileWithMetadata;
      const hostedUrl = ensureAbsoluteUrl(fileMeta.file_url || entry.analysis?.file_url || null);
      return {
        name:
          entry.analysis?.analysis?.item_type ||
          entry.analysis?.analysis?.short_description ||
          entry.file.name,
        url: hostedUrl || URL.createObjectURL(entry.file),
        shouldRevoke: !hostedUrl,
      };
    });
  }, [wardrobeItems]);

  useEffect(() => {
    return () => {
      wardrobePreviewUrls.forEach(({ url, shouldRevoke }) => {
        if (shouldRevoke) URL.revokeObjectURL(url);
      });
    };
  }, [wardrobePreviewUrls]);

  const loadPublicAssetAsFile = useCallback(async (src: string, filename: string) => {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Could not load ${filename}`);
    }
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || 'image/png' });
  }, []);

  const inferPreviewCategory = useCallback((name: string) => {
    const normalized = name.toLowerCase();
    if (/jean|pant|trouser|skirt|short/.test(normalized)) return 'lower_body';
    if (/shoe|heel|boot|sneaker/.test(normalized)) return 'shoes';
    if (/bag|purse|hat|cap|jewellery|jewelry/.test(normalized)) return 'accessories';
    return 'upper_body';
  }, []);

  const handleSelfFilesSelected = useCallback(
    (fileList: FileList | null) => {
      const files = Array.from(fileList || [])
        .filter((file) => file.type.startsWith('image/'))
        .slice(0, 5);
      if (files.length === 0) return;
      if (!requireAuth()) return;
      setError(null);
      setUserImages(files);
    },
    [requireAuth]
  );

  const handleWardrobeFilesSelected = useCallback(
    (fileList: FileList | null) => {
      const remainingSlots = Math.max(0, 5 - wardrobeItems.length);
      const shouldReplace = remainingSlots === 0;
      const limit = shouldReplace ? 5 : remainingSlots;
      const files = Array.from(fileList || [])
        .filter((file) => file.type.startsWith('image/'))
        .slice(0, limit);
      if (files.length === 0) return;
      if (!requireAuth()) return;
      const analyses = files.map((file, index) =>
        createPreviewAnalysis(
          file,
          shouldReplace ? index : wardrobeItems.length + index,
          undefined,
          inferPreviewCategory(file.name)
        )
      );
      setError(null);
      handleBulkUpload(files, analyses, shouldReplace);
    },
    [createPreviewAnalysis, handleBulkUpload, inferPreviewCategory, requireAuth, wardrobeItems.length]
  );

  const handleSampleModelSelect = useCallback(
    async (sample: (typeof PREVIEW_SAMPLE_MODELS)[number]) => {
      if (!requireAuth()) return;
      try {
        const file = await loadPublicAssetAsFile(sample.src, sample.filename);
        setError(null);
        setUserImages([file]);
      } catch (selectError) {
        console.error('Failed to select sample model', selectError);
        setError('Could not load that sample. Please upload a photo instead.');
      }
    },
    [loadPublicAssetAsFile, requireAuth]
  );

  const handleWardrobePreviewSelect = useCallback(
    async (item: (typeof PREVIEW_WARDROBE_ITEMS)[number]) => {
      if (!requireAuth()) return;
      try {
        const file = await loadPublicAssetAsFile(item.src, item.filename);
        const analysis = createPreviewAnalysis(file, 0, item.label, item.category);
        setError(null);
        setWardrobeItems([{ file, analysis }]);
        setBlockedWardrobeIndices(new Set());
        setAdjustingDescriptionIndices(new Set());
        setAdjustDescriptionFeedback(new Map());
      } catch (selectError) {
        console.error('Failed to select wardrobe preview item', selectError);
        setError('Could not load that wardrobe item. Please upload one instead.');
      }
    },
    [createPreviewAnalysis, loadPublicAssetAsFile, requireAuth]
  );

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
      
      logger.info('outfit_saved', {
        outfitId: response.data?.id,
      });
    } catch (error: unknown) {
      const err =
        typeof error === 'object' && error !== null
          ? (error as { response?: { status?: number }; message?: string })
          : { message: String(error) };
      console.error('Error saving outfit to My Outfits:', err.message || err);
      // Don't throw - this is non-critical, but log for debugging
      if (err.response?.status === 401) {
        console.warn('User not authenticated, outfit not saved');
      }
    }
  };

  const applyPitchDemoResult = useCallback(
    async (requestId: string | null) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (resultImageLoadTimerRef.current) {
        clearTimeout(resultImageLoadTimerRef.current);
        resultImageLoadTimerRef.current = null;
      }

      setModestyApplied(false);
      setBlockedWardrobeIndices(new Set());
      setLastSafetyBlockDetail(null);
      setAdjustDescriptionFeedback(new Map());
      setGeneratedImage(null);
      setProducts(getDemoTryOnProducts());
      setProductSearchAttempted(true);
      setProductSearchError(null);
      setIsProductSearchLoading(false);
      setIsPreviewResult(true);
      markGuestPreviewConsumed();

      captureEvent(ANALYTICS_EVENTS.TRY_ON_SUCCESS, {
        request_id: requestId,
        demo_preview: true,
        wardrobe_items: wardrobeItems.length,
        user_images: userImages.length,
      });
      captureEvent(ANALYTICS_EVENTS.FREE_TRY_ON_COMPLETED, {
        request_id: requestId,
        demo_preview: true,
      });

      requestAnimationFrame(() => {
        setGeneratedImage(getDemoTryOnImageUrl());
      });
    },
    [markGuestPreviewConsumed, userImages.length, wardrobeItems.length]
  );

  const handleGenerate = async () => {
    logger.info("tryon_generate_requested", {
      userImagesCount: userImages.length,
      wardrobeItems: wardrobeItems.length,
      billingPlan: billing?.plan ?? null,
      creditsAvailable: billing?.creditsAvailable ?? null,
      trialsRemaining: billing?.trialsRemaining ?? null,
      isOnTrial,
    });
    
    // Prevent multiple simultaneous calls
    if (isGenerating) {
      logger.info("tryon_generate_duplicate_ignored");
      return;
    }

    if (!requireAuth()) {
      return;
    }
    if (isGenerating) {
      return;
    }

    if (isGuestPitchDemo && guestPreviewConsumed) {
      setError('Your free demo try-on has already been used. Upgrade to continue.');
      setShowPaywall(true);
      return;
    }

    if (lacksCredits) {
      redirectToPricing();
      return;
    }
    
    if (userImages.length === 0) {
      const errorMsg = "Please upload at least one photo of yourself.";
      logger.info("tryon_validation_failed", { error: errorMsg });
      setError(errorMsg);
      return;
    }
    
    const activeWardrobeItems = wardrobeItems.slice(0, 5);
    const activeFiles = activeWardrobeItems.map(item => item.file);

    if (activeFiles.length === 0) {
      const errorMsg = "Please upload at least one clothing item.";
      logger.info("tryon_validation_failed", { error: errorMsg });
      setError(errorMsg);
      return;
    }

    // Check credits before proceeding (unless on trial or bypass user)
    if (lacksCredits) {
      logger.info("tryon_no_credits_redirecting");
      redirectToPricing();
      return;
    }

    // Log bypass for admin
    if (isBypass) {
      logger.info("tryon_payment_bypassed", { hasUserEmail: Boolean(userEmail) });
    }

    // Show paywall if credits are low (3 or less) and not on trial
    if (!isBypass && !isOnTrial && billing && billing.creditsAvailable <= 3 && billing.creditsAvailable > 0) {
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
    let usedFreeTrialForRequest = false;

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

      if (isGuestPitchDemo) {
        requestId = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `req-${Date.now()}`;
        setLastRequestId(requestId);
        captureEvent(ANALYTICS_EVENTS.TRY_ON_ATTEMPT, {
          request_id: requestId,
          wardrobe_items: activeWardrobeItems.length,
          user_images: userImages.length,
          plan: 'free',
          credits_available: 0,
          free_trial_eligible: true,
          bypass: false,
          is_authenticated: false,
          demo_preview: true,
        });
        await applyPitchDemoResult(requestId);
        setIsTryOnLoading(false);
        setIsGenerating(false);
        console.error = originalError;
        return;
      }

      // Get API URL from environment or fail with guidance
      const API_URL = getBackendApiUrl('Try-on');
      if (!API_URL) {
        setIsTryOnLoading(false);
        setIsGenerating(false);
        console.error = originalError;
        return;
      }
      logger.info("tryon_backend_selected", { apiUrl: API_URL });
      
      // Wake up Render service first (health check)
      logger.info("tryon_backend_wakeup_started");
      try {
        const healthCheck = await httpClient.get(`${API_URL}/`, { timeout: 180000 }); // 3 minutes
        logger.info("tryon_backend_wakeup_succeeded", { status: healthCheck.status });
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
        
        logger.info("tryon_uploads_prepared", { itemCount: preparedTryOnFiles.length });

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
          creditHoldAppliedRef.current = Boolean(holdRes?.data?.creditHoldApplied);
          const creditsAvailable = holdRes?.data?.creditsAvailable;
          const usedFreeTrial = Boolean(holdRes?.data?.usedFreeTrial);
          const unlimitedCredits = Boolean(holdRes?.data?.unlimitedCredits);
          usedFreeTrialForRequest = usedFreeTrial;
          setIsPreviewResult(usedFreeTrial);
          if (typeof creditsAvailable === 'number') {
            setBilling((prev) =>
              prev
                ? {
                    ...prev,
                    creditsAvailable,
                    unlimitedCredits: prev.unlimitedCredits || unlimitedCredits,
                    isPrivileged: prev.isPrivileged || unlimitedCredits,
                  }
                : prev
            );
          }
          if (usedFreeTrial && billing && !isBypass) {
            setBilling((prev) => (prev ? { ...prev, trialsRemaining: Math.max(0, prev.trialsRemaining - 1) } : prev));
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
        logger.info("tryon_metadata_prepared", { metadataKeys: Object.keys(metadata) });

        logger.info("tryon_backend_request_started");
        logIngest({
          event: 'try_on_request_started',
          data: {
            apiUrl: API_URL,
            userImagesCount: userImages.length,
            clothingItemsCount: preparedTryOnFiles.length,
            metadataKeys: Object.keys(metadata),
          },
          timestamp: Date.now(),
        });
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
        logIngest({
          event: 'try_on_request_succeeded',
          data: {
            status: tryOnRes?.status,
            hasImageUrl: Boolean(tryOnRes?.data?.image_url),
          },
          timestamp: Date.now(),
        });

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
            logger.info("tryon_completed", { requestId });
          });
          
          if (myOutfitsEnabled) {
            saveOutfitToMyOutfits(imageUrl, preparedTryOnFiles, wardrobeItems);
          }
          
          // Mark trial as used if backend reported free trial consumption (idempotent)
          if (!isBypass && (usedFreeTrialForRequest || Boolean(tryOnRes?.data?.usedFreeTrial))) {
            try {
              await httpClient.post('/api/my/trial/consume');
          trialConsumedRef.current = true;
          setBilling((prev) => (prev ? { ...prev, trialsRemaining: Math.max(0, prev.trialsRemaining - 1) } : prev));
          // Track trial consumption for n8n automation
          trackTrialConsumed(requestId || undefined);
            } catch (consumeErr) {
              console.warn('Failed to mark trial consumed client-side', consumeErr);
            }
          }

          // Track outfit generation for n8n automation
          trackOutfitGenerated(requestId || '', preparedTryOnFiles.length);

          // Refresh billing info after successful try-on
          if (isSignedInReady) {
            fetchBilling();
          }
        } else {
          throw new Error("No image URL returned from try-on API");
        }
      } catch (tryOnError: unknown) {
        const error = tryOnError as { name?: string; code?: string; response?: { status?: number; data?: { error?: string; detail?: string } }; message?: string };
        logIngest({
          event: 'try_on_request_failed',
          data: {
            errorName: error?.name,
            errorCode: error?.code,
            status: error?.response?.status,
            errorDetail: error?.response?.data?.detail,
            errorMessage: error?.message,
          },
          timestamp: Date.now(),
        });
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
                (isBypass
                  ? "Your account will not be charged credits for retrying."
                  : "Warning: if your next attempt is blocked again for the same reason, 1 credit will be deducted.")
            );
            setIsTryOnLoading(false);
            setIsGenerating(false);
            console.error = originalError;
            return;
          }

          // Second (or later) blocked attempt after warning: apply 1-credit penalty (idempotent by requestId).
          try {
            let charged = false;
            if (!isBypass && requestId) {
              const penaltyRes = await httpClient.post('/api/my/credits/content-block-penalty', { requestId });
              charged = Boolean(penaltyRes?.data?.charged);
              const creditsAvailable = penaltyRes?.data?.creditsAvailable;
              if (typeof creditsAvailable === 'number') {
                setBilling((prev) => (prev ? { ...prev, creditsAvailable } : prev));
              } else {
                // Fallback to a refresh
                if (isSignedInReady) fetchBilling();
              }
            }
            setError(
              "Your try-on was blocked again by content safety filters. " +
                (charged
                  ? "1 credit has been deducted. "
                  : "No credits were deducted. ") +
                "Please choose a different (more modest) item or adjust the description and try again."
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

        logger.info("product_identification_started");
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
          logger.info("product_identification_succeeded");
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
            logger.info("product_search_completed");
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
      
      if (error.response?.status === 429) {
        setError("Wow, we're experiencing high demand right now! You've been placed in a brief queue. Please try again in a moment.");
      } else if (error.response?.status === 500 || error.response?.status === 503 || error.response?.status === 502) {
        setError("Our AI servers are currently processing a high volume of requests. Please wait a few moments and try again.");
      } else if (error.response?.status === 0 || error.message?.includes('Network Error') || error.code === 'ERR_NETWORK') {
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
    <main className="min-h-screen bg-white text-[#101114] font-sans">
      <header
        ref={stickyHeaderRef}
        className="sticky top-0 z-50 border-b border-[#d9dde5] bg-white/95 text-[#101114] shadow-[0_1px_12px_rgba(15,23,42,0.08)] backdrop-blur-md safe-area-inset"
      >
        <div className="mx-auto grid min-h-[84px] w-full max-w-[1435px] grid-cols-[1fr_auto] items-center gap-3 px-5 sm:px-8 md:grid-cols-[1fr_auto_1fr] md:gap-4">
          <Link href="/" className="min-w-0 truncate text-base font-black tracking-[-0.02em] text-black sm:text-2xl">
            IGetDressed.Online
          </Link>

          <nav className="hidden items-center gap-10 text-sm font-medium text-black md:flex">
            <Link href="/" className="relative flex h-[84px] items-center gap-2 px-2">
              <LayoutGrid size={16} strokeWidth={1.8} />
              <span>Studio</span>
              <span className="absolute inset-x-0 bottom-4 h-0.5 rounded-full bg-[#6b35f4]" />
            </Link>
            <Link href="/pricing" className="transition-colors hover:text-[#6b35f4]">
              Pricing
            </Link>
            <Link href="/about" className="transition-colors hover:text-[#6b35f4]">
              About
            </Link>
          </nav>

          <div className="flex items-center justify-end gap-4">
            <Link
              href="/pricing"
              className="hidden items-center gap-2 text-sm font-semibold text-[#008b8b] sm:flex"
            >
              <Sparkles size={19} fill="#008b8b" strokeWidth={1.6} />
              {isBypass ? 'Unlimited' : `${billing?.creditsAvailable ?? 120} Credits`}
            </Link>
            <div className="hidden h-8 w-px bg-slate-200 sm:block" />
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => {
                  reportUiAction('account_menu_open', 'completed', { destination: '/billing' });
                  router.push('/billing');
                }}
                className="flex items-center gap-2"
                aria-label="Open account billing"
              >
                <span className="relative h-10 w-10 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                  {user?.imageUrl ? (
                    <Image
                      src={user.imageUrl}
                      alt={user.fullName || 'Account'}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : (
                    <Image
                      src="/preview-assets/sample-woman-1.png"
                      alt="Account"
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  )}
                </span>
                <ChevronDown size={18} className="hidden text-black sm:block" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push('/sign-in')}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:text-black sm:px-4"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/sign-up')}
                  className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 sm:px-4"
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1435px] px-5 pb-24 pt-10 sm:px-8 sm:pt-12 lg:pb-10">
        <div className="grid gap-9 lg:grid-cols-[minmax(0,1.02fr)_minmax(520px,0.9fr)] lg:items-start">
          <section className="min-w-0">
            <h1 className="max-w-[680px] text-[2.75rem] font-black leading-[0.98] tracking-[-0.04em] text-black sm:text-[3.55rem]">
              Virtual Try-On Studio
            </h1>
            <p className="mt-4 text-lg leading-7 text-slate-600">
              See it on you. Shop with confidence.
            </p>

            {actionFeedback && (
              <div
                role="status"
                className={`mt-4 rounded-lg border px-4 py-3 text-sm font-medium ${
                  actionFeedback.tone === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : actionFeedback.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : actionFeedback.tone === 'error'
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : 'border-blue-200 bg-blue-50 text-blue-800'
                }`}
              >
                {actionFeedback.message}
              </div>
            )}

            <div className="mt-5 space-y-3">
              <section className="rounded-xl border border-[#dfe3ea] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-3 text-lg font-bold text-black">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#101720] text-sm font-bold text-white shadow-[0_10px_20px_rgba(15,23,42,0.18)]">
                      1
                    </span>
                    Upload Yourself
                  </h2>
                </div>

                <input
                  ref={selfUploadInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    handleSelfFilesSelected(event.currentTarget.files);
                    event.currentTarget.value = '';
                  }}
                />

                <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_44px_minmax(250px,1.25fr)] md:items-center">
                  <button
                    type="button"
                    onClick={() => selfUploadInputRef.current?.click()}
                    className="group relative flex min-h-[158px] flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white text-center transition-colors hover:border-[#6b35f4] hover:bg-[#f8f6ff]"
                  >
                    {userPreviewUrls[0] ? (
                      <img
                        src={userPreviewUrls[0].url}
                        alt={userPreviewUrls[0].name}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <>
                        <UserPlus size={54} className="mb-3 text-[#6b35f4]" strokeWidth={1.6} />
                        <span className="text-sm font-semibold text-black">Upload full-body photo</span>
                        <span className="mt-1 text-sm text-slate-500">PNG, JPG up to 10MB</span>
                      </>
                    )}
                    {userPreviewUrls[0] && (
                      <span className="absolute inset-x-0 bottom-0 bg-black/55 px-3 py-2 text-sm font-semibold text-white">
                        Change photo
                      </span>
                    )}
                  </button>

                  <div className="hidden items-center justify-center md:flex">
                    <div className="relative h-[158px] w-px bg-slate-200">
                      <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">
                        or
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">Choose a sample</p>
                    <div className="grid grid-cols-3 gap-3">
                      {PREVIEW_SAMPLE_MODELS.map((sample) => (
                        <button
                          key={sample.filename}
                          type="button"
                          onClick={() => void handleSampleModelSelect(sample)}
                          className="relative aspect-[0.8] overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition-all hover:border-[#6b35f4] hover:shadow-[0_8px_20px_rgba(107,53,244,0.16)]"
                          aria-label={`Choose ${sample.label}`}
                        >
                          <Image
                            src={sample.src}
                            alt={sample.label}
                            fill
                            sizes="110px"
                            loading={sample.filename === PREVIEW_SAMPLE_MODELS[0].filename ? 'eager' : 'lazy'}
                            className="object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-4 text-sm">
                  <span className="flex items-center gap-2 text-slate-500">
                    <CheckCircle2 size={17} className="text-[#12a7a2]" />
                    <span>Photo looks good</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => selfUploadInputRef.current?.click()}
                    className="font-semibold text-[#6b35f4] transition-colors hover:text-[#4c24c8]"
                  >
                    Change
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-[#dfe3ea] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
                <input
                  ref={wardrobeUploadInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    handleWardrobeFilesSelected(event.currentTarget.files);
                    event.currentTarget.value = '';
                  }}
                />

                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="flex items-center gap-3 text-lg font-bold text-black">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#101720] text-sm font-bold text-white shadow-[0_10px_20px_rgba(15,23,42,0.18)]">
                      2
                    </span>
                    Choose Wardrobe
                  </h2>
                  <div className="flex items-center gap-3">
                    <div className="hidden h-9 w-48 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-400 sm:flex">
                      <Search size={16} />
                      <span>Search clothing</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowWardrobeFilters((current) => !current);
                        reportUiAction('wardrobe_filters_toggle', 'completed', {
                          nextOpen: !showWardrobeFilters,
                        });
                      }}
                      className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-[#6b35f4] hover:text-[#6b35f4]"
                      aria-expanded={showWardrobeFilters}
                      aria-controls="wardrobe-filter-panel"
                    >
                      <SlidersHorizontal size={15} />
                      Filters
                    </button>
                  </div>
                </div>

                {showWardrobeFilters && (
                  <div
                    id="wardrobe-filter-panel"
                    className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    Showing {filteredPreviewWardrobeItems.length} sample item
                    {filteredPreviewWardrobeItems.length === 1 ? '' : 's'} for{' '}
                    {activeWardrobeAudience.toLowerCase()}.
                  </div>
                )}

                <div className="flex items-center gap-7 border-b border-slate-200 text-sm font-medium text-slate-500">
                  {(['Women', 'Men', 'Unisex'] as WardrobeAudience[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => handleWardrobeAudienceChange(tab)}
                      aria-pressed={activeWardrobeAudience === tab}
                      className={`relative pb-3 ${activeWardrobeAudience === tab ? 'text-[#6b35f4]' : 'hover:text-slate-900'}`}
                    >
                      {tab}
                      {activeWardrobeAudience === tab && (
                        <span className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-full bg-[#6b35f4]" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex items-stretch gap-3 overflow-x-auto pb-1">
                  {wardrobePreviewUrls.length > 0
                    ? wardrobePreviewUrls.map((item, index) => (
                        <button
                          key={`${item.name}-${index}`}
                          type="button"
                          onClick={() => handleItemRemove(index)}
                          className={`relative h-[110px] w-[110px] flex-none overflow-hidden rounded-lg border bg-white transition-all ${
                            index === 0
                              ? 'border-[#6b35f4] shadow-[0_0_0_1px_#6b35f4]'
                              : 'border-slate-200 hover:border-[#6b35f4]'
                          }`}
                          aria-label={`Remove ${item.name}`}
                        >
                          <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
                          {index === 0 && (
                            <span className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#6b35f4] text-white">
                              <CheckCircle2 size={15} />
                            </span>
                          )}
                        </button>
                      ))
                    : filteredPreviewWardrobeItems.map((item, index) => (
                        <button
                          key={item.filename}
                          type="button"
                          onClick={() => void handleWardrobePreviewSelect(item)}
                          className={`relative h-[110px] w-[110px] flex-none overflow-hidden rounded-lg border bg-white transition-all ${
                            index === 0
                              ? 'border-[#6b35f4] shadow-[0_0_0_1px_#6b35f4]'
                              : 'border-slate-200 hover:border-[#6b35f4]'
                          }`}
                          aria-label={`Choose ${item.label}`}
                        >
                          <Image
                            src={item.src}
                            alt={item.label}
                            fill
                            sizes="110px"
                            loading={index === 0 ? 'eager' : 'lazy'}
                            className="object-cover"
                          />
                          {index === 0 && (
                            <span className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#6b35f4] text-white">
                              <CheckCircle2 size={15} />
                            </span>
                          )}
                        </button>
                      ))}
                  <button
                    type="button"
                    onClick={() => wardrobeUploadInputRef.current?.click()}
                    className="flex h-[110px] w-[74px] flex-none items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.12)] transition-colors hover:border-[#6b35f4] hover:text-[#6b35f4]"
                    aria-label="Upload clothing"
                  >
                    <ChevronRight size={22} />
                  </button>
                </div>
              </section>

              <button
                type="button"
                onClick={() => {
                  if (isGenerating) return;
                  if (lacksCredits) {
                    redirectToPricing();
                    return;
                  }
                  void handleGenerate().catch((clickError) => {
                    console.error('Error in handleGenerate:', clickError);
                    setError('An error occurred while trying to generate your look. Please try again.');
                    setIsGenerating(false);
                  });
                }}
                disabled={isGenerating}
                className="flex min-h-[54px] w-full items-center justify-center gap-3 rounded-lg bg-[#6b35f4] px-5 text-base font-bold text-white shadow-[0_14px_28px_rgba(107,53,244,0.28)] transition-all hover:bg-[#5c2bdd] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isGenerating ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Sparkles size={21} fill="currentColor" strokeWidth={1.6} />
                )}
                <span>{isGenerating ? 'Generating your look...' : isGuestPitchDemo ? 'Launch demo preview' : 'Try it on'}</span>
                {!isGenerating && (
                  <span className="ml-auto rounded-full bg-[#5528c8] px-4 py-1.5 text-sm font-semibold text-white/90">
                    {isOnTrial ? 'Free' : '2 Credits'}
                  </span>
                )}
              </button>
              {isGenerating && (
                <button
                  type="button"
                  onClick={() => abortController?.abort()}
                  className="w-full text-center text-sm font-medium text-slate-500 underline hover:text-[#6b35f4]"
                >
                  Cancel
                </button>
              )}
            </div>
          </section>

          <section
            ref={virtualMirrorSectionRef}
            id="virtual-mirror"
            className={`overflow-hidden rounded-lg bg-[#10141b] text-white shadow-[0_22px_48px_rgba(15,23,42,0.24)] ${
              isMirrorExpanded
                ? 'fixed inset-3 z-50 overflow-y-auto'
                : 'scroll-mt-28'
            }`}
          >
            <div className="flex min-h-[66px] items-center justify-between gap-3 border-b border-white/10 px-5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                <Sparkles size={20} className="text-white" fill="white" strokeWidth={1.4} />
                Virtual Mirror
              </h2>
              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMirrorMode('fit');
                    showActionFeedback('Mirror set to fit view.', 'success', 'mirror_fit_view');
                  }}
                  aria-pressed={mirrorMode === 'fit'}
                  className={`flex h-9 items-center gap-2 rounded-md border px-4 text-white ${
                    mirrorMode === 'fit' ? 'border-white/35 bg-white/15' : 'border-white/25 bg-white/5'
                  }`}
                >
                  <UserRound size={15} />
                  Fit view
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMirrorMode('zoom');
                    showActionFeedback('Mirror set to zoom view.', 'success', 'mirror_zoom_view');
                  }}
                  aria-pressed={mirrorMode === 'zoom'}
                  className={`hidden h-9 items-center gap-2 rounded-md border px-4 text-white md:flex ${
                    mirrorMode === 'zoom' ? 'border-white/35 bg-white/15' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <ZoomIn size={15} />
                  Zoom
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMirrorExpanded((current) => !current);
                    reportUiAction('mirror_expand_toggle', 'completed', {
                      nextExpanded: !isMirrorExpanded,
                    });
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10"
                  aria-label={isMirrorExpanded ? 'Collapse mirror' : 'Expand mirror'}
                  aria-pressed={isMirrorExpanded}
                >
                  <Expand size={17} />
                </button>
              </div>
            </div>

            <div className="grid bg-white lg:grid-cols-[minmax(0,1fr)_124px]">
              <div className="min-h-[420px] bg-[#e5e1d9] lg:h-[567px] lg:min-h-0">
                <VirtualMirror
                  imageUrl={generatedImage}
                  placeholderImageUrl={mirrorPlaceholderImage}
                  isLoading={isTryOnLoading}
                  errorMessage={error}
                  onStageChange={handleLoaderStageChange}
                  isPreview={isPreviewResult}
                  onDownloadClean={redirectToPricing}
                  onTryAnother={redirectToPricing}
                  onImageLoaded={handleResultImageLoaded}
                  showResultActions={false}
                  className={`h-full min-h-[420px] rounded-none border-0 lg:min-h-0 lg:aspect-auto ${
                    mirrorMode === 'zoom' ? 'scale-[1.035]' : ''
                  }`}
                />
              </div>
              <div className="hidden border-l border-slate-200 bg-white p-5 lg:block">
                <div className="space-y-4">
                  {PREVIEW_MIRROR_THUMBNAILS.map((thumb, index) => (
                    <button
                      key={thumb.src}
                      type="button"
                      onClick={() => {
                        setActiveMirrorThumb(index);
                        showActionFeedback(`${thumb.alt} selected.`, 'success', 'mirror_thumbnail_select', {
                          thumb: thumb.alt,
                        });
                      }}
                      className={`relative aspect-[0.72] w-full overflow-hidden rounded-lg border bg-slate-50 ${
                        index === activeMirrorThumb ? 'border-[#6b35f4] shadow-[0_0_0_2px_#6b35f4]' : 'border-slate-200'
                      }`}
                      aria-label={thumb.alt}
                      aria-pressed={index === activeMirrorThumb}
                    >
                      <Image src={thumb.src} alt={thumb.alt} fill sizes="84px" className="object-cover" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      if (generatedImage && user) {
                        setIsShopSaveOpen(true);
                        reportUiAction('mirror_add_look', 'completed', { mode: 'shop_save_modal' });
                        return;
                      }
                      showActionFeedback(
                        isAuthenticated
                          ? 'Generate a look first, then you can save it.'
                          : 'Sign in and generate a look before saving.',
                        'info',
                        'mirror_add_look_blocked',
                        { hasGeneratedImage: Boolean(generatedImage) }
                      );
                    }}
                    className="flex aspect-[0.72] w-full flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:border-[#6b35f4] hover:text-[#6b35f4]"
                  >
                    <Plus size={22} />
                    <span className="text-sm">Add look</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex min-h-[72px] items-center justify-between gap-4 px-6">
              <p className="flex items-center gap-2 text-[11px] font-semibold leading-tight text-[#2dd4cf] sm:gap-3 sm:text-base">
                <Sparkles size={22} fill="#2dd4cf" strokeWidth={1.5} />
                <span className="hidden sm:inline">Looks great! Ready to shop.</span>
                <span className="sm:hidden">Ready to shop.</span>
              </p>
              <div className="flex items-center gap-5 text-white/80">
                <button
                  type="button"
                  onClick={() => handleLookFeedback('liked')}
                  className={`transition-colors hover:text-white ${lookFeedback === 'liked' ? 'text-[#2dd4cf]' : ''}`}
                  aria-label="Like look"
                  aria-pressed={lookFeedback === 'liked'}
                >
                  <ThumbsUp size={22} />
                </button>
                <button
                  type="button"
                  onClick={() => handleLookFeedback('disliked')}
                  className={`transition-colors hover:text-white ${lookFeedback === 'disliked' ? 'text-[#fca5a5]' : ''}`}
                  aria-label="Dislike look"
                  aria-pressed={lookFeedback === 'disliked'}
                >
                  <ThumbsDown size={22} />
                </button>
                <span className="h-7 w-px bg-white/15" />
                <button
                  type="button"
                  onClick={() => void handleDownloadLook()}
                  className="transition-colors hover:text-white"
                  aria-label="Download look"
                >
                  <Download size={22} />
                </button>
              </div>
            </div>
          </section>
        </div>

        <section id="shop-the-look" className="mt-5 scroll-mt-28 border-t border-slate-200 pt-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-4">
              <h2 className="text-xl font-bold tracking-[-0.02em] text-black">Shop the Look</h2>
              <button
                type="button"
                onClick={handleViewAllProducts}
                className="text-sm font-semibold text-[#6b35f4] hover:text-[#4c24c8]"
              >
                View all
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleProductStep(-1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-black"
                aria-label="Previous products"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => handleProductStep(1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-black shadow-sm"
                aria-label="Next products"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {productSearchError && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {productSearchError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {orderedShopProducts.map((product, index) => (
              <article
                key={`${product.title}-${index}`}
                className="grid min-h-[148px] grid-cols-[90px_minmax(0,1fr)] gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.06)]"
              >
                <div className="relative overflow-hidden rounded-md bg-slate-50">
                  <img
                    src={product.thumbnail}
                    alt={product.title}
                    className="h-full w-full object-contain"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="min-w-0">
                  <div className="mb-3 flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium leading-5 text-black">{product.title}</h3>
                    <Heart size={18} className="flex-none text-slate-500" />
                  </div>
                  <p className="text-sm font-semibold text-black">{product.price}</p>
                  <a
                    href={product.link}
                    onClick={() => handleProductClick(product)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-600 transition-colors hover:border-[#6b35f4] hover:text-[#6b35f4]"
                  >
                    View product
                  </a>
                </div>
              </article>
            ))}
          </div>

          {isProductSearchLoading && (
            <p className="mt-3 text-sm text-slate-500">Finding close matches...</p>
          )}
        </section>
      </div>

      <div className="hidden">
        <section className="mb-6 grid gap-5 lg:mb-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <h1 className="max-w-4xl text-[2.4rem] font-semibold leading-[0.98] text-[#101114] sm:text-[4rem] lg:text-[5.25rem]">
              Virtual Try-On Studio
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              See it on you, preserve your real fit, then shop comparable pieces with confidence.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {[
              { icon: UserRound, label: `${userImages.length || 0} self photos` },
              { icon: Shirt, label: `${wardrobeItems.length || 0}/5 wardrobe items` },
              { icon: BadgeCheck, label: backendAvailability === 'healthy' ? 'Studio online' : 'Service check' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm"
              >
                <Icon size={15} className="text-[#009b9b]" />
                {label}
              </div>
            ))}
          </div>
        </section>

        <div className="mb-5 flex flex-wrap items-center gap-4 text-xs text-slate-500 sm:gap-6 sm:text-sm">
            <Link 
              href="/terms-of-service" 
              className="transition-colors hover:text-[#5b46f4] underline"
            >
              Terms of Service
            </Link>
            <Link 
              href="/privacy-policy" 
              className="transition-colors hover:text-[#5b46f4] underline"
            >
              Privacy Policy
            </Link>
        </div>

        {/* Admin Auth Diagnostics */}
        {adminDiagnosticsEnabled && (
          <div className="bg-slate-900/5 border border-slate-900/10 text-slate-900 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 flex flex-col gap-2 shadow-[0_0_15px_rgba(0,0,0,0.08)]">
            <p className="font-semibold text-sm sm:text-base">Auth diagnostics (admin)</p>
            <p className="text-xs sm:text-sm text-slate-700">
              Clerk loaded: {isAuthLoaded ? 'yes' : 'no'} · Signed in:{' '}
              {isSignedIn ? 'yes' : 'no'} · User ID: {user?.id ?? 'none'}
            </p>
            <p className="text-[11px] sm:text-xs text-slate-600">
              Billing status: {billingStatus} · Billing error: {billingError ?? 'none'}
            </p>
            {isSignedIn && billingStatus === 'error' && (
              <p className="text-[11px] sm:text-xs text-slate-600">
                If signed in but billing is 401, confirm CLERK_SECRET_KEY matches the
                publishable key in Vercel.
              </p>
            )}
          </div>
        )}

        {/* Admin Billing Diagnostics (bypass users only) */}
        {isBypass && adminDiagnosticsEnabled && billingStatus === 'error' && (
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
        {isAuthenticated && billing && isOnTrial && (
          <div className="mb-4 flex flex-col items-start justify-between gap-3 rounded-lg border border-[#6d5dfc]/20 bg-white p-3 text-[#101114] shadow-[0_16px_44px_rgba(109,93,252,0.12)] sm:mb-6 sm:flex-row sm:items-center sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3 flex-1">
              <Zap size={18} className="sm:w-5 sm:h-5 text-black flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-black text-sm sm:text-base">Free Try-Ons Available!</p>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                  You have {billing.trialsRemaining} free try-on{billing.trialsRemaining !== 1 ? 's' : ''}. Upgrade to get unlimited try-ons with a subscription.
                </p>
              </div>
            </div>
            <Link 
              href="/pricing"
              className="flex min-h-11 w-full items-center justify-center rounded-lg bg-[#101114] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-[0_10px_24px_rgba(16,17,20,0.18)] transition-colors hover:bg-[#20232a] sm:w-auto sm:py-2 touch-manipulation"
            >
              Go to Pricing
            </Link>
          </div>
        )}

        {/* Low Credits Warning */}
        {billingBannerState === 'low_credits' && billing && (
          <div className="mb-4 flex flex-col items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 shadow-sm sm:mb-6 sm:flex-row sm:items-center sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3 flex-1">
              <CreditCard size={18} className="sm:w-5 sm:h-5 text-yellow-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-sm sm:text-base">Low Credits</p>
                <p className="text-xs sm:text-sm text-amber-800 mt-0.5">
                  You have {billing.creditsAvailable} credit{billing.creditsAvailable !== 1 ? 's' : ''} remaining
                </p>
              </div>
            </div>
            <Link
              href="/pricing"
              className="flex min-h-11 w-full items-center justify-center rounded-lg bg-amber-500 px-4 py-2.5 text-center text-sm font-semibold text-black transition-colors hover:bg-amber-400 sm:w-auto sm:py-2 touch-manipulation"
            >
              Go to Pricing
            </Link>
          </div>
        )}

        {/* No Credits Warning */}
        {billingBannerState === 'no_credits' && (
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

        {billingBannerState === 'trial_complete' && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <div className="flex items-center gap-2 sm:gap-3 flex-1">
              <Zap size={18} className="sm:w-5 sm:h-5 text-emerald-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-sm sm:text-base text-emerald-800">Free Try-Ons Complete</p>
                <p className="text-xs sm:text-sm text-emerald-700 mt-0.5">
                  Your previews are ready. Upgrade or purchase credits to generate more looks.
                </p>
              </div>
            </div>
            <Link
              href="/pricing"
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-500 transition-colors text-sm shadow-[0_0_15px_rgba(16,185,129,0.25)] text-center min-h-[44px] flex items-center justify-center touch-manipulation"
            >
              View Plans
            </Link>
          </div>
        )}

        {pitchDemoEnabled && !isAuthenticated && (
          <div className="rounded-lg border border-black/15 bg-blue-50 p-3 sm:p-4 mb-4 sm:mb-6 text-sm sm:text-base text-blue-900">
            Demo mode is active. You can upload photos without signing in, generate one pitch-ready preview, and then the paywall will appear.
          </div>
        )}

        {!pitchDemoEnabled && backendAvailability !== 'healthy' && (
          <div
            className={`p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 border text-sm sm:text-base ${
              backendAvailability === 'checking'
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            {backendAvailabilityMessage ||
              (backendAvailability === 'checking'
                ? 'Checking try-on service availability...'
                : 'Try-on is temporarily unavailable.')}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 shadow-sm sm:mb-6 sm:p-4 sm:text-base">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-12 lg:gap-8">
          
          <div className="space-y-4 sm:space-y-5 lg:col-span-7 lg:space-y-6">
            
            <section
              id="choose-wardrobe"
              className={`${cardClass} ${cardPadding} space-y-4`}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-3 text-base font-semibold text-[#101114] sm:text-lg">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#101114] text-white shadow-[0_10px_24px_rgba(16,17,20,0.18)]">
                    <UserRound size={17} />
                  </span>
                  Upload Yourself
                </h2>
                <span className="hidden rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 sm:inline-flex">
                  Main reference first
                </span>
              </div>
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
                isAuthenticated={isAuthenticated || pitchDemoEnabled}
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
              <p className="mt-2 text-[11px] sm:text-xs text-slate-500">
                Tip: Drag to reorder; the first photo is used as the main reference. Aim for front / 45° / profile in good light.
              </p>
            </section>

            <section className={`${cardClass} ${cardPadding} space-y-4`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-3 text-base font-semibold text-[#101114] sm:text-lg">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#101114] text-white shadow-[0_10px_24px_rgba(16,17,20,0.18)]">
                    <Shirt size={17} />
                  </span>
                  Choose Wardrobe
                </h2>
                <span className="hidden rounded-lg border border-[#009b9b]/20 bg-[#009b9b]/10 px-3 py-1.5 text-xs font-medium text-[#007f7f] sm:inline-flex">
                  Up to 5 pieces
                </span>
              </div>

              {tryOnFromUrlEnabled && (
                <>
                  <div className="rounded-lg border border-dashed border-[#6d5dfc]/30 bg-[#6d5dfc]/5 p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="rounded-md bg-[#101114] px-2 py-0.5 text-[10px] font-bold text-white">Optional</span>
                      <h3 className="text-sm font-semibold text-[#101114]">Try On Any URL</h3>
                    </div>
                    <TryOnFromUrl
                      onProductScraped={handleProductScraped}
                      isAuthenticated={isAuthenticated}
                      onAuthRequired={requireAuth}
                      disabled={wardrobeItems.length >= 5 || backendAvailability !== 'healthy'}
                    />
                  </div>

                  <div className="relative flex items-center gap-3 my-2">
                    <div className="flex-1 h-px bg-black/10"></div>
                    <span className="text-xs font-medium text-slate-400">or upload images</span>
                    <div className="flex-1 h-px bg-black/10"></div>
                  </div>
                </>
              )}

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
                isAuthenticated={isAuthenticated || pitchDemoEnabled}
                enableGuestDemo={pitchDemoEnabled}
                onAuthRequired={requireAuth}
                isUploadEnabled={pitchDemoEnabled || backendAvailability === 'healthy'}
                disabledMessage={
                  pitchDemoEnabled || backendAvailability === 'healthy'
                    ? 'Please sign in to upload clothing items.'
                    : backendAvailabilityMessage || 'Try-on is temporarily unavailable.'
                }
                blockedMessage="Please sign in to upload clothing items."
              />
              {wardrobeItems.length > 1 && (
                <div className="mt-3 rounded-lg border border-[#009b9b]/20 bg-[#009b9b]/10 p-3 shadow-sm">
                  <p className="text-sm text-[#006f6f]">
                    <strong>Tip:</strong> You can try on up to 5 items at once for a complete outfit.
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
                    logger.info("tryon_button_clicked");
                    if (!isAuthenticated && !pitchDemoEnabled) {
                      setError('Please sign in to try on.');
                      return;
                    }
                    if (isGenerating) {
                      logger.info("tryon_button_duplicate_ignored");
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
                  w-full rounded-lg py-3.5 text-base font-semibold sm:py-4 sm:text-lg flex items-center justify-center gap-2 sm:gap-3 transition-all
                  min-h-[52px] touch-manipulation select-none
                  ${isGenerating 
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300 pointer-events-none'
                    : backendAvailability !== 'healthy'
                      ? pitchDemoEnabled
                        ? 'bg-[#101114] text-white hover:bg-[#20232a] active:scale-[0.98] border border-[#101114]'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : !isAuthenticated && !pitchDemoEnabled
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-[linear-gradient(135deg,#101114_0%,#5b46f4_52%,#009b9b_100%)] text-white hover:brightness-105 active:scale-[0.98] border border-[#101114]/10 shadow-[0_18px_36px_rgba(91,70,244,0.24)]'
                  }
                `}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={18} className="sm:w-5 sm:h-5 animate-spin" />
                    <span>Generating your look...</span>
                  </>
                ) : isGuestPitchDemo ? (
                  <>
                    <WandSparkles size={18} className="sm:w-5 sm:h-5" />
                    <span>Launch demo preview</span>
                  </>
                ) : !isAuthenticated && !pitchDemoEnabled ? (
                  <>
                    <WandSparkles size={18} className="sm:w-5 sm:h-5" />
                    <span>Sign in to try on</span>
                  </>
                ) : backendAvailability === 'checking' ? (
                  <>
                    <Loader2 size={18} className="sm:w-5 sm:h-5 animate-spin" />
                    <span>Checking service...</span>
                  </>
                ) : backendAvailability !== 'healthy' ? (
                  <>
                    <WandSparkles size={18} className="sm:w-5 sm:h-5" />
                    <span>{pitchDemoEnabled ? 'Launch demo preview' : 'Try-on unavailable'}</span>
                  </>
                ) : (
                  <>
                    <WandSparkles size={18} className="sm:w-5 sm:h-5" />
                    <span>{isGuestPitchDemo ? 'Launch demo preview' : 'Try it on'}</span>
                  </>
                )}
              </button>
              {isGenerating && (
                <button
                  onClick={() => abortController?.abort()}
                  className="w-full text-center text-sm text-slate-600 underline hover:text-[#5b46f4]"
                  aria-label="Cancel operation"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4 sm:space-y-5 lg:col-span-5 lg:space-y-6">
            
            <section
              id="legacy-virtual-mirror"
              className="scroll-mt-24 overflow-hidden rounded-lg border border-slate-800 bg-[#101114] p-3 text-white shadow-[0_28px_80px_rgba(15,23,42,0.24)] sm:p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold text-white sm:text-lg">
                  <Sparkles size={18} className="text-[#8ff4e6]" />
                  Virtual Mirror
                </h2>
                <span className="rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-slate-200">
                  Fit view
                </span>
              </div>
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
                <div className="mt-3 rounded-lg border border-white/15 bg-white/10 p-3 text-xs text-slate-200">
                  For safety, we automatically add tasteful coverage/lining for intimate or minimal-coverage items.
                </div>
              )}
              
              {/* Social Share Buttons - appears after successful try-on */}
              {generatedImage && !isGenerating && (
                <div className="mt-4 rounded-lg border border-white/15 bg-white/10 p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                    Share Your Look
                    <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-200">
                      Get 2 free credits
                    </span>
                  </h3>
                  <SocialShareButtons
                    imageUrl={generatedImage}
                    isPreview={isPreviewResult}
                    onUpgradeClick={redirectToPricing}
                  />
                  <p className="mt-3 text-[11px] text-slate-300">
                    Tag @igetdressed.online on Instagram for a chance to be featured.
                  </p>
                </div>
              )}

              {generatedImage && !isGenerating && user && (
                <div className="mt-4 rounded-lg border border-white/15 bg-white/10 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Shop &amp; Save
                      </p>
                      <p className="text-xs text-slate-300">
                        Compare prices for up to 5 wardrobe items using Google Shopping data.
                      </p>
                    </div>
                    <button
                      onClick={() => setIsShopSaveOpen(true)}
                      className="w-full rounded-lg border border-white/16 bg-white px-4 py-2 text-xs font-semibold text-[#101114] transition-colors hover:bg-slate-100 sm:w-auto"
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
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-[#101114] sm:mb-4 sm:text-lg">
                  <Search size={18} className="text-[#009b9b] sm:h-5 sm:w-5" />
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
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      {productSearchError ? (
                        <p>{productSearchError}</p>
                      ) : (
                        <p>No matching products found yet.</p>
                      )}
                      <p className="mt-2 text-xs text-slate-500">
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
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-[#101114] sm:mb-4 sm:text-lg">
                  <Search size={18} className="text-[#009b9b] sm:h-5 sm:w-5" />
                  Shop &amp; Save Deals
                </h2>
                <div className="space-y-4">
                  {shopSaveResults.map((result) => {
                    const itemImageUrl = ensureAbsoluteUrl(result.item.public_url);
                    return (
                    <div
                      key={result.item.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-4"
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
                          <p className="text-[11px] font-semibold text-slate-500">
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
                                  className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"
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
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold border border-[#101114] transition-colors ${
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
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold transition-colors hover:border-slate-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        ref={mobileActionBarRef}
        className="hidden"
      >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-slate-700">Ready to try on?</p>
              <p className="text-[11px] text-black/60 truncate">
                {userImages.length ? `${userImages.length} selfie${userImages.length !== 1 ? 's' : ''}` : 'Add a selfie'}
                {" • "}
                {wardrobeItems.length ? `${wardrobeItems.length} item${wardrobeItems.length !== 1 ? 's' : ''}` : 'Add clothing items'}
              </p>
            </div>
            <button
              onClick={() => {
                if (!isAuthenticated && !pitchDemoEnabled) {
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
                min-w-[120px] rounded-lg px-4 py-3 text-xs font-bold
                ${isGenerating ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : !isAuthenticated && !pitchDemoEnabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-900 active:bg-gray-800'}
              `}
            >
              {isGenerating ? 'Working...' : !isAuthenticated && !pitchDemoEnabled ? 'Sign in to try on' : isGuestPitchDemo ? 'Launch demo' : 'Try it on'}
            </button>
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

  return hasUsableClerkKey() ? <HomeContentWithClerk /> : <HomeContentWithoutClerk />;
}
