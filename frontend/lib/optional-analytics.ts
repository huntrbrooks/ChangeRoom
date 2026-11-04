/** Optional measurement is disabled unless explicitly enabled on a production build. */
export function optionalAnalyticsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS === 'true' &&
    process.env.NEXT_PUBLIC_OPTIONAL_ANALYTICS_DEPLOYMENT === 'production';
}
