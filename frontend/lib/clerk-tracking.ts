/**
 * Clerk user tracking utilities
 * Track user interactions with products, features, and pricing
 */

import type { User } from '@clerk/nextjs/server';

export type TrackingEvent = 
  | 'pricing_viewed'
  | 'product_viewed'
  | 'feature_clicked'
  | 'checkout_initiated'
  | 'upgrade_clicked'
  | 'credit_pack_viewed'
  | 'trial_started'
  | 'subscription_created';

export interface TrackingData {
  event: TrackingEvent;
  userId?: string;
  userEmail?: string;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

/**
 * Track user interaction event
 * This can be extended to send to analytics services
 */
export async function trackUserEvent(
  user: User | null,
  event: TrackingEvent,
  metadata?: Record<string, unknown>
): Promise<void> {
  const trackingData: TrackingData = {
    event,
    userId: user?.id,
    userEmail: user?.emailAddresses?.[0]?.emailAddress,
    metadata,
    timestamp: new Date(),
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 User Tracking:', trackingData);
  }

  // In production, you can send this to:
  // - Analytics service (Mixpanel, Amplitude, etc.)
  // - Your backend API
  // - Clerk's user metadata
  // - Database for analytics

  try {
    // Example: Send to your analytics endpoint
    // await fetch('/api/analytics/track', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(trackingData),
    // });
  } catch (error) {
    console.error('Failed to track event:', error);
  }
}

/**
 * Track pricing table view
 */
export async function trackPricingView(user: User | null): Promise<void> {
  await trackUserEvent(user, 'pricing_viewed', {
    source: 'pricing_page',
  });
}

/**
 * Track product view
 */
export async function trackProductView(
  user: User | null,
  plan: 'free' | 'standard' | 'pro'
): Promise<void> {
  await trackUserEvent(user, 'product_viewed', {
    plan,
  });
}

/**
 * Track feature click/interaction
 */
export async function trackFeatureClick(
  user: User | null,
  featureId: string,
  plan: 'free' | 'standard' | 'pro'
): Promise<void> {
  await trackUserEvent(user, 'feature_clicked', {
    featureId,
    plan,
  });
}

/**
 * Track checkout initiation
 */
export async function trackCheckoutInitiated(
  user: User | null,
  plan: 'standard' | 'pro' | 'credit-pack',
  priceId: string
): Promise<void> {
  await trackUserEvent(user, 'checkout_initiated', {
    plan,
    priceId,
  });
}

/**
 * Track upgrade click
 */
export async function trackUpgradeClick(
  user: User | null,
  fromPlan: 'free' | 'standard' | 'pro',
  toPlan: 'standard' | 'pro'
): Promise<void> {
  await trackUserEvent(user, 'upgrade_clicked', {
    fromPlan,
    toPlan,
  });
}

/**
 * Track trial start
 */
export async function trackTrialStarted(
  user: User | null,
  plan: 'standard' | 'pro'
): Promise<void> {
  await trackUserEvent(user, 'trial_started', {
    plan,
  });
}

