export const formatDateDDMMMYYYY = (date: Date | string | null): string => {
    if (!date) return '';
    try {
        if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
            date = `${date}T00:00:00Z`;
        }
        const d = new Date(date);
        if (isNaN(d.getTime())) return String(date);
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        const year = d.getUTCFullYear();
        return `${day}-${month}-${year}`;
    } catch (e) {
        return String(date);
    }
};

export const getLocalDateString = (date?: Date | string | null): string => {
  const d = date ? new Date(date) : new Date();
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getLocalTimeString = (date?: Date | string | null): string => {
  const d = date ? new Date(date) : new Date();
  if (isNaN(d.getTime())) return "";
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

export const normalizeDateStr = (date: any): string => {
  if (!date) return "";
  if (typeof date === "string" && date.includes("T")) {
    return date.split("T")[0];
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatDateDisplay = (date: Date | string | null): string => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Parses a date string from various common formats and returns it in YYYY-MM-DD format.
 * @param dateString The date string to parse.
 * @returns The formatted date string, or an empty string if invalid.
 */
export const parseAndFormatDate = (dateString: string): string => {
  if (!dateString || typeof dateString !== "string") return "";

  const trimmed = dateString.trim();
  if (!trimmed) return "";

  // Handle '29-Apr-2024' or '1-Jul-25' format
  const excelDateMatch = trimmed.match(
    /^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})$/,
  );
  if (excelDateMatch) {
    const day = excelDateMatch[1];
    const monthStr = excelDateMatch[2];
    let year = excelDateMatch[3];
    if (year.length === 2) year = `20${year}`;

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthIndex = monthNames.findIndex(
      (m) => m.toLowerCase() === monthStr.toLowerCase(),
    );
    if (monthIndex > -1) {
      return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Handle ISO format already: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    const year = dmyMatch[3];
    // Defaulting to DD/MM/YYYY as it's common in this context
    return `${year}-${month}-${day}`;
  }

  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  console.warn(`Could not parse date: "${dateString}"`);
  return "";
};

/**
 * Formats a date string (YYYY-MM-DD or ISO) to DD-MMM-YYYY format.
 * @param dateStr Date string.
 * @returns Formatted date string (e.g., 29-Apr-2024).
 */
export const formatDateToDDMMMYYYY = (dateStr: string): string => {
  if (!dateStr) return "";

  let datePart = dateStr;
  if (dateStr.includes("T")) {
    datePart = dateStr.split("T")[0];
  }

  // Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const [year, month, day] = datePart.split("-");
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const mIdx = parseInt(month, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      return `${day}-${monthNames[mIdx]}-${year}`;
    }
  }

  // Attempt to handle ISO or other Date strings as fallback
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const day = d.getDate().toString().padStart(2, "0");
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const month = monthNames[d.getMonth()];
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    }
  } catch (e) {
    // Fallback
  }

  return dateStr;
};

export const getDurationFormula = (duration: string): string => {
  if (!duration) return "Less Than 5 Minutes";
  try {
    const parts = duration.split(":").map(Number);
    const minutes = (parts[0] || 0) * 60 + (parts[1] || 0);

    if (minutes > 19) return "More Than 20 Minutes";
    if (minutes > 9) return "10 - 19 Minutes";
    if (minutes > 4) return "5 - 9 Minutes";
    return "Less Than 5 Minutes";
  } catch (e) {
    return "Less Than 5 Minutes";
  }
};

export const calculateDuration = (inT: string, outT: string) => {
  if (!inT || !outT) return "0:0:0";
  try {
    const [inH, inM] = inT.split(":").map(Number);
    const [outH, outM] = outT.split(":").map(Number);

    let diffInMinutes = outH * 60 + outM - (inH * 60 + inM);
    if (diffInMinutes < 0) diffInMinutes += 24 * 60;

    const hours = Math.floor(diffInMinutes / 60);
    const minutes = diffInMinutes % 60;
    return `${hours}:${String(minutes).padStart(2, "0")}:00`;
  } catch (e) {
    return "0:0:0";
  }
};
