import { optimizeImageFile } from "./imageOptimization";

export type ConversionDecision = "convert" | "skip";

export const OPTIMAL_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const EXTENSION_HINTS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
  ".avif",
  ".tif",
  ".tiff",
  ".bmp",
  ".gif",
];

export function isLikelyImageFile(file: File): boolean {
  if (file.type?.startsWith("image/")) return true;
  const lower = (file.name || "").toLowerCase();
  return EXTENSION_HINTS.some((ext) => lower.endsWith(ext));
}

export function needsConversionToOptimal(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (!type) return true; // unknown types are risky for model backends
  return !OPTIMAL_IMAGE_MIME_TYPES.has(type);
}

function renameWithExtension(name: string, extension: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base}${extension}`;
}

function targetExtensionForMime(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

async function convertHeicWithHeic2Any(file: File): Promise<File> {
  // Dynamic import to keep bundle smaller; dependency still must exist at build time.
  const mod = await import("heic2any");
  const heic2any = (mod as unknown as { default: (args: unknown) => Promise<Blob | Blob[]> }).default;
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  return new File([blob], renameWithExtension(file.name, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

/**
 * Convert an image to an "optimal" format for the app (default: JPEG),
 * while also keeping it under size limits.
 * 
 * A preparation failure must never silently return an unbounded original file.
 */
export async function convertToOptimalImageFile(file: File): Promise<File> {
  const type = (file.type || "").toLowerCase();
  const nameLower = (file.name || "").toLowerCase();
  const isHeic =
    type === "image/heic" ||
    type === "image/heif" ||
    nameLower.endsWith(".heic") ||
    nameLower.endsWith(".heif");

  if (isHeic) {
    // Try heic2any first (best for cross-browser HEIC support)
    try {
      const jpg = await convertHeicWithHeic2Any(file);
      const optimized = await optimizeImageFile(jpg, {
        preferredMimeType: "image/jpeg",
        maxSizeMB: 9.5,
        maxDimension: 2200,
        absoluteMinDimension: 900,
      });
      return optimized.file;
    } catch (heicErr) {
      console.warn("[imageConversion] HEIC preparation failed; trying canvas-based fallback.", heicErr);
      // Fallback: try canvas-based pipeline (works on Safari where HEIC decoding is supported)
      try {
        const optimized = await optimizeImageFile(file, {
          preferredMimeType: "image/jpeg",
          maxSizeMB: 9.5,
          maxDimension: 2200,
          absoluteMinDimension: 900,
        });
        const ext = targetExtensionForMime(optimized.file.type);
        return new File([optimized.file], renameWithExtension(file.name, ext), {
          type: optimized.file.type,
          lastModified: Date.now(),
        });
      } catch (canvasErr) {
        console.error("[imageConversion] Could not prepare HEIC image.", canvasErr);
        throw new Error(PHOTO_PREPARATION_ERROR);
      }
    }
  }

  // Non-HEIC: just optimize
  try {
    const optimized = await optimizeImageFile(file, {
      preferredMimeType: "image/jpeg",
      maxSizeMB: 9.5,
      maxDimension: 2200,
      absoluteMinDimension: 900,
    });
    const ext = targetExtensionForMime(optimized.file.type);
    return new File([optimized.file], renameWithExtension(file.name, ext), {
      type: optimized.file.type,
      lastModified: Date.now(),
    });
  } catch (optErr) {
    console.error("[imageConversion] Could not prepare image.", optErr);
    throw new Error(PHOTO_PREPARATION_ERROR);
  }
}

export const PHOTO_PREPARATION_ERROR =
  'We could not prepare this photo. Export a JPG or PNG at 2200 pixels or less on its longest side, then choose it again. No credit or free trial was used.';

/** Process one photo at a time to avoid decoding a whole phone-photo batch at once. */
export async function prepareTryOnImageFiles(
  files: File[],
  onProgress?: (current: number, total: number) => void,
  signal?: AbortSignal,
): Promise<File[]> {
  const prepared: File[] = [];
  for (const [index, file] of files.entries()) {
    if (signal?.aborted) throw new DOMException('Photo preparation cancelled.', 'AbortError');
    onProgress?.(index + 1, files.length);
    const converted = await convertToOptimalImageFile(file);
    if (signal?.aborted) throw new DOMException('Photo preparation cancelled.', 'AbortError');
    prepared.push(converted);
  }
  return prepared;
}


