const IST_TIMEZONE = 'Asia/Kolkata';

function toValidDate(input?: Date | string | number): Date | null {
  if (input === undefined || input === null || input === '') return new Date();
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formats a date/timestamp in 12-hour Indian Standard Time (e.g. "12 Nov 2026, 06:36:38 PM IST").
 * Returns the original text unchanged if the input is not a parseable timestamp.
 */
export function formatIst12Hr(input?: Date | string | number): string {
  const date = toValidDate(input);
  if (!date) return String(input ?? '');

  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date);

  return `${formatted.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase())} IST`;
}

/**
 * Formats time-only in 12-hour IST (e.g. "06:36:38 PM IST").
 */
export function formatIstTimeOnly12Hr(input?: Date | string | number): string {
  const date = toValidDate(input);
  if (!date) return String(input ?? '');

  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date);

  return `${formatted.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase())} IST`;
}

/**
 * Formats a filesystem-safe 12-hour IST stamp (e.g. "2026-11-12_06-36-38-PM-IST").
 */
export function formatIstFileStamp(input?: Date | string | number): string {
  const date = toValidDate(input) || new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || '';

  const dayPeriod = get('dayPeriod').toUpperCase() || 'AM';
  return `${get('year')}-${get('month')}-${get('day')}_${get('hour')}-${get('minute')}-${get('second')}-${dayPeriod}-IST`;
}
