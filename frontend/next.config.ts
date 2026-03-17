import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Skip static generation for pages that use Clerk
  output: 'standalone',
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
