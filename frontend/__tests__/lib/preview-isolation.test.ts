import { unsafePreview } from '@/lib/preview-isolation';
const staging = { VERCEL_ENV: 'preview', CHANGEROOM_ISOLATED_PREVIEW: 'true',
  CHANGEROOM_STAGING_DB_NAME: 'rehearsal', CHANGEROOM_STAGING_DB_HOSTS: 'staging.invalid,staging-pooler.invalid',
  NEXT_PUBLIC_APP_URL:'https://stage.example.invalid', CHANGEROOM_STAGING_APP_HOST:'stage.example.invalid',
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

test('the release opens pack checkout only in the hosted live environment with the canonical return origin', () => {
  const live = {VERCEL:'1',VERCEL_ENV:'production',NEXT_PUBLIC_APP_URL:'https://igetdressed.online',STRIPE_SECRET_KEY:'sk_live_fixture'};
  expect(canCreateCheckout(live)).toBe(true);
  for (const mismatch of [{VERCEL:'0'}, {VERCEL_ENV:'preview'}, {NEXT_PUBLIC_APP_URL:'https://stage.example.invalid'},
    {STRIPE_SECRET_KEY:'sk_test_fixture'}, {CHANGEROOM_TEST_CHECKOUT:'true'}, {CHANGEROOM_ISOLATED_PREVIEW:'true'}])
    expect(canCreateCheckout({...live,...mismatch})).toBe(false);
});

test.each([
  ['https://igetdressed.online', 'igetdressed.online'],
  ['https://www.getdressed.online', 'www.getdressed.online'],
  ['https://changeroom.vercel.app', 'changeroom.vercel.app'],
  ['https://stage.example.invalid.', 'stage.example.invalid.'],
  ['http://stage.example.invalid', 'stage.example.invalid'],
  ['https://stage.example.invalid/', 'stage.example.invalid'],
  ['https://stage.example.invalid/redirect', 'stage.example.invalid'],
  ['https://stage.example.invalid?redirect=other', 'stage.example.invalid'],
  ['https://stage.example.invalid:8443', 'stage.example.invalid'],
  ['https://user@stage.example.invalid', 'stage.example.invalid'],
  ['https://other.example.invalid', 'stage.example.invalid'],
  ['https://stage.example.invalid', undefined],
  [undefined, 'stage.example.invalid'],
])('denies preview when Stripe return URL %s is not a pinned staging origin', (url,host) => {
  const env = {...staging, NEXT_PUBLIC_APP_URL:url, CHANGEROOM_STAGING_APP_HOST:host, CHANGEROOM_TEST_CHECKOUT:'true'};
  expect(unsafePreview(env)).toBe(true);
  expect(canCreateCheckout(env)).toBe(false);
});
