import {
  isMyOutfitsEnabled,
  isPitchDemoEnabled,
  isTryOnFromUrlEnabled,
  parseBooleanEnvFlag,
} from "@/lib/featureFlags";

describe("parseBooleanEnvFlag", () => {
  it("accepts common truthy values", () => {
    expect(parseBooleanEnvFlag("1")).toBe(true);
    expect(parseBooleanEnvFlag("true")).toBe(true);
    expect(parseBooleanEnvFlag("YES")).toBe(true);
    expect(parseBooleanEnvFlag(" on ")).toBe(true);
  });

  it("rejects missing and falsey values", () => {
    expect(parseBooleanEnvFlag(undefined)).toBe(false);
    expect(parseBooleanEnvFlag(null)).toBe(false);
    expect(parseBooleanEnvFlag("0")).toBe(false);
    expect(parseBooleanEnvFlag("false")).toBe(false);
  });
});

describe("isTryOnFromUrlEnabled", () => {
  const originalValue = process.env.NEXT_PUBLIC_ENABLE_TRYON_FROM_URL;

  afterEach(() => {
    if (typeof originalValue === "string") {
      process.env.NEXT_PUBLIC_ENABLE_TRYON_FROM_URL = originalValue;
      return;
    }

    delete process.env.NEXT_PUBLIC_ENABLE_TRYON_FROM_URL;
  });

  it("defaults to disabled", () => {
    delete process.env.NEXT_PUBLIC_ENABLE_TRYON_FROM_URL;
    expect(isTryOnFromUrlEnabled()).toBe(false);
  });

  it("enables the feature only for explicit truthy values", () => {
    process.env.NEXT_PUBLIC_ENABLE_TRYON_FROM_URL = "true";
    expect(isTryOnFromUrlEnabled()).toBe(true);
  });
});

describe("isMyOutfitsEnabled", () => {
  const originalValue = process.env.NEXT_PUBLIC_ENABLE_MY_OUTFITS;

  afterEach(() => {
    if (typeof originalValue === "string") {
      process.env.NEXT_PUBLIC_ENABLE_MY_OUTFITS = originalValue;
      return;
    }

    delete process.env.NEXT_PUBLIC_ENABLE_MY_OUTFITS;
  });

  it("defaults to disabled", () => {
    delete process.env.NEXT_PUBLIC_ENABLE_MY_OUTFITS;
    expect(isMyOutfitsEnabled()).toBe(false);
  });

  it("enables the feature only for explicit truthy values", () => {
    process.env.NEXT_PUBLIC_ENABLE_MY_OUTFITS = "true";
    expect(isMyOutfitsEnabled()).toBe(true);
  });
});

describe("isPitchDemoEnabled", () => {
  const originalValue = process.env.NEXT_PUBLIC_ENABLE_PITCH_DEMO;

  afterEach(() => {
    if (typeof originalValue === "string") {
      process.env.NEXT_PUBLIC_ENABLE_PITCH_DEMO = originalValue;
      return;
    }

    delete process.env.NEXT_PUBLIC_ENABLE_PITCH_DEMO;
  });

  it("defaults to enabled for pitch mode", () => {
    delete process.env.NEXT_PUBLIC_ENABLE_PITCH_DEMO;
    expect(isPitchDemoEnabled()).toBe(true);
  });

  it("can be explicitly disabled", () => {
    process.env.NEXT_PUBLIC_ENABLE_PITCH_DEMO = "false";
    expect(isPitchDemoEnabled()).toBe(false);
  });
});
