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

it('allows only the pinned staging sign-in return origin in a preview', async () => {
  const { getAllowedRedirectOrigins } = await import('@/lib/clerkAuthConfig');
  const env = {VERCEL_ENV:'preview', NEXT_PUBLIC_APP_URL:'https://stage.example.invalid',
    CHANGEROOM_STAGING_APP_HOST:'stage.example.invalid'};
  expect(getAllowedRedirectOrigins(env)).toEqual(['https://stage.example.invalid']);
  expect(getAllowedRedirectOrigins({...env, NEXT_PUBLIC_APP_URL:'https://igetdressed.online'})).toEqual([]);
});
