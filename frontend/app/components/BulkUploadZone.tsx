import React, { useCallback, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import axios from 'axios';

interface AnalyzedItem {
  index: number;
  original_filename: string;
  analysis?: {
    category: string;
    detailed_description: string;
    suggested_filename: string;
    metadata: any;
    item_type?: string;
  };
  error?: string;
  status?: 'analyzing' | 'success' | 'error';
  file_url?: string;
  saved_filename?: string;
  saved_file?: string;
}

interface BulkUploadZoneProps {
  onFilesUploaded: (files: File[], analyses: AnalyzedItem[]) => void;
  API_URL?: string;
}

export const BulkUploadZone: React.FC<BulkUploadZoneProps> = ({ 
  onFilesUploaded,
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
    setAnalysisProgress('Uploading and analyzing clothing items...');
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
      
      // Create FormData with all files
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append('clothing_images', file);
      });

      // Use fetch for Server-Sent Events (SSE) streaming
      const response = await fetch(`${API_URL_FETCH}/api/analyze-clothing`, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header, let browser set it with boundary
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let allAnalyses: AnalyzedItem[] = [];

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                setProgressPercent(data.progress);
                setAnalysisProgress(data.message || `Analyzing ${data.current}/${data.total} items...`);
                
                // Update status for current item being analyzed
                setAnalyzedItems(prev => prev.map((item, idx) => 
                  idx === data.current - 1 ? { ...item, status: 'analyzing' as const } : item
                ));
              } else if (data.type === 'item_complete') {
                // Update individual item as it completes
                setProgressPercent(data.progress);
                const itemData = data.item;
                const category = itemData.analysis?.category || 'unknown';
                const itemType = itemData.analysis?.item_type || '';
                const filename = itemData.saved_filename || itemData.analysis?.suggested_filename || itemData.original_filename;
                
                console.log(`Item ${itemData.index + 1} complete:`, {
                  category,
                  itemType,
                  filename,
                  file_url: itemData.file_url,
                  saved_filename: itemData.saved_filename,
                  fullItem: itemData
                });
                
                setAnalysisProgress(data.message || `Completed ${data.current}/${data.total} items: ${category}${itemType ? ` (${itemType})` : ''}`);
                
                setAnalyzedItems(prev => prev.map((item, idx) => 
                  idx === data.item.index ? { 
                    ...item, 
                    ...data.item, 
                    status: data.item.status || (data.item.error ? 'error' : 'success'),
                    // Ensure all analysis data is properly set
                    analysis: {
                      ...item.analysis,
                      ...data.item.analysis,
                      category: category,
                      item_type: itemType
                    },
                    saved_filename: filename,
                    file_url: itemData.file_url || ''
                  } : item
                ));
              } else if (data.type === 'complete') {
                allAnalyses = data.items as AnalyzedItem[];
                setProgressPercent(100);
                setAnalysisProgress('Analysis complete!');
                
                // Log analysis results for debugging
                console.log('Analysis complete. All items:', allAnalyses);
                allAnalyses.forEach((analysis, idx) => {
                  if (analysis?.analysis) {
                    console.log(`Item ${idx + 1}:`, {
                      category: analysis.analysis.category,
                      item_type: analysis.analysis.item_type,
                      filename: analysis.saved_filename || analysis.analysis.suggested_filename,
                      original: analysis.original_filename
                    });
                  }
                });
                
                // Update all items with their final status
                setAnalyzedItems(prev => prev.map((item, idx) => {
                  const analysis = allAnalyses[idx];
                  if (analysis?.error) {
                    return { ...item, ...analysis, status: 'error' as const };
                  } else if (analysis?.analysis) {
                    const category = analysis.analysis.category || 'unknown';
                    const itemType = analysis.analysis.item_type || '';
                    const filename = analysis.saved_filename || analysis.analysis?.suggested_filename || analysis.original_filename;
                    
                    console.log(`Updating item ${idx + 1} display:`, { category, itemType, filename });
                    
                    const fileUrl = analysis.file_url || '';
                    
                    // Store the file URL for image display
                    if (fileUrl) {
                      setSavedFileUrls(prev => {
                        const newMap = new Map(prev);
                        newMap.set(idx, fileUrl);
                        return newMap;
                      });
                    }
                    
                    return { 
                      ...item, 
                      ...analysis, 
                      status: 'success' as const,
                      // Ensure category and item_type are properly set
                      analysis: {
                        ...item.analysis,
                        ...analysis.analysis,
                        category: category,
                        item_type: itemType
                      },
                      saved_filename: filename,
                      file_url: fileUrl
                    };
                  }
                  return item;
                }));
              } else if (data.type === 'error') {
                throw new Error(data.error || 'Analysis failed');
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', e, line);
            }
          }
        }
      }

      // Use saved files from server if available, otherwise create File objects
      const processedFiles: File[] = [];
      const API_URL_PROCESS = API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      for (let idx = 0; idx < selectedFiles.length; idx++) {
        const file = selectedFiles[idx];
        const item = allAnalyses[idx];
        const analysis = item?.analysis;
        
        if (analysis && item?.file_url) {
          // File was saved on server - fetch it and create File object
          try {
            const fileUrl = item.file_url.startsWith('http') 
              ? item.file_url 
              : `${API_URL_PROCESS}${item.file_url}`;
            
            const response = await fetch(fileUrl);
            const blob = await response.blob();
            const savedFilename = item.saved_filename || analysis.suggested_filename || file.name;
            const newFile = new File([blob], savedFilename, { type: blob.type || file.type });
            
            // Attach metadata to the file object
            (newFile as any).metadata = analysis.metadata || {};
            (newFile as any).detailed_description = analysis.detailed_description;
            (newFile as any).category = analysis.category;
            (newFile as any).item_type = analysis.item_type;
            (newFile as any).file_url = fileUrl; // Store URL for try-on API
            (newFile as any).saved_filename = savedFilename;
            
            processedFiles.push(newFile);
          } catch (error) {
            console.warn(`Failed to fetch saved file for ${file.name}, using original:`, error);
            // Fallback to original file
            const newFile = new File([file], analysis.suggested_filename || file.name, { type: file.type });
            (newFile as any).metadata = analysis.metadata || {};
            (newFile as any).detailed_description = analysis.detailed_description;
            (newFile as any).category = analysis.category;
            (newFile as any).item_type = analysis.item_type;
            processedFiles.push(newFile);
          }
        } else if (analysis) {
          // Analysis available but file not saved - create File with suggested name
          const suggestedName = analysis.suggested_filename || file.name;
          const newFile = new File([file], suggestedName, { type: file.type });
          
          // Attach metadata to the file object
          (newFile as any).metadata = analysis.metadata || {};
          (newFile as any).detailed_description = analysis.detailed_description;
          (newFile as any).category = analysis.category;
          (newFile as any).item_type = analysis.item_type;
          
          processedFiles.push(newFile);
        } else {
          // No analysis available - use original file
          processedFiles.push(file);
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

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleBulkDrop}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isAnalyzing 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }
        `}
      >
        {isAnalyzing ? (
          <div className="flex flex-col items-center w-full">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-4" />
            <p className="text-sm font-medium text-gray-700 mb-4">{analysisProgress}</p>
            {/* Progress Bar - Enhanced visibility */}
            <div className="w-full max-w-md px-4">
              <div className="w-full bg-gray-200 rounded-full h-3 mb-2 shadow-inner">
                <div 
                  className="bg-blue-500 h-3 rounded-full transition-all duration-500 ease-out shadow-md"
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
          <label className="cursor-pointer block">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <span className="mt-4 block text-base font-medium text-gray-900">
              Upload 1-5 clothing items at once
            </span>
            <span className="mt-2 block text-sm text-gray-500">
              Drag and drop images here or click to select. Items will be analyzed and categorized automatically.
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {analyzedItems.map((item, idx) => {
            const file = uploadedFiles[idx];
            const isSuccess = item.status === 'success' && item.analysis;
            const isError = item.status === 'error' || item.error;
            const isAnalyzing = item.status === 'analyzing';
            
            return (
              <div
                key={idx}
                className={`
                  border-2 rounded-lg p-3 transition-all
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
                  <div className="space-y-2">
                    <img
                      src={
                        item.file_url 
                          ? (item.file_url.startsWith('http') 
                              ? item.file_url 
                              : `${API_URL}${item.file_url}`)
                          : (file ? URL.createObjectURL(file) : '')
                      }
                      alt={item.saved_filename || item.analysis?.suggested_filename || item.original_filename}
                      className="w-full h-32 object-cover rounded"
                      onError={(e) => {
                        // Fallback to original file if saved URL fails
                        if (item.file_url && file) {
                          (e.target as HTMLImageElement).src = URL.createObjectURL(file);
                        }
                      }}
                    />
                    <div className="text-xs">
                      <p className="font-medium text-gray-900 truncate mb-1" title={item.saved_filename || item.analysis?.suggested_filename || item.original_filename}>
                        {item.saved_filename || item.analysis?.suggested_filename || item.original_filename}
                      </p>
                      {isAnalyzing && (
                        <p className="text-blue-600 mt-1 font-medium">Analyzing...</p>
                      )}
                      {isSuccess && (
                        <div className="mt-1 space-y-0.5">
                          <p className="text-green-700 font-bold text-xs uppercase">
                            ✓ {item.analysis?.category?.replace(/_/g, ' ') || 'Analyzed'}
                          </p>
                          {item.analysis?.item_type && (
                            <p className="text-gray-600 text-[10px] font-medium">
                              {item.analysis.item_type}
                            </p>
                          )}
                          {item.saved_filename && (
                            <p className="text-gray-400 text-[9px] mt-0.5 truncate" title="Saved filename">
                              Saved
                            </p>
                          )}
                        </div>
                      )}
                      {isError && (
                        <p className="text-red-600 mt-1 font-medium">✗ Failed</p>
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

