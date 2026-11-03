export const DEFAULT_GOOGLE_TAG_MANAGER_ID = "GTM-P9NX58BF";

export function getGoogleTagManagerId(): string | null {
  // A staging rehearsal must never populate the live marketing container.
  if (process.env.VERCEL_ENV === "preview") return null;
  const envValue = (process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID || "").trim();
  return envValue || DEFAULT_GOOGLE_TAG_MANAGER_ID;
}
