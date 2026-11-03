import { unsafePreview } from './preview-isolation';
// Fail closed, including in previews. Reopening requires an explicit reviewed release.
export const NEW_PURCHASES_ENABLED = false;
export const PURCHASE_PAUSE_NOTICE =
  'Virtual try-on is temporarily unavailable. New subscriptions and credit packs are paused.';

// Explicitly isolated test deployments can exercise Checkout without enabling live sales.
export function canCreateCheckout(env: Record<string,string | undefined> = process.env) {
  if (NEW_PURCHASES_ENABLED) return true;
  return env.VERCEL_ENV === 'preview' && env.CHANGEROOM_TEST_CHECKOUT === 'true' && !unsafePreview(env);
}

export function pausedCheckoutResponse(): Response {
  return Response.json(
    { error: 'purchases_paused', message: PURCHASE_PAUSE_NOTICE, billingUrl: '/billing' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
