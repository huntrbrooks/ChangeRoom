import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Upload, X, Info, Loader2, AlertTriangle, Star, ArrowUpRight } from 'lucide-react';
import {
  optimizeImageFile,
  type OptimizeImageOptions,
} from '@/lib/imageOptimization';
import { isLikelyImageFile, needsConversionToOptimal } from '@/lib/imageConversion';
import { detectFacesBestEffort } from '@/lib/faceDetection';
/* eslint-disable react-hooks/exhaustive-deps */

interface UploadZoneProps {
  onFileSelect?: (file: File | null) => void;
  onFilesSelect?: (files: File[]) => void;
  onClear?: () => void;
  selectedFile?: File | null;
  selectedFiles?: File[];
  label: string;
  multiple?: boolean;
  maxFiles?: number;
  optimizeConfig?: (OptimizeImageOptions & { enabled?: boolean }) | null;
  /**
   * When false, uploads are blocked and the component will surface a message
   * instead of processing the file. Defaults to true.
   */
  isAuthenticated?: boolean;
  /** Called when a blocked upload is attempted (e.g., to prompt login). */
  onAuthRequired?: () => void;
  /** Message shown when uploads are blocked. */
  blockedMessage?: string;
  /** Show ghost guidance cards for expected shots */
  showGuidance?: boolean;
  /** Whether the first image should be highlighted as main reference */
  highlightMainReference?: boolean;
  /** Persist file order change upstream (optional) */
  onOrderChange?: (files: File[]) => void;
  /** Optional inline tip toggle */
  showInlineTip?: boolean;
}

const _formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes)) {
    return '';
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
};

export const UploadZone: React.FC<UploadZoneProps> = ({
  onFileSelect,
  onFilesSelect,
  onClear,
  selectedFile,
  selectedFiles = [],
  label,
  multiple = false,
  maxFiles = 5,
  optimizeConfig = null,
  isAuthenticated = true,
  onAuthRequired,
  blockedMessage = 'Please sign in to upload an image.',
  showGuidance = true,
  highlightMainReference = false,
  onOrderChange,
  showInlineTip = true,
}) => {
  const [showTips, setShowTips] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationMessage, setOptimizationMessage] = useState<string | null>(null);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  const [qualityWarnings, setQualityWarnings] = useState<string[]>([]);
  const [qualityByName, setQualityByName] = useState<Record<string, 'good' | 'fair' | 'poor'>>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isMainFaceCheckRunning, setIsMainFaceCheckRunning] = useState(false);

  const analyzeImageQuality = useCallback(async (file: File, opts?: { detectFace?: boolean }) => {
    try {
      const bmp = await createImageBitmap(file);
      const minDim = Math.min(bmp.width, bmp.height);
      const aspect = bmp.width / Math.max(1, bmp.height);

      // Scale down for faster analysis
      const targetWidth = 512;
      const scale = Math.min(1, targetWidth / bmp.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        bmp.close();
        return {
          minDim,
          aspect,
          brightness: null,
          sharpness: null,
          faceCount: null,
          faceAreaRatio: null,
        };
      }
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Compute average luminance and gradient-based sharpness
      let lumSum = 0;
      let gradSum = 0;
      let samples = 0;
      const stride = 4; // sample every 4 pixels for speed
      for (let y = 1; y < height - 1; y += stride) {
        for (let x = 1; x < width - 1; x += stride) {
          const idx = (y * width + x) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          lumSum += lum;

          // Simple gradient magnitude approximation
          const idxRight = (y * width + (x + 1)) * 4;
          const idxDown = ((y + 1) * width + x) * 4;
          const lumR = 0.299 * data[idxRight] + 0.587 * data[idxRight + 1] + 0.114 * data[idxRight + 2];
          const lumD = 0.299 * data[idxDown] + 0.587 * data[idxDown + 1] + 0.114 * data[idxDown + 2];
          const grad = Math.abs(lum - lumR) + Math.abs(lum - lumD);
          gradSum += grad;

          samples++;
        }
      }

      const avgLum = samples ? lumSum / samples : null;
      const avgGrad = samples ? gradSum / samples : null;

      // Best-effort face detection (advisory only). Lazy loads MediaPipe on browsers without FaceDetector.
      let faceCount: number | null = null;
      let faceAreaRatio: number | null = null;
      try {
        if (opts?.detectFace) {
          const r = await detectFacesBestEffort(bmp);
          faceCount = typeof r.faceCount === 'number' ? r.faceCount : null;
          faceAreaRatio = typeof r.faceAreaRatio === 'number' ? r.faceAreaRatio : null;
        }
      } catch {
        // ignore face detection failures
      } finally {
        bmp.close();
      }

      return { minDim, aspect, brightness: avgLum, sharpness: avgGrad, faceCount, faceAreaRatio };
    } catch {
      return {
        minDim: null,
        aspect: null,
        brightness: null,
        sharpness: null,
        faceCount: null,
        faceAreaRatio: null,
      };
    }
  }, []);
  
  // Combine single and multiple file inputs for easier handling
  const files = useMemo(() => {
    if (multiple) {
      return selectedFiles || [];
    }
    return selectedFile ? [selectedFile] : [];
  }, [multiple, selectedFile, selectedFiles]);

  const previewUrls = useMemo(() => {
    return files.map(file => URL.createObjectURL(file));
  }, [files]);

  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const optimizationEnabled = optimizeConfig?.enabled ?? false;

  const cleanupMessages = useCallback(() => {
    setOptimizationMessage(null);
    setOptimizationError(null);
  }, []);

  const handleBlockedUpload = useCallback(() => {
    cleanupMessages();
    setOptimizationError(blockedMessage);
    if (onAuthRequired) {
      onAuthRequired();
    }
  }, [blockedMessage, cleanupMessages, onAuthRequired]);

  const handleClear = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    cleanupMessages();
    if (onClear) {
      onClear();
    } else {
      if (multiple && onFilesSelect) {
        onFilesSelect([]);
      } else if (onFileSelect) {
        onFileSelect(null);
      }
    }
  }, [cleanupMessages, onClear, onFileSelect, onFilesSelect, multiple]);
  
  const handleRemoveFile = useCallback((indexToRemove: number) => {
     if (!multiple || !onFilesSelect) return;
     const newFiles = files.filter((_, idx) => idx !== indexToRemove);
     onFilesSelect(newFiles);
     setQualityWarnings([]);
     setQualityByName((prev) => {
       const next = { ...prev };
       const removed = files[indexToRemove]?.name;
       if (removed) {
         delete next[removed];
       }
       return next;
     });
  }, [files, multiple, onFilesSelect]);

  const processFiles = useCallback(async (newFiles: File[]) => {
    if (newFiles.length === 0) {
      if (!multiple) handleClear();
      return;
    }

    const requiresConversion = newFiles.some((f) => needsConversionToOptimal(f));
    if (requiresConversion) {
      const msg =
        "Convert to optimal file type?\n\n" +
        "Generation will most likley fail if conversion is not processed.";
      const yes = window.confirm(msg);
      if (!yes) {
        cleanupMessages();
        if (multiple && onFilesSelect) {
          const combined = [...files, ...newFiles].slice(0, maxFiles);
          onFilesSelect(combined);
        } else if (onFileSelect) {
          onFileSelect(newFiles[0]);
        }
        return;
      }
    }

    if (!optimizationEnabled || !optimizeConfig) {
      cleanupMessages();
      if (multiple && onFilesSelect) {
        const combined = [...files, ...newFiles].slice(0, maxFiles);
        onFilesSelect(combined);
      } else if (onFileSelect) {
        onFileSelect(newFiles[0]);
      }
      return;
    }

    const { enabled: _enabled, ...optimizationOptions } = optimizeConfig;

    try {
      setIsOptimizing(true);
      cleanupMessages();

      const optimizedResults = await Promise.all(
        newFiles.map(file => optimizeImageFile(file, optimizationOptions))
      );
      
      const optimizedFiles = optimizedResults.map(r => r.file);

      if (multiple && onFilesSelect) {
         const combined = [...files, ...optimizedFiles].slice(0, maxFiles);
         onFilesSelect(combined);
      } else if (onFileSelect) {
        onFileSelect(optimizedFiles[0]);
      }

      // Construct optimization message
      const optimizationCount = optimizedResults.filter(r => r.didOptimize || r.mimeTypeChanged).length;
      if (optimizationCount > 0) {
        setOptimizationMessage(
          `Optimized ${optimizationCount} image${optimizationCount !== 1 ? 's' : ''} to fit limits.`
        );
      }
      
      // Perform quality checks (resolution, framing, brightness, sharpness)
      const shouldCheckMainFace = Boolean(highlightMainReference && multiple && optimizedFiles.length > 0);
      setIsMainFaceCheckRunning(shouldCheckMainFace);
      let qualityResults: Array<{
        name: string;
        minDim: number | null;
        aspect: number | null;
        brightness: number | null;
        sharpness: number | null;
        faceCount: number | null;
        faceAreaRatio: number | null;
      }>;
      try {
        qualityResults = await Promise.all(
          optimizedFiles.map(async (f, idx) => {
            const q = await analyzeImageQuality(f, {
              // Only check face on the *main* reference photo to keep things fast.
              detectFace: Boolean(shouldCheckMainFace && idx === 0),
            });
            return { name: f.name, ...q };
          })
        );
      } finally {
        setIsMainFaceCheckRunning(false);
      }
      
      const warnings: string[] = [];
      const lowResNames = qualityResults.filter(f => f.minDim !== null && f.minDim < 900).map(f => f.name);
      const weirdAspect = qualityResults.filter(f => f.aspect !== null && (f.aspect < 0.5 || f.aspect > 2.0)).map(f => f.name);
      const dark = qualityResults.filter(f => f.brightness !== null && f.brightness < 50).map(f => f.name);
      const bright = qualityResults.filter(f => f.brightness !== null && f.brightness > 220).map(f => f.name);
      const blurry = qualityResults.filter(f => f.sharpness !== null && f.sharpness < 8).map(f => f.name);

      if (lowResNames.length > 0) {
        warnings.push(`Low resolution detected (${lowResNames.length}). Results may be blurry.`);
      }
      if (weirdAspect.length > 0) {
        warnings.push(`Unusual framing detected (${weirdAspect.length}). Try centered, full-body shots.`);
      }
      if (dark.length > 0) {
        warnings.push(`Low lighting detected (${dark.length}). Use brighter, daylight photos.`);
      }
      if (bright.length > 0) {
        warnings.push(`Overexposed photos detected (${bright.length}). Avoid harsh light.`);
      }
      if (blurry.length > 0) {
        warnings.push(`Possible blur in ${blurry.length} photo(s). Ensure focus and steady camera.`);
      }

      // Main reference guidance: best-effort face/shot checks for the *first* photo.
      if (highlightMainReference && multiple && qualityResults.length > 0) {
        const main = qualityResults[0];
        const faceCount = typeof main.faceCount === 'number' ? main.faceCount : null;
        const faceAreaRatio =
          typeof main.faceAreaRatio === 'number' ? main.faceAreaRatio : null;

        // If we can detect faces, require at least one for best identity fidelity.
        if (faceCount === 0) {
          warnings.push(
            'Main reference: no face detected. Use a clear photo with your face visible for better identity consistency.'
          );
        }

        // Heuristic: too close-up → face area is huge; likely not full-body.
        if (faceAreaRatio !== null && faceAreaRatio > 0.25) {
          warnings.push(
            'Main reference: this looks like a close-up. For best try-on, use a full-body shot (head-to-toe) with your face visible.'
          );
        }

        // Heuristic: landscape shots often crop body; not a hard rule, just guidance.
        if (typeof main.aspect === 'number' && main.aspect > 1.3) {
          warnings.push(
            'Main reference: landscape framing detected. For best results, use a vertical full-body photo (portrait) so your full outfit stays in frame.'
          );
        }
      }

      // Build per-file quality status
      const qualityStatus: Record<string, 'good' | 'fair' | 'poor'> = { ...qualityByName };
      qualityResults.forEach((f) => {
        const issues = [
          f.minDim !== null && f.minDim < 900,
          f.aspect !== null && (f.aspect < 0.5 || f.aspect > 2.0),
          f.brightness !== null && (f.brightness < 50 || f.brightness > 220),
          f.sharpness !== null && f.sharpness < 8,
        ].filter(Boolean).length;
        if (issues === 0) {
          qualityStatus[f.name] = 'good';
        } else if (issues === 1) {
          qualityStatus[f.name] = 'fair';
        } else {
          qualityStatus[f.name] = 'poor';
        }
      });

      setQualityWarnings(warnings);
      setQualityByName(prev => ({ ...prev, ...qualityStatus }));

    } catch (error) {
      console.error('Image optimization failed', error);
      setIsMainFaceCheckRunning(false);
      const message =
        error instanceof Error ? error.message : 'Could not optimize images.';
      setOptimizationError(message);
    } finally {
      setIsOptimizing(false);
    }
  }, [cleanupMessages, files, handleClear, maxFiles, multiple, onFileSelect, onFilesSelect, optimizationEnabled, optimizeConfig]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (isOptimizing) {
      return;
    }
    if (!isAuthenticated) {
      handleBlockedUpload();
      return;
    }
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(isLikelyImageFile);
    
    if (droppedFiles.length > 0) {
       if (!multiple) {
         void processFiles([droppedFiles[0]]);
       } else {
         void processFiles(droppedFiles);
       }
    }
  }, [handleBlockedUpload, isAuthenticated, isOptimizing, multiple, processFiles]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (isOptimizing) {
      return;
    }
    if (!isAuthenticated) {
      handleBlockedUpload();
      return;
    }
    
    const selectedFilesList = Array.from(e.target.files || []);
    if (selectedFilesList.length > 0) {
       void processFiles(selectedFilesList);
    }
    // Reset input
    e.target.value = '';
  }, [handleBlockedUpload, isAuthenticated, isOptimizing, processFiles]);

  const handleSetMainReference = useCallback((index: number) => {
    if (!multiple || !onFilesSelect) return;
    const newFiles = [...files];
    const [chosen] = newFiles.splice(index, 1);
    const reordered = [chosen, ...newFiles];
    onFilesSelect(reordered);
    if (onOrderChange) {
      onOrderChange(reordered);
    }
  }, [files, multiple, onFilesSelect]);

  const handleReorder = useCallback((from: number, to: number) => {
    if (!multiple || !onFilesSelect || from === to) return;
    const newFiles = [...files];
    const [moved] = newFiles.splice(from, 1);
    newFiles.splice(to, 0, moved);
    onFilesSelect(newFiles);
    if (onOrderChange) {
      onOrderChange(newFiles);
    }
  }, [files, multiple, onFilesSelect]);

  const getQualityBadge = useCallback((fileName: string) => {
    const status = qualityByName[fileName];
    if (!status) return null;
    const labelMap = { good: 'Good', fair: 'Fair', poor: 'Poor' };
    const styleMap = {
      good: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      fair: 'bg-amber-100 text-amber-800 border-amber-200',
      poor: 'bg-red-100 text-red-800 border-red-200',
    };
    return (
      <span className={`absolute top-1 left-1 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide border rounded ${styleMap[status]}`}>
        {labelMap[status]}
      </span>
    );
  }, [qualityByName]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <label className="block text-xs sm:text-sm font-medium">
            {label} {multiple && files.length > 0 && <span className="text-black/60">({files.length}/{maxFiles})</span>}
          </label>
          {highlightMainReference && multiple && files.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-200 rounded">
              <Star size={12} /> Main reference = first photo
            </span>
          )}
          {showInlineTip && multiple && (
            <span className="text-[10px] sm:text-xs text-black/60">
              Drag to reorder; first photo is the Main Reference.
            </span>
          )}
        </div>
        {files.length === 0 && (
          <button
            type="button"
            onClick={() => setShowTips(!showTips)}
            className="text-xs text-black hover:text-black/70 uppercase tracking-wider flex items-center gap-1 py-1 px-1 touch-manipulation min-h-[32px]"
            aria-label="Show photo tips"
          >
            <Info size={14} />
            Tips for best results
          </button>
        )}
      </div>
      {optimizationEnabled && files.length === 0 && (
        <p className="text-[11px] text-black/70 mb-2">
          Large mobile photos are automatically resized to stay under the 10MB limit.
        </p>
      )}
      {(showTips || showGuidance) && files.length === 0 && (
        <div className="mb-3 p-3 bg-black/5 rounded-none text-xs text-black border border-black/20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="font-semibold text-black text-sm mb-1">Best results</p>
              <ul className="list-disc list-inside space-y-1">
                {multiple ? (
                   <>
                    <li>Upload 3-5 photos: front, 45°, side/profile.</li>
                    <li>Full-body, face visible, no heavy shadows.</li>
                    <li>Good lighting (natural/daylight), avoid backlight.</li>
                    <li>Plain background preferred, avoid filters.</li>
                   </>
                ) : (
                   <>
                    <li>Full-body photo, face visible.</li>
                    <li>Good lighting, minimal shadows.</li>
                    <li>Plain background; avoid filters.</li>
                   </>
                )}
              </ul>
            </div>
            {showGuidance && (
              <div className="space-y-2">
                <p className="font-semibold text-black text-sm">What to upload here</p>
                <div className="rounded border border-black/10 bg-white p-2 flex items-center justify-center">
                  <img
                    src="/example poses.jpeg"
                    alt="Guidance showing acceptable angles and photo quality examples"
                    className="w-full h-auto rounded"
                    loading="lazy"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Grid for multiple files or single preview */}
      {files.length > 0 && previewUrls.length > 0 ? (
        <div className="space-y-3">
          {/* Main image centered */}
          <div className="flex justify-center">
            <div
              className="relative group w-full max-w-2xl"
              draggable={multiple}
              onDragStart={() => setDragIndex(0)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== 0) {
                  e.currentTarget.classList.add('ring-2', 'ring-amber-300', 'ring-offset-2');
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('ring-2', 'ring-amber-300', 'ring-offset-2');
                if (dragIndex !== null) {
                  handleReorder(dragIndex, 0);
                  setDragIndex(null);
                }
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('ring-2', 'ring-amber-300', 'ring-offset-2');
              }}
              onDragEnd={(e) => {
                e.currentTarget.classList.remove('ring-2', 'ring-amber-300', 'ring-offset-2');
                setDragIndex(null);
              }}
            >
              <div
                className={`w-full rounded border bg-black/5 overflow-hidden flex items-center justify-center ${highlightMainReference ? 'border-amber-400 ring-2 ring-amber-200' : 'border-black/10'}`}
                aria-label="Main reference preview"
              >
                <img
                  src={previewUrls[0]}
                  alt="Main reference"
                  className="block max-w-full max-h-[60vh] sm:max-h-[70vh] h-auto w-auto"
                />
              </div>
              {getQualityBadge(files[0].name)}
              <div className="absolute top-2 right-2 flex flex-col gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (multiple) {
                      handleRemoveFile(0);
                    } else {
                      handleClear(e);
                    }
                  }}
                  className="bg-red-500 hover:bg-red-400 text-white p-2 rounded-full min-w-[28px] min-h-[28px] flex items-center justify-center touch-manipulation transition-colors shadow-sm"
                  aria-label="Remove image"
                >
                  <X size={14} />
                </button>
              </div>
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide bg-white/90 text-amber-800 border border-amber-200 rounded-full shadow-sm">
                <Star size={12} /> Main Image
              </span>
            </div>
          </div>

          {/* Secondary images row */}
          {multiple && (
            <div className="flex flex-wrap items-start justify-center gap-2">
              {files.slice(1).map((file, idx) => {
                const trueIndex = idx + 1;
                return (
                  <div
                    key={`${file.name}-${trueIndex}`}
                    className="relative group w-[46%] sm:w-40"
                    draggable
                    onDragStart={() => setDragIndex(trueIndex)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragIndex !== null && dragIndex !== trueIndex) {
                        e.currentTarget.classList.add('ring-2', 'ring-amber-300', 'ring-offset-2');
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('ring-2', 'ring-amber-300', 'ring-offset-2');
                      if (dragIndex !== null) {
                        handleReorder(dragIndex, trueIndex);
                        setDragIndex(null);
                      }
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove('ring-2', 'ring-amber-300', 'ring-offset-2');
                    }}
                    onDragEnd={(e) => {
                      e.currentTarget.classList.remove('ring-2', 'ring-amber-300', 'ring-offset-2');
                      setDragIndex(null);
                    }}
                  >
                    <div className="w-full h-28 sm:h-32 rounded border border-black/10 bg-black/5 overflow-hidden flex items-center justify-center">
                      <img
                        src={previewUrls[trueIndex]}
                        alt={`Preview ${trueIndex + 1}`}
                        className="block max-w-full max-h-full h-auto w-auto"
                      />
                    </div>
                    {getQualityBadge(file.name)}
                    <div className="absolute top-1 right-1 flex flex-col gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(trueIndex);
                        }}
                        className="bg-red-500 hover:bg-red-400 text-white p-1 rounded-full min-w-[24px] min-h-[24px] flex items-center justify-center touch-manipulation transition-colors shadow-sm"
                        aria-label="Remove image"
                      >
                        <X size={14} />
                      </button>
                      {highlightMainReference && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetMainReference(trueIndex);
                          }}
                          className="bg-white/90 hover:bg-white text-black border border-black/10 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1 shadow-sm"
                          aria-label="Set as main reference"
                        >
                          <ArrowUpRight size={12} /> Set as Main
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Add button for multiple uploads if under limit */}
              {files.length < maxFiles && (
                <label
                  className={`
                    border-2 border-dashed border-black/20 hover:border-black/40 active:border-black rounded p-4 flex flex-col items-center justify-center cursor-pointer min-h-[112px] sm:min-h-[144px] w-[46%] sm:w-40 transition-all bg-black/5 hover:bg-black/10
                    ${isOptimizing || !isAuthenticated ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {isOptimizing ? (
                    <Loader2 className="h-6 w-6 animate-spin text-black/50" />
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-black/50 mb-2" />
                      <span className="text-xs font-semibold text-black/50 uppercase tracking-wide">Add</span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,.heic,.heif,.avif,.tif,.tiff,.bmp,.gif,.jpg,.jpeg,.png,.webp"
                    multiple
                    onChange={handleChange}
                    aria-label={label || 'Add more files'}
                    disabled={isOptimizing || !isAuthenticated}
                  />
                </label>
              )}
            </div>
          )}

          {!multiple && (
            <p className="text-xs text-black truncate px-1 uppercase tracking-wider text-center">
              {files[0].name}
            </p>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-none p-4 sm:p-6 text-center cursor-pointer transition-all touch-manipulation
            ${
              isOptimizing
                ? 'opacity-70 pointer-events-none border-black/10'
                : !isAuthenticated
                ? 'opacity-60 border-black/10 cursor-not-allowed'
                : 'border-black/20 hover:border-black/40 active:border-black'
            }
          `}
          aria-busy={isOptimizing}
          aria-disabled={!isAuthenticated}
        >
          {isOptimizing ? (
            <div className="flex flex-col items-center justify-center py-6 sm:py-10 gap-3">
              <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 text-black animate-spin" />
              <p className="text-xs sm:text-sm font-semibold text-black uppercase tracking-wider">
                Optimizing your photo...
              </p>
              <p className="text-[11px] sm:text-xs text-black/70">
                This usually takes just a few seconds.
              </p>
            </div>
          ) : (
            <label className="cursor-pointer block touch-manipulation">
              <Upload className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-black" />
              <span className="mt-2 block text-xs sm:text-sm font-semibold text-black uppercase tracking-wider px-2">
                {multiple ? "Drop images here or tap to upload" : "Drop image here or tap to upload"}
              </span>
              {multiple && (
                 <span className="block text-[10px] sm:text-xs text-black/60 mt-1">
                   Recommend 3-5 photos for best results
                 </span>
              )}
              <input
                type="file"
                className="hidden"
                accept="image/*,.heic,.heif,.avif,.tif,.tiff,.bmp,.gif,.jpg,.jpeg,.png,.webp"
                multiple={multiple}
                onChange={handleChange}
                aria-label={label || 'Upload files'}
              />
            </label>
          )}
        </div>
      )}

      {!isAuthenticated && (
        <p className="mt-2 text-xs sm:text-sm text-red-600">
          {blockedMessage}
        </p>
      )}
      {optimizationMessage && (
        <p className="mt-2 text-xs sm:text-sm text-black/80">{optimizationMessage}</p>
      )}
      {optimizationError && (
        <p className="mt-2 text-xs sm:text-sm text-red-600">{optimizationError}</p>
      )}
      {isMainFaceCheckRunning && (
        <p className="mt-2 text-xs sm:text-sm text-black/70 inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing main photo…
        </p>
      )}
      {qualityWarnings.length > 0 && (
        <div className="mt-2 p-2 rounded border border-amber-200 bg-amber-50 text-amber-800 text-xs flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" />
          <div className="space-y-1">
            {qualityWarnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

