import React, { useCallback, useState } from 'react';
import { Upload, Loader2, X } from 'lucide-react';
import axios from 'axios';

interface AnalyzedItem {
  index: number;
  original_filename: string;
  analysis?: {
    body_region?: string;
    category: string;
    detailed_description?: string;
    short_description?: string;
    description?: string;
    suggested_filename: string;
    metadata: any;
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
  onFilesUploaded: (files: File[], analyses: AnalyzedItem[]) => void;
  onItemRemove?: (index: number) => void;
  API_URL?: string;
}

export const BulkUploadZone: React.FC<BulkUploadZoneProps> = ({ 
  onFilesUploaded,
  onItemRemove,
  API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [analyzedItems, setAnalyzedItems] = useState<AnalyzedItem[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [savedFileUrls, setSavedFileUrls] = useState<Map<number, string>>(new Map());

  const handleBulkUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    
    // Limit to 5 files
    const selectedFiles = files.slice(0, 5);
    
    if (files.length > 5) {
      alert(`Only the first 5 files will be uploaded. ${files.length - 5} files were ignored.`);
    }

    setIsAnalyzing(true);
    setAnalysisProgress('Uploading and analyzing clothing items with OpenAI...');
    setProgressPercent(0);
    setUploadedFiles(selectedFiles);
    
    // Initialize items with 'analyzing' status
    const initialItems: AnalyzedItem[] = selectedFiles.map((file, idx) => ({
      index: idx,
      original_filename: file.name,
      status: 'analyzing'
    }));
    setAnalyzedItems(initialItems);

    try {
      const API_URL_FETCH = API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      // Update progress
      setProgressPercent(20);
      setAnalysisProgress('Sending images to backend for OpenAI analysis...');
      
      // Create FormData with all files
      const formData = new FormData();
      selectedFiles.forEach((file) => {
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
      const allAnalyses: AnalyzedItem[] = processedItems.map((item: any) => ({
        index: item.index,
        original_filename: item.original_filename || item.metadata?.original_filename || selectedFiles[item.index]?.name || `item_${item.index}`,
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
          metadata: item.metadata || item.analysis || {}
        },
        saved_filename: item.filename || item.saved_filename,
        file_url: item.url || item.file_url,
        status: item.status || 'success' as const
      }));

      console.log('Batch preprocessing complete. All items:', allAnalyses);

      // Update UI with results
      setAnalyzedItems(allAnalyses);

      // Store file URLs for display
      allAnalyses.forEach((item, idx) => {
        if (item.file_url) {
          setSavedFileUrls(prev => {
            const newMap = new Map(prev);
            newMap.set(idx, item.file_url!);
            return newMap;
          });
        }
      });

      // Process files for parent component
      const processedFiles: File[] = [];
      const API_URL_PROCESS = API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      for (let idx = 0; idx < selectedFiles.length; idx++) {
        const file = selectedFiles[idx];
        const item = allAnalyses[idx];
        const processedItem = processedItems[idx];
        
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
            (newFile as any).metadata = processedItem.metadata || {};
            (newFile as any).detailed_description = processedItem.description || '';
            (newFile as any).category = processedItem.category || 'unknown';
            (newFile as any).item_type = processedItem.subcategory || '';
            (newFile as any).file_url = fileUrl; // Store URL for try-on API
            (newFile as any).saved_filename = savedFilename;
            (newFile as any).storage_path = processedItem.storage_path;
            
            processedFiles.push(newFile);
          } catch (error) {
            console.warn(`Failed to fetch saved file for ${file.name}, using original:`, error);
            // Fallback to original file
            const newFile = new File([file], item.saved_filename || file.name, { type: file.type });
            (newFile as any).metadata = processedItem?.metadata || {};
            (newFile as any).detailed_description = processedItem?.description || '';
            (newFile as any).category = processedItem?.category || 'unknown';
            (newFile as any).item_type = processedItem?.subcategory || '';
            processedFiles.push(newFile);
          }
        } else {
          // Use original file with metadata attached
          const newFile = new File([file], file.name, { type: file.type });
          if (processedItem) {
            (newFile as any).metadata = processedItem.metadata || {};
            (newFile as any).detailed_description = processedItem.description || '';
            (newFile as any).category = processedItem.category || 'unknown';
            (newFile as any).item_type = processedItem.subcategory || '';
          }
          processedFiles.push(newFile);
        }
      }

      // Call the upload handler
      onFilesUploaded(processedFiles, allAnalyses);
    } catch (error: any) {
      console.error('Error analyzing clothing items:', error);
      setAnalysisProgress(`Error: ${error.message || 'Analysis failed'}`);
      setProgressPercent(0);
      
      // Mark all items as error
      setAnalyzedItems(prev => prev.map(item => ({ ...item, status: 'error' as const, error: error.message })));
      
      // Still allow files to be added even if analysis fails
      onFilesUploaded(selectedFiles, []);
    } finally {
      setIsAnalyzing(false);
    }
  }, [onFilesUploaded, API_URL]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await handleBulkUpload(files);
    // Reset file input
    e.target.value = '';
  }, [handleBulkUpload]);

  const handleBulkDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    await handleBulkUpload(files);
  }, [handleBulkUpload]);

  const handleRemoveItem = useCallback((index: number) => {
    const newItems = [...analyzedItems];
    const newFiles = [...uploadedFiles];
    newItems.splice(index, 1);
    newFiles.splice(index, 1);
    setAnalyzedItems(newItems);
    setUploadedFiles(newFiles);
    
    // Notify parent if handler provided
    if (onItemRemove) {
      onItemRemove(index);
    } else {
      // Otherwise update parent with remaining files
      onFilesUploaded(newFiles, newItems);
    }
  }, [analyzedItems, uploadedFiles, onItemRemove, onFilesUploaded]);

  return (
    <div className="space-y-3 sm:space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleBulkDrop}
        className={`
          border-2 border-dashed rounded-lg p-4 sm:p-6 md:p-8 text-center cursor-pointer transition-colors touch-manipulation
          ${isAnalyzing 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400 active:border-gray-500 hover:bg-gray-50'
          }
        `}
      >
        {isAnalyzing ? (
          <div className="flex flex-col items-center w-full">
            <Loader2 className="h-7 w-7 sm:h-8 sm:w-8 text-blue-500 animate-spin mb-3 sm:mb-4" />
            <p className="text-xs sm:text-sm font-medium text-gray-700 mb-3 sm:mb-4 px-2">{analysisProgress}</p>
            {/* Progress Bar - Enhanced visibility */}
            <div className="w-full max-w-md px-2 sm:px-4">
              <div className="w-full bg-gray-200 rounded-full h-2.5 sm:h-3 mb-2 shadow-inner">
                <div 
                  className="bg-blue-500 h-2.5 sm:h-3 rounded-full transition-all duration-500 ease-out shadow-md"
                  style={{ 
                    width: `${Math.max(progressPercent, 5)}%`,
                    minWidth: progressPercent > 0 ? '8px' : '0px'
                  }}
                />
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs font-semibold text-gray-600">{progressPercent}%</p>
                <p className="text-xs text-gray-500">Processing...</p>
              </div>
            </div>
          </div>
        ) : (
          <label className="cursor-pointer block touch-manipulation">
            <Upload className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" />
            <span className="mt-3 sm:mt-4 block text-sm sm:text-base font-medium text-gray-900 px-2">
              Upload 1-5 clothing items at once
            </span>
            <span className="mt-2 block text-xs sm:text-sm text-gray-500 px-2">
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
      {analyzedItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
          {analyzedItems.map((item, idx) => {
            const file = uploadedFiles[idx];
            const isSuccess = item.status === 'success' && item.analysis;
            const isError = item.status === 'error' || item.error;
            const isAnalyzing = item.status === 'analyzing';
            
            return (
              <div
                key={idx}
                className={`
                  border-2 rounded-lg p-2 sm:p-3 transition-all
                  ${isSuccess 
                    ? 'border-green-500 bg-green-50' 
                    : isError 
                    ? 'border-red-500 bg-red-50' 
                    : isAnalyzing
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-300 bg-gray-50'
                  }
                `}
              >
                {(file || item.file_url) && (
                  <div className="space-y-1.5 sm:space-y-2 relative">
                    <button
                      onClick={() => handleRemoveItem(idx)}
                      className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full opacity-90 hover:opacity-100 transition-opacity z-10 min-w-[24px] min-h-[24px] flex items-center justify-center"
                      aria-label={`Remove ${item.saved_filename || item.original_filename}`}
                    >
                      <X size={12} />
                    </button>
                    <img
                      src={
                        item.file_url 
                          ? (item.file_url.startsWith('http') 
                              ? item.file_url 
                              : `${API_URL}${item.file_url}`)
                          : (file ? URL.createObjectURL(file) : '')
                      }
                      alt={item.saved_filename || item.analysis?.suggested_filename || item.original_filename}
                      className="w-full h-24 sm:h-32 object-cover rounded"
                      onError={(e) => {
                        // Fallback to original file if saved URL fails
                        if (item.file_url && file) {
                          (e.target as HTMLImageElement).src = URL.createObjectURL(file);
                        }
                      }}
                    />
                    <div className="text-xs">
                      <p className="font-medium text-gray-900 truncate mb-0.5 sm:mb-1 text-[10px] sm:text-xs" title={item.saved_filename || item.analysis?.suggested_filename || item.original_filename}>
                        {item.saved_filename || item.analysis?.suggested_filename || item.original_filename}
                      </p>
                      {isAnalyzing && (
                        <p className="text-blue-600 mt-0.5 sm:mt-1 font-medium text-[10px] sm:text-xs">Analyzing...</p>
                      )}
                      {isSuccess && (
                        <div className="mt-0.5 sm:mt-1 space-y-0.5">
                          <p className="text-green-700 font-bold text-[10px] sm:text-xs uppercase">
                            ✓ {item.analysis?.body_region?.replace(/_/g, ' ') || item.analysis?.category?.replace(/_/g, ' ') || 'Analyzed'}
                          </p>
                          
                          {/* Item type, for example "leather lace up boots" */}
                          {item.analysis?.item_type && (
                            <p className="text-gray-800 text-[9px] sm:text-[10px] font-semibold">
                              {item.analysis.item_type}
                            </p>
                          )}
                          
                          {/* Color and style */}
                          {(item.analysis?.color || item.analysis?.style) && (
                            <p className="text-gray-600 text-[9px] sm:text-[10px]">
                              {item.analysis?.color && <span>{item.analysis.color}</span>}
                              {item.analysis?.color && item.analysis?.style && <span>, </span>}
                              {item.analysis?.style && <span>{item.analysis.style}</span>}
                            </p>
                          )}
                          
                          {/* Tags */}
                          {item.analysis?.tags && Array.isArray(item.analysis.tags) && item.analysis.tags.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-0.5">
                              {item.analysis.tags.slice(0, 3).map((tag: string, tagIdx: number) => (
                                <span
                                  key={tagIdx}
                                  className="px-1 py-[1px] rounded-full bg-gray-200 text-[8px] sm:text-[9px] text-gray-700"
                                >
                                  {tag}
                                </span>
                              ))}
                              {item.analysis.tags.length > 3 && (
                                <span className="text-[8px] sm:text-[9px] text-gray-500">
                                  +{item.analysis.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                          
                          {/* Short description */}
                          {item.analysis?.short_description && (
                            <p className="text-gray-500 text-[8px] sm:text-[9px] mt-0.5 line-clamp-2">
                              {item.analysis.short_description}
                            </p>
                          )}
                          
                          {/* Fallback to description if short_description not available */}
                          {!item.analysis?.short_description && item.analysis?.description && (
                            <p className="text-gray-500 text-[8px] sm:text-[9px] mt-0.5 line-clamp-2">
                              {item.analysis.description}
                            </p>
                          )}
                          
                          {item.saved_filename && (
                            <p className="text-gray-400 text-[8px] sm:text-[9px] mt-0.5 truncate" title="Saved filename">
                              Saved
                            </p>
                          )}
                        </div>
                      )}
                      {isError && (
                        <p className="text-red-600 mt-0.5 sm:mt-1 font-medium text-[10px] sm:text-xs">✗ Failed</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

