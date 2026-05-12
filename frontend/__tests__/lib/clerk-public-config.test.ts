import {
  getClerkPublishableKey,
  isUsableClerkPublishableKey,
  normalizeClerkPublishableKey,
} from "@/lib/clerk-public-config";

describe("clerk-public-config", () => {
  const originalPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  afterEach(() => {
    if (originalPublishableKey === undefined) {
      delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = originalPublishableKey;
    }
  });

  it("normalizes quoted Clerk publishable keys", () => {
    expect(normalizeClerkPublishableKey(' "pk_live_abc.DEF-123=" ')).toBe(
      "pk_live_abc.DEF-123="
    );
  });

  it("accepts usable normalized Clerk publishable keys", () => {
    expect(isUsableClerkPublishableKey(' "pk_test_abcdefghijklmnopqrstuvwxyz" ')).toBe(
      true
    );
  });

  it("rejects malformed Clerk publishable keys", () => {
    expect(isUsableClerkPublishableKey("not-a-key")).toBe(false);
    expect(isUsableClerkPublishableKey("pk_short")).toBe(false);
  });

  it("returns a sanitized env key", () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
      ' "pk_live_abcdefghijklmnopqrstuvwxyz" ';

    expect(getClerkPublishableKey()).toBe("pk_live_abcdefghijklmnopqrstuvwxyz");
  });
});
