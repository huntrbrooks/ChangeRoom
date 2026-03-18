export const DEFAULT_GOOGLE_TAG_MANAGER_ID = "GTM-P9NX58BF";

export function getGoogleTagManagerId(): string {
  const envValue = (process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID || "").trim();
  return envValue || DEFAULT_GOOGLE_TAG_MANAGER_ID;
}
