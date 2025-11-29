import React from 'react';
import { Sparkles } from 'lucide-react';

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
        <img 
          src={imageUrl} 
          alt="Virtual Try-On Result" 
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400 px-4">
          <p className="text-xs sm:text-sm text-center">Your virtual reflection appears here</p>
        </div>
      )}
    </div>
  );
};

