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
        Accept: "application/json",
      },
      method: "GET",
      redirect: "error",
      signal: controller.signal,
    });

    const bodyText = await response.text();

    if (response.status === 200) {
      const stack = response.headers.get("X-ChangeRoom-Stack");
      const mime = (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
      if (mime === "application/json" && (stack === "fastapi-worker" || stack === "fastapi-render")) {
        try {
          if (JSON.parse(bodyText)?.message === "IGetDressed.Online API is running") {
            return { ok: true, message: null, status: 200 };
          }
        } catch { /* A gateway can send a login page with a JSON content type. */ }
      }
      return { ok: false, message: "The configured address did not return the try-on service.", status: 200 };
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
