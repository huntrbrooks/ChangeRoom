import { clerkMiddleware } from '@clerk/nextjs/server';

// Ensure Clerk auth is available for App Router and API routes.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Match all routes except static assets and Next internals.
    '/((?!_next|.*\\..*).*)',
    // Always run for API routes.
    '/api/(.*)',
  ],
};
