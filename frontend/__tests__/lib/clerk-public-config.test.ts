import {
  getClerkPublishableKey,
  isUsableClerkPublishableKey,
  normalizeClerkPublishableKey,
} from "@/lib/clerk-public-config";

describe("clerk-public-config", () => {
  const originalPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const originalAllowLiveKeyInDev =
    process.env.NEXT_PUBLIC_ALLOW_LIVE_CLERK_IN_DEV;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalPublishableKey === undefined) {
      delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = originalPublishableKey;
    }
    if (originalAllowLiveKeyInDev === undefined) {
      delete process.env.NEXT_PUBLIC_ALLOW_LIVE_CLERK_IN_DEV;
    } else {
      process.env.NEXT_PUBLIC_ALLOW_LIVE_CLERK_IN_DEV =
        originalAllowLiveKeyInDev;
    }
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      configurable: true,
    });
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
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    });
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
      ' "pk_live_abcdefghijklmnopqrstuvwxyz" ';

    expect(getClerkPublishableKey()).toBe("pk_live_abcdefghijklmnopqrstuvwxyz");
  });

  it("blocks production Clerk keys in local development by default", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
    });
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
      "pk_live_abcdefghijklmnopqrstuvwxyz";

    expect(getClerkPublishableKey()).toBeUndefined();
  });

  it("allows production Clerk keys in local development with an explicit override", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
    });
    process.env.NEXT_PUBLIC_ALLOW_LIVE_CLERK_IN_DEV = "1";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
      "pk_live_abcdefghijklmnopqrstuvwxyz";

    expect(getClerkPublishableKey()).toBe("pk_live_abcdefghijklmnopqrstuvwxyz");
  });
});
