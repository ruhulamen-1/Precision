export const safeJsonParse = (str, fallback = []) => {
    if (!str) return fallback;
    try {
        const parsed = typeof str === 'string' ? JSON.parse(str) : str;
        
        if (Array.isArray(fallback)) {
            return Array.isArray(parsed) ? parsed : fallback;
        }
        
        if (fallback !== null && typeof fallback === 'object') {
            return (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) ? parsed : fallback;
        }
        
        return parsed || fallback;
    } catch (e) {
        console.error("JSON Parse Error:", e);
        return fallback;
    }
};

export const formatDate = (dateValue) => {
    if (!dateValue) return '';
    
    const formatSingleDate = (ds) => {
        if (!ds) return '';
        
        // Handle ISO date only format (YYYY-MM-DD)
        if (typeof ds === 'string' && ds.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const date = new Date(`${ds}T00:00:00`);
            const options = { day: '2-digit', month: 'short', year: 'numeric' };
            return date.toLocaleDateString('en-GB', options);
        }

        const date = new Date(ds);
        if (!isNaN(date.getTime())) {
            const options = { day: '2-digit', month: 'short', year: 'numeric' };
            return date.toLocaleDateString('en-GB', options);
        }
        
        return ds;
    };

    const str = String(dateValue);

    if (str.includes(' to ')) {
        const [start, end] = str.split(' to ');
        return `${formatSingleDate(start)} to ${formatSingleDate(end)}`;
    }
    
    if (str.includes(' - ')) {
        const [start, end] = str.split(' - ');
        return `${formatSingleDate(start)} - ${formatSingleDate(end)}`;
    }

    return formatSingleDate(str);
};

export const getTimeZone = (timeString) => {
    if (!timeString) return null;
    const [hours, minutes] = timeString.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return null;

    const time = hours + minutes / 60;

    if (time >= 9 && time < 11) {
        return { name: 'Morning Drive', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/70 dark:text-sky-300' };
    }
    if (time >= 11 && time < 14) {
        return { name: 'Core Hours', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-300' };
    }
    if (time >= 14 && time < 15) {
        return { name: 'Lunch Block', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-300' };
    }
    if (time >= 15 && time <= 18) {
        return { name: 'Evening Shift', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/70 dark:text-indigo-300' };
    }
    return null;
};

export const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const dataURLtoBlob = (dataurl) => {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
};
