/**
 * Centralized environment variable configuration with validation
 * All environment variables should be accessed through this module
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnv(key: string, defaultValue?: string): string {
  return process.env[key] || defaultValue || "";
}

// Clerk Configuration
export const clerkConfig = {
  secretKey: requireEnv("CLERK_SECRET_KEY"),
  publishableKey: requireEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
} as const;

// Stripe Configuration
export const stripeConfig = {
  secretKey: requireEnv("STRIPE_SECRET_KEY"),
  webhookSecret: requireEnv("STRIPE_WEBHOOK_SECRET"),
  standardPriceId: requireEnv("STRIPE_STANDARD_PRICE_ID"),
  proPriceId: requireEnv("STRIPE_PRO_PRICE_ID"),
  creditPackSmallPriceId: requireEnv("STRIPE_CREDIT_PACK_SMALL_PRICE_ID"),
  creditPackLargePriceId: requireEnv("STRIPE_CREDIT_PACK_LARGE_PRICE_ID"),
} as const;

// Database Configuration
export const dbConfig = {
  url: requireEnv("DATABASE_URL"),
} as const;

// R2 Configuration
export const r2Config = {
  accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
  secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
  bucketName: requireEnv("R2_BUCKET_NAME"),
  accountId: requireEnv("R2_ACCOUNT_ID"),
  publicBaseUrl: requireEnv("R2_PUBLIC_BASE_URL"),
  endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
} as const;

// OpenAI Configuration
export const openaiConfig = {
  apiKey: requireEnv("OPENAI_API_KEY"),
} as const;

// Gemini Configuration
export const geminiConfig = {
  apiKey: requireEnv("GEMINI_API_KEY"),
} as const;

// App Configuration (optional with defaults)
export const appConfig = {
  appUrl: getEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  freeCredits: parseInt(getEnv("TRYON_FREE_CREDITS", "10"), 10),
  standardMonthlyCredits: parseInt(getEnv("TRYON_STANDARD_MONTHLY_CREDITS", "50"), 10),
  proMonthlyCredits: parseInt(getEnv("TRYON_PRO_MONTHLY_CREDITS", "250"), 10),
  creditPackSmallAmount: 20, // Can be made configurable if needed
  creditPackLargeAmount: 100, // Can be made configurable if needed
} as const;

// Validate numeric configs
if (isNaN(appConfig.freeCredits) || appConfig.freeCredits < 0) {
  throw new Error("TRYON_FREE_CREDITS must be a non-negative integer");
}
if (isNaN(appConfig.standardMonthlyCredits) || appConfig.standardMonthlyCredits < 0) {
  throw new Error("TRYON_STANDARD_MONTHLY_CREDITS must be a non-negative integer");
}
if (isNaN(appConfig.proMonthlyCredits) || appConfig.proMonthlyCredits < 0) {
  throw new Error("TRYON_PRO_MONTHLY_CREDITS must be a non-negative integer");
}

