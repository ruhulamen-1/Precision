/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Every date shown anywhere in the app's tables goes through this — dd-mmm-yyyy,
// no time (e.g. "18-Aug-2026"), regardless of what shape the value arrives in:
// a plain "YYYY-MM-DD" string (most API date fields), a full ISO timestamp
// (mysql2 sends DATE/TIMESTAMP columns as "2026-08-18T00:00:00.000Z" once JSON
// round-trips them, since the pool isn't using the dateStrings option), or an
// actual JS Date instance.
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';

  let year: number, month: number, day: number;

  if (value instanceof Date) {
    year = value.getFullYear();
    month = value.getMonth();
    day = value.getDate();
  } else {
    const str = String(value).trim();
    if (!str) return '';
    // Pull the "YYYY-MM-DD" out of the front of the string directly (rather than
    // going through `new Date(str)`) so a date-only value never gets shifted a day
    // by the local timezone's offset from UTC.
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return str; // not a recognizable date — show whatever we were given
    year = Number(match[1]);
    month = Number(match[2]) - 1;
    day = Number(match[3]);
  }

  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  if (month < 0 || month > 11 || Number.isNaN(year) || Number.isNaN(day)) return String(value);
  return `${String(day).padStart(2, '0')}-${MONTHS[month]}-${year}`;
}

// Today's date as "YYYY-MM-DD", read from the browser's LOCAL date components
// (getFullYear/getMonth/getDate) rather than `new Date().toISOString()` — the latter
// converts to UTC, which reads as yesterday for the first several hours of every day
// in timezones ahead of UTC (e.g. Bangladesh, UTC+6, midnight–5:59am local).
export function todayDateOnlyString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}