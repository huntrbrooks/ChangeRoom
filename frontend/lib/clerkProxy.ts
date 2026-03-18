export const CLERK_PROXY_PATH = '/__clerk';

function normalizeClerkHost(value: string | undefined, fallback: string): string {
  const raw = (value || '').trim();
  if (!raw) {
    return fallback;
  }

  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    return url.host;
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '') || fallback;
  }
}

export function getClerkFrontendApiHost(): string {
  return normalizeClerkHost(
    process.env.NEXT_PUBLIC_CLERK_FRONTEND_API || process.env.CLERK_FRONTEND_API,
    'clerk.igetdressed.online'
  );
}
