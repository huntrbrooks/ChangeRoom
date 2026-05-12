describe("clerkAuthConfig", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      configurable: true,
    });
  });

  it("keeps current and legacy redirect origins together in production", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    });

    const { getAllowedRedirectOrigins } = await import("@/lib/clerkAuthConfig");

    expect(getAllowedRedirectOrigins()).toEqual([
      "https://igetdressed.online",
      "https://www.igetdressed.online",
      "https://getdressed.online",
      "https://www.getdressed.online",
    ]);
  });

  it("allows local development redirects for Clerk auth", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
    });

    const { getAllowedRedirectOrigins } = await import("@/lib/clerkAuthConfig");

    expect(getAllowedRedirectOrigins()).toEqual([
      "https://igetdressed.online",
      "https://www.igetdressed.online",
      "https://getdressed.online",
      "https://www.getdressed.online",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
  });
});
