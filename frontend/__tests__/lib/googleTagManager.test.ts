/** @jest-environment node */
import { renderToStaticMarkup } from 'react-dom/server';
import { getGoogleTagManagerId } from '@/lib/googleTagManager';
import { optionalAnalyticsEnabled } from '@/lib/optional-analytics';

const original = { ...process.env };
beforeEach(() => {
  delete process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS;
  process.env.NEXT_PUBLIC_OPTIONAL_ANALYTICS_DEPLOYMENT = 'production';
  process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID = 'GTM-TEST123';
});
afterAll(() => { process.env = original; });

it.each([undefined, '', 'false', 'TRUE', '1'])('defaults off for flag %s even with a configured container', (flag) => {
  if (flag === undefined) delete process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS;
  else process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = flag;
  expect(optionalAnalyticsEnabled()).toBe(false);
  expect(getGoogleTagManagerId()).toBeNull();
});

it.each([undefined, 'disabled', 'preview', 'development'])('stays off outside the generated production marker (%s)', (deployment) => {
  process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
  if (deployment === undefined) delete process.env.NEXT_PUBLIC_OPTIONAL_ANALYTICS_DEPLOYMENT;
  else process.env.NEXT_PUBLIC_OPTIONAL_ANALYTICS_DEPLOYMENT = deployment;
  expect(getGoogleTagManagerId()).toBeNull();
});

it('requires an explicit valid container even when enabled', () => {
  process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
  expect(getGoogleTagManagerId()).toBe('GTM-TEST123');
  for (const value of ['', 'not-a-container', "GTM-X');alert(1);//"]) {
    process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID = value;
    expect(getGoogleTagManagerId()).toBeNull();
  }
});


it.each(['preview', 'development', undefined])('a %s build cannot inherit an enabled deployment marker', async (deployment) => {
  jest.resetModules();
  process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
  process.env.NEXT_PUBLIC_OPTIONAL_ANALYTICS_DEPLOYMENT = 'production';
  if (deployment === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = deployment;
  const { default: config } = await import('@/next.config');
  expect(config.env?.NEXT_PUBLIC_OPTIONAL_ANALYTICS_DEPLOYMENT).toBe('disabled');
});


it('omits the server-rendered tracking iframe by default and includes it only when enabled', async () => {
  const { GoogleTagManagerBody } = await import('@/app/components/GoogleTagManager');
  expect(renderToStaticMarkup(GoogleTagManagerBody())).toBe('');
  process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
  expect(renderToStaticMarkup(GoogleTagManagerBody())).toContain('https://www.googletagmanager.com/ns.html?id=GTM-TEST123');
});
