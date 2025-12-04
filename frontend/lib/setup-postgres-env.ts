/**
 * Ensure @vercel/postgres sees a connection string even if only DATABASE_URL is set.
 * Production environments sometimes only provide DATABASE_URL, which causes
 * the client to throw and repeatedly spam the console with 500 errors.
 */
const POSTGRES_KEYS = [
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

const existingValue = POSTGRES_KEYS.map((key) => process.env[key]).find(Boolean);
const fallbackUrl = existingValue || process.env.DATABASE_URL;

if (!existingValue && fallbackUrl) {
  POSTGRES_KEYS.forEach((key) => {
    if (!process.env[key]) {
      process.env[key] = fallbackUrl;
    }
  });
}


