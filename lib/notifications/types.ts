/**
 * Shared notification domain types for Nur+.
 *
 * These types are the contract between the UI (settings screen), the
 * scheduling engine, and the three delivery backends
 * (Capacitor Local Notifications on Android, the Electron main process on
 * Windows, and the Web Notification API in a browser).
 */

/** The five daily prayers plus sunrise and sunset markers. */
export type PrayerKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'sunset' | 'maghrib' | 'isha';

export const PRAYER_KEYS: readonly PrayerKey[] = [
  'fajr',
  'sunrise',
  'dhuhr',
  'asr',
  'sunset',
  'maghrib',
  'isha',
];

/** Prayers that can produce an "X minutes before" reminder. */
export const REMINDABLE_PRAYER_KEYS: readonly PrayerKey[] = [
  'fajr',
  'dhuhr',
  'asr',
  'maghrib',
  'isha',
];

export const PRAYER_DISPLAY_NAMES: Record<PrayerKey, string> = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  sunset: 'Sunset',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

/**
 * How a prayer notification announces itself.
 *
 *  - `notification` : system default notification tone (or vibrate only)
 *  - `adhaan`       : the full Adhaan audio asset
 *  - `takbir`       : the opening "Allahu Akbar" phrase only
 *  - `silent`       : heads-up banner with no sound and no vibration
 */
export type AlertStyle = 'notification' | 'adhaan' | 'takbir' | 'silent';

export const ALERT_STYLES: readonly AlertStyle[] = ['notification', 'adhaan', 'takbir', 'silent'];

/** `Fajr` style keys, as returned by the AlAdhan timings API. */
export interface PrayerTimes {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Sunset: string;
  Maghrib: string;
  Isha: string;
}

/** User-facing notification preferences (persisted in app settings). */
export interface NotificationPreferences {
  /** Master switch. When false, every scheduled notification is withdrawn. */
  enabled: boolean;
  /** Per-prayer switches. */
  fajr: boolean;
  sunrise: boolean;
  dhuhr: boolean;
  asr: boolean;
  sunset: boolean;
  maghrib: boolean;
  isha: boolean;
  /** Minutes before the Adhaan for the "prepare for prayer" reminder. 0 disables. */
  beforeAdhan: number;
  /** How prayer notifications announce themselves. */
  alertStyle: AlertStyle;
  /** Which Adhaan recording to use. See `adhaan-sounds.ts`. */
  adhaanSoundId: string;
}

/** Whether a scheduled item is the prayer-time alert or the pre-prayer reminder. */
export type NotificationKind = 'prayer' | 'reminder';

/** A single notification the scheduler wants to arm. */
export interface PlannedNotification {
  id: number;
  kind: NotificationKind;
  prayer: PrayerKey;
  /** Absolute firing time. */
  at: Date;
  title: string;
  body: string;
  /** Android channel the notification is posted to. */
  channelId: string;
  /** Android `res/raw` file name (with extension) or `null` for channel default. */
  soundFile: string | null;
}

/** Result of a permission request, platform independent. */
export interface PermissionOutcome {
  granted: boolean;
  /** Human readable explanation suitable for display in the settings UI. */
  message: string;
  /** True when the OS requires the user to finish the grant in system settings. */
  needsSystemSettings: boolean;
}

/** Result of a "send test" action. */
export interface TestOutcome {
  success: boolean;
  message: string;
}
