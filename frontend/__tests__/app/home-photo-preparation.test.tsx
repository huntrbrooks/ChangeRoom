import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Home from '@/app/page';
import { PHOTO_PREPARATION_ERROR, prepareTryOnImageFiles } from '@/lib/imageConversion';
import { httpClient } from '@/lib/httpClient';

const mockRouter = { push: jest.fn(), prefetch: jest.fn() };
const mockUser = { id: 'photo-user', primaryEmailAddress: { emailAddress: 'test@example.invalid', verification: { status: 'verified' } } };
const mockGetToken = jest.fn().mockResolvedValue('test');
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: mockUser, isLoaded: true }),
  useAuth: () => ({ getToken: mockGetToken, isSignedIn: true, isLoaded: true }),
}));
jest.mock('@/lib/clerk-public-config', () => ({ hasUsableClerkPublishableKey: () => true }));
jest.mock('@/lib/backendHealth', () => ({ probeBackendHealth: jest.fn().mockResolvedValue({ ok: true }) }));
jest.mock('@/lib/httpClient', () => ({ httpClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@/lib/analytics', () => ({ ANALYTICS_EVENTS: {}, captureEvent: jest.fn() }));
jest.mock('@/lib/userEvents', () => ({ trackTrialConsumed: jest.fn(), trackOutfitGenerated: jest.fn() }));
jest.mock('@/lib/clientDiagnostics', () => ({ recordClientDiagnostic: jest.fn() }));
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/imageConversion', () => ({
  ...jest.requireActual('@/lib/imageConversion'), prepareTryOnImageFiles: jest.fn(),
}));
jest.mock('@/app/components/UploadZone', () => ({ UploadZone: () => null }));
jest.mock('@/app/components/BulkUploadZone', () => ({ BulkUploadZone: () => null }));
jest.mock('@/app/components/TryOnFromUrl', () => ({ TryOnFromUrl: () => null }));
jest.mock('@/app/components/VirtualMirror', () => ({ VirtualMirror: () => null }));
jest.mock('@/app/components/SocialShareButtons', () => ({ SocialShareButtons: () => null }));
jest.mock('@/app/components/ProductCard', () => ({ ProductCard: () => null }));
jest.mock('@/app/components/PaywallModal', () => ({ PaywallModal: () => null }));
jest.mock('@/app/components/ShopSaveModal', () => ({ ShopSaveModal: () => null }));

beforeAll(() => {
  // Jest does not compile Tailwind; reflect the real hidden legacy studio.
  const style = document.createElement('style');
  style.textContent = '.hidden { display: none; }';
  document.head.append(style);
});

beforeEach(() => {
  jest.clearAllMocks();
  (httpClient.get as jest.Mock).mockResolvedValue({ data: { looks: [], plan: 'free', creditsAvailable: 0, trialsRemaining: 1 } });
  URL.createObjectURL = jest.fn().mockReturnValue('blob:prepared-photo');
  URL.revokeObjectURL = jest.fn();
});

test.each([0, 1])('visible upload input %s waits for prepared files and cannot generate during preparation', async inputIndex => {
  let finish!: (files: File[]) => void;
  (prepareTryOnImageFiles as jest.Mock).mockImplementation((files, progress) => {
    progress(1, files.length);
    return new Promise(resolve => { finish = resolve; });
  });
  const { container } = render(<Home />);
  await screen.findByRole('heading', { name: 'Virtual Try-On Studio' });
  const original = new File(['raw'], 'large-phone.heic', { type: 'image/heic' });
  const prepared = new File(['prepared'], 'large-phone.jpg', { type: 'image/jpeg' });
  fireEvent.change(container.querySelectorAll('input[type="file"]')[inputIndex], { target: { files: [original] } });
  expect(await screen.findByText('Preparing photo 1 of 1 on this device…')).toBeVisible();
  const generate = screen.getByRole('button', { name: /Preparing photos/ });
  expect(generate).toBeDisabled();
  fireEvent.click(generate);
  expect(httpClient.post).not.toHaveBeenCalled();
  expect((URL.createObjectURL as jest.Mock).mock.calls.some(([file]) => file === original)).toBe(false);
  await act(async () => { finish([prepared]); });
  await waitFor(() => expect((URL.createObjectURL as jest.Mock).mock.calls.some(([file]) => file === prepared)).toBe(true));
  expect((URL.createObjectURL as jest.Mock).mock.calls.some(([file]) => file === original)).toBe(false);
  expect(screen.queryByText('Preparing photo 1 of 1 on this device…')).not.toBeInTheDocument();
  expect(httpClient.post).not.toHaveBeenCalled();
});

test.each([0, 1])('visible upload input %s reports preparation failure without accepting the original', async inputIndex => {
  (prepareTryOnImageFiles as jest.Mock).mockRejectedValue(new Error('decoder failed'));
  const { container } = render(<Home />);
  await screen.findByRole('heading', { name: 'Virtual Try-On Studio' });
  const original = new File(['raw'], 'bad-phone.heic', { type: 'image/heic' });
  fireEvent.change(container.querySelectorAll('input[type="file"]')[inputIndex], { target: { files: [original] } });
  expect(await screen.findByRole('alert')).toHaveTextContent(PHOTO_PREPARATION_ERROR);
  expect((URL.createObjectURL as jest.Mock).mock.calls.some(([file]) => file === original)).toBe(false);
  expect(httpClient.post).not.toHaveBeenCalled();
});

test('garment removal is disabled during a pending preparation, then works after it completes', async () => {
  let finish!: (files: File[]) => void;
  const first = new File(['first'], 'first.jpg', { type: 'image/jpeg' });
  const second = new File(['second'], 'second.jpg', { type: 'image/jpeg' });
  (prepareTryOnImageFiles as jest.Mock)
    .mockResolvedValueOnce([first])
    .mockImplementationOnce((files, progress) => {
      progress(1, files.length);
      return new Promise(resolve => { finish = resolve; });
    });
  const { container } = render(<Home />);
  await screen.findByRole('heading', { name: 'Virtual Try-On Studio' });
  const wardrobeInput = container.querySelectorAll('input[type="file"]')[1];
  fireEvent.change(wardrobeInput, { target: { files: [first] } });
  const remove = await screen.findByRole('button', { name: /^Remove / });
  fireEvent.change(wardrobeInput, { target: { files: [second] } });
  expect(await screen.findByText('Preparing photo 1 of 1 on this device…')).toBeVisible();
  expect(remove).toBeDisabled();
  fireEvent.click(remove);
  expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1);
  await act(async () => { finish([second]); });
  expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(2);
  expect(remove).toBeEnabled();
  fireEvent.click(remove);
  expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1);
  expect(httpClient.post).not.toHaveBeenCalled();
});

test('sample replacement and change controls cannot race a pending photo preparation', async () => {
  let finish!: (files: File[]) => void;
  (prepareTryOnImageFiles as jest.Mock).mockImplementation((files, progress) => {
    progress(1, files.length);
    return new Promise(resolve => { finish = resolve; });
  });
  const { container } = render(<Home />);
  await screen.findByRole('heading', { name: 'Virtual Try-On Studio' });
  const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
  fireEvent.change(container.querySelectorAll('input[type="file"]')[0], { target: { files: [file] } });
  await screen.findByText('Preparing photo 1 of 1 on this device…');
  for (const button of screen.getAllByRole('button', { name: /^Choose / })) expect(button).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Change' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Upload clothing' })).toBeDisabled();
  await act(async () => { finish([file]); });
  expect(screen.getByRole('button', { name: 'Change' })).toBeEnabled();
});

test.each(['resolve', 'reject'])('unmount cancels preparation and ignores late progress or %s', async outcome => {
  let finish!: (files: File[]) => void;
  let fail!: (error: Error) => void;
  let progress!: (current: number, total: number) => void;
  let signal!: AbortSignal;
  (prepareTryOnImageFiles as jest.Mock).mockImplementation((files, update, abortSignal) => {
    progress = update;
    signal = abortSignal;
    progress(1, files.length);
    return new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  });
  const { container, unmount } = render(<Home />);
  await screen.findByRole('heading', { name: 'Virtual Try-On Studio' });
  const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
  fireEvent.change(container.querySelectorAll('input[type="file"]')[0], { target: { files: [file] } });
  await screen.findByText('Preparing photo 1 of 1 on this device…');
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    progress(2, 2);
    if (outcome === 'resolve') finish([file]);
    else fail(new Error('late decoder error'));
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(httpClient.post).not.toHaveBeenCalled();
});
