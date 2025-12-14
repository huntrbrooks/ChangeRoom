const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

const DEFAULT_PROTOCOL_PREFIX = '/';

const getDefaultBaseUrl = () => {
  if (typeof process !== 'undefined') {
    const envBase =
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      '';
    if (envBase) {
      return envBase;
    }
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return '';
};

const normalizeBase = (base: string) => base.replace(/\/+$/, '');

const normalizePath = (path: string) =>
  path.startsWith('/') ? path : `${DEFAULT_PROTOCOL_PREFIX}${path}`;

export const ensureAbsoluteUrl = (
  url?: string | null,
  baseUrl?: string
): string | null => {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  if (ABSOLUTE_URL_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const base = (baseUrl || getDefaultBaseUrl()).trim();
  if (!base) {
    return trimmed;
  }

  return `${normalizeBase(base)}${normalizePath(trimmed)}`;
};

export const ensureAbsoluteUrlOrFallback = (
  url?: string | null,
  baseUrl?: string,
  fallback?: string
) => ensureAbsoluteUrl(url, baseUrl) ?? fallback ?? null;







