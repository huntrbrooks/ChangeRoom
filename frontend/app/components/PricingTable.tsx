'use client';

import React from 'react';
import { Check, Zap, Crown, Sparkles } from 'lucide-react';
import { getAllProducts, ProductFeatures, PlanType } from '@/lib/products';
import { stripeConfig } from '@/lib/config';
import { useUser } from '@clerk/nextjs';
import { trackProductView, trackFeatureClick, trackCheckoutInitiated } from '@/lib/clerk-tracking';
import axios from 'axios';

interface PricingTableProps {
  currentPlan?: PlanType;
  onPlanSelect?: (plan: PlanType) => void;
  showCreditPacks?: boolean;
  compact?: boolean;
}

export function PricingTable({
  currentPlan,
  onPlanSelect,
  showCreditPacks = false,
  compact = false,
}: PricingTableProps) {
  const { user } = useUser();
  const [loading, setLoading] = React.useState<string | null>(null);
  const products = getAllProducts().filter(p => p.plan !== 'free' || !compact);

  React.useEffect(() => {
    // Track pricing table view
    if (user) {
      trackProductView(user, 'standard');
    }
  }, [user]);

  const handlePlanClick = async (product: ProductFeatures) => {
    if (product.plan === 'free') return;

    // Track product view
    if (user) {
      await trackProductView(user, product.plan);
    }

    if (onPlanSelect) {
      onPlanSelect(product.plan);
      return;
    }

    // Default: initiate checkout
    setLoading(product.plan);
    try {
      let priceId: string;
      if (product.plan === 'standard') {
        priceId = stripeConfig.standardPriceId;
      } else if (product.plan === 'pro') {
        priceId = stripeConfig.proPriceId;
      } else {
        return;
      }

      // Track checkout initiation
      if (user) {
        await trackCheckoutInitiated(user, product.plan, priceId);
      }

      const response = await axios.post('/api/billing/create-checkout-session', {
        priceId,
        mode: 'subscription',
        startTrial: currentPlan === 'free',
      });

      if (response.data.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout');
    } finally {
      setLoading(null);
    }
  };

  const handleFeatureHover = async (featureId: string, plan: PlanType) => {
    if (user) {
      await trackFeatureClick(user, featureId, plan);
    }
  };

  const formatPrice = (product: ProductFeatures) => {
    if (product.price.amount === 0) return 'Free';
    return `$${product.price.amount.toFixed(2)}/${product.price.period === 'month' ? 'mo' : ''}`;
  };

  const calculatePricePerCredit = (product: ProductFeatures) => {
    if (product.credits === 0) return null;
    const perCredit = product.price.amount / product.credits;
    return `$${perCredit.toFixed(2)} per try-on`;
  };

  return (
    <div className="w-full">
      {/* Desktop: Table Layout */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-[#FF13F0]/30">
              <th className="text-left p-4 text-[#FF13F0] font-semibold">Features</th>
              {products.map((product) => (
                <th
                  key={product.plan}
                  className={`text-center p-4 ${
                    product.popular
                      ? 'bg-gradient-to-b from-[#FF13F0]/20 to-transparent border-x-2 border-[#FF13F0]/30'
                      : ''
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2">
                      {product.plan === 'standard' && <Zap className="w-5 h-5 text-[#FF13F0]" />}
                      {product.plan === 'pro' && <Crown className="w-5 h-5 text-[#FF13F0]" />}
                      <span className="text-xl font-bold text-[#FF13F0]">{product.name}</span>
                      {product.badge && (
                        <span className="bg-[#FF13F0]/20 text-[#FF13F0] text-xs font-semibold px-2 py-1 rounded border border-[#FF13F0]/30">
                          {product.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-3xl font-bold text-[#FF13F0]">{formatPrice(product)}</div>
                    <div className="text-sm text-[#FF13F0]/70">{product.description}</div>
                    {product.credits > 0 && (
                      <div className="text-xs text-[#FF13F0]/60">
                        {product.credits} credits/month
                      </div>
                    )}
                    {calculatePricePerCredit(product) && (
                      <div className="text-xs text-[#FF13F0]/50">
                        {calculatePricePerCredit(product)}
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Get all unique features across all products */}
            {(() => {
              const allFeatureIds = new Set<string>();
              products.forEach((p) => {
                p.features.forEach((f) => allFeatureIds.add(f.id));
              });
              return Array.from(allFeatureIds);
            })().map((featureId) => {
              const feature = products
                .flatMap((p) => p.features)
                .find((f) => f.id === featureId);
              if (!feature) return null;

              return (
                <tr
                  key={featureId}
                  className="border-b border-[#FF13F0]/10 hover:bg-[#FF13F0]/5 transition-colors"
                >
                  <td className="p-4 text-[#FF13F0]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{feature.name}</span>
                      {feature.description && (
                        <span className="text-xs text-[#FF13F0]/60 hidden lg:inline">
                          - {feature.description}
                        </span>
                      )}
                    </div>
                  </td>
                  {products.map((product) => {
                    const hasFeature = product.features.some((f) => f.id === featureId);
                    return (
                      <td
                        key={`${product.plan}-${featureId}`}
                        className={`text-center p-4 ${
                          product.popular
                            ? 'bg-gradient-to-b from-[#FF13F0]/10 to-transparent border-x border-[#FF13F0]/20'
                            : ''
                        }`}
                        onMouseEnter={() => handleFeatureHover(featureId, product.plan)}
                      >
                        {hasFeature ? (
                          <Check className="w-5 h-5 text-[#FF13F0] mx-auto" />
                        ) : (
                          <span className="text-[#FF13F0]/30">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="p-4"></td>
              {products.map((product) => (
                <td
                  key={`action-${product.plan}`}
                  className={`text-center p-4 ${
                    product.popular
                      ? 'bg-gradient-to-b from-[#FF13F0]/10 to-transparent border-x border-[#FF13F0]/20'
                      : ''
                  }`}
                >
                  {product.plan !== 'free' && (
                    <button
                      onClick={() => handlePlanClick(product)}
                      disabled={loading !== null || currentPlan === product.plan}
                      className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors min-h-[44px] touch-manipulation ${
                        product.popular
                          ? 'bg-[#FF13F0] text-white hover:bg-[#FF13F0] shadow-[0_0_20px_rgba(255,19,240,0.4)]'
                          : 'bg-[#FF13F0]/20 text-[#FF13F0] hover:bg-[#FF13F0]/30 border border-[#FF13F0]/30'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {loading === product.plan
                        ? 'Loading...'
                        : currentPlan === product.plan
                          ? 'Current Plan'
                          : currentPlan === 'free'
                            ? 'Start Free Trial'
                            : 'Upgrade'}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile: Card Layout */}
      <div className="md:hidden space-y-4">
        {products.map((product) => (
          <div
            key={product.plan}
            className={`border-2 rounded-xl p-6 ${
              product.popular
                ? 'border-[#FF13F0] bg-gradient-to-br from-[#FF13F0]/10 to-gray-800/50 shadow-[0_0_20px_rgba(255,19,240,0.2)]'
                : 'border-[#FF13F0]/20 bg-gray-100/50'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {product.plan === 'standard' && <Zap className="w-5 h-5 text-[#FF13F0]" />}
                {product.plan === 'pro' && <Crown className="w-5 h-5 text-[#FF13F0]" />}
                <h3 className="text-xl font-bold text-[#FF13F0]">{product.name}</h3>
                {product.badge && (
                  <span className="bg-[#FF13F0]/20 text-[#FF13F0] text-xs font-semibold px-2 py-1 rounded border border-[#FF13F0]/30">
                    {product.badge}
                  </span>
                )}
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-[#FF13F0]">{formatPrice(product)}</div>
                {product.credits > 0 && (
                  <div className="text-xs text-[#FF13F0]/60">{product.credits} credits/month</div>
                )}
              </div>
            </div>

            <p className="text-sm text-[#FF13F0]/70 mb-4">{product.description}</p>

            {calculatePricePerCredit(product) && (
              <p className="text-xs text-[#FF13F0]/50 mb-4">{calculatePricePerCredit(product)}</p>
            )}

            <ul className="space-y-2 mb-6">
              {product.features.map((feature) => (
                <li
                  key={feature.id}
                  className="flex items-start gap-2 text-sm text-[#FF13F0]"
                  onMouseEnter={() => handleFeatureHover(feature.id, product.plan)}
                >
                  <Check className="w-4 h-4 text-[#FF13F0] mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{feature.name}</span>
                    {feature.description && (
                      <span className="text-[#FF13F0]/60 text-xs block mt-0.5">
                        {feature.description}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {product.plan !== 'free' && (
              <button
                onClick={() => handlePlanClick(product)}
                disabled={loading !== null || currentPlan === product.plan}
                className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors min-h-[44px] touch-manipulation ${
                  product.popular
                    ? 'bg-[#FF13F0] text-white hover:bg-[#FF13F0] shadow-[0_0_20px_rgba(255,19,240,0.4)]'
                    : 'bg-[#FF13F0]/20 text-[#FF13F0] hover:bg-[#FF13F0]/30 border border-[#FF13F0]/30'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading === product.plan
                  ? 'Loading...'
                  : currentPlan === product.plan
                    ? 'Current Plan'
                    : currentPlan === 'free'
                      ? 'Start Free Trial'
                      : 'Upgrade'}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Credit Packs Section */}
      {showCreditPacks && (
        <div className="mt-8 pt-8 border-t border-[#FF13F0]/20">
          <h3 className="text-lg font-semibold text-[#FF13F0] mb-4">Or Buy Credits</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Small Pack */}
            <div className="border border-[#FF13F0]/20 rounded-lg p-4 bg-gray-100/30">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-[#FF13F0]" />
                <h4 className="font-semibold text-[#FF13F0]">Small Pack</h4>
              </div>
              <div className="text-2xl font-bold text-[#FF13F0] mb-2">20 credits</div>
              <div className="text-sm text-[#FF13F0]/60 mb-4">$4.99 one-time</div>
              <button
                onClick={async () => {
                  setLoading('small-pack');
                  if (user) {
                    await trackCheckoutInitiated(user, 'credit-pack', stripeConfig.creditPackSmallPriceId);
                  }
                  try {
                    const response = await axios.post('/api/billing/create-checkout-session', {
                      priceId: stripeConfig.creditPackSmallPriceId,
                      mode: 'payment',
                    });
                    if (response.data.url) {
                      window.location.href = response.data.url;
                    }
                  } catch (error) {
                    console.error('Checkout error:', error);
                    alert('Failed to start checkout');
                  } finally {
                    setLoading(null);
                  }
                }}
                disabled={loading !== null}
                className="w-full py-2 bg-[#FF13F0]/20 text-[#FF13F0] rounded-lg font-semibold hover:bg-[#FF13F0]/30 transition-colors disabled:opacity-50 border border-[#FF13F0]/30"
              >
                {loading === 'small-pack' ? 'Loading...' : 'Buy Now'}
              </button>
            </div>

            {/* Large Pack */}
            <div className="border border-[#FF13F0]/20 rounded-lg p-4 bg-gray-100/30">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-[#FF13F0]" />
                <h4 className="font-semibold text-[#FF13F0]">Large Pack</h4>
              </div>
              <div className="text-2xl font-bold text-[#FF13F0] mb-2">100 credits</div>
              <div className="text-sm text-[#FF13F0]/60 mb-4">$19.99 one-time</div>
              <button
                onClick={async () => {
                  setLoading('large-pack');
                  if (user) {
                    await trackCheckoutInitiated(user, 'credit-pack', stripeConfig.creditPackLargePriceId);
                  }
                  try {
                    const response = await axios.post('/api/billing/create-checkout-session', {
                      priceId: stripeConfig.creditPackLargePriceId,
                      mode: 'payment',
                    });
                    if (response.data.url) {
                      window.location.href = response.data.url;
                    }
                  } catch (error) {
                    console.error('Checkout error:', error);
                    alert('Failed to start checkout');
                  } finally {
                    setLoading(null);
                  }
                }}
                disabled={loading !== null}
                className="w-full py-2 bg-[#FF13F0]/20 text-[#FF13F0] rounded-lg font-semibold hover:bg-[#FF13F0]/30 transition-colors disabled:opacity-50 border border-[#FF13F0]/30"
              >
                {loading === 'large-pack' ? 'Loading...' : 'Buy Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


