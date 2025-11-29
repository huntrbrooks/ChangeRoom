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

  const handleBulkUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    
    // Limit to 5 files
    const selectedFiles = files.slice(0, 5);
    
    if (files.length > 5) {
      alert(`Only the first 5 files will be uploaded. ${files.length - 5} files were ignored.`);
    }

    setIsAnalyzing(true);
    setAnalysisProgress('Uploading and analyzing clothing items...');

    try {
      // Create FormData with all files
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append('clothing_images', file);
      });

      // Send to analysis endpoint
      const response = await axios.post(`${API_URL}/api/analyze-clothing`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000, // 5 minutes for analysis
      });

      const analyses = response.data.items as AnalyzedItem[];
      
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
      setAnalysisProgress('Analysis complete!');
    } catch (error: any) {
      console.error('Error analyzing clothing items:', error);
      setAnalysisProgress(`Error: ${error.response?.data?.detail || error.message}`);
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
        <div className="flex flex-col items-center">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-2" />
          <p className="text-sm text-gray-600">{analysisProgress}</p>
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

