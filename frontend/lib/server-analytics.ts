import { ANALYTICS_EVENTS, type AnalyticsEventName } from './analytics-events';

const key = process.env.POSTHOG_KEY;
const host = (process.env.POSTHOG_HOST || 'https://us.i.posthog.com').replace(
  /\/+$/,
  '',
);

type EventPayload = Record<string, unknown>;

export async function captureServerEvent(
  event: AnalyticsEventName,
  properties: EventPayload = {},
  distinctId?: string,
): Promise<void> {
  if (!key) return;

  try {
    await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId || properties?.distinct_id || 'server',
        properties: {
          source: 'server',
          ...properties,
        },
      }),
      cache: 'no-store',
    });
  } catch (err) {
    console.error('PostHog capture failed', err);
  }
}

export { ANALYTICS_EVENTS };

