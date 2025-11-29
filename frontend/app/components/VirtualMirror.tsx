import React from 'react';
import { Sparkles, Download, Share2 } from 'lucide-react';

interface VirtualMirrorProps {
  imageUrl: string | null;
  isLoading: boolean;
}

export const VirtualMirror: React.FC<VirtualMirrorProps> = ({ imageUrl, isLoading }) => {
  return (
    <div className="w-full aspect-[3/4] bg-gray-100 rounded-lg sm:rounded-xl overflow-hidden relative border-2 border-gray-200">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/5 backdrop-blur-sm z-10">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-blue-400 opacity-75"></div>
            <div className="relative bg-blue-500 rounded-full p-3 sm:p-4">
              <Sparkles className="text-white animate-spin w-6 h-6 sm:w-8 sm:h-8" />
            </div>
          </div>
          <p className="mt-3 sm:mt-4 text-sm sm:text-lg font-medium text-gray-700 animate-pulse px-4 text-center">
            Weaving your new look...
          </p>
        </div>
      )}
      
      {imageUrl ? (
        <>
          <img 
            src={imageUrl} 
            alt="Virtual Try-On Result" 
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-3 right-3 flex gap-2">
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
              className="bg-white/90 hover:bg-white px-3 py-2 rounded-lg shadow-md flex items-center gap-2 text-sm font-medium transition-colors min-h-[44px]"
              aria-label="Download try-on result"
            >
              <Download size={16} />
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
                  } catch (error: any) {
                    if (error.name !== 'AbortError') {
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
              className="bg-white/90 hover:bg-white px-3 py-2 rounded-lg shadow-md flex items-center gap-2 text-sm font-medium transition-colors min-h-[44px]"
              aria-label="Share try-on result"
            >
              <Share2 size={16} />
              <span className="hidden sm:inline">Share</span>
            </button>
          </div>
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400 px-4">
          <p className="text-xs sm:text-sm text-center">Your virtual reflection appears here</p>
        </div>
      )}
    </div>
  );
};

