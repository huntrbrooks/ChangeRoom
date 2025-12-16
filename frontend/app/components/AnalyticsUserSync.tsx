'use client';

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { identifyUser, resetAnalytics } from '@/lib/analytics';

export function AnalyticsUserSync() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (user?.id) {
      identifyUser(user.id, {
        email: user.emailAddresses?.[0]?.emailAddress,
        created_at: user.createdAt?.toISOString?.() ?? undefined,
      });
    } else if (isLoaded) {
      resetAnalytics();
    }
  }, [isLoaded, user]);

  return null;
}

