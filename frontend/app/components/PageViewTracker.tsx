'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { capturePageView } from '@/lib/analytics';

export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const queryString =
      typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';
    capturePageView(queryString ? `${pathname}?${queryString}` : pathname);
  }, [pathname]);

  return null;
}
