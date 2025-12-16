/**
 * Centralized environment variable configuration with validation
 * All environment variables should be accessed through this module
 * Uses lazy access to avoid build-time errors when env vars aren't available
 */

// Check if we're in build mode (Next.js static analysis phase)
const isBuildTime = typeof window === 'undefined' && 
  (process.env.NEXT_PHASE === 'phase-production-build' || 
   process.env.NEXT_RUNTIME === undefined);

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    // During build time, return empty string to allow build to proceed
    // Runtime will fail if actually used, which is the desired behavior
    if (isBuildTime) {
      return '';
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnv(key: string, defaultValue?: string): string {
  return process.env[key] || defaultValue || "";
}

// Helper to create lazy config getters that only access env vars when accessed
function createLazyConfig<T extends Record<string, unknown>>(factory: () => T): T {
  let cached: T | null = null;
  const getValue = () => {
    if (!cached) {
      cached = factory();
    }
    return cached;
  };
  
  // Create a proxy that lazily evaluates the factory
  return new Proxy({} as T, {
    get(_target, prop: string | symbol) {
      const value = getValue();
      return value[prop as keyof T];
    },
    ownKeys() {
      return Reflect.ownKeys(getValue());
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(getValue(), prop);
    },
    has(_target, prop) {
      return prop in getValue();
    }
  }) as T;
}

// Clerk Configuration - lazy access (only accessed when actually used)
export const clerkConfig = createLazyConfig(() => ({
  secretKey: requireEnv("CLERK_SECRET_KEY"),
  publishableKey: requireEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
}));

// Stripe Configuration
// Separate server-only and client-safe configs to avoid exposing secrets
export const stripeConfig = createLazyConfig(() => {
  // Server-only: includes secret key and webhook secret
  return {
    secretKey: requireEnv("STRIPE_SECRET_KEY"),
    webhookSecret: requireEnv("STRIPE_WEBHOOK_SECRET"),
    starterPriceId: getEnv("STRIPE_STARTER_PRICE_ID", ""),
    starterXmasPriceId: getEnv("STRIPE_STARTER_XMAS_PRICE_ID", ""),
    valuePriceId: getEnv("STRIPE_VALUE_PRICE_ID", ""),
    proPriceId: getEnv("STRIPE_PRO_PRICE_ID", ""),
    creatorPriceId: getEnv("STRIPE_CREATOR_PRICE_ID", ""),
    powerPriceId: getEnv("STRIPE_POWER_PRICE_ID", ""),
  };
});

// Client-safe config: exposes only public price IDs (no secrets)
export const stripePublicConfig = createLazyConfig(() => ({
  starterPriceId: getEnv("NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID") || getEnv("STRIPE_STARTER_PRICE_ID", ""),
  starterXmasPriceId: getEnv("NEXT_PUBLIC_STRIPE_STARTER_XMAS_PRICE_ID") || getEnv("STRIPE_STARTER_XMAS_PRICE_ID", ""),
  valuePriceId: getEnv("NEXT_PUBLIC_STRIPE_VALUE_PRICE_ID") || getEnv("STRIPE_VALUE_PRICE_ID", ""),
  proPriceId: getEnv("NEXT_PUBLIC_STRIPE_PRO_PRICE_ID") || getEnv("STRIPE_PRO_PRICE_ID", ""),
  creatorPriceId: getEnv("NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID") || getEnv("STRIPE_CREATOR_PRICE_ID", ""),
  powerPriceId: getEnv("NEXT_PUBLIC_STRIPE_POWER_PRICE_ID") || getEnv("STRIPE_POWER_PRICE_ID", ""),
}));

// Database Configuration - lazy access
export const dbConfig = createLazyConfig(() => ({
  url: requireEnv("DATABASE_URL"),
}));

// R2 Configuration - lazy access
export const r2Config = createLazyConfig(() => {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  return {
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    bucketName: requireEnv("R2_BUCKET_NAME"),
    accountId,
    publicBaseUrl: requireEnv("R2_PUBLIC_BASE_URL"),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
});

// OpenAI Configuration - lazy access
export const openaiConfig = createLazyConfig(() => ({
  apiKey: requireEnv("OPENAI_API_KEY"),
}));

// Gemini Configuration - lazy access
export const geminiConfig = createLazyConfig(() => ({
  apiKey: requireEnv("GEMINI_API_KEY"),
}));

// App Configuration (optional with defaults)
export const appConfig = {
  appUrl: getEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  // Free trial is a single free try-on, not a credit grant
  freeCredits: parseInt(getEnv("TRYON_FREE_CREDITS", "0"), 10),
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

