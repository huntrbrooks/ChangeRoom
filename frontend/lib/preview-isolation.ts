// Previews may only receive traffic after their operator has identified isolated services.
type Env = Record<string, string | undefined>;

function isolatedDatabase(env: Env): boolean {
  const expectedName = env.CHANGEROOM_STAGING_DB_NAME;
  const hosts = new Set((env.CHANGEROOM_STAGING_DB_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean));
  // db.ts can prefer a pooled URL over the first URL. Check all of its candidates.
  const configured = [env.POSTGRES_URL, env.POSTGRES_PRISMA_URL, env.DATABASE_URL,
    env.POSTGRES_URL_NON_POOLING].filter((value): value is string => !!value && value !== 'undefined');
  if (!expectedName || !hosts.size || !configured.length) return false;
  return configured.every(value => {
    try {
      const url = new URL(value);
      return ['postgres:', 'postgresql:'].includes(url.protocol) && hosts.has(url.hostname.toLowerCase()) &&
        decodeURIComponent(url.pathname.slice(1)) === expectedName;
    } catch { return false; }
  });
}

export function unsafePreview(env: Env): boolean {
  if (env.VERCEL_ENV !== 'preview') return false;
  let api: URL;
  try { api = new URL(env.NEXT_PUBLIC_API_URL || ''); } catch { return true; }
  return env.CHANGEROOM_ISOLATED_PREVIEW !== 'true' || !isolatedDatabase(env) ||
    !env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ||
    !env.CLERK_SECRET_KEY?.startsWith('sk_test_') ||
    !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_') ||
    api.protocol !== 'https:' || api.hostname === 'changeroom.onrender.com' ||
    api.hostname !== env.CHANGEROOM_STAGING_API_HOST;
}
