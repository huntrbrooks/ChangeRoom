import React, { useCallback, useState, useEffect } from 'react';
import { Upload, Loader2, X, RefreshCw } from 'lucide-react';
import {
  getWearingStyleOptions,
  getDefaultWearingStyle,
  hasWearingStyleOptions,
} from '@/lib/wearingStyles';

interface FileWithMetadata extends File {
  metadata?: Record<string, unknown>;
  detailed_description?: string;
  category?: string;
  item_type?: string;
  file_url?: string;
  saved_filename?: string;
  storage_path?: string;
  wearing_style?: string;
}

export interface AnalyzedItem {
  index: number;
  original_filename: string;
  analysis?: {
    body_region?: string;
    category: string;
    detailed_description?: string;
    short_description?: string;
    description?: string;
    suggested_filename: string;
    metadata?: Record<string, unknown>;
    item_type?: string;
    color?: string;
    style?: string;
    tags?: string[];
  };
  error?: string;
  status?: 'analyzing' | 'success' | 'error';
  file_url?: string;
  saved_filename?: string;
  saved_file?: string;
}

interface BulkUploadZoneProps {
  existingImages?: File[];
  existingAnalyses?: AnalyzedItem[];
  onFilesUploaded: (files: File[], analyses: AnalyzedItem[], shouldReplace?: boolean) => void;
  onItemRemove?: (index: number) => void;
  onItemReplace?: (index: number, file: File, analysis: AnalyzedItem) => void;
  API_URL?: string;
}

export const BulkUploadZone: React.FC<BulkUploadZoneProps> = ({ 
  existingImages = [],
  existingAnalyses = [],
  onFilesUploaded,
  onItemRemove,
  onItemReplace,
  API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [analyzedItems, setAnalyzedItems] = useState<AnalyzedItem[]>(existingAnalyses);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>(existingImages);
  const [wearingStyles, setWearingStyles] = useState<Map<number, string>>(new Map());
  const [objectUrls, setObjectUrls] = useState<Map<number, string>>(new Map());

  // Sync with parent state when props change
  useEffect(() => {
    setUploadedFiles(existingImages);
    setAnalyzedItems(existingAnalyses);
  }, [existingImages, existingAnalyses]);

  // Create object URLs for files in useEffect to avoid hydration issues
  useEffect(() => {
    const urls = new Map<number, string>();
    uploadedFiles.forEach((file, idx) => {
      if (!objectUrls.has(idx) && file && !(file as FileWithMetadata).file_url) {
        const url = URL.createObjectURL(file);
        urls.set(idx, url);
      }
    });
    
    if (urls.size > 0) {
      setObjectUrls(prev => {
        const newMap = new Map(prev);
        urls.forEach((url, idx) => newMap.set(idx, url));
        return newMap;
      });
    }

    // Cleanup function to revoke URLs when component unmounts or files change
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [uploadedFiles]);

  const analyzeFiles = useCallback(async (filesToAnalyze: File[], startIndex: number = 0) => {
    if (filesToAnalyze.length === 0) return { files: [], analyses: [] };

    setIsAnalyzing(true);
    setAnalysisProgress('Uploading and analyzing clothing items with OpenAI...');
    setProgressPercent(0);
    
    // Initialize items with 'analyzing' status for new files
    const initialItems: AnalyzedItem[] = filesToAnalyze.map((file, idx) => ({
      index: startIndex + idx,
      original_filename: file.name,
      status: 'analyzing'
    }));
    
    // Update analyzed items - preserve existing, add new analyzing ones
    setAnalyzedItems(prev => {
      const newItems = [...prev];
      initialItems.forEach((item, idx) => {
        newItems[startIndex + idx] = item;
      });
      return newItems;
    });

    try {
      const API_URL_FETCH = API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      // Update progress
      setProgressPercent(20);
      setAnalysisProgress('Sending images to backend for OpenAI analysis...');
      
      // Create FormData with files to analyze
      const formData = new FormData();
      filesToAnalyze.forEach((file) => {
        formData.append('clothing_images', file);
      });

      // Call the new batch preprocessing endpoint
      const response = await fetch(`${API_URL_FETCH}/api/preprocess-clothing`, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header, let browser set it with boundary
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || errorData.detail || `Analysis failed: ${response.statusText}`);
      }

      setProgressPercent(80);
      setAnalysisProgress('Processing results...');

      // Parse JSON response
      const result = await response.json();
      const processedItems = result.items || [];

      if (processedItems.length === 0) {
        throw new Error('No items returned from preprocessing');
      }

      setProgressPercent(100);
      setAnalysisProgress('Analysis complete!');

      // Transform backend response to frontend format
      const allAnalyses: AnalyzedItem[] = processedItems.map((item: {
        index?: number;
        original_filename?: string;
        analysis?: AnalyzedItem['analysis'];
        error?: string;
        status?: string;
        file_url?: string;
        saved_filename?: string;
        saved_file?: string;
        metadata?: Record<string, unknown>;
        body_region?: string;
        category?: string;
        subcategory?: string;
        color?: string;
        style?: string;
        description?: string;
        tags?: string[];
        filename?: string;
        recommended_filename?: string;
        url?: string;
      }, idx: number) => {
        const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
        const originalFilename = item.original_filename || 
          (metadata && 'original_filename' in metadata ? String(metadata.original_filename) : undefined) ||
          filesToAnalyze[idx]?.name || 
          `item_${startIndex + idx}`;
        
        return {
        index: startIndex + idx,
        original_filename: originalFilename,
        analysis: {
          body_region: item.analysis?.body_region || item.body_region || item.analysis?.category || item.category || 'unknown',
          category: item.analysis?.body_region || item.body_region || item.analysis?.category || item.category || 'unknown',  // For backward compatibility
          item_type: item.analysis?.item_type || item.subcategory || '',
          color: item.analysis?.color || item.color,
          style: item.analysis?.style || item.style,
          description: item.analysis?.description || item.analysis?.short_description || item.description || '',
          detailed_description: item.analysis?.description || item.analysis?.short_description || item.description || '',
          short_description: item.analysis?.short_description || item.description || '',
          tags: item.analysis?.tags || item.tags || [],
          suggested_filename: item.filename || item.recommended_filename || item.saved_filename,
          metadata: metadata || item.analysis || {}
        },
        saved_filename: item.filename || item.saved_filename,
        file_url: item.url || item.file_url,
        status: (item.status === 'error' ? 'error' : item.status === 'analyzing' ? 'analyzing' : 'success') as 'analyzing' | 'success' | 'error'
      };
      });

      console.log('Batch preprocessing complete. New items:', allAnalyses);

      // Update analyzed items - preserve existing, update new ones
      setAnalyzedItems(prev => {
        const newItems = [...prev];
        allAnalyses.forEach((analysis, idx) => {
          newItems[startIndex + idx] = analysis;
        });
        return newItems;
      });

      // Initialize wearing styles map - preserve existing or set defaults
      const localWearingStyles = new Map<number, string>(wearingStyles);
      allAnalyses.forEach((item, idx) => {
        const actualIdx = startIndex + idx;
        // Initialize wearing style if options are available
        if (item.analysis) {
          const category = item.analysis.category || item.analysis.body_region || '';
          const itemType = item.analysis.item_type || '';
          if (hasWearingStyleOptions(category, itemType)) {
            // Check if file already has a wearing style
            const existingFile = filesToAnalyze[idx];
            const existingStyle = existingFile ? (existingFile as FileWithMetadata).wearing_style : null;
            
            // Use existing style if valid, otherwise use default
            if (existingStyle) {
              const styleOptions = getWearingStyleOptions(category, itemType);
              const isValidStyle = styleOptions.some(opt => opt.value === existingStyle);
              if (isValidStyle) {
                localWearingStyles.set(actualIdx, existingStyle);
              } else {
                const defaultStyle = getDefaultWearingStyle(category, itemType);
                if (defaultStyle) {
                  localWearingStyles.set(actualIdx, defaultStyle);
                }
              }
            } else {
              const defaultStyle = getDefaultWearingStyle(category, itemType);
              if (defaultStyle) {
                localWearingStyles.set(actualIdx, defaultStyle);
              }
            }
          }
        }
      });
      // Update state with the new map
      setWearingStyles(localWearingStyles);

      // Process files for parent component
      const processedFiles: File[] = [];
      const API_URL_PROCESS = API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      for (let idx = 0; idx < filesToAnalyze.length; idx++) {
        const file = filesToAnalyze[idx];
        const item = allAnalyses[idx];
        const processedItem = processedItems[idx];
        const actualIdx = startIndex + idx;
        
        if (item?.file_url && processedItem) {
          // File was saved on server - fetch it and create File object with metadata
          try {
            const fileUrl = item.file_url.startsWith('http') 
              ? item.file_url 
              : `${API_URL_PROCESS}${item.file_url}`;
            
            const response = await fetch(fileUrl);
            const blob = await response.blob();
            const savedFilename = item.saved_filename || file.name;
            const newFile = new File([blob], savedFilename, { type: blob.type || file.type });
            
            // Attach metadata to the file object for try-on API
            const fileWithMeta = newFile as FileWithMetadata;
            fileWithMeta.metadata = processedItem.metadata || {};
            fileWithMeta.detailed_description = processedItem.description || '';
            fileWithMeta.category = processedItem.category || 'unknown';
            fileWithMeta.item_type = processedItem.subcategory || '';
            fileWithMeta.file_url = fileUrl; // Store URL for try-on API
            fileWithMeta.saved_filename = savedFilename;
            fileWithMeta.storage_path = processedItem.storage_path;
            // Add wearing style if set
            const wearingStyle = localWearingStyles.get(actualIdx);
            if (wearingStyle) {
              fileWithMeta.wearing_style = wearingStyle;
            }
            
            processedFiles.push(newFile);
          } catch (error) {
            console.warn(`Failed to fetch saved file for ${file.name}, using original:`, error);
            // Fallback to original file
            const newFile = new File([file], item.saved_filename || file.name, { type: file.type });
            const fileWithMeta = newFile as FileWithMetadata;
            fileWithMeta.metadata = processedItem?.metadata || {};
            fileWithMeta.detailed_description = processedItem?.description || '';
            fileWithMeta.category = processedItem?.category || 'unknown';
            fileWithMeta.item_type = processedItem?.subcategory || '';
            // Add wearing style if set
            const wearingStyle = localWearingStyles.get(actualIdx);
            if (wearingStyle) {
              fileWithMeta.wearing_style = wearingStyle;
            }
            processedFiles.push(newFile);
          }
        } else {
          // Use original file with metadata attached
          const newFile = new File([file], file.name, { type: file.type });
          const fileWithMeta = newFile as FileWithMetadata;
          if (processedItem) {
            fileWithMeta.metadata = processedItem.metadata || {};
            fileWithMeta.detailed_description = processedItem.description || '';
            fileWithMeta.category = processedItem.category || 'unknown';
            fileWithMeta.item_type = processedItem.subcategory || '';
          }
          // Add wearing style if set
          const wearingStyle = localWearingStyles.get(actualIdx);
          if (wearingStyle) {
            fileWithMeta.wearing_style = wearingStyle;
          }
          processedFiles.push(newFile);
        }
      }

      return { files: processedFiles, analyses: allAnalyses };
    } catch (error: unknown) {
      console.error('Error analyzing clothing items:', error);
      const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
      setAnalysisProgress(`Error: ${errorMessage}`);
      setProgressPercent(0);
      
      // Mark new items as error
      setAnalyzedItems(prev => {
        const newItems = [...prev];
        for (let idx = 0; idx < filesToAnalyze.length; idx++) {
          newItems[startIndex + idx] = {
            index: startIndex + idx,
            original_filename: filesToAnalyze[idx].name,
            status: 'error' as const,
            error: errorMessage
          };
        }
        return newItems;
      });
      
      // Still allow files to be added even if analysis fails
      return { files: filesToAnalyze, analyses: [] };
    } finally {
      setIsAnalyzing(false);
    }
  }, [API_URL]);

  const handleBulkUpload = useCallback(async (files: File[], shouldReplace: boolean = false) => {
    if (files.length === 0) return;
    
    const currentCount = uploadedFiles.length;
    const totalAfterUpload = currentCount + files.length;
    
    // Check if upload would exceed limit
    if (totalAfterUpload > 5 && !shouldReplace) {
      const confirmed = window.confirm(
        `You currently have ${currentCount} image${currentCount !== 1 ? 's' : ''}. Uploading ${files.length} more would exceed the limit of 5 images. Uploading these images will replace all existing images. Continue?`
      );
      if (!confirmed) {
        return;
      }
      shouldReplace = true;
    }
    
    // Limit files to what can fit
    let filesToProcess: File[];
    if (shouldReplace) {
      filesToProcess = files.slice(0, 5);
      if (files.length > 5) {
        alert(`Only the first 5 files will be uploaded. ${files.length - 5} files were ignored.`);
      }
    } else {
      const remainingSlots = 5 - currentCount;
      filesToProcess = files.slice(0, remainingSlots);
      if (files.length > remainingSlots) {
        alert(`Only ${remainingSlots} more image${remainingSlots !== 1 ? 's' : ''} can be added. ${files.length - remainingSlots} file${files.length - remainingSlots !== 1 ? 's' : ''} were ignored.`);
      }
    }

    const startIndex = shouldReplace ? 0 : currentCount;
    const result = await analyzeFiles(filesToProcess, startIndex);
    
    if (shouldReplace) {
      // Replace all files
      setUploadedFiles(result.files);
      onFilesUploaded(result.files, result.analyses, true);
    } else {
      // Append new files
      const newFiles = [...uploadedFiles, ...result.files];
      setUploadedFiles(newFiles);
      onFilesUploaded(result.files, result.analyses, false);
    }
  }, [uploadedFiles, analyzeFiles, onFilesUploaded]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await handleBulkUpload(files, false);
    // Reset file input
    e.target.value = '';
  }, [handleBulkUpload]);

  const handleBulkDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    await handleBulkUpload(files, false);
  }, [handleBulkUpload]);

  const handleReplaceItem = useCallback(async (index: number, file: File) => {
    const result = await analyzeFiles([file], index);
    if (result.files.length > 0 && result.analyses.length > 0) {
      // Update local state
      const newFiles = [...uploadedFiles];
      newFiles[index] = result.files[0];
      setUploadedFiles(newFiles);
      
      // Notify parent
      if (onItemReplace) {
        onItemReplace(index, result.files[0], result.analyses[0]);
      }
    }
  }, [uploadedFiles, analyzeFiles, onItemReplace]);


  const handleRemoveItem = useCallback((index: number) => {
    const newItems = analyzedItems.filter((_, idx) => idx !== index);
    const newFiles = uploadedFiles.filter((_, idx) => idx !== index);
    setAnalyzedItems(newItems);
    setUploadedFiles(newFiles);
    
    // Remove wearing style for this item and reindex remaining ones
    setWearingStyles(prev => {
      const newMap = new Map<number, string>();
      prev.forEach((style, idx) => {
        if (idx < index) {
          newMap.set(idx, style);
        } else if (idx > index) {
          newMap.set(idx - 1, style);
        }
      });
      return newMap;
    });
    
    // Notify parent if handler provided
    if (onItemRemove) {
      onItemRemove(index);
    }
  }, [analyzedItems, uploadedFiles, onItemRemove]);

  const handleWearingStyleChange = useCallback((index: number, style: string) => {
    // Update wearing style state
    setWearingStyles(prev => {
      const newMap = new Map(prev);
      newMap.set(index, style);
      return newMap;
    });

    // Update file metadata if file exists
    const updatedFiles = [...uploadedFiles];
    if (updatedFiles[index]) {
      (updatedFiles[index] as FileWithMetadata).wearing_style = style;
      setUploadedFiles(updatedFiles);
    }
  }, [uploadedFiles]);

  return (
    <div className="space-y-3 sm:space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleBulkDrop}
        className={`
          border-2 border-dashed rounded-lg p-4 sm:p-6 md:p-8 text-center cursor-pointer transition-colors touch-manipulation
          ${isAnalyzing 
            ? 'border-black bg-black/10 shadow-[0_0_20px_rgba(0,0,0,0.3)]' 
            : 'border-black/30 hover:border-black/50 active:border-black hover:bg-black/5'
          }
        `}
      >
        {isAnalyzing ? (
          <div className="flex flex-col items-center w-full">
            <Loader2 className="h-7 w-7 sm:h-8 sm:w-8 text-black animate-spin mb-3 sm:mb-4" />
            <p className="text-xs sm:text-sm font-medium text-black mb-3 sm:mb-4 px-2">{analysisProgress}</p>
            {/* Progress Bar - Enhanced visibility */}
            <div className="w-full max-w-md px-2 sm:px-4">
              <div className="w-full bg-gray-100 rounded-full h-2.5 sm:h-3 mb-2 shadow-inner">
                <div 
                  className="bg-black h-2.5 sm:h-3 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                  style={{ 
                    width: `${Math.max(progressPercent, 5)}%`,
                    minWidth: progressPercent > 0 ? '8px' : '0px'
                  }}
                />
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs font-semibold text-black">{progressPercent}%</p>
                <p className="text-xs text-black/70">Processing...</p>
              </div>
            </div>
          </div>
        ) : (
          <label className="cursor-pointer block touch-manipulation">
            <Upload className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-black" />
            <span className="mt-3 sm:mt-4 block text-sm sm:text-base font-medium text-black px-2">
              {uploadedFiles.length < 5 
                ? `Upload ${5 - uploadedFiles.length} more clothing item${5 - uploadedFiles.length !== 1 ? 's' : ''} (${uploadedFiles.length}/5)`
                : 'Maximum 5 items reached. Upload new images to replace all existing items.'
              }
            </span>
            <span className="mt-2 block text-xs sm:text-sm text-black/70 px-2">
              Drag and drop images here or tap to select. Items will be analyzed and categorized automatically.
            </span>
            <input
              type="file"
              className="hidden"
              accept="image/*"
              multiple
              onChange={handleFileInput}
            />
          </label>
        )}
      </div>

      {/* Display analyzed items horizontally */}
      {uploadedFiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
          {uploadedFiles.map((file, idx) => {
            const item = analyzedItems[idx];
            const isSuccess = item?.status === 'success' && item.analysis;
            const isError = item?.status === 'error' || item?.error;
            const isAnalyzing = item?.status === 'analyzing';
            
            // Compute wearing style options outside of JSX to avoid hydration issues
            const category = item?.analysis?.category || item?.analysis?.body_region || '';
            const itemType = item?.analysis?.item_type || '';
            // Also check description and tags for better matching (e.g., "cargo pants", "baseball cap", "hooded sweatshirt")
            const description = (item?.analysis?.description || item?.analysis?.detailed_description || '').toLowerCase();
            const tags = (item?.analysis?.tags || []).join(' ').toLowerCase();
            const combinedText = `${itemType} ${description} ${tags}`.toLowerCase();
            
            // Try matching with item_type first, then fallback to keyword matching in description/tags
            let styleOptions = isSuccess ? getWearingStyleOptions(category, itemType) : [];
            
            // If no options found with item_type, try keyword matching for common cases
            if (isSuccess && styleOptions.length === 0) {
              // Check for hoodie/hooded sweatshirt
              if (category === 'upper_body' && (combinedText.includes('hood') || combinedText.includes('sweatshirt'))) {
                styleOptions = getWearingStyleOptions('upper_body', 'hoodie');
              }
              // Check for cargo pants
              else if (category === 'lower_body' && combinedText.includes('cargo')) {
                styleOptions = getWearingStyleOptions('lower_body', 'pants');
              }
              // Check for baseball cap
              else if (category === 'accessories' && (combinedText.includes('baseball') || combinedText.includes('cap'))) {
                styleOptions = getWearingStyleOptions('accessories', 'hat');
              }
              // Check for boots
              else if (category === 'shoes' && combinedText.includes('boot')) {
                styleOptions = getWearingStyleOptions('shoes', 'boots');
              }
            }
            const hasWearingOptions = styleOptions.length > 0;
            const currentWearingStyle = wearingStyles.get(idx);
            const defaultWearingStyle = currentWearingStyle || styleOptions[0]?.value || '';
            
            // Debug logging
            if (isSuccess && item?.analysis) {
              console.log(`[WearingStyle] Item ${idx}: category="${category}", itemType="${itemType}", hasOptions=${hasWearingOptions}, styleOptions=${styleOptions.length}, defaultStyle="${defaultWearingStyle}"`);
            }
            
            return (
              <div
                key={idx}
                className={`
                  border-2 rounded-lg p-2 sm:p-3 transition-all
                  ${isSuccess 
                    ? 'border-green-500 bg-green-500/10 shadow-[0_0_10px_rgba(0,255,0,0.2)]' 
                    : isError 
                    ? 'border-red-500 bg-red-500/10 shadow-[0_0_10px_rgba(255,0,0,0.2)]' 
                    : isAnalyzing
                    ? 'border-black bg-black/10 shadow-[0_0_10px_rgba(0,0,0,0.2)]'
                    : 'border-black/20 bg-gray-100'
                  }
                `}
              >
                <div className="space-y-1.5 sm:space-y-2 relative">
                    <button
                      onClick={() => handleRemoveItem(idx)}
                      className="absolute top-1 right-1 bg-red-500 hover:bg-red-400 text-white p-1.5 sm:p-1 rounded-full opacity-90 hover:opacity-100 transition-opacity z-10 min-w-[36px] min-h-[36px] sm:min-w-[24px] sm:min-h-[24px] flex items-center justify-center shadow-[0_0_8px_rgba(255,0,0,0.3)] touch-manipulation"
                      aria-label={`Remove ${item?.saved_filename || item?.original_filename || file.name}`}
                    >
                      <X size={14} className="sm:w-3 sm:h-3" />
                    </button>
                    <button
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e) => {
                          const selectedFile = (e.target as HTMLInputElement).files?.[0];
                          if (selectedFile) {
                            handleReplaceItem(idx, selectedFile);
                          }
                        };
                        input.click();
                      }}
                      className="absolute top-1 left-1 bg-black hover:bg-black text-white p-1.5 sm:p-1 rounded-full opacity-90 hover:opacity-100 transition-opacity z-10 min-w-[36px] min-h-[36px] sm:min-w-[24px] sm:min-h-[24px] flex items-center justify-center shadow-[0_0_8px_rgba(0,0,0,0.3)] touch-manipulation"
                      aria-label={`Replace ${item?.saved_filename || item?.original_filename || file.name}`}
                    >
                      <RefreshCw size={14} className="sm:w-3 sm:h-3" />
                    </button>
                    <img
                      src={
                        item?.file_url 
                          ? (item.file_url.startsWith('http') 
                              ? item.file_url 
                              : `${API_URL}${item.file_url}`)
                          : objectUrls.get(idx) || ''
                      }
                      alt={item?.saved_filename || item?.analysis?.suggested_filename || item?.original_filename || file.name}
                      className="w-full h-24 sm:h-32 object-cover rounded"
                      onError={(e) => {
                        // Fallback to object URL if saved URL fails
                        const fallbackUrl = objectUrls.get(idx);
                        if (fallbackUrl) {
                          (e.target as HTMLImageElement).src = fallbackUrl;
                        }
                      }}
                    />
                    <div className="text-xs">
                      <p className="font-medium text-black truncate mb-0.5 sm:mb-1 text-[10px] sm:text-xs" title={item?.saved_filename || item?.analysis?.suggested_filename || item?.original_filename || file.name}>
                        {item?.saved_filename || item?.analysis?.suggested_filename || item?.original_filename || file.name}
                      </p>
                      {isAnalyzing && (
                        <p className="text-black mt-0.5 sm:mt-1 font-medium text-[10px] sm:text-xs">Analyzing...</p>
                      )}
                      {isSuccess && item?.analysis && (
                        <div className="mt-0.5 sm:mt-1 space-y-0.5">
                          <p className="text-green-400 font-bold text-[10px] sm:text-xs uppercase">
                            ✓ {item.analysis.body_region?.replace(/_/g, ' ') || item.analysis.category?.replace(/_/g, ' ') || 'Analyzed'}
                          </p>
                          
                          {/* Item type, for example "leather lace up boots" */}
                          {item.analysis.item_type && (
                            <p className="text-black text-[9px] sm:text-[10px] font-semibold">
                              {item.analysis.item_type}
                            </p>
                          )}
                          
                          {/* Color and style */}
                          {(item.analysis.color || item.analysis.style) && (
                            <p className="text-black/80 text-[9px] sm:text-[10px]">
                              {item.analysis.color && <span>{item.analysis.color}</span>}
                              {item.analysis.color && item.analysis.style && <span>, </span>}
                              {item.analysis.style && <span>{item.analysis.style}</span>}
                            </p>
                          )}
                          
                          {/* Tags */}
                          {item.analysis.tags && Array.isArray(item.analysis.tags) && item.analysis.tags.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-0.5">
                              {item.analysis.tags.slice(0, 3).map((tag: string, tagIdx: number) => (
                                <span
                                  key={tagIdx}
                                  className="px-1 py-[1px] rounded-full bg-black/20 text-[8px] sm:text-[9px] text-black"
                                >
                                  {tag}
                                </span>
                              ))}
                              {item.analysis.tags.length > 3 && (
                                <span className="text-[8px] sm:text-[9px] text-black/70">
                                  +{item.analysis.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                          
                          {/* Short description */}
                          {item.analysis.short_description && (
                            <p className="text-black/60 text-[8px] sm:text-[9px] mt-0.5 line-clamp-2">
                              {item.analysis.short_description}
                            </p>
                          )}
                          
                          {/* Fallback to description if short_description not available */}
                          {!item.analysis.short_description && item.analysis.description && (
                            <p className="text-black/60 text-[8px] sm:text-[9px] mt-0.5 line-clamp-2">
                              {item.analysis.description}
                            </p>
                          )}
                          
                          {item.saved_filename && (
                            <p className="text-black/50 text-[8px] sm:text-[9px] mt-0.5 truncate" title="Saved filename">
                              Saved
                            </p>
                          )}
                        </div>
                      )}
                      {isError && (
                        <p className="text-red-400 mt-0.5 sm:mt-1 font-medium text-[10px] sm:text-xs">✗ Failed</p>
                      )}
                    </div>

                    {/* Wearing Style Dropdown */}
                    {isSuccess && hasWearingOptions && styleOptions.length > 0 && (
                      <div className="mt-1.5 sm:mt-2">
                        <label htmlFor={`wearing-style-${idx}`} className="block text-[9px] sm:text-[10px] font-medium text-black mb-1">
                          How to wear:
                        </label>
                        <select
                          id={`wearing-style-${idx}`}
                          value={defaultWearingStyle || styleOptions[0]?.value || ''}
                          onChange={(e) => handleWearingStyleChange(idx, e.target.value)}
                          className="w-full text-[9px] sm:text-[10px] px-2 py-1.5 rounded bg-gray-100 border border-black/30 text-black focus:border-black focus:outline-none focus:ring-1 focus:ring-[black] appearance-none cursor-pointer hover:border-black/50 transition-colors"
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2300ffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 0.5rem center',
                            paddingRight: '2rem',
                          }}
                        >
                          {styleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

