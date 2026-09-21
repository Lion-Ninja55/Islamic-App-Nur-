/**
 * Pure scheduling engine.
 *
 * Given a calendar of prayer times and the user's preferences, produce the exact
 * list of notifications that should be armed. This function performs no I/O and
 * touches no platform API, which makes it trivially unit-testable and lets the
 * very same logic run on Android, on Windows and in a browser.
 */

import {
  PRAYER_KEYS,
  PRAYER_DISPLAY_NAMES,
  REMINDABLE_PRAYER_KEYS,
  type NotificationPreferences,
  type PlannedNotification,
  type PrayerKey,
  type PrayerTimes,
} from './types';
import { notificationId, cycleIndexForDate, MAX_SCHEDULE_CYCLES } from './ids';
import { resolveAlertAudio } from './adhaan-sounds';
import { channelIdForPrayer, channelIdForReminder } from './channels';

/** Map of `yyyy-MM-dd` (local date) to that day's timings. */
export type PrayerCalendar = Map<string, PrayerTimes>;

export interface BuildScheduleOptions {
  /** Reference instant. Defaults to now. Notifications in the past are dropped. */
  now?: Date;
  /** How many day-cycles to schedule. Capped at MAX_SCHEDULE_CYCLES. */
  horizonCycles?: number;
}

/** Local `yyyy-MM-dd` key, matching the calendar map. */
export function calendarKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Turn an `HH:mm` (or `HH:mm (TZ)`) string from the AlAdhan API into a concrete
 * local Date on the given day.
 */
export function prayerTimeToDate(dayKey: string, time: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const [year, month, day] = dayKey.split('-').map(Number);
  const result = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

function prayerBody(prayer: PrayerKey): string {
  if (prayer === 'sunrise') {
    return 'The sun has risen. Fajr prayer time has ended.';
  }
  if (prayer === 'sunset') {
    return 'The sun has set. Maghrib prayer time is approaching.';
  }
  return `It is now time for ${PRAYER_DISPLAY_NAMES[prayer]} prayer.`;
}

function reminderBody(prayer: PrayerKey, minutes: number): string {
  const unit = minutes === 1 ? 'minute' : 'minutes';
  return `${PRAYER_DISPLAY_NAMES[prayer]} prayer begins in ${minutes} ${unit}.`;
}

/**
 * Build the complete, ordered notification plan.
 *
 * The returned array is sorted by firing time so callers (and tests) can rely on
 * a deterministic order.
 */
export function buildSchedule(
  calendar: PrayerCalendar,
  preferences: NotificationPreferences,
  options: BuildScheduleOptions = {},
): PlannedNotification[] {
  if (!preferences.enabled) return [];

  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const horizon = Math.min(
    options.horizonCycles ?? MAX_SCHEDULE_CYCLES,
    MAX_SCHEDULE_CYCLES,
  );

  const alertAudio = resolveAlertAudio(preferences.alertStyle, preferences.adhaanSoundId);
  const plan: PlannedNotification[] = [];
  const horizonEnd = nowMs + horizon * 86_400_000;

  const dayKeys = Array.from(calendar.keys()).sort();
  for (const dayKey of dayKeys) {
    const times = calendar.get(dayKey);
    if (!times) continue;

    for (const prayer of PRAYER_KEYS) {
      if (!preferences[prayer]) continue;

      const rawTime = times[prayerToTimesKey(prayer)];
      if (!rawTime) continue;

      const at = prayerTimeToDate(dayKey, rawTime);
      if (!at) continue;

      const atMs = at.getTime();
      if (atMs <= nowMs || atMs > horizonEnd) continue;

      const cycle = cycleIndexForDate(at);

      // ---- the prayer-time notification -------------------------------
      plan.push({
        id: notificationId(cycle, prayer, 'prayer'),
        kind: 'prayer',
        prayer,
        at,
        title:
          prayer === 'sunrise' || prayer === 'sunset'
            ? `${PRAYER_DISPLAY_NAMES[prayer]}`
            : `${PRAYER_DISPLAY_NAMES[prayer]} Prayer Time`,
        body: prayerBody(prayer),
        channelId: channelIdForPrayer(preferences.alertStyle, alertAudio),
        soundFile:
          preferences.alertStyle === 'adhaan' || preferences.alertStyle === 'takbir'
            ? alertAudio.androidRawFile
            : null,
      });

      // ---- the optional "X minutes before" reminder --------------------
      // Sunrise and sunset are markers, not prayers, so they never get reminders.
      const reminderMinutes = preferences.beforeAdhan;
      const isRemindable = REMINDABLE_PRAYER_KEYS.includes(prayer);
      if (isRemindable && reminderMinutes > 0) {
        const reminderAt = new Date(atMs - reminderMinutes * 60_000);
        const reminderMs = reminderAt.getTime();
        if (reminderMs > nowMs && reminderMs <= horizonEnd) {
          plan.push({
            id: notificationId(cycle, prayer, 'reminder'),
            kind: 'reminder',
            prayer,
            at: reminderAt,
            title: `${PRAYER_DISPLAY_NAMES[prayer]} Reminder`,
            body: reminderBody(prayer, reminderMinutes),
            channelId: channelIdForReminder(preferences.alertStyle),
            soundFile: null,
          });
        }
      }
    }
  }

  plan.sort((a, b) => a.at.getTime() - b.at.getTime());
  return plan;
}

/** Map the lowercase preference key onto the AlAdhan timings property. */
function prayerToTimesKey(prayer: PrayerKey): keyof PrayerTimes {
  switch (prayer) {
    case 'fajr':
      return 'Fajr';
    case 'sunrise':
      return 'Sunrise';
    case 'dhuhr':
      return 'Dhuhr';
    case 'asr':
      return 'Asr';
    case 'sunset':
      return 'Sunset';
    case 'maghrib':
      return 'Maghrib';
    case 'isha':
      return 'Isha';
  }
}

/** Total number of notifications a plan contains, by kind. */
export function summarisePlan(plan: PlannedNotification[]): {
  total: number;
  prayer: number;
  reminder: number;
} {
  let prayer = 0;
  let reminder = 0;
  for (const item of plan) {
    if (item.kind === 'prayer') prayer += 1;
    else reminder += 1;
  }
  return { total: plan.length, prayer, reminder };
}
