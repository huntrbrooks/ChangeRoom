import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest, type NextMiddleware, type NextFetchEvent } from 'next/server';
import { buildCanonicalUrl, shouldRedirectToCanonicalHost } from '@/lib/domainRouting';
import { CLERK_PROXY_PATH, getClerkFrontendApiHost } from '@/lib/clerkProxy';

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks/stripe(.*)',
  '/how-it-works',
  '/about',
  '/pricing',
  // MCP OAuth metadata endpoints must be publicly accessible
  '/.well-known/oauth-authorization-server(.*)',
  '/.well-known/oauth-protected-resource(.*)',
  // Legal pages
  '/privacy-policy',
  '/terms-of-service',
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

function buildClerkProxyTarget(req: NextRequest): URL {
  const proxyUrl = req.nextUrl.clone();
  proxyUrl.protocol = 'https:';
  proxyUrl.host = getClerkFrontendApiHost();
  proxyUrl.pathname = proxyUrl.pathname.replace(CLERK_PROXY_PATH, '') || '/';
  return proxyUrl;
}

function proxyClerkFrontendApi(req: NextRequest) {
  const proxyUrl = buildClerkProxyTarget(req);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete('host');
  requestHeaders.set('Clerk-Proxy-Url', req.nextUrl.origin + CLERK_PROXY_PATH);
  requestHeaders.set('Clerk-Secret-Key', process.env.CLERK_SECRET_KEY || '');
  requestHeaders.set('X-Forwarded-Host', req.headers.get('host') || req.nextUrl.host);
  requestHeaders.set('X-Forwarded-Proto', 'https');
  requestHeaders.set(
    'X-Forwarded-For',
    req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || ''
  );

  const response = NextResponse.rewrite(proxyUrl, {
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
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
  const forwardedHost = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (
    shouldRedirectToCanonicalHost({
      host: forwardedHost,
      pathname: req.nextUrl.pathname,
      method: req.method,
    })
  ) {
    return NextResponse.redirect(buildCanonicalUrl(req.nextUrl), 308);
  }

  if (req.nextUrl.pathname.startsWith(CLERK_PROXY_PATH)) {
    return proxyClerkFrontendApi(req);
  }

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
    '/__clerk(.*)',
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
