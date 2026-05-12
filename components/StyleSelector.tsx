import React from 'react';
import { STYLE_OPTIONS } from '../constants';
import { StyleOption } from '../types';
import { Check } from 'lucide-react';

interface StyleSelectorProps {
  selectedStyle: StyleOption;
  onSelect: (style: StyleOption) => void;
  customPrompt: string;
  onCustomPromptChange: (text: string) => void;
}

export const StyleSelector: React.FC<StyleSelectorProps> = ({
  selectedStyle,
  onSelect,
  customPrompt,
  onCustomPromptChange
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-3">Choose a Theme</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {STYLE_OPTIONS.map((style) => (
            <button
              key={style.id}
              onClick={() => onSelect(style)}
              className={`
                relative p-4 rounded-xl text-left transition-all duration-200 border
                ${selectedStyle.id === style.id 
                  ? 'border-indigo-600 ring-1 ring-indigo-600 bg-indigo-50/30' 
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }
              `}
            >
              <div className={`w-full h-20 rounded-lg mb-3 ${style.previewColor} flex items-center justify-center opacity-80`}>
                 {/* Visual abstraction of the style */}
                 <div className="w-8 h-8 rounded-full bg-white/50 mix-blend-overlay"></div>
              </div>
              <p className="font-medium text-slate-900 text-sm">{style.name}</p>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{style.description}</p>
              
              {selectedStyle.id === style.id && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-3">Custom Instructions (Optional)</h3>
        <textarea
          value={customPrompt}
          onChange={(e) => onCustomPromptChange(e.target.value)}
          placeholder="E.g., Make it look like it's floating in space, or add autumn leaves around it..."
          className="w-full p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-h-[100px] text-sm resize-y"
        />
      </div>
    </div>
  );
};
