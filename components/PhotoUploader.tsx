import React from "react";

interface PhotoUploaderProps {
  id: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCameraClick: () => void;
  fileInputRef: React.Ref<HTMLInputElement>;
  multiple?: boolean;
}

const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  id,
  onFileChange,
  onCameraClick,
  fileInputRef,
  multiple = false,
}) => {
  const commonButtonClasses =
    "flex-1 flex flex-col items-center justify-center p-4 h-28 border-2 border-slate-300 border-dashed rounded-md cursor-pointer hover:border-orange-500 transition-colors text-slate-500 hover:text-orange-600";

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <label htmlFor={id} className={commonButtonClasses}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
        <span className="mt-1 text-xs font-medium text-center">
          Upload Photo
        </span>
      </label>
      <input
        id={id}
        type="file"
        multiple={multiple}
        className="sr-only"
        onChange={onFileChange}
        accept="image/*"
        ref={fileInputRef}
      />

      <button
        type="button"
        onClick={onCameraClick}
        className={commonButtonClasses}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span className="mt-1 text-xs font-medium text-center">Take Photo</span>
      </button>
      
      {/* Optional: Paste Hint */}
      <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-400 uppercase tracking-tight">
        <div className="px-1.5 py-0.5 bg-white border border-slate-300 rounded shadow-sm text-slate-600">Ctrl + V</div>
        <span>to Paste Image</span>
      </div>
    </div>
  );
};

export default PhotoUploader;
