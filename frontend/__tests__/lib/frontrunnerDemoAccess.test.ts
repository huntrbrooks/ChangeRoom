/**
 * @jest-environment node
 */

import {
  createFrontrunnerDemoSessionToken,
  hasValidFrontrunnerDemoSession,
  isValidFrontrunnerDemoPassword,
} from "@/lib/frontrunnerDemoAccess";

describe("frontrunnerDemoAccess", () => {
  const originalPassword = process.env.FRONTRUNNER_DEMO_PASSWORD;
  const originalSecret = process.env.FRONTRUNNER_DEMO_COOKIE_SECRET;

  beforeEach(() => {
    process.env.FRONTRUNNER_DEMO_PASSWORD = "bintang";
    process.env.FRONTRUNNER_DEMO_COOKIE_SECRET = "pitch-secret";
  });

  afterEach(() => {
    if (typeof originalPassword === "string") {
      process.env.FRONTRUNNER_DEMO_PASSWORD = originalPassword;
    } else {
      delete process.env.FRONTRUNNER_DEMO_PASSWORD;
    }

    if (typeof originalSecret === "string") {
      process.env.FRONTRUNNER_DEMO_COOKIE_SECRET = originalSecret;
    } else {
      delete process.env.FRONTRUNNER_DEMO_COOKIE_SECRET;
    }
  });

  it("accepts the configured password", () => {
    expect(isValidFrontrunnerDemoPassword("bintang")).toBe(true);
    expect(isValidFrontrunnerDemoPassword("wrong")).toBe(false);
  });

  it("validates the signed demo session token", () => {
    const token = createFrontrunnerDemoSessionToken();

    expect(hasValidFrontrunnerDemoSession(token)).toBe(true);
    expect(hasValidFrontrunnerDemoSession("invalid")).toBe(false);
  });

  it("issues a different token per session", () => {
    expect(createFrontrunnerDemoSessionToken()).not.toBe(createFrontrunnerDemoSessionToken());
  });

  it("rejects tampered and expired tokens", () => {
    const now = Date.UTC(2026, 9, 29, 12);
    const token = createFrontrunnerDemoSessionToken(now);
    const [issuedAt, nonce, signature] = token.split(".");

    expect(hasValidFrontrunnerDemoSession(`${Number(issuedAt) + 3600}.${nonce}.${signature}`, now)).toBe(false);
    expect(hasValidFrontrunnerDemoSession(token, now + 11 * 3600 * 1000)).toBe(true);
    expect(hasValidFrontrunnerDemoSession(token, now + 13 * 3600 * 1000)).toBe(false);
  });

  it("rejects tokens signed with a different secret", () => {
    const token = createFrontrunnerDemoSessionToken();
    process.env.FRONTRUNNER_DEMO_COOKIE_SECRET = "rotated-secret";
    expect(hasValidFrontrunnerDemoSession(token)).toBe(false);
  });

  it("stays locked when no password is configured", () => {
    delete process.env.FRONTRUNNER_DEMO_PASSWORD;
    delete process.env.FRONTRUNNER_DEMO_COOKIE_SECRET;
    expect(isValidFrontrunnerDemoPassword("bintang")).toBe(false);
    expect(hasValidFrontrunnerDemoSession("1.2.3")).toBe(false);
  });
});
