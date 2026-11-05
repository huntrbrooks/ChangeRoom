import { unsafePreview } from './preview-isolation';
// AU/NZ personal-use packs only. Production can be stopped immediately at the
// checkout-only firewall rule, or by disabling this release switch.
export const NEW_PURCHASES_ENABLED = true;
export const PURCHASE_PAUSE_NOTICE =
  'New subscriptions and credit packs are paused. Existing credits and billing management remain available.';

// Explicitly isolated test deployments can exercise Checkout without enabling live sales.
export function canCreateCheckout(env: Record<string,string | undefined> = process.env) {
  if (env.VERCEL_ENV === 'preview') {
    return env.CHANGEROOM_TEST_CHECKOUT === 'true' && !unsafePreview(env);
  }
  return NEW_PURCHASES_ENABLED && env.VERCEL === '1' && env.VERCEL_ENV === 'production'
    && env.NEXT_PUBLIC_APP_URL === 'https://igetdressed.online'
    && env.CHANGEROOM_TEST_CHECKOUT !== 'true' && env.CHANGEROOM_ISOLATED_PREVIEW !== 'true'
    && /^(?:sk|rk)_live_\S+$/.test(env.STRIPE_SECRET_KEY ?? '');
}

export function pausedCheckoutResponse(): Response {
  return Response.json(
    { error: 'purchases_paused', message: PURCHASE_PAUSE_NOTICE, billingUrl: '/billing' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
