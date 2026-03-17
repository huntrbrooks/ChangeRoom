/**
 * User Event Emitter
 * 
 * Sends user events to our backend, which forwards them to n8n
 * for automated email sequences and conversion flows.
 */

export type UserEvent = 
  | 'signup_complete'
  | 'trial_consumed'
  | 'purchase_complete'
  | 'outfit_generated'
  | 'pricing_viewed'
  | 'checkout_started'
  | 'checkout_abandoned';

interface EventData {
  [key: string]: unknown;
}

/**
 * Emit a user event for n8n automation triggers
 * Non-blocking - fires and forgets
 */
export function emitUserEvent(event: UserEvent, data?: EventData): void {
  // Fire and forget - don't block UI
  fetch('/api/events/user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event,
      data,
      timestamp: new Date().toISOString(),
    }),
  }).catch((error) => {
    // Silent fail - analytics shouldn't break the app
    console.warn('[emitUserEvent] Failed:', error);
  });
}

/**
 * Track when user completes signup
 */
export function trackSignup(email: string): void {
  emitUserEvent('signup_complete', { 
    email,
    source: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
  });
}

/**
 * Track when free trial is consumed
 */
export function trackTrialConsumed(requestId?: string): void {
  emitUserEvent('trial_consumed', { requestId });
}

/**
 * Track when user purchases credits
 */
export function trackPurchase(plan: string, amount: number, currency: string): void {
  emitUserEvent('purchase_complete', { plan, amount, currency });
}

/**
 * Track when user generates an outfit
 */
export function trackOutfitGenerated(requestId: string, itemCount: number): void {
  emitUserEvent('outfit_generated', { requestId, itemCount });
}

/**
 * Track when user views pricing page
 */
export function trackPricingViewed(source?: string): void {
  emitUserEvent('pricing_viewed', { source });
}

/**
 * Track when user starts checkout
 */
export function trackCheckoutStarted(plan: string, price: number): void {
  emitUserEvent('checkout_started', { plan, price });
}

/**
 * Track when user abandons checkout (leaves pricing without completing)
 */
export function trackCheckoutAbandoned(plan?: string): void {
  emitUserEvent('checkout_abandoned', { plan });
}

