/**
 * Resizes a base64 encoded image to a maximum width and height.
 * @param base64Str The base64 string of the image.
 * @param maxWidth The maximum width of the resized image.
 * @param maxHeight The maximum height of the resized image.
 * @returns A promise that resolves with the resized image as a base64 string.
 */
export const resizeImage = (base64Str: string, maxWidth = 1280, maxHeight = 1280): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            let { width, height } = img;

            if (width <= maxWidth && height <= maxHeight) {
                resolve(base64Str);
                return;
            }

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round(width * (maxHeight / height));
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("Could not get canvas context"));
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = (err) => {
            console.error("Error loading image for resizing:", err);
            reject(new Error("Image failed to load"));
        };
    });
};
