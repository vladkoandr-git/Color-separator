export enum SeparationMode {
  CMYK = 'CMYK',
  SPOT = 'SPOT'
}

export interface SpotColor {
  id: string;
  name: string;
  color: string; // Hex code
  threshold: number; // 0-100 sensitivity
}

export interface ChannelResult {
  name: string;
  dataUrl: string; // Base64 image
  colorHex: string; // Representative color for UI
}

export type BgRemoveMode = 'white' | 'black' | 'custom' | 'auto';

export interface ImageAdjustments {
  brightness: number; // -100 to 100
  contrast: number;   // -100 to 100
  gamma: number;      // 0.1 to 3.0
  removeBg: boolean;
  bgRemoveMode: BgRemoveMode; // New: Mode selection
  customBgColor: string;      // New: For custom mode
  bgThreshold: number;        // 0 to 100 (Sensitivity)
}

export interface ProcessingConfig {
  mode: SeparationMode;
  spotColors: SpotColor[];
  includeWhiteBase?: boolean;
  adjustments: ImageAdjustments;
}