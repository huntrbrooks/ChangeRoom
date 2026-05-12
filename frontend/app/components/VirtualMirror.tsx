import React, { useEffect, useRef, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { TryOnProgressLoader } from './TryOnProgressLoader';
import { logger } from '@/lib/logger';

interface VirtualMirrorProps {
  imageUrl: string | null;
  isLoading: boolean;
  errorMessage?: string | null;
  onStageChange?: (stageId: number) => void;
  isPreview?: boolean;
  onDownloadClean?: () => void;
  onTryAnother?: () => void;
  onImageLoaded?: () => void;
  onImageError?: (message: string) => void;
  placeholderImageUrl?: string;
  showResultActions?: boolean;
  className?: string;
}

export const VirtualMirror: React.FC<VirtualMirrorProps> = ({
  imageUrl,
  isLoading,
  errorMessage,
  onStageChange,
  isPreview = false,
  onDownloadClean,
  onTryAnother,
  onImageLoaded,
  onImageError,
  placeholderImageUrl,
  showResultActions = true,
  className = '',
}) => {
  const [showLoader, setShowLoader] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const imageRetryAttemptedRef = useRef(false);
  const loaderFallbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const LOADER_FADE_MS = 2400;

  const displayImageUrl = imageUrl || placeholderImageUrl || null;
  const hasResult = Boolean(imageUrl);
  const hasImageLoadError = Boolean(imageLoadError);
  const hasError = Boolean(errorMessage || imageLoadError);
  const status: 'pending' | 'success' | 'error' =
    hasError ? 'error' : imageReady ? 'success' : isLoading ? 'pending' : hasResult ? 'success' : 'pending';
  const canCompleteLoader = hasError ? true : imageReady;
  const resolvedErrorMessage = errorMessage || imageLoadError;

  useEffect(() => {
    if (isLoading) {
      setHasRun(true);
      setShowLoader(true);
      setImageReady(false);
      setImageLoadError(null);
      imageRetryAttemptedRef.current = false;
    }
  }, [isLoading]);

  useEffect(() => {
    // Reset readiness whenever a new image URL is provided
    if (imageUrl) {
      setImageReady(false);
      setImageLoadError(null);
      imageRetryAttemptedRef.current = false;
    }
  }, [imageUrl]);

  const failImageLoad = React.useCallback(
    (failedUrl: string | null) => {
      const message =
        "The try-on finished, but the generated image could not be loaded. Please try again.";
      logger.error('tryon_image_load_failed', { imageUrl: failedUrl });
      setImageReady(false);
      setImageLoadError(message);
      onImageError?.(message);
    },
    [onImageError]
  );

  // Failproof: mark ready even if the browser doesn't fire onLoad (cached/instant render)
  useEffect(() => {
    if (!imageUrl) return;

    let cancelled = false;

    const markIfComplete = () => {
      const el = imgElRef.current;
      if (!el) return;
      if (el.complete && el.naturalWidth > 0) {
        if (!cancelled) {
          setImageReady(true);
          onImageLoaded?.();
        }
      }
    };

    // 1) Check DOM img after mount
    const raf = requestAnimationFrame(markIfComplete);

    // 2) Preload via Image() as a backup (covers some edge cases where ref isn't set yet)
    try {
      const pre = new Image();
      pre.src = imageUrl;
      if (pre.complete) {
        markIfComplete();
      } else {
        pre.onload = () => {
          if (!cancelled) {
            setImageReady(true);
            onImageLoaded?.();
          }
        };
      }
    } catch {
      // ignore
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [imageUrl, onImageLoaded]);

  // Keep loader visible through resolution (success or error) to allow full fade-out
  useEffect(() => {
    if (!isLoading && hasRun && status !== 'pending') {
      setShowLoader(true);
    }
  }, [hasRun, isLoading, status]);

  useEffect(() => {
    if (!isLoading && !hasResult && !hasError) {
      setShowLoader(false);
    }
  }, [isLoading, hasResult, hasError]);

  // Failsafe: ensure loader disappears shortly after resolution even if onFinished is delayed
  useEffect(() => {
    if (loaderFallbackTimerRef.current) {
      clearTimeout(loaderFallbackTimerRef.current);
      loaderFallbackTimerRef.current = null;
    }
    // If the image is ready, we *always* allow the loader to finish, even if parent is still "loading".
    const canFinish = canCompleteLoader && (status !== 'pending' || imageReady);
    if (canFinish) {
      loaderFallbackTimerRef.current = setTimeout(() => {
        setShowLoader(false);
      }, LOADER_FADE_MS + 200);
    }
    return () => {
      if (loaderFallbackTimerRef.current) {
        clearTimeout(loaderFallbackTimerRef.current);
        loaderFallbackTimerRef.current = null;
      }
    };
  }, [status, canCompleteLoader, imageReady]);

  const handleLoaderFinished = () => {
    setShowLoader(false);
  };

  const goToPricing = () => {
    window.location.href = '/pricing?promo=xmas';
  };

  const handleDownloadClean = onDownloadClean || goToPricing;
  const handleTryAnother = onTryAnother || goToPricing;

  return (
    <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-white/15 bg-[#f6f7fb] ${className}`}>
      {showLoader && (
        <TryOnProgressLoader
          isActive={showLoader}
          status={status}
          canComplete={canCompleteLoader}
          failureMessage={hasError ? resolvedErrorMessage || undefined : undefined}
          onStageChange={onStageChange}
          onFinished={handleLoaderFinished}
        />
      )}

      {displayImageUrl && !hasImageLoadError ? (
        <>
          <img
            key={displayImageUrl}
            src={displayImageUrl}
            alt="Virtual Try-On Result"
            ref={imgElRef}
            className="w-full h-full object-cover"
            loading={imageUrl ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={imageUrl ? 'high' : 'auto'}
            onLoad={() => {
              if (imageUrl) {
                setImageReady(true);
                setImageLoadError(null);
                onImageLoaded?.();
                logger.info('tryon_image_loaded');
              }
            }}
            onError={(e) => {
              console.error('Error loading try-on image:', displayImageUrl);
              const img = e.target as HTMLImageElement;
              // Try to reload without timestamp if it was added
              if (imageUrl?.includes('?t=') && !imageRetryAttemptedRef.current) {
                const urlWithoutTimestamp = imageUrl.split('?')[0];
                if (urlWithoutTimestamp !== imageUrl && img.src !== urlWithoutTimestamp) {
                  imageRetryAttemptedRef.current = true;
                  img.src = urlWithoutTimestamp;
                  return;
                }
              }
              failImageLoad(displayImageUrl);
            }}
          />
          {isPreview && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {/* Subtle darkening helps keep the watermark legible on very bright images */}
              <div className="absolute inset-0 bg-black/10" aria-hidden="true" />
              <img
                src="/watermark.png"
                alt="Watermark"
                aria-hidden="true"
                className="relative w-[70%] max-w-[420px] opacity-35 select-none"
                draggable={false}
              />
            </div>
          )}
          {showResultActions && imageUrl && (
            <div className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleDownloadClean}
              className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-[#101114] px-3 py-2.5 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(16,17,20,0.24)] transition-colors hover:bg-[#20232a] active:bg-[#20232a] sm:px-3 sm:py-2 sm:text-sm touch-manipulation select-none"
              aria-label="Download clean result"
            >
              <Download size={16} className="sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Download clean</span>
            </button>
            <button
              onClick={handleTryAnother}
              className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2.5 text-xs font-semibold text-[#101114] shadow-[0_10px_24px_rgba(15,23,42,0.12)] transition-colors hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm touch-manipulation select-none"
              aria-label="Try another outfit"
            >
              <Share2 size={16} className="sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Try another outfit</span>
            </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,#ffffff_0%,#eef2f7_54%,#dbe3ee_100%)] px-4 text-slate-400">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
              <Share2 size={18} className="text-[#6d5dfc]" />
            </div>
            <p className={`text-xs sm:text-sm ${hasImageLoadError ? 'text-red-600' : ''}`}>
              {hasImageLoadError ? resolvedErrorMessage : 'Your virtual reflection appears here'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
