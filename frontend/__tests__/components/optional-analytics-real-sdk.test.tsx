/** The installed SDK is intentionally NOT mocked: importing it reads consent storage. */
import React from 'react';
import { render } from '@testing-library/react';

jest.unmock('posthog-js');
jest.unmock('posthog-js/react');
jest.mock('@clerk/nextjs', () => ({ useUser: () => ({ isLoaded: true, user: {
  id: 'fixture-user', emailAddresses: [{ emailAddress: 'fixture@example.invalid' }],
} }) }));

const original = { ...process.env };
const originalFetch = global.fetch;
beforeEach(() => {
  process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-key';
  process.env.NEXT_PUBLIC_OPTIONAL_ANALYTICS_DEPLOYMENT = 'production';
  delete process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS;
  jest.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  global.fetch = jest.fn();
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { process.env = original; global.fetch = originalFetch; });

it.each(['disabled', 'staging'])('never evaluates the real SDK or touches analytics storage/network while %s', async (mode) => {
  if (mode === 'staging') {
    process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
    process.env.NEXT_PUBLIC_OPTIONAL_ANALYTICS_DEPLOYMENT = 'disabled';
  }
  const read = jest.spyOn(Storage.prototype, 'getItem');
  const write = jest.spyOn(Storage.prototype, 'setItem');
  const remove = jest.spyOn(Storage.prototype, 'removeItem');
  const xhr = jest.spyOn(XMLHttpRequest.prototype, 'open');
  // Import application modules only after installing spies: the former static
  // SDK imports are the regression this test must observe, before any effect.
  const { PostHogClientProvider } = await import('@/app/providers/PostHogProvider');
  const { AnalyticsUserSync } = await import('@/app/components/AnalyticsUserSync');
  const { initAnalytics, identifyUser, capturePageView } = await import('@/lib/analytics');
  const { unmount } = render(<PostHogClientProvider><AnalyticsUserSync /><p>Product content</p></PostHogClientProvider>);
  expect(await initAnalytics()).toBe(false);
  expect(await identifyUser('fixture-user')).toBe(false);
  await capturePageView('/pricing');
  unmount();
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(xhr).not.toHaveBeenCalled();
});
