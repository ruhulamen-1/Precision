
/**
 * Robustly parses a CSV file by detecting encoding (UTF-8 vs Windows-1252/ANSI).
 * This helps prevent weird symbols like  when importing files from Excel.
 */
export const parseCSVRobustly = (file: File, config: any) => {
    if (typeof window.Papa === 'undefined') {
        if (config.error) config.error(new Error("PapaParse library not found"));
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer) return;

        let text = '';
        try {
            // Try UTF-8 first with fatal: true to trigger error on invalid sequences
            const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
            text = utf8Decoder.decode(buffer);
        } catch (err) {
            console.warn('UTF-8 decoding failed for CSV, falling back to Windows-1252...', err);
            // Fallback to Windows-1252 which captures most Excel ANSI exports
            const winDecoder = new TextDecoder('windows-1252');
            text = winDecoder.decode(buffer);
        }

        window.Papa.parse(text, config);
    };
    
    reader.onerror = (err) => {
        if (config.error) config.error(err);
    };
    
    reader.readAsArrayBuffer(file);
};
