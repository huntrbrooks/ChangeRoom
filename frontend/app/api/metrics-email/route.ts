import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_KEY = process.env.POSTHOG_KEY;
const POSTHOG_HOST =
  (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/+$/, "");
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const METRICS_EMAIL_TO = process.env.METRICS_EMAIL_TO;
const METRICS_EMAIL_FROM =
  process.env.METRICS_EMAIL_FROM || "metrics@igetdressed.online";

type MetricsRow = Record<string, number>;

async function fetchMetrics(): Promise<MetricsRow> {
  if (!POSTHOG_KEY || !POSTHOG_PROJECT_ID) {
    throw new Error("PostHog config missing");
  }

  const hogql = `
WITH now() - INTERVAL 7 DAY AS start_ts
SELECT
  countIf(event = 'tryon_attempt') AS tryon_attempts,
  countIf(event = 'tryon_success') AS tryon_successes,
  countIf(event = 'free_tryon_completed') AS free_tryon_completed,
  countIf(event = 'paywall_view_after_result') AS paywall_views_after_result,
  countIf(event = 'checkout_started') AS checkout_started,
  countIf(event = 'purchase_completed') AS purchase_completed,
  countIf(event = 'tryon_success' AND properties.used_free_trial = true) AS free_tryon_successes,
  countIf(event = 'tryon_attempt' AND properties.free_trial_eligible = true) AS free_tryon_attempts
FROM events
WHERE timestamp >= start_ts
  `;

  const res = await fetch(
    `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${POSTHOG_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query: hogql,
        },
      }),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog query failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const firstResult = Array.isArray(data?.results) ? data.results[0] : data;
  const columns: string[] = firstResult?.columns || [];
  const values: number[] =
    (firstResult?.results && firstResult.results[0]) || [];

  const metrics: MetricsRow = {};
  columns.forEach((col: string, idx: number) => {
    metrics[col] = Number(values[idx] ?? 0);
  });

  return metrics;
}

function formatRate(numerator: number, denominator: number): string {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatAttemptsPerSuccess(
  attempts: number,
  successes: number
): string {
  if (!successes) return "∞";
  return (attempts / successes).toFixed(2);
}

function buildEmailHtml(metrics: MetricsRow): string {
  const attempts = metrics.tryon_attempts || 0;
  const successes = metrics.tryon_successes || 0;
  const freeAttempts = metrics.free_tryon_attempts || 0;
  const freeSuccesses = metrics.free_tryon_successes || 0;

  const freeTryOnRate = formatRate(freeSuccesses, freeAttempts || attempts);
  const paywallRate = formatRate(
    metrics.paywall_views_after_result || 0,
    successes || attempts
  );
  const checkoutRate = formatRate(
    metrics.checkout_started || 0,
    metrics.paywall_views_after_result || successes || 1
  );
  const purchaseRate = formatRate(
    metrics.purchase_completed || 0,
    metrics.checkout_started || 1
  );
  const attemptsPerSuccess = formatAttemptsPerSuccess(attempts, successes);

  return `
  <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; line-height: 1.5;">
    <h2 style="margin-bottom: 12px;">Weekly Funnel Metrics (last 7 days)</h2>
    <table cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 640px;">
      <thead>
        <tr style="background: #0f172a; color: #fff;">
          <th align="left">Metric</th>
          <th align="right">Value</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td>Free try-on completed rate</td>
          <td align="right">${freeTryOnRate}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td>Paywall view rate after result</td>
          <td align="right">${paywallRate}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td>Checkout started rate</td>
          <td align="right">${checkoutRate}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td>Purchase completed rate</td>
          <td align="right">${purchaseRate}</td>
        </tr>
        <tr>
          <td>Attempts per success</td>
          <td align="right">${attemptsPerSuccess}</td>
        </tr>
      </tbody>
    </table>
    <p style="margin-top: 18px; color: #475569; font-size: 14px;">
      Raw counts — attempts: ${attempts}, successes: ${successes}, free attempts: ${freeAttempts}, free successes: ${freeSuccesses}, paywall views: ${metrics.paywall_views_after_result || 0}, checkouts: ${metrics.checkout_started || 0}, purchases: ${metrics.purchase_completed || 0}
    </p>
  </div>
  `;
}

async function handleRequest(_req: NextRequest) {
  try {
    const metrics = await fetchMetrics();

    if (!RESEND_API_KEY || !METRICS_EMAIL_TO) {
      return NextResponse.json(
        {
          ok: true,
          metrics,
          message:
            "Email delivery disabled; set RESEND_API_KEY and METRICS_EMAIL_TO to enable.",
        },
        { status: 200 }
      );
    }

    const resend = new Resend(RESEND_API_KEY);
    const html = buildEmailHtml(metrics);

    await resend.emails.send({
      from: METRICS_EMAIL_FROM,
      to: METRICS_EMAIL_TO.split(",").map((v) => v.trim()),
      subject: "Weekly funnel metrics",
      html,
    });

    return NextResponse.json({ ok: true, metrics }, { status: 200 });
  } catch (error: unknown) {
    console.error("metrics-email error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown metrics-email error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}

