// Fail closed, including in previews. Reopening requires an explicit reviewed release.
export const NEW_PURCHASES_ENABLED = false;
export const PURCHASE_PAUSE_NOTICE =
  'Virtual try-on is temporarily unavailable. New subscriptions and credit packs are paused.';

export function pausedCheckoutResponse(): Response {
  return Response.json(
    { error: 'purchases_paused', message: PURCHASE_PAUSE_NOTICE, billingUrl: '/billing' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
