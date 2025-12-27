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

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image for optimization.'));
    img.src = src;
  });
};

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

  const dataUrl = await readFileAsDataURL(file);
  const image = await loadImage(dataUrl);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas not supported in this browser.');
  }

  const drawScaledImage = (width: number, height: number) => {
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  };

  const originalLongestSide = Math.max(image.width, image.height);
  const scale =
    originalLongestSide > maxDimension
      ? maxDimension / originalLongestSide
      : 1;

  let workingWidth = image.width * scale;
  let workingHeight = image.height * scale;
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
    throw new Error(
      'We could not shrink this photo below the 10MB limit. Please choose a smaller image.'
    );
  }

  const optimizedFile = new File([blob], file.name, {
    type: targetMimeType,
    lastModified: Date.now(),
  });

  return {
    file: optimizedFile,
    didOptimize: true,
    originalBytes: file.size,
    finalBytes: optimizedFile.size,
    mimeTypeChanged: optimizedFile.type !== file.type,
  };
};


