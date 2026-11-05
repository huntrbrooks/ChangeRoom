import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PricingTable } from '@/app/components/PricingTable';
import { CheckoutStatus } from '@/app/components/CheckoutStatus';

jest.mock('@clerk/nextjs', () => ({useUser: () => ({isSignedIn: true})}));
jest.mock('@/lib/clerk-public-config', () => ({hasUsableClerkPublishableKey: () => true}));

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  window.history.replaceState({}, '', '/');
});

test.each(['AU', 'NZ'])('a signed-in buyer must explicitly choose residence and personal use (%s)', async country => {
  const post = jest.fn().mockResolvedValue({ok: false, json: async () => ({message: 'Checkout unavailable for test'})});
  global.fetch = post;
  render(<PricingTable />);
  const buy = screen.getByRole('button', {name: 'Buy Starter pack'});
  expect(buy).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Country of residence'), {target: {value: country}});
  expect(buy).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', {name: /my own personal use/}));
  expect(buy).toBeEnabled();
  fireEvent.click(buy);
  await screen.findByRole('alert');
  expect(post).toHaveBeenCalledTimes(1);
  expect(JSON.parse(post.mock.calls[0][1].body)).toEqual({sku: 'starter-pack', buyerCountry: country, personalUse: true});
});

test('an uncaptured, canceled authorization is not shown as a paid or pending purchase', async () => {
  window.history.replaceState({}, '', '/billing?session_id=cs_test_fixture');
  const onSettled = jest.fn();
  global.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => ({settled: false, status: 'not_completed'})});
  render(<CheckoutStatus onSettled={onSettled} />);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No money was collected and no credits were added'));
  expect(onSettled).not.toHaveBeenCalled();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test.each([['needs_review', 'Do not pay again'], ['refunded', 'full refund']])('%s explains the next step and links to support', async (status, text) => {
  window.history.replaceState({}, '', '/billing?session_id=cs_test_fixture');
  const onSettled = jest.fn();
  global.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => ({settled: false, status})});
  render(<CheckoutStatus onSettled={onSettled} />);
  expect(await screen.findByRole('link', {name: 'Get support'})).toHaveAttribute('href', '/support');
  expect(screen.getByRole('status')).toHaveTextContent(text);
  expect(onSettled).not.toHaveBeenCalled();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
