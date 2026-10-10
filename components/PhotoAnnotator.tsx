import React, { useState, useRef, useCallback } from "react";
import { PhotoAnnotation, AnnotationPoint } from "../types";

interface PhotoAnnotatorProps {
  photo: string;
  alt?: string;
  annotations: PhotoAnnotation[];
  onChange?: (annotations: PhotoAnnotation[]) => void;
  editable?: boolean;
  className?: string;
}

type Mode = "point" | "box" | "highlight" | "ruler" | "arrow" | "freehand";

interface DragOffset {
  id: string;
  dx: number;
  dy: number;
}

interface PointsDragSnapshot {
  id: string;
  startX: number;
  startY: number;
  original: AnnotationPoint[];
}

interface EndpointDrag {
  id: string;
  index: number;
}

interface DrawingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_BOX_SIZE = 2; // percent
const MIN_LINE_LEN = 1.5; // percent

const genId = () => `mark_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const dist = (a: AnnotationPoint, b: AnnotationPoint) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Renders a photo with red "mark" annotations on top of it, mimicking the
 * hand-marked-up photos used in the manual inspection reports:
 *  - Point: a small dot mark, click to add.
 *  - Box: a rectangle outline around an area, click-drag to draw.
 *  - Highlight: a translucent yellow rectangle over an area, click-drag to draw.
 *  - Ruler: a straight line with tick marks at both ends, click-drag to draw.
 *  - Markup (Arrow): a line with an arrowhead pointing at a spot, click-drag to draw.
 *  - Drawing: a freehand pen stroke, click-drag to draw.
 * All types can be moved, labeled with a note, and deleted once placed.
 */
const PhotoAnnotator: React.FC<PhotoAnnotatorProps> = ({
  photo,
  alt = "Case visual",
  annotations,
  onChange,
  editable = true,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("point");
  const [activeId, setActiveId] = useState<string | null>(null);

  const dragRef = useRef<DragOffset | null>(null); // moving point/box/highlight
  const resizeIdRef = useRef<string | null>(null); // resizing box/highlight corner
  const drawStartRef = useRef<{ x: number; y: number } | null>(null); // drawing box/highlight
  const [drawingBox, setDrawingBox] = useState<DrawingBox | null>(null);

  const lineStartRef = useRef<AnnotationPoint | null>(null); // drawing ruler/arrow
  const [drawingLine, setDrawingLine] = useState<{ a: AnnotationPoint; b: AnnotationPoint } | null>(null);

  const freehandRef = useRef<AnnotationPoint[] | null>(null); // drawing freehand path
  const [drawingPath, setDrawingPath] = useState<AnnotationPoint[] | null>(null);

  const pointsDragRef = useRef<PointsDragSnapshot | null>(null); // moving ruler/arrow/freehand
  const endpointDragRef = useRef<EndpointDrag | null>(null); // dragging a ruler/arrow endpoint handle

  const getRelativePosition = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    return { x, y };
  }, []);

  const updateMark = (id: string, patch: Partial<PhotoAnnotation>) => {
    if (!onChange) return;
    onChange(annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const removeMark = (id: string) => {
    if (!onChange) return;
    onChange(annotations.filter((a) => a.id !== id));
    if (activeId === id) setActiveId(null);
  };

  // ---------- Point mode: click to add ----------
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editable || !onChange || mode !== "point") return;
    const { x, y } = getRelativePosition(e.clientX, e.clientY);
    const newMark: PhotoAnnotation = { id: genId(), type: "point", xPct: x, yPct: y, text: "" };
    onChange([...annotations, newMark]);
    setActiveId(newMark.id);
  };

  // ---------- Box / Highlight mode: drag on empty area to draw ----------
  // ---------- Ruler / Arrow mode: drag from start to end ----------
  // ---------- Freehand mode: drag to draw a path ----------
  const handleContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || !onChange) return;
    const { x, y } = getRelativePosition(e.clientX, e.clientY);

    if (mode === "box" || mode === "highlight") {
      drawStartRef.current = { x, y };
      setDrawingBox({ x, y, w: 0, h: 0 });
    } else if (mode === "ruler" || mode === "arrow") {
      lineStartRef.current = { x, y };
      setDrawingLine({ a: { x, y }, b: { x, y } });
    } else if (mode === "freehand") {
      freehandRef.current = [{ x, y }];
      setDrawingPath([{ x, y }]);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    const { x, y } = getRelativePosition(e.clientX, e.clientY);

    // Moving an existing point/box/highlight
    if (dragRef.current) {
      const mark = annotations.find((a) => a.id === dragRef.current!.id);
      if (!mark) return;
      const w = mark.wPct ?? 0;
      const h = mark.hPct ?? 0;
      const newX = Math.min(100 - w, Math.max(0, x - dragRef.current.dx));
      const newY = Math.min(100 - h, Math.max(0, y - dragRef.current.dy));
      updateMark(mark.id, { xPct: newX, yPct: newY });
      return;
    }

    // Resizing a box/highlight corner
    if (resizeIdRef.current) {
      const mark = annotations.find((a) => a.id === resizeIdRef.current);
      if (!mark) return;
      const newW = Math.min(100 - mark.xPct, Math.max(MIN_BOX_SIZE, x - mark.xPct));
      const newH = Math.min(100 - mark.yPct, Math.max(MIN_BOX_SIZE, y - mark.yPct));
      updateMark(mark.id, { wPct: newW, hPct: newH });
      return;
    }

    // Dragging a ruler/arrow endpoint handle
    if (endpointDragRef.current) {
      const mark = annotations.find((a) => a.id === endpointDragRef.current!.id);
      if (!mark || !mark.points) return;
      const pts = mark.points.map((p, i) => (i === endpointDragRef.current!.index ? { x, y } : p));
      updateMark(mark.id, { points: pts });
      return;
    }

    // Moving a whole ruler/arrow/freehand shape
    if (pointsDragRef.current) {
      const { id, startX, startY, original } = pointsDragRef.current;
      const dx = x - startX;
      const dy = y - startY;
      const moved = original.map((p) => ({
        x: Math.min(100, Math.max(0, p.x + dx)),
        y: Math.min(100, Math.max(0, p.y + dy)),
      }));
      updateMark(id, { points: moved });
      return;
    }

    // Drawing a new box/highlight
    if (drawStartRef.current) {
      const { x: startX, y: startY } = drawStartRef.current;
      setDrawingBox({
        x: Math.min(startX, x),
        y: Math.min(startY, y),
        w: Math.abs(x - startX),
        h: Math.abs(y - startY),
      });
      return;
    }

    // Drawing a new ruler/arrow line
    if (lineStartRef.current) {
      setDrawingLine({ a: lineStartRef.current, b: { x, y } });
      return;
    }

    // Drawing a new freehand path
    if (freehandRef.current) {
      const last = freehandRef.current[freehandRef.current.length - 1];
      if (!last || dist(last, { x, y }) > 1.2) {
        freehandRef.current = [...freehandRef.current, { x, y }];
        setDrawingPath(freehandRef.current);
      }
    }
  };

  const handlePointerUp = () => {
    if (drawStartRef.current && drawingBox && onChange) {
      if (drawingBox.w >= MIN_BOX_SIZE && drawingBox.h >= MIN_BOX_SIZE) {
        const newMark: PhotoAnnotation = {
          id: genId(),
          type: mode === "highlight" ? "highlight" : "box",
          xPct: drawingBox.x,
          yPct: drawingBox.y,
          wPct: drawingBox.w,
          hPct: drawingBox.h,
          text: "",
        };
        onChange([...annotations, newMark]);
        setActiveId(newMark.id);
      }
    }
    drawStartRef.current = null;
    setDrawingBox(null);

    if (lineStartRef.current && drawingLine && onChange) {
      if (dist(drawingLine.a, drawingLine.b) >= MIN_LINE_LEN) {
        const newMark: PhotoAnnotation = {
          id: genId(),
          type: mode === "ruler" ? "ruler" : "arrow",
          xPct: drawingLine.a.x,
          yPct: drawingLine.a.y,
          points: [drawingLine.a, drawingLine.b],
          text: "",
        };
        onChange([...annotations, newMark]);
        setActiveId(newMark.id);
      }
    }
    lineStartRef.current = null;
    setDrawingLine(null);

    if (freehandRef.current && onChange) {
      const pts = freehandRef.current;
      if (pts.length >= 2) {
        const newMark: PhotoAnnotation = {
          id: genId(),
          type: "freehand",
          xPct: pts[0].x,
          yPct: pts[0].y,
          points: pts,
          text: "",
        };
        onChange([...annotations, newMark]);
        setActiveId(newMark.id);
      }
    }
    freehandRef.current = null;
    setDrawingPath(null);

    dragRef.current = null;
    resizeIdRef.current = null;
    endpointDragRef.current = null;
    pointsDragRef.current = null;
  };

  // ---------- Interaction handlers for existing marks ----------
  const handleMarkPointerDown = (e: React.PointerEvent, mark: PhotoAnnotation) => {
    if (!editable) return;
    e.stopPropagation();
    const { x, y } = getRelativePosition(e.clientX, e.clientY);
    dragRef.current = { id: mark.id, dx: x - mark.xPct, dy: y - mark.yPct };
    setActiveId(mark.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleResizeHandlePointerDown = (e: React.PointerEvent, id: string) => {
    if (!editable) return;
    e.stopPropagation();
    resizeIdRef.current = id;
    setActiveId(id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleShapeBodyPointerDown = (e: React.PointerEvent, mark: PhotoAnnotation) => {
    if (!editable || !mark.points) return;
    e.stopPropagation();
    const { x, y } = getRelativePosition(e.clientX, e.clientY);
    pointsDragRef.current = { id: mark.id, startX: x, startY: y, original: mark.points.map((p) => ({ ...p })) };
    setActiveId(mark.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleEndpointPointerDown = (e: React.PointerEvent, id: string, index: number) => {
    if (!editable) return;
    e.stopPropagation();
    endpointDragRef.current = { id, index };
    setActiveId(id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  // ---------- Label (note) editor / display ----------
  const renderLabel = (mark: PhotoAnnotation, style: React.CSSProperties) => {
    const isActive = activeId === mark.id;
    return (
      <div
        className="absolute z-20"
        style={style}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {editable && isActive ? (
          <div className="flex items-start gap-1 bg-white rounded-md shadow-lg border-2 border-red-600 p-1 w-44">
            <textarea
              autoFocus
              value={mark.text}
              onChange={(e) => updateMark(mark.id, { text: e.target.value })}
              onFocus={(e) => {
                const el = e.target;
                el.selectionStart = el.value.length;
                el.selectionEnd = el.value.length;
              }}
              onBlur={() => {
                const shapeType = mark.type;
                const isShapeOnly = shapeType === "box" || shapeType === "highlight" || shapeType === "ruler" || shapeType === "arrow" || shapeType === "freehand";
                if (!mark.text.trim() && !isShapeOnly) removeMark(mark.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                  setActiveId(null);
                }
              }}
              placeholder="Mark note... (wraps across lines)"
              rows={3}
              className="flex-1 text-xs px-1.5 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-red-400 rounded resize-y whitespace-pre-wrap break-words leading-snug text-slate-800"
            />
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className="p-1 text-slate-400 hover:text-green-600"
              aria-label="Done editing"
              title="Done"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => removeMark(mark.id)}
              className="p-1 text-slate-400 hover:text-red-600"
              aria-label="Remove mark"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ) : mark.text ? (
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (editable) setActiveId(mark.id);
            }}
            className={`inline-block max-w-[45vw] sm:max-w-[220px] text-[11px] font-semibold px-1.5 py-0.5 rounded bg-white border-2 border-red-600 text-slate-800 shadow whitespace-pre-wrap break-words leading-snug ${editable ? "cursor-text" : ""}`}
          >
            {mark.text}
          </div>
        ) : editable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveId(mark.id);
            }}
            className="text-[10px] px-1.5 py-0.5 rounded bg-white border-2 border-red-600 text-red-600 shadow whitespace-nowrap"
          >
            + note
          </button>
        ) : null}
      </div>
    );
  };

  const MODES: { id: Mode; label: string; icon: React.ReactNode }[] = [
    {
      id: "point",
      label: "Point",
      icon: <span className="w-2 h-2 rounded-full bg-current" />,
    },
    {
      id: "box",
      label: "Box",
      icon: <span className="w-2.5 h-2.5 border-2 border-current" />,
    },
    {
      id: "highlight",
      label: "Highlight",
      icon: <span className="w-2.5 h-2.5 bg-current opacity-60" />,
    },
    {
      id: "ruler",
      label: "Ruler",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 13l8-8M6 10l1.5-1.5M9 13l1.5-1.5M12 6l1.5-1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "arrow",
      label: "Markup",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
          <path d="M3 17L17 3M17 3H9M17 3v8" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      id: "freehand",
      label: "Draw",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 15c2-4 3-8 5-8s2 6 4 6 2-5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <div className={className}>
      {editable && (
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-xs font-medium text-slate-500">Mark type:</span>
          <div className="inline-flex rounded-md border border-slate-300 overflow-hidden">
            {MODES.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`px-2.5 py-1 text-xs font-medium flex items-center gap-1 ${i > 0 ? "border-l border-slate-300" : ""} ${
                  mode === m.id ? "bg-red-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative select-none touch-none"
        onClick={handleImageClick}
        onPointerDown={handleContainerPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <img
          src={photo}
          alt={alt}
          className="w-full h-full object-contain rounded-md border border-slate-300 bg-slate-100 pointer-events-none"
          draggable={false}
        />

        {/* SVG overlay for line-based shapes: ruler, arrow, freehand */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ pointerEvents: "none" }}
        >
          {annotations.map((mark) => {
            if (!mark.points || mark.points.length < 2) return null;
            const [a, b] = mark.points;

            if (mark.type === "ruler") {
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              const px = -uy * 1.6;
              const py = ux * 1.6;
              return (
                <g key={mark.id}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#dc2626" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                  <line x1={a.x + px} y1={a.y + py} x2={a.x - px} y2={a.y - py} stroke="#dc2626" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                  <line x1={b.x + px} y1={b.y + py} x2={b.x - px} y2={b.y - py} stroke="#dc2626" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                </g>
              );
            }

            if (mark.type === "arrow") {
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              const px = -uy;
              const py = ux;
              const headLen = 3.2;
              const headW = 1.4;
              const tipX = b.x;
              const tipY = b.y;
              const baseX = b.x - ux * headLen;
              const baseY = b.y - uy * headLen;
              const leftX = baseX + px * headW;
              const leftY = baseY + py * headW;
              const rightX = baseX - px * headW;
              const rightY = baseY - py * headW;
              return (
                <g key={mark.id}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#dc2626" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                  <polygon points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`} fill="#dc2626" />
                </g>
              );
            }

            if (mark.type === "freehand") {
              const pts = mark.points.map((p) => `${p.x},${p.y}`).join(" ");
              return (
                <polyline
                  key={mark.id}
                  points={pts}
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth={0.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            }

            return null;
          })}

          {/* live previews while drawing */}
          {drawingLine && (
            <line x1={drawingLine.a.x} y1={drawingLine.a.y} x2={drawingLine.b.x} y2={drawingLine.b.y} stroke="#dc2626" strokeDasharray="2,1.5" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
          )}
          {drawingPath && drawingPath.length > 1 && (
            <polyline
              points={drawingPath.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#dc2626"
              strokeWidth={0.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Interactive hit-areas + handles + labels for line-based shapes */}
        {annotations.map((mark) => {
          if (!mark.points || mark.points.length < 2) return null;
          const isLineType = mark.type === "ruler" || mark.type === "arrow";
          const isFreehand = mark.type === "freehand";
          const [a, b] = mark.points;
          const midX = isFreehand ? mark.points[0].x : (a.x + b.x) / 2;
          const midY = isFreehand ? mark.points[0].y : (a.y + b.y) / 2;
          const flipX = midX > 65;
          const flipY = midY > 80;

          return (
            <React.Fragment key={mark.id}>
              {/* Invisible-ish thick line as a drag handle for the whole shape (only for ruler/arrow; freehand dragged via its polyline area is harder to hit, so add a small handle at its first point) */}
              {isLineType && (
                <div
                  onPointerDown={(e) => handleShapeBodyPointerDown(e, mark)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (editable) setActiveId(mark.id);
                  }}
                  className={editable ? "cursor-move" : ""}
                  style={{
                    position: "absolute",
                    left: `${Math.min(a.x, b.x)}%`,
                    top: `${Math.min(a.y, b.y)}%`,
                    width: `${Math.max(Math.abs(b.x - a.x), 3)}%`,
                    height: `${Math.max(Math.abs(b.y - a.y), 3)}%`,
                    zIndex: 10,
                  }}
                />
              )}
              {isFreehand && (
                <div
                  onPointerDown={(e) => handleShapeBodyPointerDown(e, mark)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (editable) setActiveId(mark.id);
                  }}
                  className={`absolute z-10 w-4 h-4 rounded-full border-2 border-white bg-red-600 shadow-md ${editable ? "cursor-move" : ""}`}
                  style={{ left: `${mark.points[0].x}%`, top: `${mark.points[0].y}%`, transform: "translate(-50%, -50%)" }}
                  title={editable ? "Drag to move the drawing" : undefined}
                />
              )}

              {editable && isLineType && (
                <>
                  <div
                    onPointerDown={(e) => handleEndpointPointerDown(e, mark.id, 0)}
                    className="absolute z-20 w-2.5 h-2.5 rounded-full bg-white border-2 border-red-600 cursor-crosshair"
                    style={{ left: `${a.x}%`, top: `${a.y}%`, transform: "translate(-50%, -50%)" }}
                    title="Drag to adjust this end"
                  />
                  <div
                    onPointerDown={(e) => handleEndpointPointerDown(e, mark.id, 1)}
                    className="absolute z-20 w-2.5 h-2.5 rounded-full bg-white border-2 border-red-600 cursor-crosshair"
                    style={{ left: `${b.x}%`, top: `${b.y}%`, transform: "translate(-50%, -50%)" }}
                    title="Drag to adjust this end"
                  />
                </>
              )}

              {renderLabel(mark, {
                left: flipX ? "auto" : `calc(${midX}% + 8px)`,
                right: flipX ? `calc(${100 - midX}% + 8px)` : "auto",
                top: flipY ? "auto" : `calc(${midY}% - 10px)`,
                bottom: flipY ? `calc(${100 - midY}% + 4px)` : "auto",
              })}
            </React.Fragment>
          );
        })}

        {/* Point and box/highlight marks */}
        {annotations.map((mark) => {
          const isBoxLike = mark.type === "box" || mark.type === "highlight";
          if (!isBoxLike && mark.type !== "point" && mark.type) return null; // line types handled above
          if (mark.points) return null; // safety guard, shouldn't happen

          if (isBoxLike) {
            const w = mark.wPct ?? 10;
            const h = mark.hPct ?? 10;
            const isHighlight = mark.type === "highlight";
            const flipX = mark.xPct + w > 90;
            const flipY = mark.yPct < 12;
            return (
              <div
                key={mark.id}
                className={`absolute z-10 ${isHighlight ? "bg-yellow-300/40 border border-yellow-500" : "border-2 border-red-600"}`}
                style={{
                  left: `${mark.xPct}%`,
                  top: `${mark.yPct}%`,
                  width: `${w}%`,
                  height: `${h}%`,
                }}
                onPointerDown={(e) => handleMarkPointerDown(e, mark)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (editable) setActiveId(mark.id);
                }}
              >
                {editable && (
                  <div
                    onPointerDown={(e) => handleResizeHandlePointerDown(e, mark.id)}
                    className={`absolute -right-1.5 -bottom-1.5 w-3 h-3 border border-white rounded-sm cursor-nwse-resize ${isHighlight ? "bg-yellow-500" : "bg-red-600"}`}
                    title="Drag to resize"
                  />
                )}
                {renderLabel(mark, {
                  left: flipX ? "auto" : 0,
                  right: flipX ? 0 : "auto",
                  top: flipY ? 2 : -22,
                })}
              </div>
            );
          }

          // point
          const flipX = mark.xPct > 65;
          const flipY = mark.yPct > 75;
          return (
            <div
              key={mark.id}
              className="absolute z-10"
              style={{ left: `${mark.xPct}%`, top: `${mark.yPct}%`, transform: "translate(-50%, -50%)" }}
            >
              <div
                onPointerDown={(e) => handleMarkPointerDown(e, mark)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (editable) setActiveId(mark.id);
                }}
                className={`w-4 h-4 rounded-full border-2 border-white bg-red-600 shadow-md ${editable ? "cursor-move" : ""}`}
                style={{ boxShadow: "0 0 0 1.5px rgba(220,38,38,0.9)" }}
                title={editable ? "Drag to move, click to edit" : undefined}
              />
              {renderLabel(mark, {
                left: flipX ? "auto" : 10,
                right: flipX ? 10 : "auto",
                top: flipY ? "auto" : -2,
                bottom: flipY ? 2 : "auto",
              })}
            </div>
          );
        })}

        {/* Live preview while drawing a new box/highlight */}
        {drawingBox && (
          <div
            className={`absolute z-10 pointer-events-none ${
              mode === "highlight" ? "bg-yellow-300/40 border border-yellow-500" : "border-2 border-dashed border-red-500 bg-red-500/10"
            }`}
            style={{
              left: `${drawingBox.x}%`,
              top: `${drawingBox.y}%`,
              width: `${drawingBox.w}%`,
              height: `${drawingBox.h}%`,
            }}
          />
        )}
      </div>

      {editable && (
        <p className="mt-1.5 text-xs text-slate-400">
          {mode === "point" && "Click anywhere on the photo to drop a mark, drag a mark to move it, click its label to edit the note."}
          {mode === "box" && "Click-drag on the photo to draw a box around the area, drag the box to move it, drag the corner handle to resize."}
          {mode === "highlight" && "Click-drag on the photo to highlight an area, drag it to move, drag the corner handle to resize."}
          {mode === "ruler" && "Click-drag to draw a ruler line, drag either end to adjust, drag the line to move it."}
          {mode === "arrow" && "Click-drag to draw an arrow pointing at the issue, drag either end to adjust, drag the line to move it."}
          {mode === "freehand" && "Click-drag to freehand draw on the photo, drag the red dot at the start to move the whole drawing."}
        </p>
      )}
    </div>
  );
};

export default PhotoAnnotator;