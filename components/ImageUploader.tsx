import React, { useRef, useState } from 'react';
import { Upload, Image as ImageIcon, X } from 'lucide-react';

interface ImageUploaderProps {
  onImageSelect: (base64: string) => void;
  onClear: () => void;
  selectedImage: string | null;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageSelect, onClear, selectedImage }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          onImageSelect(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFile(e.target.files[0]);
    }
  };

  if (selectedImage) {
    return (
      <div className="relative group rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
        <img 
          src={selectedImage} 
          alt="Original Product" 
          className="w-full h-64 object-contain p-4 bg-slate-50"
        />
        <button
          onClick={onClear}
          className="absolute top-2 right-2 p-2 bg-white/90 rounded-full shadow-md text-slate-600 hover:text-red-500 transition-colors backdrop-blur-sm"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="absolute bottom-2 left-2 px-3 py-1 bg-black/70 text-white text-xs rounded-full backdrop-blur-sm">
          Original
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-xl h-64 flex flex-col items-center justify-center cursor-pointer transition-all duration-200
        ${isDragging 
          ? 'border-indigo-500 bg-indigo-50/50' 
          : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
        }
      `}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleChange}
        accept="image/*"
        className="hidden"
      />
      <div className="p-4 rounded-full bg-slate-100 mb-4 group-hover:scale-110 transition-transform">
        <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-500" />
      </div>
      <p className="text-sm font-medium text-slate-700">Click to upload product photo</p>
      <p className="text-xs text-slate-500 mt-2">or drag and drop here</p>
    </div>
  );
};
