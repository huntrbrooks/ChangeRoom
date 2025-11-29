import React, { useCallback, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import axios from 'axios';

interface AnalyzedItem {
  index: number;
  original_filename: string;
  analysis: {
    category: string;
    detailed_description: string;
    suggested_filename: string;
    metadata: any;
  };
  error?: string;
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

    try {
      // Create FormData with all files
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append('clothing_images', file);
      });

      // Use fetch for Server-Sent Events (SSE) streaming
      const response = await fetch(`${API_URL}/api/analyze-clothing`, {
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
      let analyses: AnalyzedItem[] = [];

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
              } else if (data.type === 'complete') {
                analyses = data.items as AnalyzedItem[];
                setProgressPercent(100);
                setAnalysisProgress('Analysis complete!');
              } else if (data.type === 'error') {
                throw new Error(data.error || 'Analysis failed');
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', e, line);
            }
          }
        }
      }

      // Create new File objects with suggested names and attach metadata
      const processedFiles: File[] = [];
      selectedFiles.forEach((file, idx) => {
        const analysis = analyses[idx]?.analysis;
        if (analysis) {
          // Create a new File with the suggested filename
          const suggestedName = analysis.suggested_filename || file.name;
          const newFile = new File([file], suggestedName, { type: file.type });
          
          // Attach metadata to the file object (stored in a custom property)
          (newFile as any).metadata = analysis.metadata;
          (newFile as any).detailed_description = analysis.detailed_description;
          (newFile as any).category = analysis.category;
          
          processedFiles.push(newFile);
        } else {
          processedFiles.push(file);
        }
      });

      // Call the upload handler
      onFilesUploaded(processedFiles, analyses);
    } catch (error: any) {
      console.error('Error analyzing clothing items:', error);
      setAnalysisProgress(`Error: ${error.message || 'Analysis failed'}`);
      setProgressPercent(0);
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
          <p className="text-sm text-gray-600 mb-3">{analysisProgress}</p>
          {/* Progress Bar */}
          <div className="w-full max-w-md">
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
              <div 
                className="bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 text-center">{progressPercent}%</p>
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
  );
};

