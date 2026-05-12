type BackendUrlResult = {
  apiUrl: string | null;
  reason?: string;
  usedFallback?: boolean;
};

export function resolveBackendApiUrl(override?: string | null): BackendUrlResult {
  const overrideValue = (override || "").trim();
  if (overrideValue) {
    return { apiUrl: overrideValue };
  }

  const envValue = (process.env.NEXT_PUBLIC_API_URL || "").trim();
  if (envValue) {
    return { apiUrl: envValue };
  }

  return {
    apiUrl: null,
    reason:
      process.env.NODE_ENV === "production"
        ? "NEXT_PUBLIC_API_URL is missing in the client build."
        : "NEXT_PUBLIC_API_URL is missing. Set it to your backend URL, for example http://localhost:8000.",
  };
}
