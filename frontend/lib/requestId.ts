export function generateRequestId(prefix: string = "req"): string {
  try {
    // Browser + modern runtimes
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // ignore
  }
  // Fallback (good enough for correlation)
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ensureRequestId(
  headers: Record<string, string | undefined> | undefined,
  prefix: string = "req"
): { requestId: string; headers: Record<string, string> } {
  const existing =
    headers?.["X-Request-Id"] ||
    headers?.["x-request-id"] ||
    headers?.["X-ChangeRoom-Request-Id"] ||
    headers?.["x-changeroom-request-id"];

  const requestId = (existing && String(existing)) || generateRequestId(prefix);

  return {
    requestId,
    headers: {
      ...(headers || {}),
      "X-Request-Id": requestId,
      "X-ChangeRoom-Request-Id": requestId,
    },
  };
}




