/**
 * Paywall bypass configuration utility
 * 
 * Checks if a user email is in the bypass list configured via
 * NEXT_PUBLIC_PAYWALL_BYPASS_EMAILS environment variable.
 * 
 * Format: Comma-separated email list (e.g., "user1@example.com,user2@example.com")
 */

/**
 * Check if a user email is in the paywall bypass list
 * @param email - User email address to check
 * @returns true if the email is in the bypass list, false otherwise
 */
export function isBypassUser(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const bypassEmailsEnv = process.env.NEXT_PUBLIC_PAYWALL_BYPASS_EMAILS;
  if (!bypassEmailsEnv) {
    return false;
  }

  // Parse comma-separated email list
  const bypassEmails = bypassEmailsEnv
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);

  // Case-insensitive email matching
  const normalizedEmail = email.toLowerCase().trim();

  return bypassEmails.includes(normalizedEmail);
}











