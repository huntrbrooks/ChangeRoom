describe("googleTagManager", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID;
  });

  it("defaults to the configured production GTM container", async () => {
    const { getGoogleTagManagerId } = await import("@/lib/googleTagManager");

    expect(getGoogleTagManagerId()).toBe("GTM-P9NX58BF");
  });

  it("uses the env override when provided", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID = "GTM-TEST123";
    const { getGoogleTagManagerId } = await import("@/lib/googleTagManager");

    expect(getGoogleTagManagerId()).toBe("GTM-TEST123");
  });
});
