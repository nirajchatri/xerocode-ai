import React, { useState } from 'react';
import { Download, Save, CheckCircle, Share2, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ResultViewProps {
  imageUrl: string;
  onReset: () => void;
}

export const ResultView: React.FC<ResultViewProps> = ({ imageUrl, onReset }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `product-lens-ai-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveToDrive = () => {
    // Simulation of Google Drive Save
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 1500);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="relative bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-slate-50 p-8 flex items-center justify-center min-h-[400px]">
          <img 
            src={imageUrl} 
            alt="Generated Marketing Asset" 
            className="max-w-full max-h-[600px] rounded-lg shadow-2xl"
          />
        </div>
        
        <div className="p-6 bg-white border-t border-slate-100">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Button 
                onClick={handleDownload} 
                variant="primary" 
                leftIcon={<Download className="w-4 h-4" />}
                className="flex-1 md:flex-none"
              >
                Download PNG
              </Button>
              <Button 
                onClick={handleSaveToDrive} 
                variant="secondary"
                leftIcon={saved ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Save className="w-4 h-4" />}
                disabled={saved}
                isLoading={isSaving}
                className="flex-1 md:flex-none"
              >
                {saved ? 'Saved to Drive' : 'Save to Drive'}
              </Button>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <Button 
                onClick={onReset} 
                variant="ghost" 
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Create New
              </Button>
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-400 text-center md:text-left">
            * "Save to Drive" simulates the API call. In a production environment with proper OAuth scopes, this would upload directly to your Google Drive.
          </div>
        </div>
      </div>
    </div>
  );
};
