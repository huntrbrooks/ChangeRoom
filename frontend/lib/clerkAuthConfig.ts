import { CANONICAL_ORIGIN } from "@/lib/domainRouting";

export function getClerkProxyUrl(): string | undefined {
  return undefined;
}

export function getAllowedRedirectOrigins(): string[] {
  return [
    CANONICAL_ORIGIN,
    "https://www.igetdressed.online",
    "https://getdressed.online",
    "https://www.getdressed.online",
  ];
}
