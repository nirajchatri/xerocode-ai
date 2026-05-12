export interface StyleOption {
  id: string;
  name: string;
  description: string;
  promptSuffix: string;
  previewColor: string;
}

export interface GeneratedImage {
  imageUrl: string;
  timestamp: number;
}

export enum AppState {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  GENERATING = 'GENERATING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
