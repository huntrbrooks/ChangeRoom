import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const FRONTRUNNER_DEMO_COOKIE_NAME = "frontrunnerau_demo";

function readPassword(): string {
  return (process.env.FRONTRUNNER_DEMO_PASSWORD || "bintang").trim();
}

function readCookieSecret(): string {
  return (process.env.FRONTRUNNER_DEMO_COOKIE_SECRET || readPassword()).trim();
}

function toBuffer(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = toBuffer(left);
  const rightBuffer = toBuffer(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isValidFrontrunnerDemoPassword(password: string): boolean {
  const normalized = password.trim();
  const expected = readPassword();

  if (!normalized || !expected) {
    return false;
  }

  return safeEqual(normalized, expected);
}

export function createFrontrunnerDemoSessionToken(): string {
  return createHmac("sha256", readCookieSecret())
    .update("frontrunnerau-demo-session")
    .digest("hex");
}

export function hasValidFrontrunnerDemoSession(token: string | null | undefined): boolean {
  if (!token) {
    return false;
  }

  return safeEqual(token, createFrontrunnerDemoSessionToken());
}

export function getFrontrunnerDemoCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}
