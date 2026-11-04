'use client';

import React, { useEffect } from 'react';
import { initAnalytics } from '@/lib/analytics';
import { optionalAnalyticsEnabled } from '@/lib/optional-analytics';

export function PostHogClientProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (optionalAnalyticsEnabled()) void initAnalytics();
  }, []);

  // All consumers use our gated helpers; importing the SDK's React provider would
  // evaluate its storage-reading SDK module even when measurement is disabled.
  return <>{children}</>;
}
