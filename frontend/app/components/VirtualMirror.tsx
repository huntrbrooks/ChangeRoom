import React, { useEffect, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { TryOnProgressLoader } from './TryOnProgressLoader';

interface VirtualMirrorProps {
  imageUrl: string | null;
  isLoading: boolean;
  errorMessage?: string | null;
  onStageChange?: (stageId: number) => void;
  isPreview?: boolean;
  onDownloadClean?: () => void;
  onTryAnother?: () => void;
}

export const VirtualMirror: React.FC<VirtualMirrorProps> = ({
  imageUrl,
  isLoading,
  errorMessage,
  onStageChange,
  isPreview = false,
  onDownloadClean,
  onTryAnother,
}) => {
  const [showLoader, setShowLoader] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const loaderFallbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const LOADER_FADE_MS = 2400;

  const hasResult = Boolean(imageUrl);
  const hasError = Boolean(errorMessage);
  const status: 'pending' | 'success' | 'error' =
    isLoading ? 'pending' : hasResult ? 'success' : hasError ? 'error' : 'pending';

  useEffect(() => {
    if (isLoading) {
      setHasRun(true);
      setShowLoader(true);
    }
  }, [isLoading]);

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
    if (status !== 'pending') {
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
  }, [status]);

  const handleLoaderFinished = () => {
    setShowLoader(false);
  };

  const goToPricing = () => {
    window.location.href = '/pricing?promo=xmas';
  };

  const handleDownloadClean = onDownloadClean || goToPricing;
  const handleTryAnother = onTryAnother || goToPricing;

  return (
    <div className="w-full aspect-[3/4] bg-white rounded-none overflow-hidden relative border-2 border-black/20">
      {showLoader && (
        <TryOnProgressLoader
          isActive={showLoader}
          status={status}
          failureMessage={hasError ? errorMessage || undefined : undefined}
          onStageChange={onStageChange}
          onFinished={handleLoaderFinished}
        />
      )}

      {imageUrl ? (
        <>
          <img 
            key={imageUrl} 
            src={imageUrl} 
            alt="Virtual Try-On Result" 
            className="w-full h-full object-cover"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onLoad={() => {
              console.log('Try-on image loaded successfully');
            }}
            onError={(e) => {
              console.error('Error loading try-on image:', imageUrl);
              const img = e.target as HTMLImageElement;
              // Try to reload without timestamp if it was added
              if (imageUrl.includes('?t=')) {
                const urlWithoutTimestamp = imageUrl.split('?')[0];
                if (urlWithoutTimestamp !== imageUrl && img.src !== urlWithoutTimestamp) {
                  img.src = urlWithoutTimestamp;
                }
              } else {
                // For data URLs, try reloading after a short delay
                if (imageUrl.startsWith('data:')) {
                  setTimeout(() => {
                    if (img.src === imageUrl) {
                      img.src = imageUrl;
                    }
                  }, 100);
                }
              }
            }}
          />
          {isPreview && (
            <div className="absolute inset-0 bg-gradient-to-br from-black/40 to-black/10 pointer-events-none flex items-center justify-center">
              <div className="text-white text-lg sm:text-xl font-bold uppercase tracking-[0.3em] bg-black/40 px-4 py-2 rounded">
                Watermarked Preview
              </div>
            </div>
          )}
          <div className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleDownloadClean}
              className="bg-black hover:bg-gray-900 active:bg-gray-800 text-white px-3 sm:px-3 py-2.5 sm:py-2 rounded-none flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors min-h-[44px] min-w-[44px] touch-manipulation select-none"
              aria-label="Download clean result"
            >
              <Download size={16} className="sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Download clean</span>
            </button>
            <button
              onClick={handleTryAnother}
              className="bg-white text-black border border-black px-3 sm:px-3 py-2.5 sm:py-2 rounded-none flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors min-h-[44px] min-w-[44px] touch-manipulation select-none hover:bg-black hover:text-white"
              aria-label="Try another outfit"
            >
              <Share2 size={16} className="sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Try another outfit</span>
            </button>
          </div>
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-black/40 px-4">
          <p className="text-xs sm:text-sm text-center">Your virtual reflection appears here</p>
        </div>
      )}
    </div>
  );
};

