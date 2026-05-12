import { resolveBackendApiUrl } from "@/lib/backend-url";

describe("resolveBackendApiUrl", () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    }
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      configurable: true,
    });
  });

  it("uses an explicit override before env config", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://env.example.com";

    expect(resolveBackendApiUrl("https://override.example.com")).toEqual({
      apiUrl: "https://override.example.com",
    });
  });

  it("does not silently fall back to localhost when env config is missing", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
    });

    expect(resolveBackendApiUrl()).toEqual({
      apiUrl: null,
      reason:
        "NEXT_PUBLIC_API_URL is missing. Set it to your backend URL, for example http://localhost:8000.",
    });
  });
});
