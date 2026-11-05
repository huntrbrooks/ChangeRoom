import { unsafePreview } from './preview-isolation';
// Fail closed, including in previews. Reopening requires an explicit reviewed release.
export const NEW_PURCHASES_ENABLED = false;
export const PURCHASE_PAUSE_NOTICE =
  'New subscriptions and credit packs are paused. Existing credits and billing management remain available.';

// Explicitly isolated test deployments can exercise Checkout without enabling live sales.
export function canCreateCheckout(env: Record<string,string | undefined> = process.env) {
  if (env.VERCEL_ENV === 'preview') {
    return env.CHANGEROOM_TEST_CHECKOUT === 'true' && !unsafePreview(env);
  }
  return NEW_PURCHASES_ENABLED && env.VERCEL_ENV === 'production';
}

export function pausedCheckoutResponse(): Response {
  return Response.json(
    { error: 'purchases_paused', message: PURCHASE_PAUSE_NOTICE, billingUrl: '/billing' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
