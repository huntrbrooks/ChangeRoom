'use client';

import React, { useState } from 'react';
import { X, Sparkles, Zap, Crown, CreditCard } from 'lucide-react';
import { stripeConfig, appConfig } from '@/lib/config';
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
  const [loading, setLoading] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCheckout = async (priceId: string, mode: 'subscription' | 'payment', startTrial?: boolean) => {
    setLoading(priceId);
    try {
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
      setLoading(null);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-gray-900 border border-cyan-500/30 rounded-none sm:rounded-2xl shadow-[0_0_30px_rgba(0,255,255,0.3)] max-w-2xl w-full h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-cyan-500/20 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-10">
          <h2 className="text-xl sm:text-2xl font-bold text-cyan-300">Upgrade to Continue</h2>
          <button
            onClick={onClose}
            className="text-cyan-400 hover:text-cyan-300 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Close"
          >
            <X size={20} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {onTrial && (
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 sm:p-4 shadow-[0_0_15px_rgba(0,255,255,0.2)]">
              <p className="text-xs sm:text-sm text-cyan-300">
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
            <h3 className="text-base sm:text-lg font-semibold text-cyan-300">Subscription Plans</h3>
            
            {/* Standard Plan */}
            <div className="border-2 border-cyan-500/20 rounded-xl p-4 sm:p-5 hover:border-cyan-500/50 transition-colors bg-gray-800/50">
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                    <Zap size={18} className="sm:w-5 sm:h-5 text-cyan-400 flex-shrink-0" />
                    <h4 className="text-lg sm:text-xl font-bold text-cyan-300">Standard</h4>
                  </div>
                  <p className="text-cyan-400/70 text-xs sm:text-sm">
                    Perfect for regular users
                  </p>
                </div>
              </div>
              <div className="mb-3 sm:mb-4">
                <div className="text-2xl sm:text-3xl font-bold mb-1 text-cyan-300">
                  {appConfig.standardMonthlyCredits} credits/month
                </div>
                <p className="text-xs sm:text-sm text-cyan-400/60">Monthly subscription</p>
              </div>
              <button
                onClick={() => handleCheckout(stripeConfig.standardPriceId, 'subscription', !onTrial && plan === 'free')}
                disabled={loading !== null}
                className="w-full py-3 sm:py-3 bg-cyan-500 text-black rounded-lg font-semibold hover:bg-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,255,255,0.3)] min-h-[44px] touch-manipulation text-sm sm:text-base"
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
            <div className="border-2 border-cyan-400 rounded-xl p-4 sm:p-5 hover:border-cyan-500 transition-colors bg-gradient-to-br from-cyan-500/10 to-gray-800/50 shadow-[0_0_20px_rgba(0,255,255,0.2)]">
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5 sm:mb-2 flex-wrap">
                    <Crown size={18} className="sm:w-5 sm:h-5 text-cyan-400 flex-shrink-0" />
                    <h4 className="text-lg sm:text-xl font-bold text-cyan-300">Pro</h4>
                    <span className="bg-cyan-500/20 text-cyan-300 text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-cyan-500/30 whitespace-nowrap">POPULAR</span>
                  </div>
                  <p className="text-cyan-400/70 text-xs sm:text-sm">
                    For power users and professionals
                  </p>
                </div>
              </div>
              <div className="mb-3 sm:mb-4">
                <div className="text-2xl sm:text-3xl font-bold mb-1 text-cyan-300">
                  {appConfig.proMonthlyCredits} credits/month
                </div>
                <p className="text-xs sm:text-sm text-cyan-400/60">Monthly subscription</p>
              </div>
              <button
                onClick={() => handleCheckout(stripeConfig.proPriceId, 'subscription', !onTrial && plan === 'free')}
                disabled={loading !== null}
                className="w-full py-3 sm:py-3 bg-cyan-500 text-black rounded-lg font-semibold hover:bg-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(0,255,255,0.4)] min-h-[44px] touch-manipulation text-sm sm:text-base"
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
          <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4 border-t border-cyan-500/20">
            <h3 className="text-base sm:text-lg font-semibold text-cyan-300">Or Buy Credits</h3>
            
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              {/* Small Credit Pack */}
              <div className="border border-cyan-500/20 rounded-lg p-3 sm:p-4 hover:border-cyan-500/50 transition-colors bg-gray-800/30">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
                  <CreditCard size={14} className="sm:w-4 sm:h-4 text-cyan-400 flex-shrink-0" />
                  <h4 className="font-semibold text-cyan-300 text-xs sm:text-sm">Small Pack</h4>
                </div>
                <div className="mb-2 sm:mb-3">
                  <div className="text-lg sm:text-2xl font-bold text-cyan-300">
                    {appConfig.creditPackSmallAmount} credits
                  </div>
                </div>
                <button
                  onClick={() => handleCheckout(stripeConfig.creditPackSmallPriceId, 'payment')}
                  disabled={loading !== null}
                  className="w-full py-2 sm:py-2 bg-cyan-500/20 text-cyan-300 rounded-lg font-semibold hover:bg-cyan-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm border border-cyan-500/30 min-h-[44px] touch-manipulation"
                >
                  {loading === stripeConfig.creditPackSmallPriceId ? 'Loading...' : 'Buy Now'}
                </button>
              </div>

              {/* Large Credit Pack */}
              <div className="border border-cyan-500/20 rounded-lg p-3 sm:p-4 hover:border-cyan-500/50 transition-colors bg-gray-800/30">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
                  <Sparkles size={14} className="sm:w-4 sm:h-4 text-cyan-400 flex-shrink-0" />
                  <h4 className="font-semibold text-cyan-300 text-xs sm:text-sm">Large Pack</h4>
                </div>
                <div className="mb-2 sm:mb-3">
                  <div className="text-lg sm:text-2xl font-bold text-cyan-300">
                    {appConfig.creditPackLargeAmount} credits
                  </div>
                </div>
                <button
                  onClick={() => handleCheckout(stripeConfig.creditPackLargePriceId, 'payment')}
                  disabled={loading !== null}
                  className="w-full py-2 sm:py-2 bg-cyan-500/20 text-cyan-300 rounded-lg font-semibold hover:bg-cyan-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm border border-cyan-500/30 min-h-[44px] touch-manipulation"
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

