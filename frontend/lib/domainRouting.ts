export const CANONICAL_HOST = 'igetdressed.online';
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

const LEGACY_HOSTS = new Set([
  'getdressed.online',
  'www.getdressed.online',
  'www.igetdressed.online',
]);

const EXCLUDED_REDIRECT_PREFIXES = ['/api', '/_next'];

export function normalizeHost(host?: string | null): string {
  return (host || '').trim().toLowerCase().replace(/:\d+$/, '');
}

export function shouldRedirectToCanonicalHost({
  host,
  pathname,
  method,
}: {
  host?: string | null;
  pathname: string;
  method: string;
}): boolean {
  const normalizedHost = normalizeHost(host);

  if (!LEGACY_HOSTS.has(normalizedHost)) {
    return false;
  }

  if (!['GET', 'HEAD'].includes(method.toUpperCase())) {
    return false;
  }

  return !EXCLUDED_REDIRECT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function buildCanonicalUrl(url: URL): URL {
  const canonicalUrl = new URL(url.toString());
  canonicalUrl.protocol = 'https:';
  canonicalUrl.host = CANONICAL_HOST;
  return canonicalUrl;
}
