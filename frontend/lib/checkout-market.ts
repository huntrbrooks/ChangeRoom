export const CHECKOUT_MARKET_COUNTRIES = ['AU', 'NZ'] as const;
export type CheckoutMarketCountry = typeof CHECKOUT_MARKET_COUNTRIES[number];
export const CHECKOUT_MARKET_POLICY = 'au-nz-consumer-v1' as const;

export function isCheckoutMarketCountry(value: unknown): value is CheckoutMarketCountry {
  return value === 'AU' || value === 'NZ';
}

/** null means the deployment and key cannot safely be used together (including local runtimes). */
export function expectedCheckoutLivemode(secretKey: string): boolean | null {
  if (process.env.VERCEL !== '1') return null;
  if (process.env.VERCEL_ENV === 'production' && /^(?:sk|rk)_live_\S+$/.test(secretKey)) return true;
  if (process.env.VERCEL_ENV === 'preview' && /^(?:sk|rk)_test_\S+$/.test(secretKey)) return false;
  return null;
}

/** Only use the platform-set geolocation header on a hosted Vercel deployment. */
export function checkoutMarketEvidence(buyerCountry: CheckoutMarketCountry, headers: Headers) {
  if (process.env.VERCEL !== '1' ||
      (process.env.VERCEL_ENV !== 'production' && process.env.VERCEL_ENV !== 'preview')) return null;
  const originCountry = headers.get('x-vercel-ip-country');
  if (!isCheckoutMarketCountry(originCountry) || originCountry !== buyerCountry) return null;
  return { changeRoomMarketPolicy: CHECKOUT_MARKET_POLICY, buyerCountry, originCountry };
}
