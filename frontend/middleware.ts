import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest, NextMiddleware } from 'next/server';

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks/stripe(.*)',
  '/how-it-works',
  '/about',
  '/pricing',
]);

// Check if Clerk keys are available
function hasClerkKeys(): boolean {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  
  // Validate keys exist and have basic format
  const hasPublishableKey = publishableKey && 
    publishableKey.trim().startsWith('pk_') && 
    publishableKey.trim().length > 10;
  
  const hasSecretKey = secretKey && 
    secretKey.trim().startsWith('sk_') && 
    secretKey.trim().length > 10;
  
  return !!(hasPublishableKey && hasSecretKey);
}

// Fallback middleware when Clerk is not configured
function fallbackMiddleware(req: NextRequest) {
  if (process.env.NODE_ENV === 'development') {
    console.warn('⚠️  Clerk keys not found. Running without authentication. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to enable auth.');
  }
  return NextResponse.next();
}

// Create Clerk middleware with error handling
let clerkAuthMiddleware: NextMiddleware | null = null;

try {
  if (hasClerkKeys()) {
    // Use Clerk middleware when keys are available
    clerkAuthMiddleware = clerkMiddleware(async (auth, req) => {
      try {
        // Only protect routes that are not public
        if (!isPublicRoute(req)) {
          await auth.protect();
        }
      } catch (error) {
        // Log error but don't crash - let the request continue
        console.error('Middleware error:', error);
      }
    });
  }
} catch (error) {
  // If Clerk middleware creation fails, log and use fallback
  console.error('Failed to create Clerk middleware:', error);
  clerkAuthMiddleware = null;
}

// Export middleware with execution error handling
export default function middleware(req: NextRequest, event?: any) {
  // Use Clerk middleware if available, otherwise use fallback
  if (clerkAuthMiddleware) {
    try {
      const result = clerkAuthMiddleware(req, event);
      // Handle both sync and async results
      if (result instanceof Promise) {
        return result.catch((error) => {
          // If Clerk middleware execution fails, log and fallback
          console.error('Clerk middleware execution error:', error);
          return fallbackMiddleware(req);
        });
      }
      return result;
    } catch (error) {
      // If Clerk middleware execution fails (sync error), log and fallback
      console.error('Clerk middleware execution error:', error);
      return fallbackMiddleware(req);
    }
  }
  
  return fallbackMiddleware(req);
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};

