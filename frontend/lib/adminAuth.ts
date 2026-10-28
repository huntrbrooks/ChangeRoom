import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

// Admins are identified by a VERIFIED PRIMARY email on this list, or by Clerk user id via
// ADMIN_USER_IDS (comma-separated). Unverified or secondary addresses never count.
const ADMIN_EMAILS = [
  "admin@igetdressed.online",
  "gerard@igetdressed.online",
  "gerardgrenville@gmail.com",
];

type ClerkEmailEntry = { id: string; emailAddress: string; verification?: { status?: string } | null };
type ClerkUserLike = { id: string; primaryEmailAddressId: string | null; emailAddresses: ClerkEmailEntry[] };

export function apiKeyMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) {
    return false;
  }
  // Hash first so both buffers have equal length and the comparison is constant-time.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** The user's primary email, only if Clerk reports it verified. */
export function verifiedPrimaryEmail(user: ClerkUserLike): string | null {
  const primary = user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified") {
    return null;
  }
  return primary.emailAddress.toLowerCase();
}

export function isAdminUser(user: ClerkUserLike, adminUserIds: string | undefined = process.env.ADMIN_USER_IDS): boolean {
  const allowedIds = (adminUserIds || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (allowedIds.includes(user.id)) {
    return true;
  }
  const email = verifiedPrimaryEmail(user);
  return Boolean(email && ADMIN_EMAILS.includes(email));
}

export async function getAdminAuth(request: NextRequest): Promise<{
  authorized: boolean;
  adminEmail: string | null;
}> {
  if (apiKeyMatches(request.headers.get("x-api-key"), process.env.ADMIN_API_KEY)) {
    return { authorized: true, adminEmail: "api-key" };
  }

  const { userId } = await auth();
  if (!userId) {
    return { authorized: false, adminEmail: null };
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return {
    authorized: isAdminUser(user),
    adminEmail: verifiedPrimaryEmail(user),
  };
}
