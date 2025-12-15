import React, { useEffect, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { TryOnProgressLoader } from './TryOnProgressLoader';

interface VirtualMirrorProps {
  imageUrl: string | null;
  isLoading: boolean;
  onStageChange?: (stageId: number) => void;
}

export const VirtualMirror: React.FC<VirtualMirrorProps> = ({ imageUrl, isLoading, onStageChange }) => {
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setShowLoader(true);
    }
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading && !imageUrl) {
      setShowLoader(false);
    }
  }, [isLoading, imageUrl]);

  const handleLoaderFinished = () => {
    setShowLoader(false);
  };

  return (
    <div className="w-full aspect-[3/4] bg-white rounded-none overflow-hidden relative border-2 border-black/20">
      {showLoader && (
        <TryOnProgressLoader
          isActive={isLoading}
          isComplete={!isLoading && Boolean(imageUrl)}
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
          <div className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 flex flex-col sm:flex-row gap-2">
            <button
              onClick={async () => {
                try {
                  const response = await fetch(imageUrl);
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'try-on-result.jpg';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  window.URL.revokeObjectURL(url);
                } catch (error) {
                  console.error('Failed to download image:', error);
                }
              }}
              onTouchStart={(e) => {
                if (e.touches.length > 1) {
                  e.preventDefault();
                }
              }}
              className="bg-black hover:bg-gray-900 active:bg-gray-800 text-white px-3 sm:px-3 py-2.5 sm:py-2 rounded-none flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors min-h-[44px] min-w-[44px] touch-manipulation select-none"
              aria-label="Download try-on result"
            >
              <Download size={16} className="sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={async () => {
                if (navigator.share && imageUrl) {
                  try {
                    const response = await fetch(imageUrl);
                    const blob = await response.blob();
                    const file = new File([blob], 'try-on-result.jpg', { type: 'image/jpeg' });
                    await navigator.share({
                      title: 'My Virtual Try-On',
                      text: 'Check out my virtual try-on result!',
                      files: [file]
                    });
                  } catch (error: unknown) {
                    const err = error as { name?: string };
                    if (err.name !== 'AbortError') {
                      // Fallback to copying link
                      await navigator.clipboard.writeText(imageUrl);
                      alert('Link copied to clipboard!');
                    }
                  }
                } else if (navigator.clipboard && imageUrl) {
                  await navigator.clipboard.writeText(imageUrl);
                  alert('Link copied to clipboard!');
                }
              }}
              onTouchStart={(e) => {
                if (e.touches.length > 1) {
                  e.preventDefault();
                }
              }}
              className="bg-black hover:bg-gray-900 active:bg-gray-800 text-white px-3 sm:px-3 py-2.5 sm:py-2 rounded-none flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors min-h-[44px] min-w-[44px] touch-manipulation select-none"
              aria-label="Share try-on result"
            >
              <Share2 size={16} className="sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Share</span>
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

