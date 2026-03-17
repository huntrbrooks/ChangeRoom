const ENABLED_FLAG_VALUES = new Set(["1", "true", "yes", "on"]);

export function parseBooleanEnvFlag(value: string | null | undefined): boolean {
  return ENABLED_FLAG_VALUES.has((value || "").trim().toLowerCase());
}

export function isTryOnFromUrlEnabled(): boolean {
  return parseBooleanEnvFlag(process.env.NEXT_PUBLIC_ENABLE_TRYON_FROM_URL);
}

export function isMyOutfitsEnabled(): boolean {
  return parseBooleanEnvFlag(process.env.NEXT_PUBLIC_ENABLE_MY_OUTFITS);
}

export function isPitchDemoEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ENABLE_PITCH_DEMO;
  if (typeof raw !== "string" || raw.trim() === "") {
    return true;
  }

  return parseBooleanEnvFlag(raw);
}
