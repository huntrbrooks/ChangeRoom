'use client';

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import {
  ANALYTICS_EVENTS,
  captureEvent,
  identifyUser,
  initAnalytics,
  resetAnalytics,
} from '@/lib/analytics';

export function AnalyticsUserSync() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (user?.id) {
      initAnalytics();
      identifyUser(user.id, {
        email: user.emailAddresses?.[0]?.emailAddress,
        created_at: user.createdAt?.toISOString?.() ?? undefined,
      });
      const signInKey = `analytics-sign-in:${user.id}`;
      if (typeof window !== 'undefined' && window.sessionStorage.getItem(signInKey) !== '1') {
        captureEvent(ANALYTICS_EVENTS.SIGN_IN, {
          user_id: user.id,
          source: 'clerk_session_loaded',
        });
        window.sessionStorage.setItem(signInKey, '1');
      }
    } else if (isLoaded) {
      resetAnalytics();
    }
  }, [isLoaded, user]);

  return null;
}
