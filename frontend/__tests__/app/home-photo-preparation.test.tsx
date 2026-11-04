import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Home from '@/app/page';
import { UploadZone } from '@/app/components/UploadZone';
import { BulkUploadZone } from '@/app/components/BulkUploadZone';
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
jest.mock('@/app/components/UploadZone', () => ({ UploadZone: jest.fn(() => null) }));
jest.mock('@/app/components/BulkUploadZone', () => ({ BulkUploadZone: jest.fn(() => null) }));
jest.mock('@/app/components/TryOnFromUrl', () => ({ TryOnFromUrl: () => null }));
jest.mock('@/app/components/VirtualMirror', () => ({ VirtualMirror: () => null }));
jest.mock('@/app/components/SocialShareButtons', () => ({ SocialShareButtons: () => null }));
jest.mock('@/app/components/ProductCard', () => ({ ProductCard: () => null }));
jest.mock('@/app/components/PaywallModal', () => ({ PaywallModal: () => null }));
jest.mock('@/app/components/ShopSaveModal', () => ({ ShopSaveModal: () => null }));

beforeAll(() => {
  // Jest does not compile Tailwind; respect controls hidden by the UI.
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

test('studio offers uploads instead of low-resolution sample inputs while retaining labelled examples', async () => {
  render(<Home />);
  await screen.findByRole('heading', { name: 'Virtual Try-On Studio' });
  expect(screen.getByRole('button', { name: /Upload full-body photo/ })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Upload clothing' })).toBeVisible();
  expect(screen.getByText('Use a clear full-body photo, at least 400 × 400 pixels.')).toBeVisible();
  expect(screen.queryByText('Choose a sample')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Choose (Studio front|Menswear fit|Denim casual|Classic Trench Coat|Black Blazer|Ribbed Tank Top|High Rise Straight Jeans|Leather Shoulder Bag|Slingback Heels)$/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Sample look' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Example shopping ideas' })).toBeVisible();
  expect(screen.getAllByRole('link', { name: 'Search retailers' }).length).toBeGreaterThan(0);
  expect(httpClient.post).not.toHaveBeenCalled();
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

test('upload and change controls cannot race a pending photo preparation', async () => {
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
  expect(screen.getByRole('button', { name: /Upload full-body photo/ })).toBeDisabled();
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

describe('optional shopping matches', () => {
  const originalFlag = process.env.NEXT_PUBLIC_ENABLE_SHOPPING_MATCHES;
  const shoppingLabel = 'Find similar items after my try-on by sending the garment photo to Google.';

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ENABLE_SHOPPING_MATCHES;
    (prepareTryOnImageFiles as jest.Mock).mockImplementation(async files => files);
    (httpClient.post as jest.Mock).mockImplementation(async (url: string) => {
      if (url === '/api/try-on/hold') return { data: { requestId: 'shopping-test-job' } };
      if (url.endsWith('/api/try-on')) return { data: { image_url: '/private-result.jpg', job_id: 'shopping-test-job' } };
      if (url.endsWith('/api/identify-products')) return { data: { search_query: 'blue shirt' } };
      if (url.endsWith('/api/shop')) return { data: { results: [{ title: 'Matched shirt', price: '$20', link: 'https://retailer.example/shirt', thumbnail: '/shirt.jpg', source: 'Test retailer' }] } };
      throw new Error(`Unexpected POST ${url}`);
    });
    window.scrollTo = jest.fn();
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.NEXT_PUBLIC_ENABLE_SHOPPING_MATCHES;
    else process.env.NEXT_PUBLIC_ENABLE_SHOPPING_MATCHES = originalFlag;
  });

  async function uploadPhotos(container: HTMLElement) {
    const inputs = container.querySelectorAll('input[type="file"]');
    const person = new File(['person'], 'person.jpg', { type: 'image/jpeg' });
    const garment = new File(['garment'], 'garment.jpg', { type: 'image/jpeg' });
    await act(async () => { fireEvent.change(inputs[0], { target: { files: [person] } }); });
    await act(async () => { fireEvent.change(inputs[1], { target: { files: [garment] } }); });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Try it on/ })).toBeEnabled());
    return { person, garment };
  }

  async function generate() {
    fireEvent.click(screen.getByRole('button', { name: /^Try it on/ }));
    await waitFor(() => expect(httpClient.post).toHaveBeenCalledWith('http://localhost:8000/api/try-on', expect.any(FormData), expect.any(Object)));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Try it on/ })).toBeEnabled());
  }

  test('retired upload components stay unmounted through visible uploads and generation', async () => {
    const { container } = render(<Home />);
    await screen.findByRole('heading', { name: 'Virtual Try-On Studio' });
    expect(UploadZone).not.toHaveBeenCalled();
    expect(BulkUploadZone).not.toHaveBeenCalled();
    await uploadPhotos(container);
    await generate();
    expect(screen.getByRole('button', { name: 'Upload clothing' })).toBeVisible();
    expect(UploadZone).not.toHaveBeenCalled();
    expect(BulkUploadZone).not.toHaveBeenCalled();
  });

  test.each([false, true])('successful try-on makes no shopping requests without opt-in (feature enabled: %s)', async enabled => {
    if (enabled) process.env.NEXT_PUBLIC_ENABLE_SHOPPING_MATCHES = 'true';
    const { container } = render(<Home />);
    await screen.findByRole('heading', { name: 'Virtual Try-On Studio' });
    if (enabled) expect(screen.getByRole('checkbox', { name: shoppingLabel })).not.toBeChecked();
    else expect(screen.queryByRole('checkbox', { name: shoppingLabel })).not.toBeInTheDocument();
    const uploaded = await uploadPhotos(container);
    await generate();
    const generation = (httpClient.post as jest.Mock).mock.calls.find(([url]) => url === 'http://localhost:8000/api/try-on');
    const submitted = generation![1] as FormData;
    expect(submitted.getAll('user_images')).toEqual([uploaded.person]);
    expect(submitted.getAll('clothing_images')).toEqual([uploaded.garment]);
    expect((httpClient.post as jest.Mock).mock.calls.map(([url]) => url)).toEqual(['/api/try-on/hold', 'http://localhost:8000/api/try-on']);
    expect(screen.getByRole('heading', { name: 'Example shopping ideas' })).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Search retailers' }).length).toBeGreaterThan(0);
  });

  test('enabled shopping and explicit opt-in dispatch identification and shopping after the try-on', async () => {
    process.env.NEXT_PUBLIC_ENABLE_SHOPPING_MATCHES = 'true';
    const { container } = render(<Home />);
    await screen.findByRole('heading', { name: 'Virtual Try-On Studio' });
    fireEvent.click(screen.getByRole('checkbox', { name: shoppingLabel }));
    await uploadPhotos(container);
    await generate();
    expect((httpClient.post as jest.Mock).mock.calls.map(([url]) => url)).toEqual([
      '/api/try-on/hold', 'http://localhost:8000/api/try-on',
      'http://localhost:8000/api/identify-products', 'http://localhost:8000/api/shop',
    ]);
    expect(screen.getByRole('heading', { name: 'Matched shirt' })).toBeVisible();
  });

  test('disabling shopping prevents dispatch even if the opt-in state was previously selected', async () => {
    process.env.NEXT_PUBLIC_ENABLE_SHOPPING_MATCHES = 'true';
    const { container, rerender } = render(<Home />);
    await screen.findByRole('heading', { name: 'Virtual Try-On Studio' });
    fireEvent.click(screen.getByRole('checkbox', { name: shoppingLabel }));
    process.env.NEXT_PUBLIC_ENABLE_SHOPPING_MATCHES = 'false';
    rerender(<Home />);
    expect(screen.queryByRole('checkbox', { name: shoppingLabel })).not.toBeInTheDocument();
    await uploadPhotos(container);
    await generate();
    expect((httpClient.post as jest.Mock).mock.calls.map(([url]) => url)).toEqual(['/api/try-on/hold', 'http://localhost:8000/api/try-on']);
  });
});
