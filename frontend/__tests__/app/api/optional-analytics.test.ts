/** @jest-environment node */
import { NextRequest } from 'next/server';

const mockAuth = jest.fn();
const mockSend = jest.fn();
const mockLogClick = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({ auth: () => mockAuth() }));
jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })) }));
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/db-access', () => ({ logAffiliateClick: (...args: unknown[]) => mockLogClick(...args) }));

const original = { ...process.env };
const originalFetch = global.fetch;
function request(path: string, token?: string, body?: string) {
  return new NextRequest('https://igetdressed.online' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: token ? { authorization: 'Bearer ' + token } : {},
    body,
  });
}
beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks();
  process.env.NEXT_PUBLIC_OPTIONAL_ANALYTICS_DEPLOYMENT = 'production';
  delete process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS;
  Object.assign(process.env, {
    POSTHOG_KEY: 'test-key', POSTHOG_PROJECT_ID: 'test-project',
    N8N_EVENTS_WEBHOOK_URL: 'https://automation.example.invalid/events', N8N_WEBHOOK_SECRET: 'test-n8n',
    METRICS_EMAIL_SECRET: 'test-metrics', RESEND_API_KEY: 'test-resend', METRICS_EMAIL_TO: 'fixture@example.invalid',
  });
  mockAuth.mockResolvedValue({ userId: 'fixture-user' });
  mockSend.mockResolvedValue({}); mockLogClick.mockResolvedValue(undefined);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ columns: ['tryon_attempts'], results: [[2]] }] }) });
});
afterAll(() => { process.env = original; global.fetch = originalFetch; });

it.each(['disabled', 'staging'])('skips server capture, forwarding, callback logging and metrics query/email when %s', async (mode) => {
  if (mode === 'staging') {
    process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
    process.env.NEXT_PUBLIC_OPTIONAL_ANALYTICS_DEPLOYMENT = 'disabled';
  }
  const { captureServerEvent, ANALYTICS_EVENTS } = await import('@/lib/server-analytics');
  const events = await import('@/app/api/events/user/route');
  const inbound = await import('@/app/api/webhooks/n8n/route');
  const metrics = await import('@/app/api/metrics-email/route');
  const redirect = await import('@/app/api/r/route');
  const { logger } = await import('@/lib/logger');
  await captureServerEvent(ANALYTICS_EVENTS.SIGN_UP, {}, 'fixture-user');
  const eventRequest = request('/api/events/user', undefined, 'not-json');
  const readBody = jest.spyOn(eventRequest, 'json');
  expect(await (await events.POST(eventRequest)).json()).toEqual({ ok: true, tracking: false });
  expect(readBody).not.toHaveBeenCalled();
  expect(await (await inbound.POST(request('/api/webhooks/n8n', 'test-n8n', 'not-json'))).json()).toEqual({ ok: true, tracking: false });
  expect(await (await metrics.GET(request('/api/metrics-email', 'test-metrics'))).json()).toEqual({ ok: true, skipped: 'optional_analytics_disabled' });
  const result = await redirect.GET(request('/api/r?url=https%3A%2F%2Fwww.zara.com%2Fau%2Fitem'));
  expect(result.status).toBe(302);
  expect(result.headers.get('location')).toBe('https://www.zara.com/au/item');
  expect(mockLogClick).not.toHaveBeenCalled();
  expect(logger.info).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
});

it('preserves endpoint authentication even while tracking is disabled', async () => {
  mockAuth.mockResolvedValue({ userId: null });
  const events = await import('@/app/api/events/user/route');
  const inbound = await import('@/app/api/webhooks/n8n/route');
  const metrics = await import('@/app/api/metrics-email/route');
  expect((await events.POST(request('/api/events/user', undefined, '{}'))).status).toBe(401);
  expect((await inbound.POST(request('/api/webhooks/n8n', 'wrong', '{}'))).status).toBe(401);
  expect((await metrics.GET(request('/api/metrics-email', 'wrong'))).status).toBe(401);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
});

it('retains explicit production capture, automation, metrics and click behavior', async () => {
  process.env.NEXT_PUBLIC_ENABLE_OPTIONAL_ANALYTICS = 'true';
  const { captureServerEvent, ANALYTICS_EVENTS } = await import('@/lib/server-analytics');
  const events = await import('@/app/api/events/user/route');
  const metrics = await import('@/app/api/metrics-email/route');
  const redirect = await import('@/app/api/r/route');
  await captureServerEvent(ANALYTICS_EVENTS.SIGN_UP, {}, 'fixture-user');
  expect((await events.POST(request('/api/events/user', undefined, JSON.stringify({ event: 'trial_consumed', data: {} })))).status).toBe(200);
  expect((await metrics.GET(request('/api/metrics-email', 'test-metrics'))).status).toBe(200);
  expect(global.fetch).toHaveBeenCalledTimes(3);
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect((await redirect.GET(request('/api/r?url=https%3A%2F%2Fwww.zara.com%2Fau%2Fitem'))).status).toBe(302);
  expect(mockLogClick).toHaveBeenCalledWith(expect.objectContaining({ userId: 'fixture-user' }));
});
