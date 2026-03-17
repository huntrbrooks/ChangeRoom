import {
  buildCanonicalUrl,
  CANONICAL_ORIGIN,
  normalizeHost,
  shouldRedirectToCanonicalHost,
} from '@/lib/domainRouting';

describe('domainRouting', () => {
  it('normalizes forwarded hosts with ports', () => {
    expect(normalizeHost('IGetDressed.Online:443')).toBe('igetdressed.online');
  });

  it('redirects legacy hosts for page requests', () => {
    expect(
      shouldRedirectToCanonicalHost({
        host: 'getdressed.online',
        pathname: '/sign-in',
        method: 'GET',
      })
    ).toBe(true);
  });

  it('does not redirect API requests', () => {
    expect(
      shouldRedirectToCanonicalHost({
        host: 'getdressed.online',
        pathname: '/api/my/billing',
        method: 'GET',
      })
    ).toBe(false);
  });

  it('does not redirect non-idempotent requests', () => {
    expect(
      shouldRedirectToCanonicalHost({
        host: 'getdressed.online',
        pathname: '/sign-in',
        method: 'POST',
      })
    ).toBe(false);
  });

  it('builds canonical URLs on igetdressed.online', () => {
    const redirected = buildCanonicalUrl(
      new URL('https://getdressed.online/pricing?promo=xmas')
    );

    expect(redirected.toString()).toBe(`${CANONICAL_ORIGIN}/pricing?promo=xmas`);
  });
});
