import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AnalyticsUserSync } from '@/app/components/AnalyticsUserSync';
import { PostHogClientProvider } from '@/app/providers/PostHogProvider';
import { GoogleTagManagerHead, GoogleTagManagerBody } from '@/app/components/GoogleTagManager';
import { initAnalytics, identifyUser, captureEvent, resetAnalytics } from '@/lib/analytics';

jest.mock('@clerk/nextjs', () => ({ useUser: () => ({ isLoaded: true, user: {
  id: 'fixture-user', emailAddresses: [{ emailAddress: 'fixture@example.invalid' }],
} }) }));
jest.mock('@/lib/analytics', () => ({
  initAnalytics: jest.fn().mockResolvedValue(true), identifyUser: jest.fn().mockResolvedValue(true), captureEvent: jest.fn().mockResolvedValue(undefined), resetAnalytics: jest.fn(),
  ANALYTICS_EVENTS: { SIGN_IN: 'sign_in' },
}));
jest.mock('next/script', () => ({ __esModule: true, default: ({ children, id }: { children: string; id: string }) =>
  <script id={id}>{children}</script>,
}));

const original = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
  process.env.NEXT_PUBLIC_OPTIONAL_ANALYTICS_DEPLOYMENT = 'production';
  process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID = 'GTM-TEST123';
  delete process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS;
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { process.env = original; });

it.each(['disabled', 'staging'])('renders children without GTM, SDK provider or identity storage when %s', (mode) => {
  if (mode === 'staging') {
    process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
    process.env.NEXT_PUBLIC_OPTIONAL_ANALYTICS_DEPLOYMENT = 'disabled';
  }
  const read = jest.spyOn(Storage.prototype, 'getItem');
  const write = jest.spyOn(Storage.prototype, 'setItem');
  const { container, unmount } = render(<>
    <GoogleTagManagerHead /><GoogleTagManagerBody />
    <PostHogClientProvider><AnalyticsUserSync /><p>Product still works</p></PostHogClientProvider>
  </>);
  expect(screen.getByText('Product still works')).toBeInTheDocument();
  expect(container.querySelector('script, iframe, noscript')).toBeNull();
  expect(initAnalytics).not.toHaveBeenCalled();
  expect(identifyUser).not.toHaveBeenCalled();
  expect(captureEvent).not.toHaveBeenCalled();
  expect(resetAnalytics).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  unmount();
  expect(initAnalytics).not.toHaveBeenCalled();
});

it('retains explicit production tracking and deduplicates sign-in measurement', async () => {
  process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
  const { container, rerender } = render(<>
    <GoogleTagManagerHead /><GoogleTagManagerBody />
    <PostHogClientProvider><AnalyticsUserSync /><p>Product still works</p></PostHogClientProvider>
  </>);
  expect(screen.getByText('Product still works')).toBeInTheDocument();
  expect(container.querySelector('#google-tag-manager')).not.toBeNull();
  // React does not mount noscript's iframe in a scripting-enabled client DOM.
  expect(container.querySelector('noscript')).not.toBeNull();
  expect(identifyUser).toHaveBeenCalledWith('fixture-user', expect.objectContaining({ email: 'fixture@example.invalid' }));
  await waitFor(() => expect(captureEvent).toHaveBeenCalledTimes(1));
  expect(window.sessionStorage.getItem('analytics-sign-in:fixture-user')).toBe('1');
  rerender(<PostHogClientProvider><AnalyticsUserSync /></PostHogClientProvider>);
  await waitFor(() => expect(identifyUser).toHaveBeenCalledTimes(2));
  expect(captureEvent).toHaveBeenCalledTimes(1);
});


it.each([true, false])('waits for successful async identity setup before tracking/storage (identified=%s)', async (identified) => {
  process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
  let finish: (value: boolean) => void = () => undefined;
  const pending = new Promise<boolean>(resolve => { finish = resolve; });
  (identifyUser as jest.Mock).mockReturnValueOnce(pending);
  const write = jest.spyOn(Storage.prototype, 'setItem');
  render(<AnalyticsUserSync />);
  expect(captureEvent).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  await act(async () => { finish(identified); await pending; });
  expect(captureEvent).toHaveBeenCalledTimes(identified ? 1 : 0);
  expect(write).toHaveBeenCalledTimes(identified ? 1 : 0);
});

it('does not track a user whose identity effect was unmounted before SDK readiness', async () => {
  process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
  let finish: (value: boolean) => void = () => undefined;
  const pending = new Promise<boolean>(resolve => { finish = resolve; });
  (identifyUser as jest.Mock).mockReturnValueOnce(pending);
  const write = jest.spyOn(Storage.prototype, 'setItem');
  const { unmount } = render(<AnalyticsUserSync />);
  unmount();
  await act(async () => { finish(true); await pending; });
  expect(captureEvent).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});
