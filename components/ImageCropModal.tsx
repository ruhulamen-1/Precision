import React, { useEffect, useRef, useState, useCallback } from "react";

interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (image: string) => void;
  imageSrc: string | null;
  mode?: "circle" | "rect"; // circle = profile, rect = dashboard/banner
  aspectRatio?: number;     // only used in rect mode, e.g. 16/9
}

const CANVAS_SIZE = 420;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  onClose,
  onSave,
  imageSrc,
  mode = "circle",
  aspectRatio,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // crop box in canvas coords
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0 });

  // drag state
  const dragRef = useRef<{
    type: "move" | "resize-br" | "resize-tr" | "resize-bl" | "resize-tl" | null;
    startX: number;
    startY: number;
    startBox: { x: number; y: number; w: number; h: number };
  }>({ type: null, startX: 0, startY: 0, startBox: { x: 0, y: 0, w: 0, h: 0 } });

  // init crop box
  const initBox = useCallback((imgEl: HTMLImageElement) => {
    if (mode === "circle") {
      const r = CANVAS_SIZE * 0.38;
      const cx = CANVAS_SIZE / 2;
      const cy = CANVAS_SIZE / 2;
      setBox({ x: cx - r, y: cy - r, w: r * 2, h: r * 2 });
    } else {
      // rect with optional aspect ratio
      const ratio = aspectRatio ?? (imgEl.naturalWidth / imgEl.naturalHeight);
      const margin = CANVAS_SIZE * 0.1;
      let w = CANVAS_SIZE - margin * 2;
      let h = w / ratio;
      if (h > CANVAS_SIZE - margin * 2) {
        h = CANVAS_SIZE - margin * 2;
        w = h * ratio;
      }
      const x = (CANVAS_SIZE - w) / 2;
      const y = (CANVAS_SIZE - h) / 2;
      setBox({ x, y, w, h });
    }
  }, [mode, aspectRatio]);

  // load image
  useEffect(() => {
    if (!isOpen || !imageSrc) return;
    setImgLoaded(false);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
      initBox(img);
    };
    img.src = imageSrc;
  }, [isOpen, imageSrc, initBox]);

  // compute how image fits into canvas (letterbox/pillarbox - no stretch)
  const getImgRect = useCallback((img: HTMLImageElement) => {
    const scale = Math.min(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const x = (CANVAS_SIZE - w) / 2;
    const y = (CANVAS_SIZE - h) / 2;
    return { x, y, w, h };
  }, []);

  // draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgLoaded) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // dark background for letterbox areas
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // draw image with correct aspect ratio (no stretch)
    const ir = getImgRect(img);
    ctx.drawImage(img, ir.x, ir.y, ir.w, ir.h);

    // dim overlay
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const { x, y, w, h } = box;

    // reveal crop area
    ctx.save();
    ctx.beginPath();
    if (mode === "circle") {
      ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.clip();
    ctx.drawImage(img, ir.x, ir.y, ir.w, ir.h);
    ctx.restore();

    // border
    ctx.beginPath();
    if (mode === "circle") {
      ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // rule-of-thirds grid (rect only)
    if (mode === "rect") {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(x + (w / 3) * i, y); ctx.lineTo(x + (w / 3) * i, y + h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + (h / 3) * i); ctx.lineTo(x + w, y + (h / 3) * i); ctx.stroke();
      }
      ctx.setLineDash([]);
    } else {
      // crosshair for circle
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      const cx = x + w / 2; const cy = y + h / 2;
      ctx.beginPath(); ctx.moveTo(cx - w/2, cy); ctx.lineTo(cx + w/2, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - h/2); ctx.lineTo(cx, cy + h/2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // resize handles
    const handles = getHandles(box, mode);
    handles.forEach(([hx, hy]) => {
      ctx.beginPath();
      ctx.arc(hx, hy, 7, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();
      ctx.strokeStyle = "rgba(249,115,22,0.9)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });
  }, [box, imgLoaded, mode]);

  useEffect(() => { draw(); }, [draw]);

  // keyboard
  useEffect(() => {
    if (!isOpen) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [isOpen, onClose]);

  const getCanvasPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CANVAS_SIZE / rect.width),
      y: (e.clientY - rect.top) * (CANVAS_SIZE / rect.height),
    };
  };

  const getHandles = (b: typeof box, m: string): [number, number][] => {
    if (m === "circle") {
      const cx = b.x + b.w / 2; const cy = b.y + b.h / 2; const r = b.w / 2;
      return [[cx + r * Math.cos(Math.PI / 4), cy + r * Math.sin(Math.PI / 4)]];
    }
    return [
      [b.x + b.w, b.y + b.h], // br
      [b.x + b.w, b.y],        // tr
      [b.x, b.y + b.h],        // bl
      [b.x, b.y],              // tl
    ];
  };

  const hitHandle = (pos: { x: number; y: number }, b: typeof box) => {
    if (mode === "circle") {
      const cx = b.x + b.w / 2; const cy = b.y + b.h / 2; const r = b.w / 2;
      const hx = cx + r * Math.cos(Math.PI / 4);
      const hy = cy + r * Math.sin(Math.PI / 4);
      if (Math.hypot(pos.x - hx, pos.y - hy) < 12) return "resize-br";
    } else {
      const corners: [number, number, string][] = [
        [b.x + b.w, b.y + b.h, "resize-br"],
        [b.x + b.w, b.y, "resize-tr"],
        [b.x, b.y + b.h, "resize-bl"],
        [b.x, b.y, "resize-tl"],
      ];
      for (const [hx, hy, type] of corners) {
        if (Math.hypot(pos.x - hx, pos.y - hy) < 12) return type as any;
      }
    }
    return null;
  };

  const hitInside = (pos: { x: number; y: number }, b: typeof box) => {
    if (mode === "circle") {
      return Math.hypot(pos.x - (b.x + b.w / 2), pos.y - (b.y + b.h / 2)) < b.w / 2;
    }
    return pos.x > b.x && pos.x < b.x + b.w && pos.y > b.y && pos.y < b.y + b.h;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    const hit = hitHandle(pos, box);
    if (hit) {
      dragRef.current = { type: hit as any, startX: pos.x, startY: pos.y, startBox: { ...box } };
    } else if (hitInside(pos, box)) {
      dragRef.current = { type: "move", startX: pos.x, startY: pos.y, startBox: { ...box } };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { type, startX, startY, startBox } = dragRef.current;
    const canvas = e.currentTarget as HTMLCanvasElement;

    if (!type) {
      // cursor
      const pos = getCanvasPos(e);
      const hit = hitHandle(pos, box);
      if (hit) canvas.style.cursor = "nwse-resize";
      else if (hitInside(pos, box)) canvas.style.cursor = "move";
      else canvas.style.cursor = "default";
      return;
    }

    const pos = getCanvasPos(e);
    const dx = pos.x - startX;
    const dy = pos.y - startY;
    const ratio = aspectRatio ?? (mode === "circle" ? 1 : null);

    setBox(() => {
      let { x, y, w, h } = startBox;

      if (type === "move") {
        x = clamp(x + dx, 0, CANVAS_SIZE - w);
        y = clamp(y + dy, 0, CANVAS_SIZE - h);
      } else if (mode === "circle") {
        // circle resize: distance from center to handle
        const cx = startBox.x + startBox.w / 2;
        const cy = startBox.y + startBox.h / 2;
        const newR = clamp(
          Math.hypot(pos.x - cx, pos.y - cy),
          20,
          Math.min(cx, cy, CANVAS_SIZE - cx, CANVAS_SIZE - cy)
        );
        x = cx - newR; y = cy - newR; w = newR * 2; h = newR * 2;
      } else {
        // rect resize per corner
        const MIN = 40;
        if (type === "resize-br") {
          w = clamp(startBox.w + dx, MIN, CANVAS_SIZE - x);
          h = ratio ? w / ratio : clamp(startBox.h + dy, MIN, CANVAS_SIZE - y);
        } else if (type === "resize-tr") {
          w = clamp(startBox.w + dx, MIN, CANVAS_SIZE - x);
          h = ratio ? w / ratio : clamp(startBox.h - dy, MIN, startBox.y + startBox.h);
          y = ratio ? startBox.y + startBox.h - h : startBox.y + startBox.h - h;
        } else if (type === "resize-bl") {
          w = clamp(startBox.w - dx, MIN, startBox.x + startBox.w);
          h = ratio ? w / ratio : clamp(startBox.h + dy, MIN, CANVAS_SIZE - y);
          x = startBox.x + startBox.w - w;
        } else if (type === "resize-tl") {
          w = clamp(startBox.w - dx, MIN, startBox.x + startBox.w);
          h = ratio ? w / ratio : clamp(startBox.h - dy, MIN, startBox.y + startBox.h);
          x = startBox.x + startBox.w - w;
          y = startBox.y + startBox.h - h;
        }
        // clamp to canvas
        x = clamp(x, 0, CANVAS_SIZE - w);
        y = clamp(y, 0, CANVAS_SIZE - h);
        w = clamp(w, MIN, CANVAS_SIZE - x);
        h = ratio ? w / ratio : clamp(h, MIN, CANVAS_SIZE - y);
      }
      return { x, y, w, h };
    });
  };

  const handleMouseUp = () => { dragRef.current.type = null; };

  const handleSave = () => {
    const img = imgRef.current;
    if (!img) return;
    const OUTPUT = mode === "circle" ? 400 : 800;
    const out = document.createElement("canvas");
    const ratio = aspectRatio ?? (mode === "circle" ? 1 : box.w / box.h);
    out.width = OUTPUT;
    out.height = mode === "circle" ? OUTPUT : Math.round(OUTPUT / ratio);

    const ctx = out.getContext("2d")!;

    // Use letterbox rect to map canvas coords back to original image pixels
    const ir = getImgRect(img);
    // Convert canvas crop box to source image coordinates
    const srcX = (box.x - ir.x) * (img.naturalWidth / ir.w);
    const srcY = (box.y - ir.y) * (img.naturalHeight / ir.h);
    const srcW = box.w * (img.naturalWidth / ir.w);
    const srcH = box.h * (img.naturalHeight / ir.h);

    if (mode === "circle") {
      ctx.beginPath();
      ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, out.width, out.height);
    onSave(out.toDataURL("image/jpeg", 0.92));
  };

  if (!isOpen || !imageSrc) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[490px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {mode === "circle" ? "Crop Profile Photo" : "Crop Image"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {mode === "circle"
                ? "Drag to move · Drag orange handle to resize"
                : "Drag to move · Drag corners to resize"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Canvas */}
        <div className="relative bg-slate-950 flex items-center justify-center" style={{ lineHeight: 0 }}>
          {!imgLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="w-full max-w-full"
            style={{ display: imgLoaded ? "block" : "none", touchAction: "none" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* preview */}
            {mode === "circle" ? (
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-orange-200 shadow bg-slate-200 flex-shrink-0">
                {imgLoaded && <PreviewCanvas img={imgRef.current} box={box} mode="circle" />}
              </div>
            ) : (
              <div className="h-10 rounded overflow-hidden border-2 border-orange-200 shadow bg-slate-200 flex-shrink-0"
                style={{ width: box.h > 0 ? `${(box.w / box.h) * 40}px` : "60px" }}>
                {imgLoaded && <PreviewCanvas img={imgRef.current} box={box} mode="rect" />}
              </div>
            )}
            <span className="text-xs text-slate-400 font-medium">Preview</span>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 transition">
              Cancel
            </button>
            <button onClick={handleSave} disabled={!imgLoaded} className="px-5 py-2 text-sm font-bold text-white bg-orange-600 rounded-xl hover:bg-orange-700 disabled:opacity-50 transition shadow-sm shadow-orange-600/20">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const PreviewCanvas: React.FC<{
  img: HTMLImageElement | null;
  box: { x: number; y: number; w: number; h: number };
  mode: "circle" | "rect";
}> = ({ img, box, mode }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !img) return;
    const SIZE = mode === "circle" ? 48 : Math.round(48 * (box.w / Math.max(box.h, 1)));
    canvas.width = SIZE;
    canvas.height = 48;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, 48);
    const scale = Math.min(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight);
    const irW = img.naturalWidth * scale;
    const irH = img.naturalHeight * scale;
    const irX = (CANVAS_SIZE - irW) / 2;
    const irY = (CANVAS_SIZE - irH) / 2;
    const srcX = (box.x - irX) * (img.naturalWidth / irW);
    const srcY = (box.y - irY) * (img.naturalHeight / irH);
    const srcW = box.w * (img.naturalWidth / irW);
    const srcH = box.h * (img.naturalHeight / irH);
    if (mode === "circle") {
      ctx.beginPath();
      ctx.arc(SIZE / 2, 24, SIZE / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, SIZE, 48);
  }, [img, box, mode]);

  return <canvas ref={ref} className="w-full h-full" />;
};

export default ImageCropModal;