'use client';

import { ANALYTICS_EVENTS, type AnalyticsEventName } from './analytics-events';
import { optionalAnalyticsEnabled } from './optional-analytics';

type AnalyticsClient = typeof import('posthog-js')['default'];
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/+$/, '');
let client: AnalyticsClient | undefined;
let initialization: Promise<boolean> | undefined;
let identityVersion = 0;
let pendingResetVersion: number | undefined;

export function initAnalytics(): Promise<boolean> {
  if (!optionalAnalyticsEnabled() || typeof window === 'undefined' || !key)
    return Promise.resolve(false);
  if (client) return Promise.resolve(true);
  // Import itself reads browser storage, so even module loading belongs behind the gate.
  initialization ??= import('posthog-js').then(({ default: sdk }) => {
    if (!optionalAnalyticsEnabled()) return false;
    sdk.init(key, {
      api_host: host,
      capture_pageview: false,
      autocapture: false,
      person_profiles: 'identified_only',
      persistence: 'localStorage',
    });
    // init may restore a persisted identity. Apply a still-current sign-out
    // before releasing any events waiting for SDK readiness.
    if (pendingResetVersion === identityVersion) sdk.reset();
    pendingResetVersion = undefined;
    client = sdk;
    return true;
  }).catch(() => false);
  return initialization;
}

async function withAnalytics(action: (sdk: AnalyticsClient) => void | boolean): Promise<boolean> {
  if (!optionalAnalyticsEnabled() || !await initAnalytics() || !optionalAnalyticsEnabled() || !client)
    return false;
  try {
    return action(client) !== false;
  } catch {
    // Optional measurement must not break product, authentication or payment flows.
    return false;
  }
}

export async function identifyUser(
  userId: string | undefined,
  properties?: Record<string, unknown>,
): Promise<boolean> {
  const version = ++identityVersion;
  return userId ? withAnalytics(sdk => {
    if (version !== identityVersion) return false;
    sdk.identify(userId, properties);
  }) : false;
}

export function resetAnalytics(): void {
  // Invalidate a pending identity operation if sign-out wins the SDK-load race.
  identityVersion += 1;
  if (!optionalAnalyticsEnabled()) return;
  if (!client) {
    // Do not load the SDK just to reset it; honor this reset if it later loads.
    pendingResetVersion = identityVersion;
    return;
  }
  try { client.reset(); } catch { /* Optional measurement only. */ }
}

export async function captureEvent(
  event: AnalyticsEventName,
  properties?: Record<string, unknown>,
): Promise<void> {
  await withAnalytics(sdk => { sdk.capture(event, properties); });
}

export function capturePageView(path: string, properties?: Record<string, unknown>): Promise<void> {
  return captureEvent(ANALYTICS_EVENTS.PAGE_VIEW, { path, ...properties });
}

export function getDistinctId(): string | undefined {
  if (!optionalAnalyticsEnabled() || !client) return undefined;
  try { return client.get_distinct_id(); } catch { return undefined; }
}

export { ANALYTICS_EVENTS };
