type BackendUrlResult = {
  apiUrl: string | null;
  reason?: string;
  usedFallback?: boolean;
};

const LOCAL_BACKEND_URL = "http://localhost:8000";

export function resolveBackendApiUrl(override?: string | null): BackendUrlResult {
  const overrideValue = (override || "").trim();
  if (overrideValue) {
    return { apiUrl: overrideValue };
  }

  const envValue = (process.env.NEXT_PUBLIC_API_URL || "").trim();
  if (envValue) {
    return { apiUrl: envValue };
  }

  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    return {
      apiUrl: null,
      reason: "NEXT_PUBLIC_API_URL is missing in the client build.",
    };
  }

  return {
    apiUrl: LOCAL_BACKEND_URL,
    reason: "Using local backend fallback for development.",
    usedFallback: true,
  };
}
