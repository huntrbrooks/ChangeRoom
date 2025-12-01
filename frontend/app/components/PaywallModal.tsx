'use client';

import React, { useState } from 'react';
import { X, Sparkles, Zap, Crown, CreditCard, Check } from 'lucide-react';
import { stripeConfig, appConfig } from '@/lib/config';
import { getProductFeatures } from '@/lib/products';
import { useUser } from '@clerk/nextjs';
import { trackCheckoutInitiated, trackProductView } from '@/lib/clerk-tracking';
import axios from 'axios';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  creditsAvailable: number;
  plan: 'free' | 'standard' | 'pro';
  onTrial?: boolean;
}

export function PaywallModal({
  isOpen,
  onClose,
  creditsAvailable,
  plan,
  onTrial,
}: PaywallModalProps) {
  const { user } = useUser();
  const [loading, setLoading] = useState<string | null>(null);
  const standardFeatures = getProductFeatures('standard');
  const proFeatures = getProductFeatures('pro');

  React.useEffect(() => {
    if (isOpen && user) {
      trackProductView(user, 'standard');
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleCheckout = async (priceId: string, mode: 'subscription' | 'payment', startTrial?: boolean, planType?: 'standard' | 'pro' | 'credit-pack') => {
    if (!priceId) {
      console.error('Price ID is missing');
      alert('Configuration error: Price ID not found. Please contact support.');
      return;
    }

    setLoading(priceId);
    try {
      // Track checkout initiation
      if (user && planType) {
        try {
          await trackCheckoutInitiated(user, planType, priceId);
        } catch (trackError) {
          console.warn('Tracking error (non-critical):', trackError);
        }
      }

      const response = await axios.post('/api/billing/create-checkout-session', {
        priceId,
        mode,
        startTrial,
      });
      if (response.data.url) {
        window.location.href = response.data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error: unknown) {
      console.error('Checkout error:', error);
      const axiosError = error && typeof error === 'object' && 'response' in error 
        ? (error as { response?: { data?: { error?: string } } })
        : null;
      alert(axiosError?.response?.data?.error || 'Failed to start checkout. Please try again.');
      setLoading(null);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#FAF9F6]/80 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-[#FAF9F6] border border-[#FF13F0]/30 rounded-none sm:rounded-2xl shadow-[0_0_30px_rgba(255,19,240,0.3)] max-w-2xl w-full h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#FAF9F6] border-b border-[#FF13F0]/20 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-10">
          <h2 className="text-xl sm:text-2xl font-bold text-[#FF13F0]">Upgrade to Continue</h2>
          <button
            onClick={onClose}
            className="text-[#FF13F0] hover:text-[#FF13F0]/80 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Close"
          >
            <X size={20} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {onTrial && (
            <div className="bg-[#FF13F0]/10 border border-[#FF13F0]/30 rounded-lg p-3 sm:p-4 shadow-[0_0_15px_rgba(255,19,240,0.2)]">
              <p className="text-xs sm:text-sm text-[#FF13F0]">
                <strong>Free Try-On Available!</strong> - You have 1 free try-on. 
                Upgrade now to get unlimited try-ons with a subscription.
              </p>
            </div>
          )}

          {creditsAvailable === 0 && !onTrial && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 sm:p-4 shadow-[0_0_15px_rgba(255,0,0,0.2)]">
              <p className="text-xs sm:text-sm text-red-300">
                <strong>No Credits Remaining</strong> - Upgrade to a paid plan or purchase credits to continue using Change Room.
              </p>
            </div>
          )}

          {creditsAvailable > 0 && creditsAvailable <= 3 && !onTrial && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 sm:p-4 shadow-[0_0_15px_rgba(255,255,0,0.2)]">
              <p className="text-xs sm:text-sm text-yellow-300">
                <strong>Low Credits</strong> - You have {creditsAvailable} credit{creditsAvailable !== 1 ? 's' : ''} remaining.
              </p>
            </div>
          )}

          {/* Subscription Plans */}
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-semibold text-[#FF13F0]">Subscription Plans</h3>
            
            {/* Standard Plan */}
            <div className="border-2 border-[#FF13F0]/20 rounded-xl p-4 sm:p-5 hover:border-[#FF13F0]/50 transition-colors bg-gray-100/50">
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                    <Zap size={18} className="sm:w-5 sm:h-5 text-[#FF13F0] flex-shrink-0" />
                    <h4 className="text-lg sm:text-xl font-bold text-[#FF13F0]">Standard</h4>
                  </div>
                  <p className="text-[#FF13F0]/70 text-xs sm:text-sm">
                    {standardFeatures.description}
                  </p>
                </div>
              </div>
              <div className="mb-3 sm:mb-4">
                <div className="text-2xl sm:text-3xl font-bold mb-1 text-[#FF13F0]">
                  {appConfig.standardMonthlyCredits} credits/month
                </div>
                <p className="text-xs sm:text-sm text-[#FF13F0]/60 mb-1">Monthly subscription</p>
                <p className="text-xs text-[#FF13F0]/50">≈ $0.20 per try-on</p>
              </div>
              
              {/* Features List */}
              <div className="mb-3 sm:mb-4 space-y-1.5">
                {standardFeatures.features.slice(0, 3).map((feature) => (
                  <div key={feature.id} className="flex items-center gap-2 text-xs sm:text-sm text-[#FF13F0]">
                    <Check size={14} className="text-[#FF13F0] flex-shrink-0" />
                    <span>{feature.name}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  try {
                    const priceId = stripeConfig.standardPriceId;
                    if (!priceId) throw new Error('Standard price ID not configured');
                    handleCheckout(priceId, 'subscription', !onTrial && plan === 'free', 'standard');
                  } catch (err) {
                    console.error('Error getting price ID:', err);
                    alert('Configuration error. Please contact support.');
                  }
                }}
                disabled={loading !== null}
                className="w-full py-3 sm:py-3 bg-[#FF13F0] text-white rounded-lg font-semibold hover:bg-[#FF13F0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(255,19,240,0.3)] min-h-[44px] touch-manipulation text-sm sm:text-base"
              >
                {loading === stripeConfig.standardPriceId ? (
                  'Loading...'
                ) : (
                  <>
                    {!onTrial && plan === 'free' ? 'Start Free Trial' : 'Upgrade to Standard'}
                  </>
                )}
              </button>
            </div>

            {/* Pro Plan */}
            <div className="border-2 border-[#FF13F0] rounded-xl p-4 sm:p-5 hover:border-[#FF13F0] transition-colors bg-gradient-to-br from-[#FF13F0]/10 to-gray-800/50 shadow-[0_0_20px_rgba(255,19,240,0.2)]">
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5 sm:mb-2 flex-wrap">
                    <Crown size={18} className="sm:w-5 sm:h-5 text-[#FF13F0] flex-shrink-0" />
                    <h4 className="text-lg sm:text-xl font-bold text-[#FF13F0]">Pro</h4>
                    <span className="bg-[#FF13F0]/20 text-[#FF13F0] text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-[#FF13F0]/30 whitespace-nowrap">POPULAR</span>
                  </div>
                  <p className="text-[#FF13F0]/70 text-xs sm:text-sm">
                    {proFeatures.description}
                  </p>
                </div>
              </div>
              <div className="mb-3 sm:mb-4">
                <div className="text-2xl sm:text-3xl font-bold mb-1 text-[#FF13F0]">
                  {appConfig.proMonthlyCredits} credits/month
                </div>
                <p className="text-xs sm:text-sm text-[#FF13F0]/60 mb-1">Monthly subscription</p>
                <p className="text-xs text-[#FF13F0]/50">≈ $0.08 per try-on • Best Value</p>
              </div>
              
              {/* Features List */}
              <div className="mb-3 sm:mb-4 space-y-1.5">
                {proFeatures.features.slice(0, 4).map((feature) => (
                  <div key={feature.id} className="flex items-center gap-2 text-xs sm:text-sm text-[#FF13F0]">
                    <Check size={14} className="text-[#FF13F0] flex-shrink-0" />
                    <span>{feature.name}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  try {
                    const priceId = stripeConfig.proPriceId;
                    if (!priceId) throw new Error('Pro price ID not configured');
                    handleCheckout(priceId, 'subscription', !onTrial && plan === 'free', 'pro');
                  } catch (err) {
                    console.error('Error getting price ID:', err);
                    alert('Configuration error. Please contact support.');
                  }
                }}
                disabled={loading !== null}
                className="w-full py-3 sm:py-3 bg-[#FF13F0] text-white rounded-lg font-semibold hover:bg-[#FF13F0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,19,240,0.4)] min-h-[44px] touch-manipulation text-sm sm:text-base"
              >
                {loading === stripeConfig.proPriceId ? (
                  'Loading...'
                ) : (
                  <>
                    {!onTrial && plan === 'free' ? 'Start Free Trial' : 'Upgrade to Pro'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Credit Packs */}
          <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4 border-t border-[#FF13F0]/20">
            <h3 className="text-base sm:text-lg font-semibold text-[#FF13F0]">Or Buy Credits</h3>
            
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              {/* Small Credit Pack */}
              <div className="border border-[#FF13F0]/20 rounded-lg p-3 sm:p-4 hover:border-[#FF13F0]/50 transition-colors bg-gray-100/30">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
                  <CreditCard size={14} className="sm:w-4 sm:h-4 text-[#FF13F0] flex-shrink-0" />
                  <h4 className="font-semibold text-[#FF13F0] text-xs sm:text-sm">Small Pack</h4>
                </div>
                <div className="mb-2 sm:mb-3">
                  <div className="text-lg sm:text-2xl font-bold text-[#FF13F0]">
                    {appConfig.creditPackSmallAmount} credits
                  </div>
                </div>
                <button
                  onClick={() => {
                    try {
                      const priceId = stripeConfig.creditPackSmallPriceId;
                      if (!priceId) throw new Error('Small pack price ID not configured');
                      handleCheckout(priceId, 'payment', false, 'credit-pack');
                    } catch (err) {
                      console.error('Error getting price ID:', err);
                      alert('Configuration error. Please contact support.');
                    }
                  }}
                  disabled={loading !== null}
                  className="w-full py-2 sm:py-2 bg-[#FF13F0]/20 text-[#FF13F0] rounded-lg font-semibold hover:bg-[#FF13F0]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm border border-[#FF13F0]/30 min-h-[44px] touch-manipulation"
                >
                  {loading === stripeConfig.creditPackSmallPriceId ? 'Loading...' : 'Buy Now'}
                </button>
              </div>

              {/* Large Credit Pack */}
              <div className="border border-[#FF13F0]/20 rounded-lg p-3 sm:p-4 hover:border-[#FF13F0]/50 transition-colors bg-gray-100/30">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
                  <Sparkles size={14} className="sm:w-4 sm:h-4 text-[#FF13F0] flex-shrink-0" />
                  <h4 className="font-semibold text-[#FF13F0] text-xs sm:text-sm">Large Pack</h4>
                </div>
                <div className="mb-2 sm:mb-3">
                  <div className="text-lg sm:text-2xl font-bold text-[#FF13F0]">
                    {appConfig.creditPackLargeAmount} credits
                  </div>
                </div>
                <button
                  onClick={() => {
                    try {
                      const priceId = stripeConfig.creditPackLargePriceId;
                      if (!priceId) throw new Error('Large pack price ID not configured');
                      handleCheckout(priceId, 'payment', false, 'credit-pack');
                    } catch (err) {
                      console.error('Error getting price ID:', err);
                      alert('Configuration error. Please contact support.');
                    }
                  }}
                  disabled={loading !== null}
                  className="w-full py-2 sm:py-2 bg-[#FF13F0]/20 text-[#FF13F0] rounded-lg font-semibold hover:bg-[#FF13F0]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm border border-[#FF13F0]/30 min-h-[44px] touch-manipulation"
                >
                  {loading === stripeConfig.creditPackLargePriceId ? 'Loading...' : 'Buy Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

