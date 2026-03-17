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
});
