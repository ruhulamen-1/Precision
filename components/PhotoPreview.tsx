import React from "react";

interface PhotoPreviewProps {
  src: string;
  alt: string;
  onRemove: () => void;
  className?: string;
}

const PhotoPreview: React.FC<PhotoPreviewProps> = ({
  src,
  alt,
  onRemove,
  className = "",
}) => {
  return (
    <div className={`relative group aspect-square ${className}`}>
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover rounded-md border border-slate-300"
      />
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 p-1 bg-black bg-opacity-60 rounded-full text-white opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-white transition-opacity"
        aria-label="Remove photo"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
};

export default PhotoPreview;
