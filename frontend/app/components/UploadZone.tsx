import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Upload, X, Info, Loader2 } from 'lucide-react';
import {
  optimizeImageFile,
  type OptimizeImageOptions,
} from '@/lib/imageOptimization';

interface UploadZoneProps {
  onFileSelect: (file: File | null) => void;
  onClear?: () => void;
  selectedFile: File | null;
  label: string;
  optimizeConfig?: (OptimizeImageOptions & { enabled?: boolean }) | null;
}

const formatBytes = (bytes: number) => {
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
  onClear,
  selectedFile,
  label,
  optimizeConfig = null,
}) => {
  const [showTips, setShowTips] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationMessage, setOptimizationMessage] = useState<string | null>(null);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);

  const previewUrl = useMemo(() => {
    if (!selectedFile) {
      return null;
    }
    return URL.createObjectURL(selectedFile);
  }, [selectedFile]);

  useEffect(() => {
    if (!previewUrl) {
      return;
    }
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const optimizationEnabled = optimizeConfig?.enabled ?? false;

  const cleanupMessages = useCallback(() => {
    setOptimizationMessage(null);
    setOptimizationError(null);
  }, []);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    cleanupMessages();
    if (onClear) {
      onClear();
    } else {
      onFileSelect(null);
    }
  }, [cleanupMessages, onClear, onFileSelect]);

  const processFile = useCallback(async (file: File | null) => {
    if (!file) {
      cleanupMessages();
      onFileSelect(null);
      return;
    }

    if (!optimizationEnabled || !optimizeConfig) {
      cleanupMessages();
      onFileSelect(file);
      return;
    }

    const { enabled: _enabled, ...optimizationOptions } = optimizeConfig;

    try {
      setIsOptimizing(true);
      cleanupMessages();

      const result = await optimizeImageFile(file, optimizationOptions);
      onFileSelect(result.file);

      if (result.didOptimize || result.mimeTypeChanged) {
        const sizeText = result.didOptimize
          ? `${formatBytes(result.originalBytes)} → ${formatBytes(result.finalBytes)}`
          : '';
        const mimeText = result.mimeTypeChanged
          ? `Converted to ${result.file.type.replace('image/', '').toUpperCase()}`
          : '';
        const details = [sizeText, mimeText].filter(Boolean).join(' · ');

        setOptimizationMessage(
          details
            ? `We optimized your photo so it fits the 10MB limit (${details}).`
            : 'We optimized your photo so it fits the 10MB limit.'
        );
      }
    } catch (error) {
      console.error('Image optimization failed', error);
      const message =
        error instanceof Error ? error.message : 'Could not optimize this image.';
      setOptimizationError(message);
      onFileSelect(null);
    } finally {
      setIsOptimizing(false);
    }
  }, [cleanupMessages, onFileSelect, optimizeConfig, optimizationEnabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (isOptimizing) {
      return;
    }
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      void processFile(file);
    }
  }, [isOptimizing, processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (isOptimizing) {
      return;
    }
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
  }, [isOptimizing, processFile]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs sm:text-sm font-medium">{label}</label>
        {!selectedFile && (
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
      {optimizationEnabled && !selectedFile && (
        <p className="text-[11px] text-black/70 mb-2">
          Large mobile photos are automatically resized to stay under the 10MB limit.
        </p>
      )}
      {showTips && !selectedFile && (
        <div className="mb-3 p-3 bg-black/5 rounded-none text-xs text-black border border-black/20">
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
          border-2 border-dashed rounded-none p-4 sm:p-6 text-center cursor-pointer transition-all touch-manipulation
          ${
            isOptimizing
              ? 'opacity-70 pointer-events-none border-black/10'
              : selectedFile
              ? 'border-black bg-black/5'
              : 'border-black/20 hover:border-black/40 active:border-black'
          }
        `}
        aria-busy={isOptimizing}
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
        ) : selectedFile && previewUrl ? (
          <div className="relative">
            <img
              src={previewUrl}
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
            <p className="mt-2 text-xs sm:text-sm text-black truncate px-2 uppercase tracking-wider">
              {selectedFile.name}
            </p>
          </div>
        ) : (
          <label className="cursor-pointer block touch-manipulation">
            <Upload className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-black" />
            <span className="mt-2 block text-xs sm:text-sm font-semibold text-black uppercase tracking-wider px-2">
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
      {optimizationMessage && (
        <p className="mt-2 text-xs sm:text-sm text-black/80">{optimizationMessage}</p>
      )}
      {optimizationError && (
        <p className="mt-2 text-xs sm:text-sm text-red-600">{optimizationError}</p>
      )}
    </div>
  );
};

