export const getLocalDateString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const getLocalTimeString = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

export const normalizeDateStr = (dateVal: any) => {
    if (!dateVal) return '';
    if (dateVal instanceof Date) {
        const year = dateVal.getUTCFullYear();
        const month = String(dateVal.getUTCMonth() + 1).padStart(2, '0');
        const day = String(dateVal.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    const str = String(dateVal);
    const match = str.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    if (str.includes('T')) return str.split('T')[0];
    
    try {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
            const year = d.getUTCFullYear();
            const month = String(d.getUTCMonth() + 1).padStart(2, '0');
            const day = String(d.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    } catch (e) {}
    
    return str;
};

export const formatDateForInput = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    const normalized = normalizeDateStr(dateStr);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
    return normalized;
};

export const formatDateDisplay = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    const normalized = normalizeDateStr(dateStr);
    try {
        const parts = normalized.split('-');
        if (parts.length === 3) {
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const day = parseInt(parts[2]);
            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            }
        }
        return normalized;
    } catch (e) {
        return normalized;
    }
};
