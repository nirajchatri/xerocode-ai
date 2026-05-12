import { StyleOption } from './types';

export const STYLE_OPTIONS: StyleOption[] = [
  {
    id: 'studio-minimal',
    name: 'Studio Minimal',
    description: 'Clean, solid background with professional soft lighting.',
    promptSuffix: 'Place the product on a clean, minimal studio background. Use soft, professional studio lighting to highlight the product details. High key photography, commercial aesthetic.',
    previewColor: 'bg-gray-100'
  },
  {
    id: 'luxury-dark',
    name: 'Luxury Dark',
    description: 'Elegant dark tones with dramatic rim lighting.',
    promptSuffix: 'Place the product in a luxurious, dark setting. Use dramatic rim lighting and moody atmosphere. Elegant, premium, high-end product photography.',
    previewColor: 'bg-slate-800'
  },
  {
    id: 'nature-fresh',
    name: 'Nature Fresh',
    description: 'Outdoor natural setting with sunlight and greenery.',
    promptSuffix: 'Place the product in a fresh, natural outdoor setting with blurred greenery in the background. Natural sunlight, warm tones, organic feel.',
    previewColor: 'bg-green-100'
  },
  {
    id: 'urban-street',
    name: 'Urban Street',
    description: 'Modern city vibes with concrete textures.',
    promptSuffix: 'Place the product in a modern urban street setting. Concrete textures, city lights bokeh in background. Streetwear aesthetic, cool tones.',
    previewColor: 'bg-zinc-300'
  },
  {
    id: 'pastel-pop',
    name: 'Pastel Pop',
    description: 'Bright, colorful, and playful artistic background.',
    promptSuffix: 'Place the product on a playful, pastel colored background with abstract geometric shapes. Bright, cheerful, pop-art style.',
    previewColor: 'bg-pink-100'
  },
  {
    id: 'kitchen-lifestyle',
    name: 'Kitchen Lifestyle',
    description: 'Cozy kitchen counter setting for home goods.',
    promptSuffix: 'Place the product on a modern marble kitchen counter. Soft morning light, blurred kitchen background. Lifestyle photography, cozy home atmosphere.',
    previewColor: 'bg-orange-50'
  }
];

export const MODEL_NAME = 'gemini-2.5-flash-image';
