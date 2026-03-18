describe("clerkAuthConfig", () => {
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
