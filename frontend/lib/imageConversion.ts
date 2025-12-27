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
    try {
      const jpg = await convertHeicWithHeic2Any(file);
      const optimized = await optimizeImageFile(jpg, {
        preferredMimeType: "image/jpeg",
        maxSizeMB: 9.5,
        maxDimension: 2200,
        absoluteMinDimension: 900,
      });
      return optimized.file;
    } catch (e) {
      // Fallback to canvas-based pipeline (works on Safari where HEIC decoding is supported)
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
    }
  }

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
}


