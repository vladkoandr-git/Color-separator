import { ChannelResult, SpotColor, ImageAdjustments } from '../types';

// Helper to load image
export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
};

/**
 * Calculates Euclidean distance between two hex colors in RGB space.
 */
const getColorDistance = (hex1: string, hex2: string): number => {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);

  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);

  return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
};

/**
 * Extracts dominant colors from an image using quantization and distance filtering
 * to ensure visually distinct suggestions. Default limited to 4 colors.
 */
export const extractDominantColors = async (imageSrc: string, count: number = 4): Promise<string[]> => {
  try {
    const img = await loadImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    
    // Resize to small dimension for performance (e.g. 100x100)
    const size = 100;
    canvas.width = size;
    canvas.height = size;
    ctx.drawImage(img, 0, 0, size, size);
    
    const data = ctx.getImageData(0, 0, size, size).data;
    const colorCounts: Record<string, number> = {};
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      const a = data[i+3];
      
      if (a < 128) continue; // Skip transparent/semi-transparent pixels
      
      // Quantize colors (group similar colors by rounding to nearest 24)
      const step = 24;
      const qR = Math.round(r / step) * step;
      const qG = Math.round(g / step) * step;
      const qB = Math.round(b / step) * step;
      
      // Ensure range 0-255
      const fR = Math.min(255, Math.max(0, qR));
      const fG = Math.min(255, Math.max(0, qG));
      const fB = Math.min(255, Math.max(0, qB));

      // Convert to Hex
      const hex = `#${((1 << 24) + (fR << 16) + (fG << 8) + fB).toString(16).slice(1)}`;
      colorCounts[hex] = (colorCounts[hex] || 0) + 1;
    }
    
    // Sort by frequency
    const sortedColors = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([hex]) => hex);
    
    // Filter for visually distinct colors
    const distinctColors: string[] = [];
    const minDistance = 60; // Euclidean distance threshold (approx 13% of max distance)

    for (const color of sortedColors) {
      if (distinctColors.length >= count) break;
      
      let isDistinct = true;
      for (const existing of distinctColors) {
        if (getColorDistance(existing, color) < minDistance) {
          isDistinct = false;
          break;
        }
      }

      if (isDistinct) {
        distinctColors.push(color);
      }
    }
    
    return distinctColors;
  } catch (e) {
    console.error("Error extracting colors", e);
    return [];
  }
};

/**
 * Applies Brightness, Contrast, Gamma, Background Removal, and User Mask.
 * Returns a new Canvas with the processed image.
 * 
 * @param img Source image
 * @param adj Adjustment settings
 * @param userMask Optional canvas where Red=Erase, Green=Keep
 */
export const applyAttributes = (
  img: HTMLImageElement | HTMLCanvasElement, 
  adj: ImageAdjustments,
  userMask?: HTMLCanvasElement | null
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.drawImage(img, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Get Mask Data if available
  let maskData: Uint8ClampedArray | null = null;
  if (userMask) {
    const mCtx = userMask.getContext('2d');
    if (mCtx) {
      // Ensure mask is same size (it should be from App.tsx, but safety check)
      if (userMask.width === canvas.width && userMask.height === canvas.height) {
        maskData = mCtx.getImageData(0, 0, canvas.width, canvas.height).data;
      }
    }
  }

  // Pre-calculate contrast factor
  const contrastFactor = (259 * (adj.contrast + 255)) / (255 * (259 - adj.contrast));

  // Determine target background color for removal
  let targetR = 255;
  let targetG = 255;
  let targetB = 255;
  
  if (adj.removeBg) {
    if (adj.bgRemoveMode === 'black') {
      targetR = 0; targetG = 0; targetB = 0;
    } else if (adj.bgRemoveMode === 'custom') {
      targetR = parseInt(adj.customBgColor.slice(1, 3), 16);
      targetG = parseInt(adj.customBgColor.slice(3, 5), 16);
      targetB = parseInt(adj.customBgColor.slice(5, 7), 16);
    } else if (adj.bgRemoveMode === 'auto') {
      // Sample the top-left pixel as the background color
      targetR = data[0];
      targetG = data[1];
      targetB = data[2];
    }
  }

  // Pre-calculate squared tolerance for distance check
  const tolerance = (adj.bgThreshold / 100) * 442;
  const toleranceSq = tolerance * tolerance;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    let a = data[i + 3];

    // 1. Brightness
    r += adj.brightness;
    g += adj.brightness;
    b += adj.brightness;

    // 2. Contrast
    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    // 3. Gamma
    if (adj.gamma !== 1) {
      r = 255 * Math.pow(Math.max(0, Math.min(255, r)) / 255, 1 / adj.gamma);
      g = 255 * Math.pow(Math.max(0, Math.min(255, g)) / 255, 1 / adj.gamma);
      b = 255 * Math.pow(Math.max(0, Math.min(255, b)) / 255, 1 / adj.gamma);
    }

    // Clamp values
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));

    // 4. Background Removal & Masking
    
    // Check User Mask First
    let forceRemove = false;
    let forceKeep = false;

    if (maskData) {
      // Red channel > 0 means Erase
      if (maskData[i] > 10) forceRemove = true;
      // Green channel > 0 means Keep/Restore
      if (maskData[i + 1] > 10) forceKeep = true;
    }

    if (forceRemove) {
      a = 0;
    } else if (forceKeep) {
      // Do nothing, keep 'a' as is (opaque or original alpha), skip auto removal
    } else if (adj.removeBg) {
      // Apply Auto Removal Logic
      if (adj.bgRemoveMode === 'white') {
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        const cutoff = 255 - (adj.bgThreshold * 2.5);
        if (luminance > cutoff) a = 0;
      } else {
        const distSq = 
          (r - targetR) * (r - targetR) + 
          (g - targetG) * (g - targetG) + 
          (b - targetB) * (b - targetB);
        
        if (distSq <= toleranceSq) {
          a = 0;
        }
      }
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

/**
 * Creates a PNG where Alpha channel represents ink density.
 * Now forces BLACK ink to create a "grayscale" film positive look.
 */
const createChannelImage = (
  width: number, 
  height: number, 
  densityData: Uint8ClampedArray,
  colorHex: string // Kept for interface consistency, but ignored for pixel color
): string => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imageData = ctx.createImageData(width, height);
  
  // Force Black (0,0,0) for the channel color to represent Ink Density on film
  const rC = 0;
  const gC = 0;
  const bC = 0;

  for (let i = 0; i < densityData.length; i++) {
    const density = densityData[i]; 
    const idx = i * 4;
    imageData.data[idx] = rC;     
    imageData.data[idx + 1] = gC; 
    imageData.data[idx + 2] = bC; 
    imageData.data[idx + 3] = density; 
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
};

export const processWhiteBase = async (imageSrc: string, adjustments: ImageAdjustments, userMask?: HTMLCanvasElement | null): Promise<ChannelResult> => {
  const img = await loadImage(imageSrc);
  const processedCanvas = applyAttributes(img, adjustments, userMask);
  
  const ctx = processedCanvas.getContext('2d');
  if (!ctx) throw new Error('Context failed');
  const imageData = ctx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
  const px = imageData.data;
  const len = px.length;
  const baseArr = new Uint8ClampedArray(len / 4);

  let hasTransparency = false;
  for (let i = 0; i < len; i += 4) {
    if (px[i+3] < 250) { 
      hasTransparency = true;
      break;
    }
  }

  for (let i = 0; i < len; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const a = px[i + 3];

    let val = 0;
    if (hasTransparency) {
       val = a; 
    } else {
       val = 255 - (0.299 * r + 0.587 * g + 0.114 * b);
    }
    baseArr[i / 4] = val;
  }

  return { 
    name: 'White Underbase', 
    colorHex: '#e2e8f0', 
    dataUrl: createChannelImage(processedCanvas.width, processedCanvas.height, baseArr, '#e2e8f0') 
  };
};

export const processCMYK = async (imageSrc: string, adjustments: ImageAdjustments, userMask?: HTMLCanvasElement | null): Promise<ChannelResult[]> => {
  const img = await loadImage(imageSrc);
  const processedCanvas = applyAttributes(img, adjustments, userMask);
  
  const ctx = processedCanvas.getContext('2d');
  if (!ctx) throw new Error('Context failed');
  const imageData = ctx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
  
  const px = imageData.data;
  const len = px.length;

  const cArr = new Uint8ClampedArray(len / 4);
  const mArr = new Uint8ClampedArray(len / 4);
  const yArr = new Uint8ClampedArray(len / 4);
  const kArr = new Uint8ClampedArray(len / 4);

  for (let i = 0; i < len; i += 4) {
    const alpha = px[i + 3] / 255;
    if (alpha === 0) continue;

    const r = px[i] / 255;
    const g = px[i + 1] / 255;
    const b = px[i + 2] / 255;

    let k = 1 - Math.max(r, g, b);
    let c = (1 - r - k) / (1 - k) || 0;
    let m = (1 - g - k) / (1 - k) || 0;
    let y = (1 - b - k) / (1 - k) || 0;

    const pIndex = i / 4;
    cArr[pIndex] = c * 255 * alpha;
    mArr[pIndex] = m * 255 * alpha;
    yArr[pIndex] = y * 255 * alpha;
    kArr[pIndex] = k * 255 * alpha;
  }

  return [
    { name: 'Cyan', colorHex: '#00FFFF', dataUrl: createChannelImage(processedCanvas.width, processedCanvas.height, cArr, '#00FFFF') },
    { name: 'Magenta', colorHex: '#FF00FF', dataUrl: createChannelImage(processedCanvas.width, processedCanvas.height, mArr, '#FF00FF') },
    { name: 'Yellow', colorHex: '#FFFF00', dataUrl: createChannelImage(processedCanvas.width, processedCanvas.height, yArr, '#FFFF00') },
    { name: 'Key (Black)', colorHex: '#000000', dataUrl: createChannelImage(processedCanvas.width, processedCanvas.height, kArr, '#000000') },
  ];
};

export const processSpotColors = async (imageSrc: string, spotColors: SpotColor[], adjustments: ImageAdjustments, userMask?: HTMLCanvasElement | null): Promise<ChannelResult[]> => {
  const img = await loadImage(imageSrc);
  const processedCanvas = applyAttributes(img, adjustments, userMask);
  
  const ctx = processedCanvas.getContext('2d');
  if (!ctx) throw new Error('Context failed');
  const imageData = ctx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
  
  const px = imageData.data;
  const len = px.length;

  const targets = spotColors.map(sc => {
    const r = parseInt(sc.color.slice(1, 3), 16);
    const g = parseInt(sc.color.slice(3, 5), 16);
    const b = parseInt(sc.color.slice(5, 7), 16);
    return { r, g, b, ...sc };
  });

  const channels = targets.map(() => new Uint8ClampedArray(len / 4));

  for (let i = 0; i < len; i += 4) {
    const alpha = px[i + 3] / 255;
    if (alpha === 0) continue;

    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];

    targets.forEach((target, idx) => {
      const dist = Math.sqrt(
        Math.pow(target.r - r, 2) +
        Math.pow(target.g - g, 2) +
        Math.pow(target.b - b, 2)
      );

      const maxDist = 442;
      const sensitivity = 1 + (target.threshold / 20); 
      
      let similarity = 1 - (dist / (maxDist / sensitivity));
      if (similarity < 0) similarity = 0;

      similarity = Math.pow(similarity, 3); 
      channels[idx][i / 4] = similarity * 255 * alpha;
    });
  }

  return targets.map((t, idx) => ({
    name: t.name,
    colorHex: t.color,
    dataUrl: createChannelImage(processedCanvas.width, processedCanvas.height, channels[idx], t.color)
  }));
};