import React, { useState, useRef, useCallback } from 'react';
import { RotateCcw, RotateCw, ZoomIn, ZoomOut, Trash2, Maximize2, X } from 'lucide-react';

const ImageRotator: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const loadImage = useCallback((src: string) => {
    setImageSrc(src);
    setRotation(0);
    setScale(1);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const blob = items[i].getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = (ev) => loadImage(ev.target?.result as string);
        reader.readAsDataURL(blob);
        break;
      }
    }
  }, [loadImage]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    setScale(prev => Math.min(Math.max(prev + dir * 0.1, 0.1), 10));
  };

  const rotateCW = () => setRotation(r => (r + 90) % 360);
  const rotateCCW = () => setRotation(r => (r - 90 + 360) % 360);
  const resetZoom = () => setScale(1);
  const resetRot = () => setRotation(0);
  const clearImage = () => { setImageSrc(null); setRotation(0); setScale(1); setFullscreen(false); };

  const transform = `rotate(${rotation}deg) scale(${scale})`;

  return (
    <div
      className="p-4 md:p-6"
      onPaste={handlePaste}
      tabIndex={0}
      style={{ outline: 'none' }}
    >
      <div className="max-w-3xl mx-auto">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Image Rotator</h2>
            <p className="text-sm text-slate-500 mt-0.5">Paste, drag, or upload an image to rotate and zoom</p>
          </div>
          {imageSrc && (
            <button
              onClick={clearImage}
              className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>

        {!imageSrc ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-4 py-20 transition-colors cursor-pointer ${
              isDragging ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-slate-50 hover:border-orange-300 hover:bg-orange-50/50'
            }`}
            onClick={() => document.getElementById('img-file-input')?.click()}
          >
            <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-slate-700 font-semibold">Paste or drop an image</p>
              <p className="text-slate-400 text-sm mt-1">Ctrl+V · Drag & Drop · Click to browse</p>
              <p className="text-slate-300 text-xs mt-1">Scroll to zoom · Arrow keys to rotate</p>
            </div>
            <input
              id="img-file-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5">
            {/* Image container */}
            <div
              className="w-full bg-slate-900 rounded-2xl border border-slate-200 shadow-lg overflow-hidden relative"
              style={{ height: '60vh', minHeight: 300 }}
              onWheel={handleWheel}
            >
              <img
                src={imageSrc}
                alt="Rotated"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  position: 'absolute' as const,
                  top: '50%',
                  left: '50%',
                  transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`,
                  transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  userSelect: 'none' as const,
                }}
                draggable={false}
              />
              <button
                onClick={() => setFullscreen(true)}
                className="absolute bottom-3 right-3 p-2.5 bg-black/50 backdrop-blur-sm border border-white/10 rounded-xl text-white hover:bg-black/70 transition-colors"
                title="Fullscreen"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">
              <button
                onClick={rotateCCW}
                className="flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl text-orange-600 hover:bg-orange-50 transition-colors"
                title="Rotate Left"
              >
                <RotateCcw className="h-5 w-5" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Left</span>
              </button>

              <div className="w-px h-8 bg-slate-100" />

              <button
                onClick={resetRot}
                className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors"
                title="Click to reset rotation"
              >
                <span className="text-xl font-bold font-mono text-slate-800">{rotation}°</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Rotation</span>
              </button>

              <div className="w-px h-8 bg-slate-100" />

              <button
                onClick={resetZoom}
                className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors"
                title="Click to reset zoom"
              >
                <span className="text-xl font-bold font-mono text-slate-800">{Math.round(scale * 100)}%</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Zoom</span>
              </button>

              <div className="w-px h-8 bg-slate-100" />

              <button
                onClick={rotateCW}
                className="flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl text-orange-600 hover:bg-orange-50 transition-colors"
                title="Rotate Right"
              >
                <RotateCw className="h-5 w-5" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Right</span>
              </button>
            </div>

            <p className="text-xs text-slate-400">Scroll to zoom · Arrow keys to rotate · Click values to reset</p>
          </div>
        )}
      </div>

      {/* Fullscreen overlay */}
      {fullscreen && imageSrc && (
        <div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          onWheel={(e) => {
            e.preventDefault();
            const dir = e.deltaY > 0 ? -1 : 1;
            setScale(prev => Math.min(Math.max(prev + dir * 0.1, 0.1), 10));
          }}
        >
          <img
            src={imageSrc}
            alt="Fullscreen"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              transform: `rotate(${rotation}deg) scale(${scale})`,
              transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              userSelect: 'none',
            }}
            draggable={false}
          />
          <button
            onClick={() => setFullscreen(false)}
            className="absolute top-5 right-5 p-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-5 bg-white/10 backdrop-blur-md border border-white/10 rounded-3xl px-7 py-3.5">
            <button onClick={rotateCCW} className="text-slate-300 hover:text-orange-400 transition-colors p-1">
              <RotateCcw className="h-5 w-5" />
            </button>
            <div className="flex flex-col items-center min-w-[80px]">
              <span className="text-lg font-bold font-mono text-white">{rotation}°</span>
              <button onClick={resetZoom} className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-orange-400 transition-colors">
                {Math.round(scale * 100)}% Zoom
              </button>
            </div>
            <button onClick={rotateCW} className="text-slate-300 hover:text-orange-400 transition-colors p-1">
              <RotateCw className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageRotator;
