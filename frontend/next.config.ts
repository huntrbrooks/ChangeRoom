import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Skip static generation for pages that use Clerk
  output: 'standalone',
};

export default nextConfig;
