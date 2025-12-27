import axios, { AxiosHeaders, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { ensureRequestId } from "./requestId";

/**
 * Shared axios instance for browser-side calls.
 * Automatically injects X-Request-Id / X-ChangeRoom-Request-Id unless already provided.
 */
export const httpClient: AxiosInstance = axios.create();

httpClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const current =
    config.headers instanceof AxiosHeaders
      ? (config.headers.toJSON() as Record<string, string | undefined>)
      : ((config.headers || {}) as Record<string, string | undefined>);

  const { headers } = ensureRequestId(current, "client");

  const merged = AxiosHeaders.from(config.headers ?? {});
  for (const [k, v] of Object.entries(headers)) {
    merged.set(k, v);
  }
  config.headers = merged;

  return config;
});




