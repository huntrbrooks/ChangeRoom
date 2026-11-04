// Called only in server route handlers; never accept an email/flag from the browser.
export function isTryonStaff(userId: string): boolean {
  return Boolean(userId && (process.env.TRYON_PRIVILEGED_USER_IDS || '').split(',').some(id => id.trim() === userId));
}
