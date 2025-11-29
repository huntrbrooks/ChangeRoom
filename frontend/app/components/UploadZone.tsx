import React, { useCallback } from 'react';
import { Upload, X } from 'lucide-react';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  label: string;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelect, selectedFile, label }) => {
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
      <label className="block text-xs sm:text-sm font-medium mb-2">{label}</label>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-4 sm:p-6 text-center cursor-pointer transition-colors touch-manipulation
          ${selectedFile ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 active:border-gray-500'}
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
              onClick={(e) => {
                e.stopPropagation();
                // Note: Parent needs to handle clear if needed, or just overwrite
              }}
              className="absolute top-0 right-0 bg-red-500 text-white p-1.5 sm:p-1 rounded-full transform translate-x-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center touch-manipulation"
              aria-label="Remove image"
            >
              <X size={14} className="sm:w-4 sm:h-4" />
            </button>
            <p className="mt-2 text-xs sm:text-sm text-gray-600 truncate px-2">{selectedFile.name}</p>
          </div>
        ) : (
          <label className="cursor-pointer block touch-manipulation">
            <Upload className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" />
            <span className="mt-2 block text-xs sm:text-sm font-medium text-gray-900 px-2">
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

