import { CANONICAL_ORIGIN } from "@/lib/domainRouting";

export function getAllowedRedirectOrigins(): string[] {
  const origins = [
    CANONICAL_ORIGIN,
    "https://www.igetdressed.online",
    "https://getdressed.online",
    "https://www.getdressed.online",
  ];

  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:3000", "http://127.0.0.1:3000");
  }

  return origins;
}
