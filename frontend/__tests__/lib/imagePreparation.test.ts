import { waitFor } from '@testing-library/react';
import { optimizeImageFile } from '@/lib/imageOptimization';
import { PHOTO_PREPARATION_ERROR, convertToOptimalImageFile, prepareTryOnImageFiles } from '@/lib/imageConversion';

const mockHeicConvert = jest.fn();
jest.mock('heic2any', () => ({ __esModule: true, default: (...args: unknown[]) => mockHeicConvert(...args) }));

const originalBitmap = globalThis.createImageBitmap;
let decode: jest.Mock;
let close: jest.Mock;
let draw: jest.Mock;
let fill: jest.Mock;
let outputSizes: number[];
let encodingFails: boolean;

beforeEach(() => {
  close = jest.fn();
  decode = jest.fn().mockResolvedValue({ width: 8000, height: 6000, close });
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: decode });
  draw = jest.fn();
  fill = jest.fn();
  outputSizes = [100];
  encodingFails = false;
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    return { clearRect: jest.fn(), fillRect: fill, drawImage: draw, fillStyle: '' } as unknown as CanvasRenderingContext2D;
  });
  jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
    const size = outputSizes.length > 1 ? outputSizes.shift()! : outputSizes[0];
    callback(encodingFails ? null : new Blob([new Uint8Array(size)], { type }));
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockHeicConvert.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: originalBitmap });
});

test('a small compressed 48MP JPEG is resized and reencoded before upload', async () => {
  const original = new File(['small compressed fixture'], 'phone.jpg', { type: 'image/jpeg' });
  const result = await optimizeImageFile(original, { maxDimension: 2200, preferredMimeType: 'image/jpeg' });
  expect(decode).toHaveBeenCalledWith(original);
  expect(draw.mock.calls.at(-1)?.slice(3)).toEqual([2200, 1650]);
  expect(draw).toHaveBeenCalledWith(expect.anything(), 0, 0, 2200, 1650);
  expect(fill).toHaveBeenCalledWith(0, 0, 2200, 1650);
  expect(result.file).not.toBe(original);
  expect(result.file.type).toBe('image/jpeg');
  expect(result.didOptimize).toBe(true);
  expect(close).toHaveBeenCalledTimes(1);
});

test('additional byte-budget resizing preserves a tall garment aspect ratio', async () => {
  decode.mockResolvedValue({ width: 800, height: 8000, close });
  outputSizes = [200, 50];
  await optimizeImageFile(new File(['png'], 'garment.png', { type: 'image/png' }), {
    preferredMimeType: 'image/jpeg', maxSizeMB: 100 / (1024 * 1024),
    initialQuality: 0.55, minQuality: 0.55, absoluteMinDimension: 900,
  });
  expect(draw.mock.calls.at(-1)?.slice(3)).toEqual([187, 1870]);
  expect(close).toHaveBeenCalledTimes(1);
});

test('failed encoding releases the decoded bitmap and never returns the original', async () => {
  encodingFails = true;
  await expect(optimizeImageFile(new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' })))
    .rejects.toThrow('Failed to convert canvas');
  expect(close).toHaveBeenCalledTimes(1);
});

test('successful HEIC conversion still resizes its JPEG to the worker pixel bound', async () => {
  mockHeicConvert.mockResolvedValue(new Blob(['converted'], { type: 'image/jpeg' }));
  const result = await convertToOptimalImageFile(new File(['heic'], 'phone.heic', { type: 'image/heic' }));
  expect(mockHeicConvert).toHaveBeenCalledTimes(1);
  expect(draw.mock.calls.at(-1)?.slice(3)).toEqual([2200, 1650]);
  expect(result.name).toBe('phone.jpg');
  expect(result.type).toBe('image/jpeg');
});

test('HEIC preparation failure rejects both unresized converted and original files', async () => {
  mockHeicConvert.mockResolvedValue(new Blob(['converted'], { type: 'image/jpeg' }));
  encodingFails = true;
  await expect(convertToOptimalImageFile(new File(['heic'], 'phone.heic', { type: 'image/heic' })))
    .rejects.toThrow(PHOTO_PREPARATION_ERROR);
  expect(decode).toHaveBeenCalledTimes(2); // converted JPEG, then native HEIC fallback
  expect(close).toHaveBeenCalledTimes(2);
});

test('an unsupported HEIC can use the native browser decoder without returning raw HEIC', async () => {
  mockHeicConvert.mockRejectedValue(new Error('converter unsupported'));
  const result = await convertToOptimalImageFile(new File(['heic'], 'phone.heic', { type: 'image/heic' }));
  expect(result.type).toBe('image/jpeg');
  expect(result.name).toBe('phone.jpg');
  expect(draw.mock.calls.at(-1)?.slice(3)).toEqual([2200, 1650]);
});

test('photo batches decode sequentially and publish only prepared files', async () => {
  let release!: (value: unknown) => void;
  decode.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const files = [1, 2, 3].map(i => new File(['photo'], `photo-${i}.jpg`, { type: 'image/jpeg' }));
  const progress = jest.fn();
  const prepared = prepareTryOnImageFiles(files, progress);
  await waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
  expect(progress.mock.calls).toEqual([[1, 3]]);
  release({ width: 8000, height: 6000, close });
  const result = await prepared;
  expect(decode).toHaveBeenCalledTimes(3);
  expect(progress.mock.calls).toEqual([[1, 3], [2, 3], [3, 3]]);
  expect(result.every((file, i) => file !== files[i] && file.type === 'image/jpeg')).toBe(true);
});

test('a failed batch stops before later photos and does not resolve with originals', async () => {
  encodingFails = true;
  const files = [1, 2].map(i => new File(['photo'], `photo-${i}.jpg`, { type: 'image/jpeg' }));
  await expect(prepareTryOnImageFiles(files)).rejects.toThrow(PHOTO_PREPARATION_ERROR);
  expect(decode).toHaveBeenCalledTimes(1);
});

test('cancelling a pending batch releases its current bitmap and never decodes the next photo', async () => {
  let release!: (value: unknown) => void;
  decode.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const files = [1, 2].map(i => new File(['photo'], `photo-${i}.jpg`, { type: 'image/jpeg' }));
  const controller = new AbortController();
  const prepared = prepareTryOnImageFiles(files, undefined, controller.signal);
  const rejected = expect(prepared).rejects.toMatchObject({ name: 'AbortError' });
  await waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
  controller.abort();
  release({ width: 8000, height: 6000, close });
  await rejected;
  expect(decode).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});
