export const PRIVILEGED_ACCOUNT_EMAILS = [
  "gerard.grenville@gmail.com",
  "cassandrachenco@outlook.com",
] as const;

export const UNLIMITED_CREDITS_LABEL = "Unlimited";

type EmailAddressLike = {
  id?: string | null;
  emailAddress?: string | null;
  email_address?: string | null;
  verification?: { status?: string | null } | null;
};

export type ClerkEmailUserLike = {
  primaryEmailAddress?: EmailAddressLike | null;
  primaryEmailAddressId?: string | null;
  primary_email_address_id?: string | null;
  emailAddresses?: EmailAddressLike[] | null;
  email_addresses?: EmailAddressLike[] | null;
};

export function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function getEmail(entry: EmailAddressLike | null | undefined): string | null {
  return entry?.emailAddress || entry?.email_address || null;
}

export function getUserPrimaryEmail(
  user: ClerkEmailUserLike | null | undefined
): string | null {
  if (!user) {
    return null;
  }

  const directPrimary = getEmail(user.primaryEmailAddress);
  if (directPrimary) {
    return directPrimary;
  }

  const primaryId = user.primaryEmailAddressId || user.primary_email_address_id || null;
  const emailAddresses = user.emailAddresses || user.email_addresses || [];
  const primaryById =
    primaryId && emailAddresses.find((entry) => entry.id === primaryId);
  const verified = emailAddresses.find(
    (entry) => entry.verification?.status === "verified"
  );

  return getEmail(primaryById || verified || emailAddresses[0]);
}

export function isPrivilegedAccountEmail(
  email: string | null | undefined
): boolean {
  const normalizedEmail = normalizeEmail(email);
  return PRIVILEGED_ACCOUNT_EMAILS.includes(
    normalizedEmail as (typeof PRIVILEGED_ACCOUNT_EMAILS)[number]
  );
}

export function getConfiguredBypassEmails(): string[] {
  return (process.env.NEXT_PUBLIC_PAYWALL_BYPASS_EMAILS || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

/**
 * Check if a user email is in the privileged or configured paywall bypass list.
 * @param email - User email address to check
 * @returns true if the email is in the bypass list, false otherwise
 */
export function isBypassUser(email: string | null | undefined): boolean {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  return (
    isPrivilegedAccountEmail(normalizedEmail) ||
    getConfiguredBypassEmails().includes(normalizedEmail)
  );
}




















