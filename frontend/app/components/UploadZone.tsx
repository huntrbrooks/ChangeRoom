import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Upload, X, Info, Loader2 } from 'lucide-react';
import {
  optimizeImageFile,
  type OptimizeImageOptions,
} from '@/lib/imageOptimization';

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
}) => {
  const [showTips, setShowTips] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationMessage, setOptimizationMessage] = useState<string | null>(null);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  
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
  }, [files, multiple, onFilesSelect]);

  const processFiles = useCallback(async (newFiles: File[]) => {
    if (newFiles.length === 0) {
      if (!multiple) handleClear();
      return;
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
    } catch (error) {
      console.error('Image optimization failed', error);
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
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    
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

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs sm:text-sm font-medium">
          {label} {multiple && files.length > 0 && <span className="text-black/60">({files.length}/{maxFiles})</span>}
        </label>
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
      {showTips && files.length === 0 && (
        <div className="mb-3 p-3 bg-black/5 rounded-none text-xs text-black border border-black/20">
          <ul className="list-disc list-inside space-y-1">
            {multiple ? (
               <>
                <li>Upload 3-5 photos for best results</li>
                <li>Include varied angles (front, profile, 45°)</li>
                <li>Different lighting conditions help accuracy</li>
                <li>Full-body shots preferred</li>
               </>
            ) : (
               <>
                <li>Use a full-body photo for best results</li>
                <li>Good lighting works best</li>
                <li>Plain background recommended</li>
                <li>Stand straight with arms at your sides</li>
               </>
            )}
          </ul>
        </div>
      )}
      
      {/* Grid for multiple files or single preview */}
      {files.length > 0 && previewUrls.length > 0 ? (
         <div className={`grid gap-2 ${multiple ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'}`}>
            {files.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="relative group">
                 <img
                   src={previewUrls[idx]}
                   alt={`Preview ${idx + 1}`}
                   className="w-full h-32 sm:h-48 object-cover rounded border border-black/10"
                 />
                 <button
                   onClick={(e) => {
                     e.stopPropagation();
                     if (multiple) {
                       handleRemoveFile(idx);
                     } else {
                       handleClear(e);
                     }
                   }}
                   className="absolute top-1 right-1 bg-red-500 hover:bg-red-400 text-white p-1 rounded-full min-w-[24px] min-h-[24px] flex items-center justify-center touch-manipulation transition-colors shadow-sm"
                   aria-label="Remove image"
                 >
                   <X size={14} />
                 </button>
                 {!multiple && (
                    <p className="mt-1 text-xs text-black truncate px-1 uppercase tracking-wider text-center">
                      {file.name}
                    </p>
                 )}
              </div>
            ))}
            {/* Add button for multiple uploads if under limit */}
            {multiple && files.length < maxFiles && (
               <label 
                 className={`
                   border-2 border-dashed border-black/20 hover:border-black/40 active:border-black rounded p-4 flex flex-col items-center justify-center cursor-pointer min-h-[128px] sm:min-h-[192px] transition-all bg-black/5 hover:bg-black/10
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
                    accept="image/*"
                    multiple
                    onChange={handleChange}
                    disabled={isOptimizing || !isAuthenticated}
                 />
               </label>
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
                accept="image/*"
                multiple={multiple}
                onChange={handleChange}
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
    </div>
  );
};

