import { optionalAnalyticsEnabled } from './optional-analytics';

export function getGoogleTagManagerId(): string | null {
  if (!optionalAnalyticsEnabled()) return null;
  const envValue = (process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID || "").trim();
  return /^GTM-[A-Z0-9]+$/.test(envValue) ? envValue : null;
}
