/**
 * Deterministic, collision-free notification identifiers.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The previous implementation derived ids arithmetically:
 *
 *     ((dayOffset * 10) + key.charCodeAt(0) + key.charCodeAt(1)) % 2147483647
 *
 * That formula collides. Real worked example:
 *
 *     sunrise, day 2 -> (2*10)  + 115 + 117 = 252
 *     asr,     day 4 -> (4*10)  +  97 + 115 = 252   <-- identical id
 *
 * On Android the notification id is the request code of a PendingIntent, so two
 * notifications sharing an id means the second silently replaces the first and
 * a prayer alert is lost. This module makes ids structural rather than
 * arithmetic guesswork, so uniqueness holds by construction.
 *
 * LAYOUT (fits comfortably in Android's signed 32-bit int id space)
 * -----------------------------------------------------------------
 *   100000         base namespace, far above anything the OS uses
 *   + cycle * 1000  day-cycle index (0 .. MAX_SCHEDULE_CYCLES)
 *   + prayer * 20   prayer index (0..6 used of 0..7 reserved)
 *   + kind * 10     kind: 0 = prayer time, 1 = pre-prayer reminder
 *   + slot          spare low digit, keeps ids readable, always 0 for now
 *
 * Highest id for a 365-day horizon:
 *   100000 + 364000 + 120 + 10 = 464130   (limit is 2147483647)
 */

import { type PrayerKey, type NotificationKind } from './types';

const ID_NAMESPACE = 100_000;
const IDS_PER_CYCLE = 1_000;
const IDS_PER_PRAYER = 20;
const IDS_PER_KIND = 10;

/** Highest day-cycle index the id layout can express. */
export const MAX_SCHEDULE_CYCLES = 364;

/**
 * Fixed ids for the two manual test actions, so repeated taps replace the
 * previous test rather than stacking an unbounded pile in the notification shade.
 */
export const TEST_NOTIFICATION_ID = 900_001;
export const TEST_ADHAAN_NOTIFICATION_ID = 900_002;
export const TEST_TAKBIR_NOTIFICATION_ID = 900_003;

/** Lowest id this application owns; everything at or above is ours to cancel. */
export const MANAGED_ID_FLOOR = ID_NAMESPACE;

const PRAYER_INDEX: Record<PrayerKey, number> = {
  fajr: 0,
  sunrise: 1,
  dhuhr: 2,
  asr: 3,
  sunset: 4,
  maghrib: 5,
  isha: 6,
};

const KIND_INDEX: Record<NotificationKind, number> = {
  prayer: 0,
  reminder: 1,
};

/** Stable id for one prayer notification on one day of the rolling window. */
export function notificationId(
  cycle: number,
  prayer: PrayerKey,
  kind: NotificationKind,
): number {
  if (!Number.isInteger(cycle) || cycle < 0 || cycle > MAX_SCHEDULE_CYCLES) {
    throw new RangeError(
      `notificationId: cycle ${cycle} is outside 0..${MAX_SCHEDULE_CYCLES}`,
    );
  }
  return (
    ID_NAMESPACE +
    cycle * IDS_PER_CYCLE +
    PRAYER_INDEX[prayer] * IDS_PER_PRAYER +
    KIND_INDEX[kind] * IDS_PER_KIND
  );
}

/**
 * Every id the scheduler may ever arm. Cancelling exactly this set (instead of
 * `cancelAll()`) is what allows a reschedule to run without wiping notifications
 * that belong to another feature or another day.
 */
export function allManagedIds(cycles: number = MAX_SCHEDULE_CYCLES): number[] {
  const ids: number[] = [];
  const prayers = Object.keys(PRAYER_INDEX) as PrayerKey[];
  const kinds: NotificationKind[] = ['prayer', 'reminder'];
  const limit = Math.min(cycles, MAX_SCHEDULE_CYCLES);
  for (let cycle = 0; cycle <= limit; cycle += 1) {
    for (const prayer of prayers) {
      for (const kind of kinds) {
        ids.push(notificationId(cycle, prayer, kind));
      }
    }
  }
  return ids;
}

/** True when an id belongs to this application's scheduling namespace. */
export function isManagedId(id: number): boolean {
  return Number.isInteger(id) && id >= MANAGED_ID_FLOOR;
}

/**
 * Day-cycle index for a date, relative to a fixed epoch.
 * Using an absolute epoch (rather than "today + N") means a reschedule at
 * 23:59 and one at 00:01 produce the same id for the same calendar day, so
 * re-running the scheduler is idempotent instead of producing duplicates.
 */
export function cycleIndexForDate(date: Date): number {
  const dayNumber = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
  const cycle = dayNumber % (MAX_SCHEDULE_CYCLES + 1);
  return cycle < 0 ? cycle + MAX_SCHEDULE_CYCLES + 1 : cycle;
}
