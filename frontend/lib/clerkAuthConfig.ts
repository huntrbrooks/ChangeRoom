import { CANONICAL_ORIGIN } from "@/lib/domainRouting";

export function getClerkProxyUrl(): string | undefined {
  const explicitProxyUrl = process.env.NEXT_PUBLIC_CLERK_PROXY_URL?.trim();
  return explicitProxyUrl || undefined;
}

export function getAllowedRedirectOrigins(): string[] {
  return [
    CANONICAL_ORIGIN,
    "https://www.igetdressed.online",
    "https://getdressed.online",
    "https://www.getdressed.online",
  ];
}
