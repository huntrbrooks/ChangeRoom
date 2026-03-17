describe("clerkAuthConfig", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_CLERK_PROXY_URL;
  });

  it("defaults the Clerk proxy url to the canonical proxy path", async () => {
    const { getClerkProxyUrl } = await import("@/lib/clerkAuthConfig");

    expect(getClerkProxyUrl()).toBe("https://igetdressed.online/__clerk/");
  });

  it("respects an explicit Clerk proxy override", async () => {
    process.env.NEXT_PUBLIC_CLERK_PROXY_URL = "https://igetdressed.online/custom-clerk/";
    const { getClerkProxyUrl } = await import("@/lib/clerkAuthConfig");

    expect(getClerkProxyUrl()).toBe("https://igetdressed.online/custom-clerk/");
  });

  it("keeps current and legacy redirect origins together", async () => {
    const { getAllowedRedirectOrigins } = await import("@/lib/clerkAuthConfig");

    expect(getAllowedRedirectOrigins()).toEqual([
      "https://igetdressed.online",
      "https://www.igetdressed.online",
      "https://getdressed.online",
      "https://www.getdressed.online",
    ]);
  });
});
