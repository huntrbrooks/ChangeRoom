import React from 'react';
import { UploadZone } from './UploadZone';

interface WardrobeSelectorProps {
  items: (File | null)[];
  onItemSelect: (index: number, file: File) => void;
}

export const WardrobeSelector: React.FC<WardrobeSelectorProps> = ({ items, onItemSelect }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {items.map((item, index) => (
        <UploadZone
          key={index}
          label={`Item ${index + 1}`}
          selectedFile={item}
          onFileSelect={(file) => onItemSelect(index, file)}
        />
      ))}
    </div>
  );
};

