/**
 * Prayer-time calendar retrieval and caching.
 *
 * WHY A CALENDAR AND NOT "TODAY'S TIMINGS REPEATED"
 * -------------------------------------------------
 * The previous scheduler fetched only *today's* timings from
 * `/v1/timings/{date}` and then reused those same clock times for the next seven
 * days. Prayer times move every single day (Fajr and Isha move fastest, by up to
 * a couple of minutes per day, and far more across seasons), so notifications
 * armed that way drift further out of true with every additional day and simply
 * become wrong.
 *
 * `/v1/calendar/{year}/{month}` returns a whole month of exact timings in one
 * request, so scheduling uses the correct time for every individual day.
 *
 * Caching is deliberately in `localStorage`:
 *  - it survives app restarts on Android and on Windows,
 *  - it means repeat scheduling runs make no network request at all,
 *  - and it works identically in the browser, in the Capacitor WebView and in the
 *    Electron renderer without any platform branching.
 */

import type { PrayerTimes } from '@/lib/notifications/types';
import type { PrayerCalendar } from '@/lib/notifications/schedule';

const ALADHAN_BASE = 'https://api.aladhan.com/v1';
const CACHE_PREFIX = 'nurplus-prayer-calendar:';

/** Current-month data is refreshed after this long; other months rarely change. */
const CURRENT_MONTH_TTL_MS = 6 * 60 * 60 * 1000;
const OTHER_MONTH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CalendarRequest {
  latitude: number;
  longitude: number;
  /** AlAdhan calculation method id, e.g. "2" for ISNA. */
  method: string;
  /** "0" for Shafi/Maliki/Hanbali, "1" for Hanafi. */
  school: string;
}

interface MonthCacheEntry {
  fetchedAt: number;
  days: Record<string, PrayerTimes>;
}

/** Stable cache key for a location + calculation configuration. */
function cacheKey(request: CalendarRequest, year: number, month: number): string {
  const lat = request.latitude.toFixed(4);
  const lng = request.longitude.toFixed(4);
  return `${CACHE_PREFIX}${lat}:${lng}:${request.method}:${request.school}:${year}-${month}`;
}

function readCache(key: string): MonthCacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MonthCacheEntry;
    if (!parsed || typeof parsed.fetchedAt !== 'number' || typeof parsed.days !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, entry: MonthCacheEntry): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Storage full or unavailable - caching is an optimisation, never a requirement.
  }
}

/** `dd-MM-yyyy` (the format AlAdhan returns) to `yyyy-MM-dd` (our key format). */
function normaliseGregorianDate(input: string): string | null {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(input.trim());
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

interface AlAdhanCalendarDay {
  timings?: Partial<PrayerTimes>;
  date?: { gregorian?: { date?: string } };
}

interface AlAdhanCalendarResponse {
  code: number;
  status?: string;
  data?: AlAdhanCalendarDay[];
}

/**
 * Fetch one month of timings, using the cache when it is still fresh.
 * Returns an empty object when the network or the API is unavailable.
 */
export async function getMonthCalendar(
  request: CalendarRequest,
  year: number,
  month: number,
  options: { forceRefresh?: boolean } = {},
): Promise<Record<string, PrayerTimes>> {
  const key = cacheKey(request, year, month);
  const cached = readCache(key);

  const isCurrentMonth =
    new Date().getFullYear() === year && new Date().getMonth() + 1 === month;
  const ttl = isCurrentMonth ? CURRENT_MONTH_TTL_MS : OTHER_MONTH_TTL_MS;

  if (!options.forceRefresh && cached && Date.now() - cached.fetchedAt < ttl) {
    return cached.days;
  }

  try {
    const params = new URLSearchParams({
      latitude: request.latitude.toString(),
      longitude: request.longitude.toString(),
      method: request.method,
      school: request.school,
    });
    const response = await fetch(`${ALADHAN_BASE}/calendar/${year}/${month}?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as AlAdhanCalendarResponse;
    if (payload.code !== 200 || !Array.isArray(payload.data)) {
      throw new Error(payload.status ?? 'Unexpected AlAdhan response');
    }

    const days: Record<string, PrayerTimes> = {};
    for (const entry of payload.data) {
      const gregorian = entry.date?.gregorian?.date;
      const timings = entry.timings;
      if (!gregorian || !timings) continue;
      const dayKey = normaliseGregorianDate(gregorian);
      if (!dayKey) continue;
      days[dayKey] = {
        Fajr: timings.Fajr ?? '',
        Sunrise: timings.Sunrise ?? '',
        Dhuhr: timings.Dhuhr ?? '',
        Asr: timings.Asr ?? '',
        Sunset: timings.Sunset ?? '',
        Maghrib: timings.Maghrib ?? '',
        Isha: timings.Isha ?? '',
      };
    }

    if (Object.keys(days).length > 0) {
      writeCache(key, { fetchedAt: Date.now(), days });
      return days;
    }
  } catch (error) {
    console.warn('[Nur+] Could not refresh the prayer calendar:', error);
  }

  // Network failed: fall back to whatever we last cached, however old.
  return cached?.days ?? {};
}

/**
 * Build a calendar covering `days` days starting today, fetching whatever months
 * that window touches.
 */
export async function getPrayerCalendar(
  request: CalendarRequest,
  days: number,
  options: { now?: Date; forceRefresh?: boolean } = {},
): Promise<PrayerCalendar> {
  const now = options.now ?? new Date();
  const calendar: PrayerCalendar = new Map();

  const monthsNeeded = new Set<string>();
  for (let offset = 0; offset < Math.max(days, 1); offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    monthsNeeded.add(`${day.getFullYear()}-${day.getMonth() + 1}`);
  }

  for (const monthKey of monthsNeeded) {
    const [year, month] = monthKey.split('-').map(Number);
    const monthDays = await getMonthCalendar(request, year, month, options);
    for (const [dayKey, timings] of Object.entries(monthDays)) {
      calendar.set(dayKey, timings);
    }
  }

  return calendar;
}

/** Remove every cached month. Exposed for the settings "refresh" action. */
export function clearCalendarCache(): void {
  if (typeof window === 'undefined') return;
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(CACHE_PREFIX)) keys.push(key);
  }
  for (const key of keys) window.localStorage.removeItem(key);
}

/**
 * The single day consumed by the home screen. Falls back to the network-free path
 * of the cache when called offline.
 */
export async function getTodayTimings(
  request: CalendarRequest,
): Promise<PrayerTimes | null> {
  const now = new Date();
  const month = await getMonthCalendar(request, now.getFullYear(), now.getMonth() + 1);
  const month2 = `${now.getMonth() + 1}`.padStart(2, '0');
  const day2 = `${now.getDate()}`.padStart(2, '0');
  return month[`${now.getFullYear()}-${month2}-${day2}`] ?? null;
}
