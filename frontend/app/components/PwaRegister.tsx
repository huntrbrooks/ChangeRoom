'use client';

import { useEffect } from 'react';

const SERVICE_WORKER_URL = '/service-worker.js';

export default function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const isSecureContext =
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost';

    if (!isSecureContext) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        await navigator.serviceWorker.register(SERVICE_WORKER_URL);
      } catch (error) {
        console.error('Service worker registration failed', error);
      }
    };

    registerServiceWorker();
  }, []);

  return null;
}










