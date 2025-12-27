export interface OptimizeImageOptions {
  /**
   * Target maximum size in megabytes. Defaults to 9.5MB to stay under backend 10MB limit.
   */
  maxSizeMB?: number;
  /**
   * Longest side (width or height) after resizing. Defaults to 2200px.
   */
  maxDimension?: number;
  /**
   * Preferred output mime type. Defaults to original file type or image/jpeg when not provided.
   */
  preferredMimeType?: string;
  /**
   * Starting quality for canvas.toBlob compression (0-1). Defaults to 0.92.
   */
  initialQuality?: number;
  /**
   * Minimum quality we'll allow before falling back to more aggressive downscaling. Defaults to 0.55.
   */
  minQuality?: number;
  /**
   * Amount to decrement the quality by each iteration when above the target size. Defaults to 0.07 (~7%).
   */
  qualityStep?: number;
  /**
   * Factor used to further shrink dimensions if quality adjustments alone are not enough. Defaults to 0.85 (15% smaller).
   */
  dimensionStep?: number;
  /**
   * Hard minimum longest-side dimension (px) before we stop shrinking further.
   * Useful to avoid over-downscaling faces/details.
   * Defaults to 720.
   */
  absoluteMinDimension?: number;
}

export interface OptimizeImageResult {
  file: File;
  didOptimize: boolean;
  originalBytes: number;
  finalBytes: number;
  mimeTypeChanged: boolean;
}

const DEFAULTS: Required<Omit<OptimizeImageOptions, 'preferredMimeType'>> & {
  absoluteMinDimension: number;
} = {
  maxSizeMB: 9.5,
  maxDimension: 2200,
  initialQuality: 0.92,
  minQuality: 0.55,
  qualityStep: 0.07,
  dimensionStep: 0.85,
  absoluteMinDimension: 720,
};

const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
};

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any).name === "AbortError"
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  options: { retries: number; baseDelayMs: number; label: string }
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      // Abort should not retry.
      if (isAbortError(err)) {
        throw err;
      }
      if (attempt >= options.retries) {
        break;
      }
      const delay = options.baseDelayMs * Math.pow(2, attempt);
      // eslint-disable-next-line no-console
      console.warn(`[imageOptimization] ${options.label} failed (attempt ${attempt + 1}/${options.retries + 1})`, err);
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function loadHtmlImageFromUrl(
  url: string,
  options: { timeoutMs: number }
): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";

  // Some browsers resolve decode() only after src is set.
  img.src = url;

  // Prefer decode() when available (more reliable than onload for async pipelines)
  const decodePromise =
    typeof img.decode === "function"
      ? img.decode().then(() => img)
      : new Promise<HTMLImageElement>((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Could not decode image."));
        });

  const timeoutPromise = new Promise<HTMLImageElement>((_, reject) => {
    const t = setTimeout(() => {
      clearTimeout(t);
      reject(new Error("Timed out while decoding image."));
    }, options.timeoutMs);
  });

  return Promise.race([decodePromise, timeoutPromise]);
}

async function decodeToDrawable(
  file: File
): Promise<{ drawable: CanvasImageSource; width: number; height: number; cleanup?: () => void }> {
  // Try ImageBitmap first (best for large files, avoids massive data URLs).
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return {
        drawable: bmp,
        width: bmp.width,
        height: bmp.height,
        cleanup: () => {
          try {
            bmp.close();
          } catch {
            // ignore
          }
        },
      };
    } catch (err) {
      // Some formats (e.g. HEIC on Chrome) aren't supported by createImageBitmap
      // eslint-disable-next-line no-console
      console.info("[imageOptimization] createImageBitmap failed; falling back to HTMLImageElement decode.", err);
    }
  }

  // Fallback: objectURL + HTMLImageElement decode
  const url = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImageFromUrl(url, { timeoutMs: 12_000 });
    // HTMLImageElement is also a CanvasImageSource
    return {
      drawable: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to convert canvas to blob.'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
};

const bytesFromMB = (sizeMB: number) => sizeMB * 1024 * 1024;

/**
 * Optimizes an image file so it stays below the backend size limit without requiring users
 * to manually edit their photos. Works entirely in the browser, resizing and re-encoding
 * (default JPEG) until the target size is met.
 */
export const optimizeImageFile = async (
  file: File,
  options: OptimizeImageOptions = {}
): Promise<OptimizeImageResult> => {
  if (typeof window === 'undefined') {
    return {
      file,
      didOptimize: false,
      originalBytes: file.size,
      finalBytes: file.size,
      mimeTypeChanged: false,
    };
  }

  const {
    maxSizeMB = DEFAULTS.maxSizeMB,
    maxDimension = DEFAULTS.maxDimension,
    initialQuality = DEFAULTS.initialQuality,
    minQuality = DEFAULTS.minQuality,
    qualityStep = DEFAULTS.qualityStep,
    dimensionStep = DEFAULTS.dimensionStep,
    preferredMimeType,
    absoluteMinDimension = DEFAULTS.absoluteMinDimension,
  } = options;

  const maxBytes = bytesFromMB(maxSizeMB);
  const fallbackMime = 'image/jpeg';
  const sourceMime =
    file.type && file.type.startsWith('image/') ? file.type : fallbackMime;
  const forceJpeg =
    sourceMime === 'image/heic' || sourceMime === 'image/heif';
  const targetMimeType =
    preferredMimeType || (forceJpeg ? fallbackMime : sourceMime);
  const needsMimeConversion = targetMimeType !== sourceMime;

  const shouldProcess = file.size > maxBytes || needsMimeConversion;
  if (!shouldProcess) {
    return {
      file,
      didOptimize: false,
      originalBytes: file.size,
      finalBytes: file.size,
      mimeTypeChanged: false,
    };
  }

  // Decode the image explicitly before optimization.
  // This avoids flaky Image.onload behavior and prevents failures when Data URLs are too large.
  const decoded = await withRetries(
    async () => decodeToDrawable(file),
    { retries: 2, baseDelayMs: 250, label: "decode" }
  );
  const image = decoded.drawable;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (decoded.cleanup) decoded.cleanup();
    throw new Error('Canvas not supported in this browser.');
  }

  const drawScaledImage = (width: number, height: number) => {
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  };

  const srcW =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (image as any).width || decoded.width || 1;
  const srcH =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (image as any).height || decoded.height || 1;

  const originalLongestSide = Math.max(srcW, srcH);
  const scale =
    originalLongestSide > maxDimension
      ? maxDimension / originalLongestSide
      : 1;

  let workingWidth = srcW * scale;
  let workingHeight = srcH * scale;
  drawScaledImage(workingWidth, workingHeight);

  let currentQuality = initialQuality;
  let blob = await canvasToBlob(canvas, targetMimeType, currentQuality);

  const absoluteMinDimensionClamped = Math.min(
    Math.max(1, absoluteMinDimension),
    maxDimension
  );

  while (blob.size > maxBytes) {
    if (currentQuality > minQuality + 0.005) {
      currentQuality = Math.max(minQuality, currentQuality - qualityStep);
    } else {
      const longestSide = Math.max(workingWidth, workingHeight);
      if (longestSide <= absoluteMinDimensionClamped) {
        break;
      }
      workingWidth = Math.max(
        absoluteMinDimensionClamped,
        workingWidth * dimensionStep
      );
      workingHeight = Math.max(
        absoluteMinDimensionClamped,
        workingHeight * dimensionStep
      );
      drawScaledImage(workingWidth, workingHeight);
    }

    blob = await canvasToBlob(canvas, targetMimeType, currentQuality);
  }

  if (blob.size > maxBytes) {
    if (decoded.cleanup) decoded.cleanup();
    throw new Error(
      'We could not shrink this photo below the 10MB limit. Please choose a smaller image.'
    );
  }

  const optimizedFile = new File([blob], file.name, {
    type: targetMimeType,
    lastModified: Date.now(),
  });

  if (decoded.cleanup) decoded.cleanup();
  return {
    file: optimizedFile,
    didOptimize: true,
    originalBytes: file.size,
    finalBytes: optimizedFile.size,
    mimeTypeChanged: optimizedFile.type !== file.type,
  };
};


