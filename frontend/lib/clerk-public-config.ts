const CLERK_PUBLISHABLE_KEY_PATTERN = /^pk_[a-zA-Z0-9_\-=.]+$/;

export function normalizeClerkPublishableKey(
  value: string | null | undefined
): string | undefined {
  const trimmed = (value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/['"]/g, "")
    .trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}

export function isUsableClerkPublishableKey(
  value: string | null | undefined
): boolean {
  const key = normalizeClerkPublishableKey(value);

  return Boolean(
    key &&
      key.startsWith("pk_") &&
      key.length >= 20 &&
      key.length <= 200 &&
      CLERK_PUBLISHABLE_KEY_PATTERN.test(key)
  );
}

export function getClerkPublishableKey(): string | undefined {
  const key = normalizeClerkPublishableKey(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  );

  if (!isUsableClerkPublishableKey(key)) {
    return undefined;
  }

  const allowLiveKeyInDev =
    process.env.NEXT_PUBLIC_ALLOW_LIVE_CLERK_IN_DEV === "1";

  if (
    process.env.NODE_ENV !== "production" &&
    key?.startsWith("pk_live_") &&
    !allowLiveKeyInDev
  ) {
    return undefined;
  }

  return key;
}

export function hasUsableClerkPublishableKey(): boolean {
  return Boolean(getClerkPublishableKey());
}
