'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Settings, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { httpClient } from '@/lib/httpClient';
import { offers } from '@/lib/billing-catalog';
import { PackPurchaseHistory } from '../components/PackPurchaseHistory';
import { CheckoutStatus } from '../components/CheckoutStatus';

// Force dynamic rendering to prevent static generation issues with Clerk
export const dynamic = 'force-dynamic';

interface BillingInfo {
  plan: 'free' | 'standard' | 'pro';
  creditsAvailable: number;
  creditsRefreshAt: Date | null;
  trialsRemaining: number;
  unlimitedCredits?: boolean;
  isPrivileged?: boolean;
  isFrozen?: boolean;
  canManageBilling?: boolean;
}

function BillingPageContent() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const fetchBilling = async () => {
    try {
      setBillingError(null);
      const response = await httpClient.get('/api/my/billing');
      setBilling(response.data);
    } catch (error) {
      console.error('Error fetching billing:', error);
      setBillingError('Unable to load billing details right now. Please retry in a moment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded && !user) { router.replace('/sign-in?redirect_url=%2Fbilling'); return; }
    if (isLoaded && user) void fetchBilling();
  }, [isLoaded, user, router]);

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const response = await httpClient.post('/api/billing/portal');
      if (response.data.url) {
        window.location.assign(response.data.url);
      }
    } catch (error: unknown) {
      console.error('Portal error:', error);
      const axiosError = error && typeof error === 'object' && 'response' in error 
        ? (error as { response?: { data?: { error?: string } } })
        : null;
      alert(axiosError?.response?.data?.error || 'Failed to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  };

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const isUnlimited = Boolean(billing?.unlimitedCredits || billing?.isPrivileged);
  const isOnTrial = billing && billing.trialsRemaining > 0 && !isUnlimited ? true : false;

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading billing information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6]">
      {/* Header */}
      <header className="border-b border-gray-100 sticky top-0 bg-[#FAF9F6]/95 backdrop-blur-md z-50">
        <div className="container mx-auto px-4 py-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <Link
            href="/"
            aria-label="Back to Home"
            className="flex items-center gap-2 text-gray-600 hover:text-black transition-colors whitespace-nowrap"
          >
            <ArrowLeft size={20} />
            <span className="hidden sm:inline">Back to Home</span>
          </Link>
          <h1 className="min-w-0 text-center text-base sm:text-xl font-bold truncate">
            Billing &amp; credits
          </h1>
          <div className="w-10 sm:w-24" aria-hidden /> {/* Spacer for centering */}
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <CheckoutStatus key={user.id} onSettled={fetchBilling} />
        {billingError && (
          <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
            {billingError}
          </div>
        )}
        {/* Current Plan Status */}
        <div className="bg-gradient-to-br from-blue-50 to-white border-2 border-blue-200 rounded-xl p-6 mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold mb-2">Current Plan</h2>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold capitalize">
                  {isUnlimited ? 'Unlimited' : offers.find(o => o.mode === 'subscription' && o.plan === billing?.plan)?.name || 'Free'}
                </span>
                {isUnlimited && (
                  <span className="bg-emerald-100 text-emerald-700 text-sm font-semibold px-3 py-1 rounded-full">
                    Full Access
                  </span>
                )}
                {isOnTrial && (
                  <span className="bg-blue-100 text-blue-700 text-sm font-semibold px-3 py-1 rounded-full">
                    Free Try-On Available
                  </span>
                )}
              </div>
            </div>
            {billing?.canManageBilling && (
              <button
                onClick={handleManageSubscription}
                disabled={portalLoading}
                className="flex items-center gap-2 px-4 py-2 bg-[#FAF9F6] border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Settings size={18} />
                {portalLoading ? 'Loading...' : 'Manage'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Credits Available</p>
              <p className="text-2xl font-bold">
                {isUnlimited ? 'Unlimited' : billing?.creditsAvailable || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">
                {isUnlimited ? 'Status' : billing?.plan !== 'free' ? 'Current period ends' : 'Status'}
              </p>
              <p className="text-lg font-semibold">
                {isUnlimited
                  ? 'Unlimited platform access'
                  : billing?.creditsRefreshAt
                  ? formatDate(billing.creditsRefreshAt)
                  : isOnTrial ? 'Free Try-On Available' : 'No refresh'}
              </p>
            </div>
          </div>
        </div>

        {billing?.isFrozen && <p role="alert" className="mb-4 rounded-lg bg-amber-50 p-4">Your payment needs attention. Choose Manage above to update your payment method or review the invoice.</p>}
        <PackPurchaseHistory key={'receipts:'+user.id} />
        {!isUnlimited && <div className="space-y-3">
          <Link href="/pricing" className="underline">View one-time credit packs</Link>
          <p>Pack credits are added after a successful one-time payment. Packs do not renew. If you have an existing subscription, you can still manage it here; unused purchased credits remain after cancellation.</p>
        </div>}
      </div>
    </div>
  );
}

export default function BillingPage() {
  // During build/SSR, Clerk might not be available
  // Return a loading state that will be replaced at runtime
  if (typeof window === 'undefined') {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  
  return <BillingPageContent />;
}
