'use client';

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { optionalAnalyticsEnabled } from '@/lib/optional-analytics';
import { ANALYTICS_EVENTS, captureEvent, identifyUser, resetAnalytics } from '@/lib/analytics';

export function AnalyticsUserSync() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!optionalAnalyticsEnabled()) return;
    let cancelled = false;
    if (user?.id) {
      void identifyUser(user.id, {
        email: user.emailAddresses?.[0]?.emailAddress,
        created_at: user.createdAt?.toISOString?.() ?? undefined,
      }).then(identified => {
        if (!identified || cancelled || !optionalAnalyticsEnabled()) return;
        const signInKey = `analytics-sign-in:${user.id}`;
        try {
          if (window.sessionStorage.getItem(signInKey) !== '1') {
            void captureEvent(ANALYTICS_EVENTS.SIGN_IN, {
              user_id: user.id,
              source: 'clerk_session_loaded',
            });
            window.sessionStorage.setItem(signInKey, '1');
          }
        } catch {
          // Blocked optional storage must not interrupt sign-in.
        }
      });
    } else if (isLoaded) {
      resetAnalytics();
    }
    return () => { cancelled = true; };
  }, [isLoaded, user]);

  return null;
}
