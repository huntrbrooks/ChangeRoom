/** @jest-environment node */
import { closeDeletedAccount } from '@/lib/account-closure';

const mockSql = jest.fn();
const mockCustomer = jest.fn();
const mockSessions = jest.fn();
const mockItems = jest.fn();
const mockExpire = jest.fn();
const mockSubscriptions = jest.fn();
const mockCancel = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => mockSql(...args) }));
jest.mock('stripe', () => jest.fn().mockImplementation(() => ({
  customers: { retrieve: mockCustomer },
  checkout: { sessions: { list: mockSessions, listLineItems: mockItems, expire: mockExpire } },
  subscriptions: { list: mockSubscriptions, cancel: mockCancel },
})));

const user = 'fixture_owner';
const envKeys = ['STRIPE_SECRET_KEY', 'STRIPE_STARTER_PRICE_ID', 'STRIPE_VALUE_PRICE_ID', 'STRIPE_PRO_PRICE_ID',
  'STRIPE_STARTER_XMAS_PRICE_ID', 'STRIPE_CREATOR_PRICE_ID', 'STRIPE_POWER_PRICE_ID'] as const;
const prior = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
let warning: jest.SpyInstance;
const states = () => mockSql.mock.calls.filter(([parts]) => parts[0].includes("THEN 'review' ELSE ") && parts.length === 3)
  .map(([, state]) => state);

beforeEach(() => {
  jest.clearAllMocks();
  warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  for (const key of envKeys) delete process.env[key];
  process.env.STRIPE_SECRET_KEY = 'sk_test_fixture';
  process.env.STRIPE_STARTER_PRICE_ID = 'price_pack';
  mockSql.mockImplementation(async (parts: TemplateStringsArray) => ({
    rows: parts.join('').includes('SELECT b.stripe_customer_id')
      ? [{ stripe_customer_id: 'cus_owned', stripe_subscription_id: null }] : [],
  }));
  mockCustomer.mockResolvedValue({ metadata: { clerkUserId: user } });
  mockSessions.mockReturnValue([{ id: 'cs_open', mode: 'payment', metadata: { clerkUserId: user } }]);
  mockItems.mockResolvedValue({ data: [{ price: { id: 'price_pack' } }], has_more: false });
  mockExpire.mockResolvedValue({});
  mockSubscriptions.mockReturnValue([]);
});
afterEach(() => {
  warning.mockRestore();
  for (const key of envKeys) {
    if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key];
  }
});

it('closes a packs-only account without requiring unused recurring price configuration', async () => {
  await closeDeletedAccount(user);
  expect(mockExpire).toHaveBeenCalledWith('cs_open');
  expect(mockSubscriptions).toHaveBeenCalledWith({ customer: 'cus_owned', status: 'all', limit: 100 });
  expect(states()).toEqual(['resolved']);
  expect(mockCancel).not.toHaveBeenCalled();
});

it('expires the proven pack but preserves review for an owned active subscription with an unmapped legacy price', async () => {
  mockSubscriptions.mockReturnValue([{ id: 'sub_legacy', status: 'active', metadata: {},
    items: { data: [{ price: { id: 'price_legacy' } }], has_more: false } }]);
  await closeDeletedAccount(user);
  expect(mockExpire).toHaveBeenCalledWith('cs_open');
  expect(states()).toEqual(['review']);
  expect(mockCancel).not.toHaveBeenCalled();
});

it('preserves review for an owned open recurring checkout when the legacy catalog is not configured', async () => {
  mockSessions.mockReturnValue([{ id: 'cs_recurring', mode: 'subscription', metadata: {} }]);
  mockItems.mockResolvedValue({ data: [{ price: { id: 'price_unknown' } }], has_more: false });
  await closeDeletedAccount(user);
  expect(states()).toEqual(['review']);
  expect(mockExpire).not.toHaveBeenCalled();
});

it('keeps cancelling a proven legacy subscription when the full recurring catalog is configured', async () => {
  process.env.STRIPE_CREATOR_PRICE_ID = 'price_creator';
  process.env.STRIPE_POWER_PRICE_ID = 'price_power';
  mockSubscriptions.mockReturnValue([{ id: 'sub_legacy', status: 'active', metadata: { clerkUserId: user },
    items: { data: [{ price: { id: 'price_creator' } }], has_more: false } }]);
  await closeDeletedAccount(user);
  expect(mockCancel).toHaveBeenCalledWith('sub_legacy', { invoice_now: false, prorate: false });
  expect(states()).toEqual(['resolved']);
});

it('does not block a packs-only closure on a subscription that already ended', async () => {
  mockSubscriptions.mockReturnValue([{ id: 'sub_ended', status: 'canceled', metadata: {},
    items: { data: [{ price: { id: 'price_legacy' } }], has_more: false } }]);
  await closeDeletedAccount(user);
  expect(states()).toEqual(['resolved']);
  expect(mockCancel).not.toHaveBeenCalled();
});

it('does not cancel or expire anything when customer ownership conflicts', async () => {
  mockCustomer.mockResolvedValue({ metadata: { clerkUserId: 'someone_else' } });
  await closeDeletedAccount(user);
  expect(states()).toEqual(['review']);
  expect(mockExpire).not.toHaveBeenCalled();
  expect(mockCancel).not.toHaveBeenCalled();
});

it('leaves a retriable pending closure after Stripe fails instead of losing the billing obligation', async () => {
  mockSubscriptions.mockImplementation(() => { throw new Error('temporary provider failure'); });
  await expect(closeDeletedAccount(user)).rejects.toThrow('account_closure_billing_retry_required');
  const updates = mockSql.mock.calls.filter(([parts]) => parts.join('').includes("ELSE 'pending' END"));
  expect(updates).toHaveLength(1);
  expect(states()).toEqual([]);
});
