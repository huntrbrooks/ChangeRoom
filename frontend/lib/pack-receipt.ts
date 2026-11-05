/** Receipt destinations are short-lived provider links. Never persist or log them. */
export function stripeReceiptUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.origin === 'https://pay.stripe.com' && !url.username && !url.password &&
      /^\/receipts\/(?:payment\/)?[A-Za-z0-9_-]+$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}
