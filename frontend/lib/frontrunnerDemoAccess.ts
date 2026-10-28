import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const FRONTRUNNER_DEMO_COOKIE_NAME = "frontrunnerau_demo";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

// No default password: if FRONTRUNNER_DEMO_PASSWORD is unset the pitch room stays locked.
function readPassword(): string {
  return (process.env.FRONTRUNNER_DEMO_PASSWORD || "").trim();
}

// Prefer a dedicated secret. Falling back to the password keeps existing deployments working,
// and tokens still can't be forged without knowing it.
function readCookieSecret(): string {
  return (process.env.FRONTRUNNER_DEMO_COOKIE_SECRET || readPassword()).trim();
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`frontrunnerau-demo-session:${payload}`).digest("hex");
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

/** Per-session token: `<issuedAtSeconds>.<nonce>.<hmac>`, valid for SESSION_MAX_AGE_SECONDS. */
export function createFrontrunnerDemoSessionToken(nowMs: number = Date.now()): string {
  const secret = readCookieSecret();
  if (!secret) {
    throw new Error("frontrunner_demo_not_configured");
  }
  const payload = `${Math.floor(nowMs / 1000)}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function hasValidFrontrunnerDemoSession(
  token: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  const secret = readCookieSecret();
  if (!token || !secret) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0])) {
    return false;
  }
  const [issuedAt, nonce, signature] = parts;
  if (!safeEqual(signature, sign(`${issuedAt}.${nonce}`, secret))) {
    return false;
  }

  const ageSeconds = Math.floor(nowMs / 1000) - Number(issuedAt);
  return ageSeconds >= 0 && ageSeconds <= SESSION_MAX_AGE_SECONDS;
}

export function getFrontrunnerDemoCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
