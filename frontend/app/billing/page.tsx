'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { CreditCard, Zap, Crown, Sparkles, Settings, ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';
import axios from 'axios';
import { stripeConfig, appConfig } from '@/lib/config';
import { getProductFeatures } from '@/lib/products';
import { trackCheckoutInitiated, trackUpgradeClick } from '@/lib/clerk-tracking';
import { PaywallModal } from '../components/PaywallModal';

// Force dynamic rendering to prevent static generation issues with Clerk
export const dynamic = 'force-dynamic';

interface BillingInfo {
  plan: 'free' | 'standard' | 'pro';
  creditsAvailable: number;
  creditsRefreshAt: Date | null;
  trialUsed?: boolean;
}

function BillingPageContent() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    if (isLoaded && user) {
      fetchBilling();
    }
  }, [isLoaded, user]);

  const fetchBilling = async () => {
    try {
      const response = await axios.get('/api/my/billing');
      setBilling(response.data);
    } catch (error) {
      console.error('Error fetching billing:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const response = await axios.post('/api/billing/portal');
      if (response.data.url) {
        window.location.href = response.data.url;
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

  const handleCheckout = async (priceId: string, mode: 'subscription' | 'payment', startTrial?: boolean, planType?: 'standard' | 'pro' | 'credit-pack') => {
    setCheckoutLoading(priceId);
    try {
      // Track checkout
      if (user && planType && billing) {
        if (planType === 'standard' || planType === 'pro') {
          await trackUpgradeClick(user, billing.plan, planType);
        }
        await trackCheckoutInitiated(user, planType, priceId);
      }

      const response = await axios.post('/api/billing/create-checkout-session', {
        priceId,
        mode,
        startTrial,
      });
      if (response.data.url) {
        window.location.href = response.data.url;
      }
    } catch (error: unknown) {
      console.error('Checkout error:', error);
      const axiosError = error && typeof error === 'object' && 'response' in error 
        ? (error as { response?: { data?: { error?: string } } })
        : null;
      alert(axiosError?.response?.data?.error || 'Failed to start checkout');
      setCheckoutLoading(null);
    }
  };

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const isOnTrial = billing && !billing.trialUsed ? true : false;

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    router.push('/sign-in');
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading billing information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-md z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-black transition-colors">
            <ArrowLeft size={20} />
            <span>Back to Home</span>
          </Link>
          <h1 className="text-xl font-bold">Billing & Subscription</h1>
          <div className="w-20"></div> {/* Spacer for centering */}
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Current Plan Status */}
        <div className="bg-gradient-to-br from-blue-50 to-white border-2 border-blue-200 rounded-xl p-6 mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold mb-2">Current Plan</h2>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold capitalize">{billing?.plan || 'Free'}</span>
                {isOnTrial && (
                  <span className="bg-blue-100 text-blue-700 text-sm font-semibold px-3 py-1 rounded-full">
                    Free Try-On Available
                  </span>
                )}
              </div>
            </div>
            {billing?.plan !== 'free' && (
              <button
                onClick={handleManageSubscription}
                disabled={portalLoading}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Settings size={18} />
                {portalLoading ? 'Loading...' : 'Manage'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Credits Available</p>
              <p className="text-2xl font-bold">{billing?.creditsAvailable || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">
                {billing?.plan !== 'free' ? 'Credits Refresh' : 'Status'}
              </p>
              <p className="text-lg font-semibold">
                {billing?.creditsRefreshAt 
                  ? formatDate(billing.creditsRefreshAt)
                  : isOnTrial ? 'Free Try-On Available' : 'No refresh'}
              </p>
            </div>
          </div>
        </div>

        {/* Upgrade Options */}
        {billing?.plan === 'free' && (
          <div className="mb-8">
            <h3 className="text-xl font-bold mb-4">Upgrade Your Plan</h3>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Standard Plan */}
              <div className="border-2 border-gray-200 rounded-xl p-6 hover:border-blue-500 transition-colors">
                <div className="flex items-center gap-2 mb-4">
                  <Zap size={24} className="text-blue-500" />
                  <h4 className="text-xl font-bold">Standard</h4>
                </div>
                <div className="mb-4">
                  <div className="text-3xl font-bold mb-1">
                    {appConfig.standardMonthlyCredits} credits/month
                  </div>
                  <p className="text-sm text-gray-500 mb-1">Perfect for regular users</p>
                  <p className="text-xs text-gray-400">≈ $0.20 per try-on</p>
                </div>
                
                {/* Features */}
                <div className="mb-4 space-y-2">
                  {getProductFeatures('standard').features.slice(0, 4).map((feature) => (
                    <div key={feature.id} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check size={16} className="text-blue-500" />
                      <span>{feature.name}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleCheckout(stripeConfig.standardPriceId, 'subscription', true, 'standard')}
                  disabled={checkoutLoading !== null}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {checkoutLoading === stripeConfig.standardPriceId ? 'Loading...' : 'Start Free Trial'}
                </button>
              </div>

              {/* Pro Plan */}
              <div className="border-2 border-purple-200 rounded-xl p-6 hover:border-purple-500 transition-colors bg-gradient-to-br from-purple-50 to-white">
                <div className="flex items-center gap-2 mb-4">
                  <Crown size={24} className="text-purple-500" />
                  <h4 className="text-xl font-bold">Pro</h4>
                  <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-2 py-1 rounded">POPULAR</span>
                </div>
                <div className="mb-4">
                  <div className="text-3xl font-bold mb-1">
                    {appConfig.proMonthlyCredits} credits/month
                  </div>
                  <p className="text-sm text-gray-500 mb-1">For power users and professionals</p>
                  <p className="text-xs text-purple-600 font-semibold">≈ $0.08 per try-on • Best Value</p>
                </div>
                
                {/* Features */}
                <div className="mb-4 space-y-2">
                  {getProductFeatures('pro').features.slice(0, 5).map((feature) => (
                    <div key={feature.id} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check size={16} className="text-purple-500" />
                      <span>{feature.name}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleCheckout(stripeConfig.proPriceId, 'subscription', true, 'pro')}
                  disabled={checkoutLoading !== null}
                  className="w-full py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  {checkoutLoading === stripeConfig.proPriceId ? 'Loading...' : 'Start Free Trial'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Credit Packs */}
        <div className="mb-8">
          <h3 className="text-xl font-bold mb-4">Buy Credits</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-lg p-5 hover:border-blue-500 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard size={20} className="text-gray-500" />
                <h4 className="font-semibold">Small Pack</h4>
              </div>
              <div className="mb-4">
                <div className="text-2xl font-bold">{appConfig.creditPackSmallAmount} credits</div>
              </div>
              <button
                onClick={() => handleCheckout(stripeConfig.creditPackSmallPriceId, 'payment')}
                disabled={checkoutLoading !== null}
                className="w-full py-2 bg-gray-100 text-gray-900 rounded-lg font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {checkoutLoading === stripeConfig.creditPackSmallPriceId ? 'Loading...' : 'Buy Now'}
              </button>
            </div>

            <div className="border border-gray-200 rounded-lg p-5 hover:border-blue-500 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={20} className="text-yellow-500" />
                <h4 className="font-semibold">Large Pack</h4>
              </div>
              <div className="mb-4">
                <div className="text-2xl font-bold">{appConfig.creditPackLargeAmount} credits</div>
              </div>
              <button
                onClick={() => handleCheckout(stripeConfig.creditPackLargePriceId, 'payment')}
                disabled={checkoutLoading !== null}
                className="w-full py-2 bg-gray-100 text-gray-900 rounded-lg font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {checkoutLoading === stripeConfig.creditPackLargePriceId ? 'Loading...' : 'Buy Now'}
              </button>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-3">How It Works</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>• Each try-on uses 1 credit</li>
            <li>• Subscription plans refresh credits monthly</li>
            <li>• Credit packs are added to your balance immediately</li>
            <li>• New users get 1 free try-on to test the service</li>
            <li>• You can upgrade, downgrade, or cancel anytime</li>
          </ul>
        </div>
      </div>

      {showPaywall && billing && (
        <PaywallModal
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          creditsAvailable={billing.creditsAvailable}
          plan={billing.plan}
          onTrial={isOnTrial}
        />
      )}
    </div>
  );
}

export default function BillingPage() {
  // During build/SSR, Clerk might not be available
  // Return a loading state that will be replaced at runtime
  if (typeof window === 'undefined') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  
  return <BillingPageContent />;
}

