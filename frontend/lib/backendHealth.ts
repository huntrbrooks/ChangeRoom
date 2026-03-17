export interface BackendHealthResult {
  ok: boolean;
  message: string | null;
  status: number | null;
}

type FetchLike = typeof fetch;

const DEFAULT_TIMEOUT_MS = 10_000;

function buildBackendHealthMessage(status: number | null, bodyText: string): string {
  const normalizedBody = bodyText.toLowerCase();

  if (/service\b.*suspend/.test(normalizedBody)) {
    return "Try-on is unavailable because the backend host is suspended.";
  }

  if (status === 503) {
    return "Try-on is temporarily unavailable while the backend is offline.";
  }

  if (status === 401 || status === 403) {
    return "Try-on is unavailable because backend authentication is misconfigured.";
  }

  if (status && status >= 500) {
    return "Try-on is temporarily unavailable because the backend returned an error.";
  }

  return "Try-on is temporarily unavailable.";
}

export async function probeBackendHealth(
  apiUrl: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<BackendHealthResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const target = new URL("/", apiUrl).toString();
    const response = await fetchImpl(target, {
      cache: "no-store",
      headers: {
        Accept: "application/json, text/plain;q=0.9, text/html;q=0.8",
      },
      method: "GET",
      signal: controller.signal,
    });

    const bodyText = await response.text();

    if (response.ok && !/service suspended/i.test(bodyText)) {
      return { ok: true, message: null, status: response.status };
    }

    return {
      ok: false,
      message: buildBackendHealthMessage(response.status, bodyText),
      status: response.status,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        message: "Try-on is unavailable because the backend health check timed out.",
        status: null,
      };
    }

    return {
      ok: false,
      message: "Try-on is unavailable because the backend could not be reached.",
      status: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
