import React, { useState, useEffect } from 'react';

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(`${dateStr.split('T')[0]}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const MarqueeImage = ({ screenshotKey, remark, date, onClick, getImage }) => {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!screenshotKey || !getImage) return;
    let cancelled = false;
    setLoading(true);
    getImage(screenshotKey).then((data) => {
      if (!cancelled && data) setUrl(data);
      if (!cancelled) setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [screenshotKey, getImage]);

  const handleClick = () => {
    if (url && onClick) onClick(url);
  };

  if (loading) {
    return (
      <div className="flex-shrink-0 w-44 overflow-hidden bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700">
        <div className="w-44 h-32 bg-slate-200/60 dark:bg-slate-700/60 animate-pulse" />
        <div className="px-2.5 py-2.5">
          <div className="h-2.5 w-4/5 bg-slate-200/60 dark:bg-slate-700/60 rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  if (!url) return null;

  return (
    <div
      className="flex-shrink-0 group w-44 overflow-hidden bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl cursor-zoom-in transition-all duration-300 hover:-translate-y-1"
      onClick={handleClick}
      title={remark || 'Activity Screenshot'}
    >
      <div className="relative w-44 h-32 overflow-hidden">
        <img
          src={url}
          alt={remark || 'Activity screenshot'}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          draggable={false}
        />
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        {date && (
          <span className="absolute top-2 right-2 bg-black/50 text-white text-[9px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {formatDate(date)}
          </span>
        )}
      </div>
      {/* Caption — always visible below the image, picjumbo photo-pack style */}
      <div className="px-2.5 py-2 border-t border-slate-50 dark:border-slate-700/60">
        <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 line-clamp-1 font-['Noto_Serif_Bengali']">
          {remark || 'Activity Screenshot'}
        </p>
      </div>
    </div>
  );
};

export default MarqueeImage;