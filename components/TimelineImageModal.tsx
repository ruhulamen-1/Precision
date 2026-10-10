import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const formatDateShort = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(`${dateStr.split('T')[0]}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

interface TimelineImageModalProps {
  screenshotKey: string;
  remark: string;
  date: string;
  onClose: () => void;
  getImage: (key: string) => Promise<string | null>;
}

const TimelineImageModal: React.FC<TimelineImageModalProps> = ({ screenshotKey, remark, date, onClose, getImage }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchImage = async () => {
      const url = await getImage(screenshotKey);
      if (isMounted) {
        setImageUrl(url);
        setLoading(false);
      }
    };
    fetchImage();
    return () => { isMounted = false; };
  }, [screenshotKey]);

  return createPortal(
    <div
      className="fixed inset-0 bg-black/90 flex flex-col justify-center items-center z-[9999] p-4 cursor-zoom-out"
      onClick={onClose}
    >
      <div className="relative max-w-5xl w-full max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="flex items-center justify-center h-64 w-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt="Activity screenshot"
            className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
          />
        ) : (
          <div className="text-white">Failed to load image</div>
        )}
        <div className="mt-4 bg-white/10 backdrop-blur-md p-4 rounded-xl text-center max-w-2xl w-full border border-white/20">
          <p className="text-white text-lg font-medium whitespace-pre-wrap font-['Noto_Serif_Bengali']">{remark || 'No remarks'}</p>
          <p className="text-white/60 text-sm mt-2">{formatDateShort(date)}</p>
        </div>
        <button
          className="absolute -top-12 right-0 text-white/70 hover:text-white text-4xl font-bold transition-colors"
          title="Close preview"
          onClick={onClose}
        >
          &times;
        </button>
      </div>
    </div>,
    document.body
  );
};

export default TimelineImageModal;
