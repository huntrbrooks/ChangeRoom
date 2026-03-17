'use client';

import posthog from 'posthog-js';
import { ANALYTICS_EVENTS, type AnalyticsEventName } from './analytics-events';

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host =
  (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(
    /\/+$/,
    '',
  );

let initialized = false;

export function initAnalytics(): void {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  if (!key) return;

  posthog.init(key, {
    api_host: host,
    capture_pageview: false,
    autocapture: false,
    person_profiles: 'identified_only',
    persistence: 'localStorage',
  });
  initialized = true;
}

export function identifyUser(
  userId: string | undefined,
  properties?: Record<string, unknown>,
): void {
  if (!initialized || !userId) return;
  posthog.identify(userId, properties);
}

export function resetAnalytics(): void {
  if (!initialized) return;
  posthog.reset();
}

export function captureEvent(
  event: AnalyticsEventName,
  properties?: Record<string, unknown>,
): void {
  if (!initialized) return;
  posthog.capture(event, properties);
}

export function getDistinctId(): string | undefined {
  if (!initialized) return undefined;
  return posthog.get_distinct_id();
}

export { ANALYTICS_EVENTS };

