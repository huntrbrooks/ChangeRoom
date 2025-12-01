import React, { useCallback, useState } from 'react';
import { Upload, X, Info } from 'lucide-react';

interface UploadZoneProps {
  onFileSelect: (file: File | null) => void;
  onClear?: () => void;
  selectedFile: File | null;
  label: string;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelect, onClear, selectedFile, label }) => {
  const [showTips, setShowTips] = useState(false);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClear) {
      onClear();
    } else {
      onFileSelect(null);
    }
  }, [onClear, onFileSelect]);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs sm:text-sm font-medium">{label}</label>
        {!selectedFile && (
          <button
            type="button"
            onClick={() => setShowTips(!showTips)}
            className="text-xs text-[#8B5CF6] hover:text-[#8B5CF6]/80 underline flex items-center gap-1 py-1 px-1 touch-manipulation min-h-[32px]"
            aria-label="Show photo tips"
          >
            <Info size={14} />
            Tips for best results
          </button>
        )}
      </div>
      {showTips && !selectedFile && (
        <div className="mb-3 p-3 bg-[#8B5CF6]/10 rounded-lg text-xs text-[#8B5CF6] border border-[#8B5CF6]/30 shadow-[0_0_10px_rgba(139,92,246,0.2)]">
          <ul className="list-disc list-inside space-y-1">
            <li>Use a full-body photo for best results</li>
            <li>Good lighting works best</li>
            <li>Plain background recommended</li>
            <li>Stand straight with arms at your sides</li>
          </ul>
        </div>
      )}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-4 sm:p-6 text-center cursor-pointer transition-colors touch-manipulation
          ${selectedFile ? 'border-[#8B5CF6] bg-[#8B5CF6]/10 shadow-[0_0_15px_rgba(139,92,246,0.3)]' : 'border-[#8B5CF6]/30 hover:border-[#8B5CF6]/50 active:border-[#8B5CF6]'}
        `}
      >
        {selectedFile ? (
          <div className="relative">
            <img
              src={URL.createObjectURL(selectedFile)}
              alt="Preview"
              className="max-h-32 sm:max-h-48 mx-auto rounded"
            />
            <button
              onClick={handleClear}
              className="absolute top-0 right-0 bg-red-500 hover:bg-red-400 text-white p-2 sm:p-1.5 rounded-full transform translate-x-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center touch-manipulation transition-colors shadow-[0_0_10px_rgba(255,0,0,0.3)]"
              aria-label="Remove image"
            >
              <X size={16} className="sm:w-4 sm:h-4" />
            </button>
            <p className="mt-2 text-xs sm:text-sm text-[#8B5CF6] truncate px-2">{selectedFile.name}</p>
          </div>
        ) : (
          <label className="cursor-pointer block touch-manipulation">
            <Upload className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-[#8B5CF6]" />
            <span className="mt-2 block text-xs sm:text-sm font-medium text-[#8B5CF6] px-2">
              Drop image here or tap to upload
            </span>
            <input
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleChange}
            />
          </label>
        )}
      </div>
    </div>
  );
};

