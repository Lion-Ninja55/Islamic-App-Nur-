/**
 * Nur+ notification system - public API.
 *
 * This module is the ONLY thing the UI is allowed to call. Everything below it is
 * platform specific, and the UI never needs to know which one is active.
 *
 * DATA FLOW
 * ---------
 *   1. The home screen holds the user's location and settings and fetches the
 *      prayer calendar.
 *   2. It calls `syncPrayerNotifications()` whenever prayer times, settings, the
 *      location, or the app's foreground state changes.
 *   3. This module builds one canonical plan with `buildSchedule()` and hands it to
 *      exactly one backend:
 *        - Android -> Capacitor Local Notifications (AlarmManager; survives app
 *          death and device reboots)
 *        - Windows -> the Electron main process (survives the window closing while
 *          the tray process is alive)
 *        - Browser -> in-page timers (only while the tab is open)
 *
 * NOTHING in this module cancels notifications on unmount. React lifecycle events
 * must never be able to wipe a user's alarms - that was the original defect.
 */

import { buildSchedule, summarisePlan, type PrayerCalendar } from './schedule';
import type { AlertStyle, NotificationPreferences, PrayerTimes, TestOutcome } from './types';
import { getRuntimePlatform, type RuntimePlatform } from '@/lib/platform';
import { initializeNotificationChannels } from './channels';
import {
  syncAndroidSchedule,
  sendAndroidTestNotification,
  clearAndroidSchedule,
} from './android-backend';
import {
  syncDesktopSchedule,
  sendDesktopTestNotification,
  sendDesktopTestAdhaan,
} from './desktop-backend';
import { armWebTimers, showWebNotification, clearWebTimers } from './web-backend';

/**
 * How many days ahead each platform schedules.
 *
 * Android holds every alert as a real OS alarm and the platform caps how many a
 * single app may hold, so we use a rolling window that is refreshed whenever the
 * app runs. Fourteen days covers ordinary usage with a wide margin and stays an
 * order of magnitude inside the limit even with reminders enabled.
 */
const ANDROID_HORIZON_DAYS = 14;

/** Windows holds the plan in memory, so a longer horizon costs nothing. */
const DESKTOP_HORIZON_DAYS = 30;

/** The browser only arms a handful of near-term timers. */
const WEB_HORIZON_DAYS = 2;

/** Days of calendar to fetch - a little more than the longest horizon. */
export const CALENDAR_FETCH_DAYS = 32;

export interface SyncOptions {
  /** Today's timings, used by the home screen and the desktop tray tooltip. */
  prayerTimes: PrayerTimes | null;
  preferences: NotificationPreferences;
  calendar: PrayerCalendar;
  location: {
    latitude: number | null;
    longitude: number | null;
    city: string;
    country: string;
    timezone: string;
  };
  calculationMethod: string;
  asrJuristic: string;
  /** Reference instant; defaults to now. */
  now?: Date;
}

export interface SyncOutcome {
  platform: RuntimePlatform;
  scheduled: number;
  message: string;
  notificationsDisabled: boolean;
}

/** True when the user has a usable location to compute prayer times from. */
export function hasUsableLocation(location: {
  latitude: number | null;
  longitude: number | null;
}): boolean {
  return (
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number' &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)
  );
}

function horizonFor(platform: RuntimePlatform): number {
  switch (platform) {
    case 'android':
      return ANDROID_HORIZON_DAYS;
    case 'desktop':
      return DESKTOP_HORIZON_DAYS;
    default:
      return WEB_HORIZON_DAYS;
  }
}

/**
 * Reconcile the platform's alarm set with the user's current settings.
 * Safe to call repeatedly; it is idempotent.
 */
export async function syncPrayerNotifications(options: SyncOptions): Promise<SyncOutcome> {
  const platform = getRuntimePlatform();
  const now = options.now ?? new Date();

  if (!options.preferences.enabled) {
    return withdrawAllNotifications(platform);
  }

  const plan = buildSchedule(options.calendar, options.preferences, {
    now,
    horizonCycles: horizonFor(platform),
  });
  const summary = summarisePlan(plan);

  if (platform === 'android') {
    await initializeNotificationChannels();
    const result = await syncAndroidSchedule(plan);
    return {
      platform,
      scheduled: result.scheduled,
      message: result.message,
      notificationsDisabled: result.notificationsDisabled,
    };
  }

  if (platform === 'desktop') {
    const result = await syncDesktopSchedule({
      preferences: options.preferences,
      location: options.location,
      calculationMethod: options.calculationMethod,
      asrJuristic: options.asrJuristic,
      plan,
      prayerTimes: options.prayerTimes,
    });
    return {
      platform,
      scheduled: result.scheduledCount,
      message: result.message,
      notificationsDisabled: false,
    };
  }

  // Browser: arm the near-term timers.
  const armed = armWebTimers(plan, (item) => {
    showWebNotification({
      title: item.title,
      body: item.body,
      alertStyle: options.preferences.alertStyle,
      adhaanSoundId: options.preferences.adhaanSoundId,
    });
  });

  return {
    platform,
    scheduled: armed,
    message:
      armed > 0
        ? `${armed} upcoming alert${armed === 1 ? '' : 's'} armed for this tab (${summary.total} in the next ${WEB_HORIZON_DAYS} days).`
        : 'Nothing upcoming to arm. Keep this tab open for browser notifications.',
    notificationsDisabled: false,
  };
}

/** Master switch turned off: remove everything this app scheduled. */
async function withdrawAllNotifications(platform: RuntimePlatform): Promise<SyncOutcome> {
  if (platform === 'android') {
    const removed = await clearAndroidSchedule();
    return {
      platform,
      scheduled: 0,
      message:
        removed > 0
          ? `Notifications disabled - cleared ${removed} scheduled alert${removed === 1 ? '' : 's'}.`
          : 'Notifications are disabled.',
      notificationsDisabled: false,
    };
  }
  if (platform === 'desktop') {
    const result = await syncDesktopSchedule({
      preferences: {
        enabled: false,
        fajr: false,
        sunrise: false,
        dhuhr: false,
        asr: false,
        sunset: false,
        maghrib: false,
        isha: false,
        beforeAdhan: 0,
        alertStyle: 'notification',
        adhaanSoundId: 'default-makkah',
      },
      location: { latitude: null, longitude: null, city: '', country: '', timezone: '' },
      calculationMethod: '2',
      asrJuristic: 'standard',
      prayerTimes: null,
    });
    return {
      platform,
      scheduled: 0,
      message: result.ok
        ? 'Notifications disabled - the desktop schedule was cleared.'
        : result.message,
      notificationsDisabled: false,
    };
  }
  clearWebTimers();
  return {
    platform,
    scheduled: 0,
    message: 'Notifications are disabled.',
    notificationsDisabled: false,
  };
}

/**
 * Send an immediate test notification that mirrors whatever the user's current
 * alert style would produce for a real prayer.
 */
export async function sendTestNotification(
  preferences: NotificationPreferences,
): Promise<TestOutcome> {
  const platform = getRuntimePlatform();
  const style: AlertStyle = preferences.alertStyle;

  if (platform === 'android') {
    return sendAndroidTestNotification({
      alertStyle: style,
      adhaanSoundId: preferences.adhaanSoundId,
      title: 'Nur+ test notification',
      body:
        style === 'silent'
          ? 'Silent prayer notifications are working.'
              : style === 'adhaan'
                ? 'Full Adhaan alerts are working.'
                : style === 'takbir'
                  ? 'Allahu Akbar alerts are working.'
                  : 'Prayer notifications are working.',
    });
  }

  if (platform === 'desktop') {
    return sendDesktopTestNotification({
      alertStyle: style,
      adhaanSoundId: preferences.adhaanSoundId,
    });
  }

  return showWebNotification({
    title: 'Nur+ test notification',
    body: 'Browser notifications are working while this tab is open.',
    alertStyle: style,
    adhaanSoundId: preferences.adhaanSoundId,
  });
}

/**
 * Send an immediate Test Adhaan notification. Always uses the Adhaan channel /
 * audio regardless of the currently selected alert style, because its whole
 * purpose is to prove that the Adhaan path works.
 */
export async function sendTestAdhaanNotification(
  preferences: NotificationPreferences,
): Promise<TestOutcome> {
  const platform = getRuntimePlatform();

  if (platform === 'android') {
    return sendAndroidTestNotification({
      alertStyle: 'adhaan',
      adhaanSoundId: preferences.adhaanSoundId,
      title: 'Nur+ Adhaan test',
      body: "Hayya 'alas-Salah - the Adhaan alert channel is working.",
    });
  }

  if (platform === 'desktop') {
    return sendDesktopTestAdhaan({ adhaanSoundId: preferences.adhaanSoundId });
  }

  return showWebNotification({
    title: 'Nur+ Adhaan test',
    body: "Hayya 'alas-Salah - the Adhaan audio is playing in this tab.",
    alertStyle: 'adhaan',
    adhaanSoundId: preferences.adhaanSoundId,
  });
}

/**
 * Send an immediate test using only the opening Allahu Akbar phrase.
 */
export async function sendTestTakbirNotification(
  preferences: NotificationPreferences,
): Promise<TestOutcome> {
  const platform = getRuntimePlatform();

  if (platform === 'android') {
    return sendAndroidTestNotification({
      alertStyle: 'takbir',
      adhaanSoundId: preferences.adhaanSoundId,
      title: 'Nur+ Allahu Akbar test',
      body: 'Allahu Akbar - the opening Takbir alert channel is working.',
    });
  }

  if (platform === 'desktop') {
    return sendDesktopTestNotification({
      alertStyle: 'takbir',
      adhaanSoundId: preferences.adhaanSoundId,
    });
  }

  return showWebNotification({
    title: 'Nur+ Allahu Akbar test',
    body: 'Allahu Akbar - the opening Takbir audio is playing in this tab.',
    alertStyle: 'takbir',
    adhaanSoundId: preferences.adhaanSoundId,
  });
}

export * from './types';
export { ADHAAN_SOUNDS, TAKBIR_SOUND, resolveAdhaanSound, resolveAlertAudio, type AdhaanSound } from './adhaan-sounds';
export {
  getNotificationDiagnostics,
  isNotificationPermissionGranted,
  isExactAlarmAllowed,
  requestNotificationPermission,
  openExactAlarmSettings,
  type NotificationDiagnostics,
} from './permissions';
export {
  initializeNotificationChannels,
  resetNotificationChannelsForUser,
  listNotificationChannels,
} from './channels';
export { TEST_NOTIFICATION_ID, TEST_ADHAAN_NOTIFICATION_ID, TEST_TAKBIR_NOTIFICATION_ID } from './ids';
export { buildSchedule, summarisePlan, type PrayerCalendar } from './schedule';
