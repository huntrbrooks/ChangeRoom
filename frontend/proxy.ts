import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest, type NextMiddleware, type NextFetchEvent } from 'next/server';

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

  const hasPublishableKey =
    publishableKey &&
    publishableKey.trim().startsWith('pk_') &&
    publishableKey.trim().length > 10;

  const hasSecretKey =
    secretKey &&
    secretKey.trim().startsWith('sk_') &&
    secretKey.trim().length > 10;

  return !!(hasPublishableKey && hasSecretKey);
}

// Fallback handler when Clerk is not configured
function fallbackHandler(_req: NextRequest) {
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      '⚠️  Clerk keys not found. Running without authentication. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to enable auth.'
    );
  }
  return NextResponse.next();
}

// Create Clerk middleware with error handling
let clerkAuthMiddleware: NextMiddleware | null = null;

try {
  if (hasClerkKeys()) {
    clerkAuthMiddleware = clerkMiddleware(async (auth, req) => {
      try {
        if (!isPublicRoute(req)) {
          await auth.protect();
        }
      } catch (error) {
        console.error('Proxy auth error:', error);
      }
    });
  }
} catch (error) {
  console.error('Failed to create Clerk proxy handler:', error);
  clerkAuthMiddleware = null;
}

// Export proxy handler
export default function proxy(req: NextRequest, event?: NextFetchEvent) {
  if (clerkAuthMiddleware) {
    try {
      const fetchEvent =
        event ??
        ({
          waitUntil: () => {},
        } as unknown as NextFetchEvent);

      const result = clerkAuthMiddleware(req, fetchEvent);
      if (result instanceof Promise) {
        return result.catch((error) => {
          console.error('Clerk proxy execution error:', error);
          return fallbackHandler(req);
        });
      }
      return result;
    } catch (error) {
      console.error('Clerk proxy execution error:', error);
      return fallbackHandler(req);
    }
  }

  return fallbackHandler(req);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};

