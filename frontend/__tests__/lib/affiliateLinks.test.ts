describe('convertToAffiliateLink', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const mutableEnv = process.env as Record<string, string | undefined>;

  afterEach(() => {
    mutableEnv.NODE_ENV = originalNodeEnv;
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('returns non-http links unchanged without warning in production', async () => {
    mutableEnv.NODE_ENV = 'production';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { convertToAffiliateLink } = await import('@/lib/affiliateLinks');

    expect(convertToAffiliateLink('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(convertToAffiliateLink('not-a-valid-url')).toBe('not-a-valid-url');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('adds the Amazon affiliate tag when configured', async () => {
    mutableEnv.NODE_ENV = 'test';
    mutableEnv.NEXT_PUBLIC_AMAZON_AFFILIATE_TAG = 'affiliate-20';
    jest.resetModules();

    const { convertToAffiliateLink } = await import('@/lib/affiliateLinks');
    const url = convertToAffiliateLink('https://www.amazon.com/dp/B000000000');

    expect(url).toContain('tag=affiliate-20');
    expect(url).toContain('linkCode=ogi');
  });
});
