/**
 * Prayer-time retrieval and schedule construction for the desktop build.
 *
 * The main process owns this so the schedule keeps working while the window is
 * closed: it fetches the AlAdhan calendar itself, caches each month on disk, and
 * rebuilds the notification plan from the cached settings.
 *
 * This is the CommonJS mirror of `lib/prayer-times/calendar.ts` +
 * `lib/notifications/schedule.ts`. The rules it implements are:
 *   1. a rolling window of `horizonDays`, using the REAL time for each day
 *      (never "today's times repeated", which drifts out of true within days);
 *   2. sunrise and sunset are markers, so they never get reminders;
 *   3. ids come from the shared table in constants.cjs so they match Android.
 */

const {
  notificationId,
  cycleIndexForDate,
  PRAYER_KEYS,
  REMINDABLE_PRAYER_KEYS,
  PRAYER_DISPLAY_NAMES,
  PRAYER_TIMES_KEY,
  resolveAlertAudio,
} = require('./constants.cjs');

const ALADHAN_BASE = 'https://api.aladhan.com/v1';

/** Refresh the current month at most this often. */
const CURRENT_MONTH_TTL_MS = 6 * 60 * 60 * 1000;
const OTHER_MONTH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** `yyyy-MM-dd` for a local date. */
function dayKey(date) {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `dd-MM-yyyy` (AlAdhan) to `yyyy-MM-dd`. */
function normaliseGregorian(input) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(input || '').trim());
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** Turn `HH:mm` on a given day into a concrete local Date. */
function prayerTimeToDate(key, time) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time || '').trim());
  if (!match) return null;
  const [year, month, day] = key.split('-').map(Number);
  const result = new Date(year, month - 1, day, Number(match[1]), Number(match[2]), 0, 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

/** One month of timings, using the on-disk cache when it is still fresh. */
async function fetchMonth({ latitude, longitude, method, school, year, month, calendarCache, force }) {
  const cacheKey = `${year}-${month}`;
  const cached = calendarCache[cacheKey];
  const isCurrentMonth = new Date().getFullYear() === year && new Date().getMonth() + 1 === month;
  const ttl = isCurrentMonth ? CURRENT_MONTH_TTL_MS : OTHER_MONTH_TTL_MS;

  if (!force && cached && cached.days && Date.now() - cached.fetchedAt < ttl) {
    return cached.days;
  }

  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      method: String(method),
      school: String(school),
    });
    const response = await fetch(`${ALADHAN_BASE}/calendar/${year}/${month}?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.code !== 200 || !Array.isArray(payload.data)) {
      throw new Error(payload.status || 'Unexpected AlAdhan response');
    }

    const days = {};
    for (const entry of payload.data) {
      const gregorian = entry.date && entry.date.gregorian ? entry.date.gregorian.date : null;
      const timings = entry.timings;
      if (!gregorian || !timings) continue;
      const key = normaliseGregorian(gregorian);
      if (!key) continue;
      days[key] = {
        Fajr: timings.Fajr || '',
        Sunrise: timings.Sunrise || '',
        Dhuhr: timings.Dhuhr || '',
        Asr: timings.Asr || '',
        Sunset: timings.Sunset || '',
        Maghrib: timings.Maghrib || '',
        Isha: timings.Isha || '',
      };
    }

    if (Object.keys(days).length > 0) {
      calendarCache[cacheKey] = { fetchedAt: Date.now(), days };
      return days;
    }
  } catch (error) {
    console.warn('[Nur+] Desktop calendar refresh failed:', error.message);
  }

  return cached && cached.days ? cached.days : {};
}

/** Build a merged calendar covering `days` days from today. */
async function buildCalendar(options, calendarCache, force) {
  const now = new Date();
  const merged = {};
  const monthsNeeded = new Set();
  for (let offset = 0; offset < options.days; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    monthsNeeded.add(`${date.getFullYear()}-${date.getMonth() + 1}`);
  }

  for (const monthKey of monthsNeeded) {
    const [year, month] = monthKey.split('-').map(Number);
    const days = await fetchMonth({
      ...options,
      year,
      month,
      calendarCache,
      force,
    });
    Object.assign(merged, days);
  }

  return merged;
}

/**
 * Build the notification plan for the desktop scheduler.
 *
 * @returns {Array<{id:number,kind:string,prayer:string,at:string,title:string,body:string,soundFile:string|null}>}
 */
function buildPlan(calendar, preferences, options) {
  const now = options && options.now ? options.now : new Date();
  const nowMs = now.getTime();
  const horizonMs = (options && options.horizonDays ? options.horizonDays : 30) * 86400000;
  const alertAudio = resolveAlertAudio(preferences.alertStyle, preferences.adhaanSoundId);
  const plan = [];

  if (!preferences || preferences.enabled !== true) return plan;

  for (const key of Object.keys(calendar).sort()) {
    const times = calendar[key];
    if (!times) continue;

    for (const prayer of PRAYER_KEYS) {
      if (preferences[prayer] !== true) continue;

      const rawTime = times[PRAYER_TIMES_KEY[prayer]];
      const at = rawTime ? prayerTimeToDate(key, rawTime) : null;
      if (!at) continue;

      const atMs = at.getTime();
      if (atMs <= nowMs || atMs > nowMs + horizonMs) continue;

      const cycle = cycleIndexForDate(at);

      plan.push({
        id: notificationId(cycle, prayer, 'prayer'),
        kind: 'prayer',
        prayer,
        at: at.toISOString(),
        title:
          prayer === 'sunrise' || prayer === 'sunset'
            ? PRAYER_DISPLAY_NAMES[prayer]
            : `${PRAYER_DISPLAY_NAMES[prayer]} Prayer Time`,
        body:
          prayer === 'sunrise'
            ? 'The sun has risen. Fajr prayer time has ended.'
            : prayer === 'sunset'
              ? 'The sun has set. Maghrib prayer time is approaching.'
              : `It is now time for ${PRAYER_DISPLAY_NAMES[prayer]} prayer.`,
        soundFile:
          preferences.alertStyle === 'adhaan' || preferences.alertStyle === 'takbir'
            ? alertAudio.webFile
            : null,
      });

      const reminderMinutes = Number(preferences.beforeAdhan) || 0;
      if (REMINDABLE_PRAYER_KEYS.includes(prayer) && reminderMinutes > 0) {
        const reminderAt = new Date(atMs - reminderMinutes * 60000);
        const reminderMs = reminderAt.getTime();
        if (reminderMs > nowMs && reminderMs <= nowMs + horizonMs) {
          plan.push({
            id: notificationId(cycle, prayer, 'reminder'),
            kind: 'reminder',
            prayer,
            at: reminderAt.toISOString(),
            title: `${PRAYER_DISPLAY_NAMES[prayer]} Reminder`,
            body: `${PRAYER_DISPLAY_NAMES[prayer]} prayer begins in ${reminderMinutes} ${
              reminderMinutes === 1 ? 'minute' : 'minutes'
            }.`,
            soundFile: null,
          });
        }
      }
    }
  }

  plan.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return plan;
}

/** Today's timings, used for the tray tooltip. */
function todayTimings(calendar) {
  return calendar[dayKey(new Date())] || null;
}

module.exports = { buildCalendar, buildPlan, todayTimings, dayKey };
