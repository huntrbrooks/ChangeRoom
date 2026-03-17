'use client';

import React from 'react';
import Link from 'next/link';
import { X, Sparkles, Zap, Crown, CreditCard, Check } from 'lucide-react';
import { appConfig } from '@/lib/config';
import { getProductFeatures } from '@/lib/products';
import { useUser } from '@clerk/nextjs';
import { trackProductView } from '@/lib/clerk-tracking';
import { isBypassUser } from '@/lib/bypass-config';

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
  const standardFeatures = getProductFeatures('standard');
  const proFeatures = getProductFeatures('pro');
  const userEmail = user?.emailAddresses?.[0]?.emailAddress;
  const isBypass = isBypassUser(userEmail);

  React.useEffect(() => {
    if (isOpen && user) {
      trackProductView(user, 'standard');
    }
  }, [isOpen, user]);

  if (!isOpen) return null;


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white border border-black/30 rounded-none sm:rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.3)] max-w-2xl w-full h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-black/20 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-10">
          <h2 className="text-xl sm:text-2xl font-bold text-black">Upgrade to Continue</h2>
          <button
            onClick={onClose}
            className="text-black hover:text-[gray-900] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Close"
          >
            <X size={20} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {isBypass && (
            <div className="bg-gradient-to-r from-[black]/20 to-[gray-900]/20 border-2 border-black/40 rounded-lg p-3 sm:p-4 shadow-[0_0_20px_rgba(0,0,0,0.3)]">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={18} className="text-black flex-shrink-0" />
                <p className="text-sm sm:text-base font-semibold text-black">
                  Unlimited Access Active
                </p>
              </div>
              <p className="text-xs sm:text-sm text-[gray-900]">
                You have unlimited try-ons. All subscription and credit pack options remain available below.
              </p>
            </div>
          )}
          {onTrial && !isBypass && (
            <div className="bg-black/10 border border-black/30 rounded-lg p-3 sm:p-4 shadow-[0_0_15px_rgba(0,0,0,0.2)]">
              <p className="text-xs sm:text-sm text-black">
                <strong>Free Try-On Available!</strong> - You have 1 free try-on. 
                Upgrade now to get unlimited try-ons with a subscription.
              </p>
            </div>
          )}

          {creditsAvailable === 0 && !onTrial && !isBypass && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 sm:p-4 shadow-[0_0_15px_rgba(255,0,0,0.2)]">
              <p className="text-xs sm:text-sm text-red-300">
                <strong>No Credits Remaining</strong> - Upgrade to a paid plan or purchase credits to continue using IGetDressed.Online.
              </p>
            </div>
          )}

          {creditsAvailable > 0 && creditsAvailable <= 3 && !onTrial && !isBypass && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 sm:p-4 shadow-[0_0_15px_rgba(255,255,0,0.2)]">
              <p className="text-xs sm:text-sm text-yellow-300">
                <strong>Low Credits</strong> - You have {creditsAvailable} credit{creditsAvailable !== 1 ? 's' : ''} remaining.
              </p>
            </div>
          )}

          {/* Subscription Plans */}
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-semibold text-black">Subscription Plans</h3>
            
            {/* Standard Plan */}
            <div className="border-2 border-black/20 rounded-xl p-4 sm:p-5 hover:border-black/50 transition-colors bg-gray-100/50">
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                    <Zap size={18} className="sm:w-5 sm:h-5 text-black flex-shrink-0" />
                    <h4 className="text-lg sm:text-xl font-bold text-black">Standard</h4>
                  </div>
                  <p className="text-black/80 text-xs sm:text-sm">
                    {standardFeatures.description}
                  </p>
                </div>
              </div>
              <div className="mb-3 sm:mb-4">
                <div className="text-2xl sm:text-3xl font-bold mb-1 text-black">
                  {appConfig.standardMonthlyCredits} credits/month
                </div>
                <p className="text-xs sm:text-sm text-black/70 mb-1">Monthly subscription</p>
                <p className="text-xs text-black/60">≈ $0.20 per try-on</p>
              </div>
              
              {/* Features List */}
              <div className="mb-3 sm:mb-4 space-y-1.5">
                {standardFeatures.features.slice(0, 3).map((feature) => (
                  <div key={feature.id} className="flex items-center gap-2 text-xs sm:text-sm text-black">
                    <Check size={14} className="text-black flex-shrink-0" />
                    <span>{feature.name}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/pricing"
                className="w-full py-3 sm:py-3 bg-black text-white rounded-lg font-semibold hover:bg-black transition-colors shadow-[0_0_15px_rgba(0,0,0,0.3)] min-h-[44px] touch-manipulation text-sm sm:text-base text-center block"
              >
                {!onTrial && plan === 'free' ? 'Start Free Trial' : 'Go to Pricing'}
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="border-2 border-black rounded-xl p-4 sm:p-5 hover:border-black transition-colors bg-gradient-to-br from-[black]/10 to-gray-800/50 shadow-[0_0_20px_rgba(0,0,0,0.2)]">
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5 sm:mb-2 flex-wrap">
                    <Crown size={18} className="sm:w-5 sm:h-5 text-black flex-shrink-0" />
                    <h4 className="text-lg sm:text-xl font-bold text-black">Pro</h4>
                    <span className="bg-black/20 text-black text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-black/30 whitespace-nowrap">POPULAR</span>
                  </div>
                  <p className="text-black/80 text-xs sm:text-sm">
                    {proFeatures.description}
                  </p>
                </div>
              </div>
              <div className="mb-3 sm:mb-4">
                <div className="text-2xl sm:text-3xl font-bold mb-1 text-black">
                  {appConfig.proMonthlyCredits} credits/month
                </div>
                <p className="text-xs sm:text-sm text-black/70 mb-1">Monthly subscription</p>
                <p className="text-xs text-black/60">≈ $0.08 per try-on • Best Value</p>
              </div>
              
              {/* Features List */}
              <div className="mb-3 sm:mb-4 space-y-1.5">
                {proFeatures.features.slice(0, 4).map((feature) => (
                  <div key={feature.id} className="flex items-center gap-2 text-xs sm:text-sm text-black">
                    <Check size={14} className="text-black flex-shrink-0" />
                    <span>{feature.name}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/pricing"
                className="w-full py-3 sm:py-3 bg-black text-white rounded-lg font-semibold hover:bg-black transition-colors shadow-[0_0_20px_rgba(0,0,0,0.4)] min-h-[44px] touch-manipulation text-sm sm:text-base text-center block"
              >
                {!onTrial && plan === 'free' ? 'Start Free Trial' : 'Go to Pricing'}
              </Link>
            </div>
          </div>

          {/* Credit Packs */}
          <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4 border-t border-black/20">
            <h3 className="text-base sm:text-lg font-semibold text-black">Or Buy Credits</h3>
            
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              {/* Small Credit Pack */}
              <div className="border border-black/20 rounded-lg p-3 sm:p-4 hover:border-black/50 transition-colors bg-gray-100/30">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
                  <CreditCard size={14} className="sm:w-4 sm:h-4 text-black flex-shrink-0" />
                  <h4 className="font-semibold text-black text-xs sm:text-sm">Small Pack</h4>
                </div>
                <div className="mb-2 sm:mb-3">
                  <div className="text-lg sm:text-2xl font-bold text-black">
                    {appConfig.creditPackSmallAmount} credits
                  </div>
                </div>
                <Link
                  href="/pricing"
                  className="w-full py-2 sm:py-2 bg-black/20 text-black rounded-lg font-semibold hover:bg-black/30 transition-colors text-xs sm:text-sm border border-black/30 min-h-[44px] touch-manipulation text-center block"
                >
                  View Pricing
                </Link>
              </div>

              {/* Large Credit Pack */}
              <div className="border border-black/20 rounded-lg p-3 sm:p-4 hover:border-black/50 transition-colors bg-gray-100/30">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
                  <Sparkles size={14} className="sm:w-4 sm:h-4 text-black flex-shrink-0" />
                  <h4 className="font-semibold text-black text-xs sm:text-sm">Large Pack</h4>
                </div>
                <div className="mb-2 sm:mb-3">
                  <div className="text-lg sm:text-2xl font-bold text-black">
                    {appConfig.creditPackLargeAmount} credits
                  </div>
                </div>
                <Link
                  href="/pricing"
                  className="w-full py-2 sm:py-2 bg-black/20 text-black rounded-lg font-semibold hover:bg-black/30 transition-colors text-xs sm:text-sm border border-black/30 min-h-[44px] touch-manipulation text-center block"
                >
                  View Pricing
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

