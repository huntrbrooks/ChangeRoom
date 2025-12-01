'use client';

import React, { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { PricingTable } from '../components/PricingTable';
import { trackPricingView } from '@/lib/clerk-tracking';
import axios from 'axios';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

interface BillingInfo {
  plan: 'free' | 'standard' | 'pro';
  creditsAvailable: number;
  creditsRefreshAt: Date | null;
  trialUsed?: boolean;
}

export default function PricingPage() {
  const { user, isLoaded } = useUser();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoaded && user) {
      fetchBilling();
      trackPricingView(user);
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

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-cyan-500/20 sticky top-0 bg-black/95 backdrop-blur-md z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors">
            <ArrowLeft size={20} />
            <span>Back to Home</span>
          </Link>
          <h1 className="text-xl font-bold text-cyan-300">Pricing & Plans</h1>
          <div className="w-20"></div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 md:py-12 max-w-6xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-cyan-300 mb-4">
            Choose Your Plan
          </h2>
          <p className="text-lg text-cyan-400/70 max-w-2xl mx-auto">
            Start with 1 free try-on, then choose the plan that fits your needs. 
            All plans include unlimited wardrobe uploads and high-quality results.
          </p>
        </div>

        {/* Pricing Table */}
        <div className="bg-gray-900/50 border border-cyan-500/30 rounded-2xl p-6 md:p-8 mb-8">
          <PricingTable
            currentPlan={billing?.plan}
            showCreditPacks={true}
          />
        </div>

        {/* FAQ Section */}
        <div className="bg-gray-900/30 border border-cyan-500/20 rounded-xl p-6 md:p-8">
          <h3 className="text-2xl font-bold text-cyan-300 mb-6">Frequently Asked Questions</h3>
          <div className="space-y-6">
            <div>
              <h4 className="font-semibold text-cyan-200 mb-2">How does the free try-on work?</h4>
              <p className="text-cyan-400/70 text-sm">
                New users get 1 free try-on to experience Change Room. No credit card required. 
                After your free try-on, choose a plan to continue.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-cyan-200 mb-2">What happens to unused credits?</h4>
              <p className="text-cyan-400/70 text-sm">
                Subscription credits refresh monthly. Unused credits from credit packs never expire 
                and are added to your balance.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-cyan-200 mb-2">Can I cancel anytime?</h4>
              <p className="text-cyan-400/70 text-sm">
                Yes! You can cancel your subscription at any time. You'll continue to have access 
                until the end of your billing period.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-cyan-200 mb-2">What's the difference between plans?</h4>
              <p className="text-cyan-400/70 text-sm">
                All plans include the same features. The difference is the number of monthly credits. 
                Pro offers the best value at $0.08 per try-on.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


