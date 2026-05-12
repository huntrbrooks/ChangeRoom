/**
 * Bridge DATABASE_URL into the @vercel/postgres env shape without changing the
 * connection type. A Neon direct URL must not be copied into POSTGRES_URL,
 * because @vercel/postgres treats POSTGRES_URL as a pooled connection string.
 */
const normalizeConnectionString = (value: string | undefined): string | undefined =>
  value && value !== "undefined" ? value : undefined;

const isLocalhostConnectionString = (connectionString: string): boolean => {
  try {
    return new URL(connectionString.replace(/^postgresql:\/\//, "https://")).hostname === "localhost";
  } catch {
    return false;
  }
};

const isPooledConnectionString = (connectionString: string): boolean =>
  connectionString.includes("-pooler.");

const isPoolCompatibleConnectionString = (connectionString: string): boolean =>
  isLocalhostConnectionString(connectionString) || isPooledConnectionString(connectionString);

const fallbackUrl = normalizeConnectionString(process.env.DATABASE_URL);

if (fallbackUrl) {
  if (isPoolCompatibleConnectionString(fallbackUrl)) {
    process.env.POSTGRES_URL ||= fallbackUrl;
    process.env.POSTGRES_PRISMA_URL ||= fallbackUrl;
  } else {
    process.env.POSTGRES_URL_NON_POOLING ||= fallbackUrl;
  }
}

