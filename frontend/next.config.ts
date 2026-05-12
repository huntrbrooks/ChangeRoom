import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Skip static generation for pages that use Clerk
  output: 'standalone',
  async headers() {
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self' https://*.clerk.com https://*.clerk.accounts.dev https://clerk.igetdressed.online",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://js.stripe.com https://*.posthog.com https://us.i.posthog.com https://*.clerk.com https://*.clerk.accounts.dev https://clerk.igetdressed.online",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://*.clerk.com https://*.clerk.accounts.dev https://clerk.igetdressed.online",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(self)',
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      // Production Render backend (from observed failing _next/image URLs)
      { protocol: 'https', hostname: 'changeroom.onrender.com', pathname: '/**' },
      // Future Render hostnames / other Render backends
      { protocol: 'https', hostname: '**.onrender.com', pathname: '/**' },
      // Local development backend
      { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/**' },
      // Optional: common R2 host patterns (safe to allow; no effect if unused)
      { protocol: 'https', hostname: '**.r2.dev', pathname: '/**' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com', pathname: '/**' },
    ],
  },
};

export default nextConfig;
