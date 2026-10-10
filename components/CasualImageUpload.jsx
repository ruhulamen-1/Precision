import React, { useState, useEffect, useRef, useCallback } from 'react';

const ImageUpload = React.forwardRef(({ screenshots = [], onUpdate, disabled, getImage, deleteImage }, ref) => {
    const [zoomedImage, setZoomedImage] = useState(null);
    const [imageUrls, setImageUrls] = useState({});
    const [loadingImages, setLoadingImages] = useState({});
    const [isDragOver, setIsDragOver] = useState(false);
    const innerRef = useRef(null);

    // Expose focus via ref
    React.useImperativeHandle(ref, () => ({
        focus: () => innerRef.current?.focus(),
    }));

    useEffect(() => {
        let isMounted = true;
        const fetchImages = async () => {
            const newUrls = {};
            const newLoading = { ...loadingImages };

            for (const key of screenshots) {
                // If key is already a base64/data URL, use directly
                if (key.startsWith('data:')) {
                    newUrls[key] = key;
                    continue;
                }
                if (!imageUrls[key] && !loadingImages[key]) {
                    newLoading[key] = true;
                    try {
                        const data = await getImage(key);
                        if (data && isMounted) newUrls[key] = data;
                    } catch (error) {
                        console.error(`Failed to load image ${key}`, error);
                    } finally {
                        if (isMounted) delete newLoading[key];
                    }
                }
            }

            if (isMounted) {
                if (Object.keys(newUrls).length > 0) setImageUrls(prev => ({ ...prev, ...newUrls }));
                setLoadingImages(newLoading);
            }
        };

        if (screenshots && screenshots.length > 0) fetchImages();

        const currentKeys = new Set(screenshots);
        const urlsToKeep = {};
        for (const key in imageUrls) {
            if (currentKeys.has(key)) urlsToKeep[key] = imageUrls[key];
        }
        if (Object.keys(imageUrls).length !== Object.keys(urlsToKeep).length) setImageUrls(urlsToKeep);

        return () => { isMounted = false; };
    }, [screenshots, getImage]);

    const processImageFile = useCallback((file) => {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target.result; // data:image/png;base64,...
            const key = `r_img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            try {
                const response = await fetch('/api/media', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key,
                        data: base64,
                        mimeType: file.type
                    })
                });
                if (response.ok) {
                    setImageUrls(prev => ({ ...prev, [key]: base64 }));
                    onUpdate([...(screenshots || []), key]);
                } else {
                    console.error('Failed to upload image', await response.text());
                }
            } catch (err) {
                console.error('Failed to upload image', err);
            }
        };
        reader.readAsDataURL(file);
    }, [screenshots, onUpdate]);

    // ─── Paste Handler ────────────────────────────────────────────────────────
    const handlePaste = useCallback((e) => {
        if (disabled) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                processImageFile(file);
                return;
            }
        }
    }, [disabled, processImageFile]);

    // ─── Drag & Drop ─────────────────────────────────────────────────────────
    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (disabled) return;
        const file = e.dataTransfer?.files?.[0];
        processImageFile(file);
    }, [disabled, processImageFile]);

    const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
    const handleDragLeave = () => setIsDragOver(false);

    const removeImage = (indexToRemove) => {
        const keyToRemove = screenshots[indexToRemove];
        // Only call deleteImage if it's a server key (not base64)
        if (keyToRemove && !keyToRemove.startsWith('data:') && deleteImage) {
            deleteImage(keyToRemove).catch(err => console.error("Failed to delete image from DB:", err));
        }
        onUpdate(screenshots.filter((_, index) => index !== indexToRemove));
    };

    const baseClasses = `relative border-2 border-dashed rounded-md p-2 transition-all min-h-[80px] h-full outline-none focus:border-blue-500 focus:bg-blue-50 dark:focus:bg-blue-900/10 focus:ring-2 focus:ring-blue-400 border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700`;
    const containerClasses = `${baseClasses} ${screenshots.length === 0 ? 'flex justify-center items-center' : ''} ${isDragOver ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : ''}`;

    const displayUrl = (key) => imageUrls[key];

    return (
        <React.Fragment>
            <div
                ref={innerRef}
                tabIndex={0}
                className={containerClasses}
                onPaste={handlePaste}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                {screenshots.length > 0 ? (
                    <div className="flex flex-wrap gap-2 w-full">
                        {screenshots.map((key, index) => (
                            <div key={index} className="relative group flex-shrink-0 w-full min-h-[40px] flex items-center justify-center bg-gray-100 dark:bg-slate-800 rounded">
                                {loadingImages[key] ? (
                                    <div className="flex items-center justify-center p-4">
                                        <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                                    </div>
                                ) : displayUrl(key) ? (
                                    <img
                                        src={displayUrl(key)}
                                        alt={`screenshot ${index + 1}`}
                                        className="w-full h-auto max-h-40 object-contain rounded border border-gray-300 dark:border-slate-600 cursor-pointer hover:opacity-75 transition-opacity"
                                        onClick={(e) => { e.stopPropagation(); setZoomedImage(displayUrl(key)); }}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center p-4 text-gray-400">
                                        <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                        </svg>
                                        <span className="text-[10px]">Image not found</span>
                                    </div>
                                )}
                                {!disabled && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeImage(index); }}
                                        className="absolute top-1 right-1 w-5 h-5 bg-black bg-opacity-50 text-white rounded-full flex items-center justify-center text-xs font-bold hover:bg-red-500 transition-all opacity-0 group-hover:opacity-100 z-10"
                                        title="Remove screenshot"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                        {!disabled && (
                            <p className="w-full text-[10px] text-gray-400 dark:text-gray-500 text-center pt-1">
                                Click here & press <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-slate-600 rounded text-[9px]">Ctrl+V</kbd> to paste more
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-1 text-gray-500 dark:text-gray-400 text-sm px-2 text-center">
                        <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                        <span>Click here & press <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-slate-600 rounded text-[10px]">Ctrl+V</kbd> to paste</span>
                        <span className="text-[10px] text-gray-400">or drag & drop an image</span>
                    </div>
                )}
            </div>

            {zoomedImage && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-[9999] p-4 cursor-zoom-out"
                    onClick={() => setZoomedImage(null)}
                >
                    <img
                        src={zoomedImage}
                        alt="Zoomed screenshot"
                        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        className="absolute top-4 right-4 text-white text-4xl font-bold hover:text-gray-300 transition-colors"
                        onClick={() => setZoomedImage(null)}
                        title="Close preview"
                    >
                        &times;
                    </button>
                </div>
            )}
        </React.Fragment>
    );
});

export default ImageUpload;