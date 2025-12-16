'use client';

import React, { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { initAnalytics } from '@/lib/analytics';

export function PostHogClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    initAnalytics();
    return () => {
      if (typeof window !== 'undefined') {
        // Cast to allow optional cleanup without type errors
        (posthog as unknown as { shutdown?: () => void }).shutdown?.();
      }
    };
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

