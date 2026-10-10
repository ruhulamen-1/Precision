import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import MarqueeImage from './MarqueeImage';

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(`${dateStr.split('T')[0]}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const MIN_IMAGES_TO_SCROLL = 2; // scrolling শুরু হবে ২+ image হলে

const ScrollingActivityImages = ({ images, getImage }) => {
  const [zoomedImage, setZoomedImage] = useState(null);

  if (!images || images.length === 0) return null;

  const shouldScroll = images.length >= MIN_IMAGES_TO_SCROLL;

  // Duplicate enough times to fill the strip seamlessly (need at least ~20 items for smooth loop)
  const repeatCount = shouldScroll ? Math.max(2, Math.ceil(20 / images.length)) : 1;
  const displayImages = Array.from({ length: repeatCount }, () => images).flat();

  // ~6 seconds per image, minimum 20s
  const duration = Math.max(images.length * 6, 20);

  return (
    <div className="mt-4 overflow-hidden bg-white/20 dark:bg-slate-900/40 backdrop-blur-sm py-3 rounded-2xl border border-dashed border-gray-200/50 dark:border-slate-800/50">
      <div className="relative flex overflow-hidden">
        <div
          className={shouldScroll ? "flex gap-5 animate-marquee whitespace-nowrap px-2" : "flex gap-5 flex-wrap px-2"}
          style={shouldScroll ? { animationDuration: `${duration}s` } : {}}
        >
          {displayImages.map((img, idx) => (
            <MarqueeImage
              key={`${img.key}-${idx}`}
              screenshotKey={img.key}
              remark={img.remark}
              date={img.date}
              onClick={(url) => setZoomedImage({ url, remark: img.remark, date: img.date })}
              getImage={getImage}
            />
          ))}
        </div>
      </div>

      {zoomedImage && createPortal(
        <div
          className="fixed inset-0 bg-slate-100/80 dark:bg-slate-950/70 backdrop-blur-lg flex flex-col justify-center items-center z-[9999] p-4 cursor-zoom-out animate-in fade-in duration-300"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="relative w-full h-full flex flex-col items-center overflow-hidden rounded-2xl shadow-[0_32px_64px_-15px_rgba(30,41,59,0.25)] border border-slate-200 bg-white">
              <img
                src={zoomedImage.url}
                alt="Zoomed screenshot"
                className="max-w-full max-h-[80vh] object-contain bg-white"
              />
              {(zoomedImage.remark || zoomedImage.date) && (
                <div className="absolute bottom-4 left-4 right-4 sm:left-6 sm:right-6 sm:bottom-6 bg-white/90 backdrop-blur-md rounded-2xl shadow-[0_8px_24px_rgba(30,41,59,0.18)] border border-slate-200/80 p-4 sm:p-5 text-center">
                  <p className="text-slate-800 text-base sm:text-lg font-semibold whitespace-pre-wrap font-['Noto_Serif_Bengali'] leading-relaxed tracking-wide">
                    {zoomedImage.remark || 'Activity Details'}
                  </p>
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <div className="h-[1px] w-8 bg-slate-300"></div>
                    <p className="text-slate-400 text-xs font-medium tracking-widest uppercase">{formatDate(zoomedImage.date)}</p>
                    <div className="h-[1px] w-8 bg-slate-300"></div>
                  </div>
                </div>
              )}
            </div>
            <button
              className="absolute -top-12 right-0 sm:-right-12 sm:top-0 p-2 bg-white hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition-all shadow-md border border-slate-200"
              title="Close preview"
              onClick={() => setZoomedImage(null)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ScrollingActivityImages;