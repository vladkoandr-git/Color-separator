import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Layers, Upload, Settings2, Download, Plus, Trash2, ArrowRight, RefreshCw, Image as ImageIcon, X, Sliders, Eraser, Droplet, Zap, Paintbrush, Ban, ShieldCheck, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { SeparationMode, SpotColor, ChannelResult, ImageAdjustments, BgRemoveMode } from './types';
import { processCMYK, processSpotColors, processWhiteBase, loadImage, applyAttributes, extractDominantColors } from './services/imageProcessor';
import { Button } from './components/Button';

// Default spot colors example
const DEFAULT_SPOTS: SpotColor[] = [
  { id: '1', name: 'Ярко-Зеленый', color: '#00ff00', threshold: 50 },
  { id: '2', name: 'Оранжевый', color: '#ff8800', threshold: 50 },
  { id: '3', name: 'Фиолетовый', color: '#9d00ff', threshold: 50 },
];

const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  gamma: 1.0,
  removeBg: false,
  bgRemoveMode: 'white',
  customBgColor: '#000000',
  bgThreshold: 20
};

type BrushType = 'remove' | 'keep';

function App() {
  // State
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null); // Keeps the raw upload
  const [processedPreview, setProcessedPreview] = useState<string | null>(null); // Shows the edited version
  const [mode, setMode] = useState<SeparationMode>(SeparationMode.CMYK);
  const [spotColors, setSpotColors] = useState<SpotColor[]>(DEFAULT_SPOTS);
  const [suggestedColors, setSuggestedColors] = useState<string[]>([]);
  const [results, setResults] = useState<ChannelResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newColorHex, setNewColorHex] = useState('#000000');
  const [includeWhiteBase, setIncludeWhiteBase] = useState(false);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(DEFAULT_ADJUSTMENTS);
  
  // Masking State
  const [isMaskingMode, setIsMaskingMode] = useState(false);
  const [brushType, setBrushType] = useState<BrushType>('remove');
  const [brushSize, setBrushSize] = useState(20);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [cursorPos, setCursorPos] = useState<{x: number, y: number} | null>(null);
  const [visualBrushSize, setVisualBrushSize] = useState(20);

  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const lastPanPoint = useRef({ x: 0, y: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          const src = ev.target.result as string;
          setOriginalImageSrc(src);
          setProcessedPreview(src); // Initially same as original
          setAdjustments(DEFAULT_ADJUSTMENTS);
          setZoom(1);
          setPan({ x: 0, y: 0 });
          
          // Extract suggested colors
          extractDominantColors(src).then(colors => setSuggestedColors(colors));

          // Clear mask canvas if it exists
          if (maskCanvasRef.current) {
            const ctx = maskCanvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
          }
          
          setStep(2);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const updatePreview = useCallback(async () => {
    if (!originalImageSrc) return;
    try {
      const img = await loadImage(originalImageSrc);
      const canvas = applyAttributes(img, adjustments, maskCanvasRef.current);
      setProcessedPreview(canvas.toDataURL());
    } catch (e) {
      console.error("Preview update failed", e);
    }
  }, [originalImageSrc, adjustments]);

  // Live preview effect
  useEffect(() => {
    if (!originalImageSrc || step !== 2) return;

    // Debounce slightly to prevent UI lag on heavy sliders
    const timer = setTimeout(updatePreview, 50);
    return () => clearTimeout(timer);
  }, [updatePreview]);

  // Initialize mask canvas when image loads
  useEffect(() => {
    if (step === 2 && originalImageSrc) {
       loadImage(originalImageSrc).then(img => {
          if (maskCanvasRef.current) {
            maskCanvasRef.current.width = img.width;
            maskCanvasRef.current.height = img.height;
          }
       });
    }
  }, [step, originalImageSrc]);

  // Handle Zoom change
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.5, 4));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.5, 0.5));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };


  // --- Panning Logic ---
  const startPan = (e: React.MouseEvent | React.TouchEvent) => {
    if (isMaskingMode) return; // Don't pan if masking mode is active
    setIsPanning(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    lastPanPoint.current = { x: clientX, y: clientY };
  };

  const doPan = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isPanning) return;
    // Don't prevent default blindly to avoid blocking browser gestures if needed, 
    // but here we want to block scroll
    if (e.cancelable) e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const dx = clientX - lastPanPoint.current.x;
    const dy = clientY - lastPanPoint.current.y;
    
    setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    lastPanPoint.current = { x: clientX, y: clientY };
  };

  const endPan = () => {
    setIsPanning(false);
  };
  // --- End Panning Logic ---


  // --- Drawing Logic ---
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!maskCanvasRef.current || !isMaskingMode) return;
    
    // Update visual cursor position (Client Coordinates)
    let clientX, clientY;
    if ('touches' in e) {
       clientX = e.touches[0].clientX;
       clientY = e.touches[0].clientY;
    } else {
       clientX = (e as React.MouseEvent).clientX;
       clientY = (e as React.MouseEvent).clientY;
    }
    setCursorPos({ x: clientX, y: clientY });

    // Calculate visual brush size based on current zoom/render scale
    const rect = maskCanvasRef.current.getBoundingClientRect();
    const scale = rect.width / maskCanvasRef.current.width;
    setVisualBrushSize(brushSize * scale);

    if (isDrawing.current) {
      draw(e);
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isMaskingMode || !maskCanvasRef.current) return;
    isDrawing.current = true;
    draw(e);
  };

  const stopDrawing = () => {
    if (isDrawing.current) {
      isDrawing.current = false;
      updatePreview(); // Update processed preview on mouse up
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || !maskCanvasRef.current) return;
    
    if (e.cancelable) e.preventDefault();

    const ctx = maskCanvasRef.current.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e, maskCanvasRef.current);

    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    
    if (brushType === 'remove') {
      ctx.fillStyle = 'rgba(255, 0, 0, 1)'; 
    } else {
      ctx.fillStyle = 'rgba(0, 255, 0, 1)'; 
    }
    
    ctx.fill();
  };

  const clearMask = () => {
    if (maskCanvasRef.current) {
      const ctx = maskCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      updatePreview();
    }
  };

  // --- End Drawing Logic ---


  const handleAddColor = (hex: string = newColorHex) => {
    const newColor: SpotColor = {
      id: Date.now().toString(),
      name: `Цвет ${spotColors.length + 1}`,
      color: hex,
      threshold: 50
    };
    setSpotColors([...spotColors, newColor]);
  };

  const handleRemoveColor = (id: string) => {
    setSpotColors(spotColors.filter(c => c.id !== id));
  };

  const handleProcess = async () => {
    if (!originalImageSrc) return;
    
    setIsProcessing(true);
    // Add small delay to allow UI to show loading state before blocking main thread
    setTimeout(async () => {
      try {
        let res: ChannelResult[] = [];
        const mask = maskCanvasRef.current;
        
        // Process color channels
        if (mode === SeparationMode.CMYK) {
          res = await processCMYK(originalImageSrc, adjustments, mask);
        } else {
          res = await processSpotColors(originalImageSrc, spotColors, adjustments, mask);
        }

        // Process White Base if requested
        if (includeWhiteBase) {
          const whiteBase = await processWhiteBase(originalImageSrc, adjustments, mask);
          // Add white base to the beginning
          res.unshift(whiteBase);
        }

        setResults(res);
        setStep(3);
      } catch (err) {
        console.error("Processing failed", err);
        alert("Ошибка при обработке изображения.");
      } finally {
        setIsProcessing(false);
      }
    }, 100);
  };

  const handleReset = () => {
    setStep(1);
    setResults([]);
    setImageFile(null);
    setOriginalImageSrc(null);
    setProcessedPreview(null);
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setIsMaskingMode(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSuggestedColors([]);
    if (maskCanvasRef.current) {
        const ctx = maskCanvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    }
  };

  const handleDownload = (dataUrl: string, name: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${name}_channel.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-10 text-center">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-2xl mb-4 ring-1 ring-indigo-500/30">
          <Layers className="w-8 h-8 text-indigo-400" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
          Сепарация Каналов
        </h1>
        <p className="text-slate-400 max-w-lg mx-auto">
          Инструмент для подготовки изображений к шелкографии. Разделите изображение на CMYK или произвольные плашечные цвета.
        </p>
      </header>

      {/* Main Content Area */}
      <main className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl relative min-h-[500px] lg:overflow-hidden flex flex-col">
        
        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="h-full flex flex-col items-center justify-center p-12 min-h-[500px] animate-fade-in flex-1">
            <input 
              type="file" 
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full max-w-xl h-64 border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-slate-800/50 transition-all group"
            >
              <div className="p-4 bg-slate-800 rounded-full mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-indigo-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Загрузите изображение</h3>
              <p className="text-slate-500">JPG, PNG (RGB или CMYK)</p>
            </div>
          </div>
        )}

        {/* Step 2: Configure */}
        {step === 2 && processedPreview && (
          <div className="grid grid-cols-1 lg:grid-cols-3 lg:h-full lg:min-h-[600px] flex-1">
            {/* Sidebar Config (Order 2 on mobile, Order 1 on desktop) */}
            <div className="order-2 lg:order-1 p-6 bg-slate-900 border-t lg:border-t-0 lg:border-r border-slate-800 lg:col-span-1 flex flex-col lg:overflow-y-auto custom-scrollbar max-h-[80vh] lg:max-h-none">
              
              {/* Image Adjustments Section */}
              <div className="mb-8 border-b border-slate-800 pb-6">
                 <h2 className="text-lg font-semibold flex items-center gap-2 mb-4 text-indigo-200">
                  <Sliders className="w-5 h-5" />
                  Коррекция изображения
                </h2>
                
                <div className="space-y-4">
                  {/* Brightness */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <label>Яркость</label>
                      <span>{adjustments.brightness}</span>
                    </div>
                    <input 
                      type="range" min="-100" max="100" 
                      value={adjustments.brightness}
                      onChange={(e) => setAdjustments({...adjustments, brightness: Number(e.target.value)})}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>

                  {/* Contrast */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <label>Контраст</label>
                      <span>{adjustments.contrast}</span>
                    </div>
                    <input 
                      type="range" min="-100" max="100" 
                      value={adjustments.contrast}
                      onChange={(e) => setAdjustments({...adjustments, contrast: Number(e.target.value)})}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>

                  {/* Gamma */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <label>Гамма</label>
                      <span>{adjustments.gamma}</span>
                    </div>
                    <input 
                      type="range" min="0.1" max="3" step="0.1"
                      value={adjustments.gamma}
                      onChange={(e) => setAdjustments({...adjustments, gamma: Number(e.target.value)})}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>

                  {/* Background Removal */}
                  <div className="pt-2 bg-slate-800/20 p-3 rounded-lg border border-slate-700/50">
                    <label className="flex items-center gap-2 mb-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={adjustments.removeBg}
                        onChange={(e) => setAdjustments({...adjustments, removeBg: e.target.checked})}
                        className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                      />
                      <span className="text-sm font-semibold text-slate-200">Удаление фона</span>
                    </label>
                    
                    {adjustments.removeBg && (
                      <div className="space-y-3 animate-fade-in pl-1">
                        
                        <div className="grid grid-cols-2 gap-2">
                           <button 
                             onClick={() => setAdjustments({...adjustments, bgRemoveMode: 'white'})}
                             className={`text-xs p-2 rounded border flex items-center justify-center gap-1 ${adjustments.bgRemoveMode === 'white' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                           >
                             Белый
                           </button>
                           <button 
                             onClick={() => setAdjustments({...adjustments, bgRemoveMode: 'black'})}
                             className={`text-xs p-2 rounded border flex items-center justify-center gap-1 ${adjustments.bgRemoveMode === 'black' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                           >
                             Черный
                           </button>
                           <button 
                             onClick={() => setAdjustments({...adjustments, bgRemoveMode: 'auto'})}
                             className={`text-xs p-2 rounded border flex items-center justify-center gap-1 ${adjustments.bgRemoveMode === 'auto' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                           >
                             <Zap className="w-3 h-3" /> Авто
                           </button>
                            <button 
                             onClick={() => setAdjustments({...adjustments, bgRemoveMode: 'custom'})}
                             className={`text-xs p-2 rounded border flex items-center justify-center gap-1 ${adjustments.bgRemoveMode === 'custom' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                           >
                             <Droplet className="w-3 h-3" /> Цвет
                           </button>
                        </div>

                        {adjustments.bgRemoveMode === 'custom' && (
                           <div className="flex items-center gap-2 bg-slate-800 p-2 rounded border border-slate-700">
                             <input 
                               type="color"
                               value={adjustments.customBgColor}
                               onChange={(e) => setAdjustments({...adjustments, customBgColor: e.target.value})}
                               className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                             />
                             <span className="text-xs text-slate-400">Выберите цвет фона</span>
                           </div>
                        )}

                        <div>
                          <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <label>Чувствительность (Допуск)</label>
                            <span>{adjustments.bgThreshold}%</span>
                          </div>
                          <input 
                            type="range" min="0" max="100"
                            value={adjustments.bgThreshold}
                            onChange={(e) => setAdjustments({...adjustments, bgThreshold: Number(e.target.value)})}
                            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                          />
                        </div>

                        {/* Manual Masking Toggle */}
                        <div className="pt-2 border-t border-slate-700/50">
                           <button 
                             onClick={() => setIsMaskingMode(!isMaskingMode)}
                             className={`w-full py-2 px-3 rounded text-xs flex items-center justify-center gap-2 transition-colors ${isMaskingMode ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                           >
                             <Paintbrush className="w-3 h-3" />
                             {isMaskingMode ? 'Завершить маску' : 'Ручная маска (Кисть)'}
                           </button>

                           {isMaskingMode && (
                             <div className="mt-3 space-y-3 p-2 bg-slate-900/50 rounded animate-fade-in">
                               <div className="flex gap-2">
                                 <button 
                                   onClick={() => setBrushType('remove')}
                                   className={`flex-1 p-2 rounded border text-xs flex flex-col items-center gap-1 ${brushType === 'remove' ? 'border-red-500 bg-red-500/20 text-red-200' : 'border-slate-700 text-slate-400'}`}
                                 >
                                    <Ban className="w-4 h-4" /> Удалить
                                 </button>
                                 <button 
                                   onClick={() => setBrushType('keep')}
                                   className={`flex-1 p-2 rounded border text-xs flex flex-col items-center gap-1 ${brushType === 'keep' ? 'border-green-500 bg-green-500/20 text-green-200' : 'border-slate-700 text-slate-400'}`}
                                 >
                                    <ShieldCheck className="w-4 h-4" /> Оставить
                                 </button>
                               </div>
                               <div>
                                 <div className="flex justify-between text-xs text-slate-400 mb-1">
                                   <label>Размер кисти</label>
                                   <span>{brushSize}px</span>
                                 </div>
                                 <input 
                                    type="range" min="5" max="100"
                                    value={brushSize}
                                    onChange={(e) => setBrushSize(Number(e.target.value))}
                                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                  />
                               </div>
                               <button onClick={clearMask} className="text-xs text-red-400 hover:text-red-300 w-full text-center py-1">
                                 Очистить всю маску
                               </button>
                             </div>
                           )}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex justify-end">
                     <button 
                       onClick={() => setAdjustments(DEFAULT_ADJUSTMENTS)}
                       className="text-xs text-slate-500 hover:text-indigo-400 underline"
                     >
                       Сбросить коррекцию
                     </button>
                  </div>
                </div>
              </div>

              {/* Separation Settings Section */}
              <div className="mb-6">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4 text-indigo-200">
                  <Settings2 className="w-5 h-5" />
                  Настройки сепарации
                </h2>
                
                {/* Mode Selection */}
                <div className="flex p-1 bg-slate-800 rounded-lg mb-6">
                  <button 
                    onClick={() => setMode(SeparationMode.CMYK)}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === SeparationMode.CMYK ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    CMYK
                  </button>
                  <button 
                    onClick={() => setMode(SeparationMode.SPOT)}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === SeparationMode.SPOT ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    Выборочные цвета
                  </button>
                </div>
                
                {/* White Base Option */}
                <div className="mb-6 bg-slate-800/30 p-3 rounded-lg border border-slate-700/50">
                  <label className="flex items-center cursor-pointer gap-3">
                    <div className="relative flex items-center">
                      <input 
                        type="checkbox" 
                        checked={includeWhiteBase}
                        onChange={(e) => setIncludeWhiteBase(e.target.checked)}
                        className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 accent-indigo-600"
                      />
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-slate-200">Белая подложка (Underbase)</span>
                      <span className="block text-xs text-slate-500">Для печати на темном текстиле</span>
                    </div>
                  </label>
                </div>

                {/* Spot Config */}
                {mode === SeparationMode.SPOT && (
                  <div className="space-y-4">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-400 mb-1">Добавить цвет</label>
                        <input 
                          type="color" 
                          value={newColorHex}
                          onChange={(e) => setNewColorHex(e.target.value)}
                          className="w-full h-10 rounded cursor-pointer bg-slate-800 border border-slate-700 p-1"
                        />
                      </div>
                      <Button onClick={() => handleAddColor(newColorHex)} variant="secondary">
                        <Plus className="w-5 h-5" />
                      </Button>
                    </div>

                    {/* Suggested Colors */}
                    {suggestedColors.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs text-slate-500 mb-2">Основные цвета:</p>
                        <div className="flex flex-wrap gap-2">
                          {suggestedColors.map(color => (
                            <button
                              key={color}
                              onClick={() => {
                                setNewColorHex(color);
                                handleAddColor(color);
                              }}
                              className="w-6 h-6 rounded-full border border-slate-600 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              style={{ backgroundColor: color }}
                              title={`Добавить ${color}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                      {spotColors.map((sc) => (
                        <div key={sc.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-6 h-6 rounded-full border border-slate-600 shadow-sm"
                              style={{ backgroundColor: sc.color }}
                            />
                            <div>
                              <p className="text-sm font-medium">{sc.name}</p>
                              <p className="text-xs text-slate-500 uppercase">{sc.color}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleRemoveColor(sc.id)}
                            className="text-slate-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {spotColors.length === 0 && (
                        <p className="text-sm text-slate-500 text-center py-4">Нет выбранных цветов</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-auto space-y-3 pt-6 border-t border-slate-800">
                 <Button 
                   fullWidth 
                   onClick={handleProcess}
                   disabled={isProcessing || (mode === SeparationMode.SPOT && spotColors.length === 0)}
                  >
                   {isProcessing ? (
                     <span className="flex items-center gap-2">
                       <RefreshCw className="w-4 h-4 animate-spin" /> Обработка...
                     </span>
                   ) : (
                     <span className="flex items-center gap-2">
                       Разделить каналы <ArrowRight className="w-4 h-4" />
                     </span>
                   )}
                 </Button>
                 <Button fullWidth variant="ghost" onClick={handleReset}>Отмена</Button>
              </div>
            </div>

            {/* Preview Area (Order 1 on mobile, Order 2 on desktop) */}
            <div className="order-1 lg:order-2 lg:col-span-2 bg-slate-950 flex flex-col relative min-h-[400px] overflow-hidden">
              
              {/* Toolbar */}
              <div className="absolute top-4 left-4 z-20 flex gap-2">
                <div className="bg-slate-900/80 backdrop-blur px-3 py-1 rounded text-xs font-mono text-slate-300 pointer-events-none border border-slate-700">
                  Предпросмотр
                </div>
                {/* Zoom Controls */}
                <div className="flex items-center bg-slate-900/80 backdrop-blur rounded border border-slate-700 overflow-hidden">
                  <button onClick={handleZoomOut} className="p-1.5 hover:bg-slate-800 text-slate-300"><ZoomOut className="w-4 h-4" /></button>
                  <span className="px-2 text-xs text-slate-300 border-x border-slate-700 min-w-[3ch] text-center">{Math.round(zoom * 100)}%</span>
                  <button onClick={handleZoomIn} className="p-1.5 hover:bg-slate-800 text-slate-300"><ZoomIn className="w-4 h-4" /></button>
                  <button onClick={handleResetView} className="p-1.5 hover:bg-slate-800 text-slate-300 border-l border-slate-700" title="Сброс вида"><Maximize className="w-4 h-4" /></button>
                </div>
              </div>
              
              {/* Manual Masking Hint */}
              {isMaskingMode && (
                <div className="absolute top-4 right-4 z-20 bg-indigo-600/90 backdrop-blur px-3 py-1 rounded text-xs font-medium text-white shadow-lg animate-pulse border border-indigo-400">
                  Режим маскировки
                </div>
              )}

              {/* Cursor Overlay (Follows mouse) */}
              {isMaskingMode && cursorPos && (
                 <div 
                   className="fixed pointer-events-none rounded-full border-2 border-white/80 shadow-sm z-50 bg-white/10"
                   style={{
                     left: cursorPos.x,
                     top: cursorPos.y,
                     width: visualBrushSize,
                     height: visualBrushSize,
                     transform: 'translate(-50%, -50%)',
                     borderColor: brushType === 'remove' ? 'rgba(255, 100, 100, 0.9)' : 'rgba(100, 255, 100, 0.9)'
                   }}
                 />
              )}

              {/* Scrollable Container with Panning Handlers */}
              <div 
                ref={previewContainerRef} 
                className={`flex-1 overflow-hidden flex items-center justify-center p-0 relative ${isMaskingMode ? '' : 'cursor-grab active:cursor-grabbing'}`}
                onMouseDown={startPan}
                onMouseMove={doPan}
                onMouseUp={endPan}
                onMouseLeave={(e) => {
                  // Only stop panning on leave, not drawing as it might just overshoot
                  endPan();
                  if (isMaskingMode) {
                    setCursorPos(null);
                    stopDrawing();
                  }
                }}
                onTouchStart={startPan}
                onTouchMove={doPan}
                onTouchEnd={endPan}
              >
                <div 
                  className="relative rounded-lg shadow-2xl border border-slate-800 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] transition-transform duration-75 ease-out origin-center"
                  style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                >
                   {/* Checkerboard for transparency */}
                  <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', backgroundSize: '10px 10px'}}></div>
                  
                  {/* Result Preview */}
                  <img 
                    src={processedPreview} 
                    alt="Processed Preview" 
                    className="relative z-10 max-w-none object-contain pointer-events-none select-none"
                    style={{ maxHeight: 'none', maxWidth: 'none' }} 
                  />

                  {/* Mask Canvas Interaction Layer - Only visible/interactive when masking */}
                  <canvas 
                    ref={maskCanvasRef}
                    className={`absolute inset-0 w-full h-full z-20 touch-none ${isMaskingMode ? 'opacity-50 pointer-events-auto cursor-none' : 'opacity-0 pointer-events-none'}`}
                    onMouseDown={startDrawing}
                    onMouseMove={handlePointerMove}
                    onMouseUp={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={handlePointerMove}
                    onTouchEnd={stopDrawing}
                  />
                </div>
              </div>
              
              {/* Footer text */}
               <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
                 <p className="inline-block px-3 py-1 bg-slate-900/60 backdrop-blur rounded-full text-[10px] text-slate-400">
                  {isMaskingMode 
                    ? 'Рисуйте, чтобы скрыть/показать области.' 
                    : 'Перетаскивайте изображение для перемещения. Используйте зум для деталей.'}
                </p>
               </div>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {step === 3 && (
          <div className="flex flex-col h-full min-h-[600px] flex-1">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900">
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={() => setStep(2)} className="!p-2">
                  <ArrowRight className="w-5 h-5 rotate-180" />
                </Button>
                <h2 className="text-xl font-bold">Результат сепарации</h2>
                <div className="flex gap-2">
                  <span className="text-xs px-2 py-1 bg-slate-800 rounded text-slate-400 border border-slate-700">
                    {mode === SeparationMode.CMYK ? 'CMYK' : 'Spot Colors'}
                  </span>
                  <span className="text-xs px-2 py-1 bg-slate-800 rounded text-slate-400 border border-slate-700">
                     PNG (Transparent)
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={handleReset}>
                  <X className="w-4 h-4 mr-2" />
                  Новый проект
                </Button>
              </div>
            </div>

            <div className="flex-1 p-6 bg-slate-950 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {results.map((channel, idx) => (
                  <div key={idx} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden group hover:border-indigo-500/50 transition-colors">
                    <div className="aspect-[4/5] relative bg-white flex items-center justify-center p-4">
                      {/* Light Checkerboard background for transparency reference */}
                      <div className="absolute inset-0" style={{
                          backgroundImage: 'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                          backgroundSize: '20px 20px',
                          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                      }}></div>
                      
                      <img 
                        src={channel.dataUrl} 
                        alt={channel.name} 
                        className="max-w-full max-h-full object-contain shadow-sm relative z-10" 
                      />
                    </div>
                    <div className="p-4 border-t border-slate-800">
                      <div className="flex items-center gap-2 mb-3">
                        <div 
                          className="w-4 h-4 rounded-full border border-slate-600"
                          style={{ backgroundColor: channel.colorHex }}
                        />
                        <span className="font-semibold truncate flex-1">{channel.name}</span>
                      </div>
                      <Button 
                        variant="secondary" 
                        fullWidth 
                        size="sm"
                        onClick={() => handleDownload(channel.dataUrl, channel.name)}
                        className="text-xs"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Скачать PNG
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-8 text-center text-slate-600 text-sm">
        <p>&copy; {new Date().getFullYear()} ScreenPrint Separator. Обработка происходит локально в браузере.</p>
      </footer>
    </div>
  );
}

export default App;