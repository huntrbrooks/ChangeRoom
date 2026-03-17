import { CANONICAL_ORIGIN } from "@/lib/domainRouting";
import { CLERK_PROXY_PATH } from "@/lib/clerkProxy";

export function getClerkProxyUrl(): string {
  return process.env.NEXT_PUBLIC_CLERK_PROXY_URL || `${CANONICAL_ORIGIN}${CLERK_PROXY_PATH}/`;
}

export function getAllowedRedirectOrigins(): string[] {
  return [
    CANONICAL_ORIGIN,
    "https://www.igetdressed.online",
    "https://getdressed.online",
    "https://www.getdressed.online",
  ];
}
