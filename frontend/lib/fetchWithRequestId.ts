import { ensureRequestId } from "./requestId";

type FetchWithRequestIdOptions = {
  /**
   * Prefix used when generating a request id.
   * Example: "preprocess", "download", "metrics"
   */
  prefix?: string;
  /**
   * By default, request ids are injected only for same-origin requests to avoid CORS preflights
   * on third-party URLs (e.g. image downloads, CDNs).
   * Set force=true when you explicitly want request ids on a cross-origin call you control.
   */
  force?: boolean;
};

function isSameOriginUrl(url: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const resolved = new URL(url, window.location.origin);
    return resolved.origin === window.location.origin;
  } catch {
    return false;
  }
}

function isRelativeUrl(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

function shouldInject(url: string, force?: boolean): boolean {
  if (force) return true;
  if (isRelativeUrl(url)) return true;
  return isSameOriginUrl(url);
}

export async function fetchWithRequestId(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchWithRequestIdOptions = {}
): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : "";

  if (url && shouldInject(url, options.force)) {
    const currentHeaders: Record<string, string> = {};
    const h = init.headers;
    if (h) {
      if (h instanceof Headers) {
        h.forEach((value, key) => {
          currentHeaders[key] = value;
        });
      } else if (Array.isArray(h)) {
        h.forEach(([key, value]) => {
          currentHeaders[key] = value;
        });
      } else {
        Object.assign(currentHeaders, h as Record<string, string>);
      }
    }

    const { headers } = ensureRequestId(currentHeaders, options.prefix || "fetch");
    init = { ...init, headers };
  }

  return fetch(input, init);
}


