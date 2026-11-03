// Vercel shares some variables across targets by default. Do not expose a
// candidate to customers or let a preview use the live Stripe account/backend.
export function unsafePreview(env: Record<string, string | undefined>): boolean {
  if (env.VERCEL_ENV !== 'preview') return false;
  const db = env.POSTGRES_URL || env.DATABASE_URL;
  let host: string;
  try { host = new URL(env.NEXT_PUBLIC_API_URL || '').hostname; } catch { return true; }
  return env.CHANGEROOM_ISOLATED_PREVIEW !== 'true' || !db ||
    !env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ||
    !env.CLERK_SECRET_KEY?.startsWith('sk_test_') ||
    !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_') ||
    host === 'changeroom.onrender.com' || host !== env.CHANGEROOM_STAGING_API_HOST;
}
