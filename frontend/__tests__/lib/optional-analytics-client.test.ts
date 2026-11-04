jest.mock('posthog-js', () => ({ __esModule: true, default: {
  init: jest.fn(), identify: jest.fn(), reset: jest.fn(), capture: jest.fn(),
  get_distinct_id: jest.fn(() => 'test-distinct-id'),
} }));

const original = { ...process.env };
const originalFetch = global.fetch;
beforeEach(() => {
  jest.resetModules();
  process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-key';
  process.env.NEXT_PUBLIC_OPTIONAL_ANALYTICS_DEPLOYMENT = 'production';
  delete process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS;
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { process.env = original; global.fetch = originalFetch; });

it.each(['disabled', 'staging'])('does not initialize, identify, capture, read storage or send user/affiliate events when %s', async (mode) => {
  if (mode === 'staging') {
    process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
    process.env.NEXT_PUBLIC_OPTIONAL_ANALYTICS_DEPLOYMENT = 'disabled';
  }
  const read = jest.spyOn(Storage.prototype, 'getItem');
  const write = jest.spyOn(Storage.prototype, 'setItem');
  const analytics = await import('@/lib/analytics');
  const posthog = (await import('posthog-js')).default;
  const { emitUserEvent } = await import('@/lib/userEvents');
  const { trackAffiliateClick } = await import('@/lib/affiliateLinks');
  await analytics.initAnalytics();
  await analytics.identifyUser('user-test', { email: 'fixture@example.invalid' });
  await analytics.capturePageView('/pricing');
  analytics.resetAnalytics();
  expect(analytics.getDistinctId()).toBeUndefined();
  emitUserEvent('outfit_generated', { requestId: 'test' });
  trackAffiliateClick('https://example.invalid', 'https://example.invalid', 'shirt', 'test');
  for (const method of Object.values(posthog)) expect(method).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});

it('preserves enabled production behavior and checks the gate before later SDK operations', async () => {
  process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
  const analytics = await import('@/lib/analytics');
  const posthog = (await import('posthog-js')).default;
  const { emitUserEvent } = await import('@/lib/userEvents');
  await Promise.all([analytics.initAnalytics(), analytics.initAnalytics()]);
  await analytics.identifyUser('user-test');
  await analytics.capturePageView('/pricing');
  emitUserEvent('pricing_viewed');
  expect(posthog.init).toHaveBeenCalledTimes(1);
  expect(posthog.identify).toHaveBeenCalledWith('user-test', undefined);
  expect(posthog.capture).toHaveBeenCalledTimes(1);
  expect(analytics.getDistinctId()).toBe('test-distinct-id');
  expect(global.fetch).toHaveBeenCalledTimes(1);
  delete process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS;
  await analytics.identifyUser('other'); await analytics.capturePageView('/other'); analytics.resetAnalytics();
  expect(analytics.getDistinctId()).toBeUndefined();
  expect(posthog.identify).toHaveBeenCalledTimes(1);
  expect(posthog.capture).toHaveBeenCalledTimes(1);
  expect(posthog.reset).not.toHaveBeenCalled();
});


it('awaits one SDK initialization before concurrent first-use calls', async () => {
  process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
  const analytics = await import('@/lib/analytics');
  const posthog = (await import('posthog-js')).default;
  await Promise.all([analytics.identifyUser('fixture-user'), analytics.capturePageView('/pricing')]);
  expect(posthog.init).toHaveBeenCalledTimes(1);
  expect(posthog.identify).toHaveBeenCalledTimes(1);
  expect(posthog.capture).toHaveBeenCalledTimes(1);
  expect((posthog.init as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((posthog.identify as jest.Mock).mock.invocationCallOrder[0]);
  expect((posthog.init as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((posthog.capture as jest.Mock).mock.invocationCallOrder[0]);
});


it('does not identify a signed-out user after a delayed first SDK load', async () => {
  process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
  const analytics = await import('@/lib/analytics');
  const pending = analytics.identifyUser('signed-out-user');
  analytics.resetAnalytics();
  expect(await pending).toBe(false);
  const posthog = (await import('posthog-js')).default;
  expect(posthog.identify).not.toHaveBeenCalled();
});


it.each([false, true])('clears persisted identity after delayed init unless a newer identity supersedes sign-out (newer=%s)', async (newer) => {
  process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
  const analytics = await import('@/lib/analytics');
  const posthog = (await import('posthog-js')).default;
  let identity = 'before-init';
  const captured: string[] = [];
  (posthog.init as jest.Mock).mockImplementation(() => { identity = 'persisted-signed-out-user'; });
  (posthog.reset as jest.Mock).mockImplementation(() => { identity = 'anonymous'; });
  (posthog.identify as jest.Mock).mockImplementation((userId: string) => { identity = userId; });
  (posthog.capture as jest.Mock).mockImplementation(() => { captured.push(identity); });
  const stale = analytics.identifyUser('signed-out-user');
  analytics.resetAnalytics();
  const current = newer ? analytics.identifyUser('new-user') : undefined;
  expect(await stale).toBe(false);
  if (current) expect(await current).toBe(true);
  await analytics.capturePageView('/after-sign-out');
  expect(posthog.reset).toHaveBeenCalledTimes(newer ? 0 : 1);
  expect(captured).toEqual([newer ? 'new-user' : 'anonymous']);
});
