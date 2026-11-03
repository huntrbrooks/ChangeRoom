import { unsafePreview } from '@/lib/preview-isolation';
const staging = { VERCEL_ENV: 'preview', CHANGEROOM_ISOLATED_PREVIEW: 'true',
  CHANGEROOM_STAGING_DB_NAME: 'rehearsal', CHANGEROOM_STAGING_DB_HOSTS: 'staging.invalid,staging-pooler.invalid',
  POSTGRES_URL: 'postgresql://staging.invalid/rehearsal', STRIPE_SECRET_KEY: 'sk_test_fixture', CLERK_SECRET_KEY: 'sk_test_fixture',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture', NEXT_PUBLIC_API_URL: 'https://tryon.example.invalid', CHANGEROOM_STAGING_API_HOST: 'tryon.example.invalid' };
test('only explicitly isolated previews pass; production is unaffected', () => {
  expect(unsafePreview(staging)).toBe(false);
  expect(unsafePreview({ ...staging, STRIPE_SECRET_KEY: 'sk_live_fixture' })).toBe(true);
  expect(unsafePreview({ ...staging, CHANGEROOM_ISOLATED_PREVIEW: undefined })).toBe(true);
  expect(unsafePreview({ ...staging, NEXT_PUBLIC_API_URL: 'https://changeroom.onrender.com' })).toBe(true);
  expect(unsafePreview({ ...staging, POSTGRES_PRISMA_URL: 'postgresql://live-pooler.invalid/rehearsal' })).toBe(true);
  expect(unsafePreview({ ...staging, DATABASE_URL: 'postgresql://staging.invalid/customers' })).toBe(true);
  expect(unsafePreview({ ...staging, POSTGRES_URL_NON_POOLING: 'postgresql://staging-pooler.invalid/rehearsal' })).toBe(false);
  expect(unsafePreview({ ...staging, CHANGEROOM_STAGING_DB_HOSTS: undefined })).toBe(true);
  expect(unsafePreview({ VERCEL_ENV: 'production' })).toBe(false);
});

import { canCreateCheckout } from '@/lib/purchase-availability';
test('test checkout is opt-in and cannot open production or live Stripe', () => {
  expect(canCreateCheckout(staging)).toBe(false);
  expect(canCreateCheckout({...staging, CHANGEROOM_TEST_CHECKOUT:'true'})).toBe(true);
  expect(canCreateCheckout({...staging, VERCEL_ENV:'production', CHANGEROOM_TEST_CHECKOUT:'true'})).toBe(false);
  expect(canCreateCheckout({...staging, STRIPE_SECRET_KEY:'sk_live_fixture', CHANGEROOM_TEST_CHECKOUT:'true'})).toBe(false);
});
