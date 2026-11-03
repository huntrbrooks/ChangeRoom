import { unsafePreview } from '@/lib/preview-isolation';
const staging = { VERCEL_ENV: 'preview', CHANGEROOM_ISOLATED_PREVIEW: 'true',
  POSTGRES_URL: 'isolated', STRIPE_SECRET_KEY: 'sk_test_fixture', CLERK_SECRET_KEY: 'sk_test_fixture',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture', NEXT_PUBLIC_API_URL: 'https://tryon.example.invalid', CHANGEROOM_STAGING_API_HOST: 'tryon.example.invalid' };
test('only explicitly isolated previews pass; production is unaffected', () => {
  expect(unsafePreview(staging)).toBe(false);
  expect(unsafePreview({ ...staging, STRIPE_SECRET_KEY: 'sk_live_fixture' })).toBe(true);
  expect(unsafePreview({ ...staging, CHANGEROOM_ISOLATED_PREVIEW: undefined })).toBe(true);
  expect(unsafePreview({ ...staging, NEXT_PUBLIC_API_URL: 'https://changeroom.onrender.com' })).toBe(true);
  expect(unsafePreview({ VERCEL_ENV: 'production' })).toBe(false);
});
