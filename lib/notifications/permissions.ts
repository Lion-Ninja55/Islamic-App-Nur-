/**
 * Permission handling for every platform Nur+ ships on.
 *
 * ANDROID PERMISSION MATRIX (what actually has to be granted, and when)
 * --------------------------------------------------------------------
 *  POST_NOTIFICATIONS            Android 13+ (API 33+). Runtime permission.
 *                                Requested via `requestPermissions()`.
 *  SCHEDULE_EXACT_ALARM          Android 12+ (API 31+). Special app access, NOT
 *                                a runtime permission: the user must toggle it in
 *                                system settings. Without it, Android silently
 *                                downgrades exact alarms to inexact ones - a
 *                                prayer alert can then fire up to ~15 minutes
 *                                late, so we ask for it and explain why.
 *  USE_EXACT_ALARM               Android 13+ (API 33+). Install-time grant, no
 *                                user prompt. See the manifest comment.
 *  RECEIVE_BOOT_COMPLETED        All versions. Only needed so the notification
 *                                plugin can restore alarms after a reboot.
 *
 * Nothing here requests location, storage, contacts, phone state, or any other
 * capability: prayer times come from the user's coordinates which the app already
 * has from a single foreground geolocation read on the web side.
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import {
  initializeNotificationChannels,
  isAndroidNative,
  NOTIFICATION_SMALL_ICON,
} from './channels';
import type { PermissionOutcome } from './types';
import { getDesktopBridge, getRuntimePlatform } from '@/lib/platform';

/** Current notification permission, without prompting. */
export async function isNotificationPermissionGranted(): Promise<boolean> {
  const platform = getRuntimePlatform();

  if (platform === 'desktop') {
    // Windows notifications are an OS-level user setting, not an app permission.
    return true;
  }

  if (platform === 'android') {
    try {
      const status = await LocalNotifications.checkPermissions();
      return status.display === 'granted';
    } catch {
      return false;
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  return Notification.permission === 'granted';
}

/** True when Android is allowed to use exact alarms. Always true elsewhere. */
export async function isExactAlarmAllowed(): Promise<boolean> {
  if (!isAndroidNative()) return true;
  try {
    const status = await LocalNotifications.checkExactNotificationSetting();
    return status.exact_alarm === 'granted';
  } catch {
    // The platform call does not exist on Android < 12, where exact alarms are
    // always allowed.
    return true;
  }
}

/**
 * Ask for notification permission, creating the Android channels first so that
 * the very first notification already has a channel to land in.
 */
export async function requestNotificationPermission(options?: {
  /** Also check (and if needed prompt for) exact-alarm access. */
  includeExactAlarm?: boolean;
}): Promise<PermissionOutcome> {
  const platform = getRuntimePlatform();
  const includeExactAlarm = options?.includeExactAlarm ?? true;

  if (platform === 'desktop') {
    const bridge = getDesktopBridge();
    if (!bridge) {
      return {
        granted: false,
        message: 'Desktop notification bridge is unavailable.',
        needsSystemSettings: false,
      };
    }
    return {
      granted: true,
      message:
        'Windows delivers Nur+ notifications through the system notification centre. Use your Windows notification settings to mute them.',
      needsSystemSettings: false,
    };
  }

  if (platform === 'android') {
    try {
      await initializeNotificationChannels();
      const status = await LocalNotifications.requestPermissions();
      if (status.display !== 'granted') {
        return {
          granted: false,
          message:
            'Notification permission was denied. Open system settings and allow notifications for Nur+ to receive prayer alerts.',
          needsSystemSettings: true,
        };
      }
    } catch (error) {
      return {
        granted: false,
        message:
          error instanceof Error
            ? `Could not request notification permission: ${error.message}`
            : 'Could not request notification permission.',
        needsSystemSettings: false,
      };
    }

    if (includeExactAlarm && !(await isExactAlarmAllowed())) {
      return {
        granted: true,
        message:
          'Notifications are allowed. For on-time prayer alerts, tap "Allow exact alarms" and turn on "Alarms & reminders" for Nur+.',
        needsSystemSettings: true,
      };
    }

    return {
      granted: true,
      message: 'Notifications are enabled.',
      needsSystemSettings: false,
    };
  }

  // ---- plain browser -------------------------------------------------
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      granted: false,
      message: 'This browser does not support notifications.',
      needsSystemSettings: false,
    };
  }
  if (Notification.permission === 'granted') {
    return { granted: true, message: 'Notifications are enabled.', needsSystemSettings: false };
  }
  if (Notification.permission === 'denied') {
    return {
      granted: false,
      message:
        'Notifications are blocked for this site. Re-enable them in your browser site settings.',
      needsSystemSettings: true,
    };
  }
  const permission = await Notification.requestPermission();
  return {
    granted: permission === 'granted',
    message:
      permission === 'granted'
        ? 'Notifications are enabled.'
        : 'Notification permission was not granted.',
    needsSystemSettings: false,
  };
}

/**
 * Open the OS screen where the user can grant exact-alarm access.
 *
 * On Android this hands off to system settings; Android restarts the app when the
 * setting flips from granted to denied and deletes exact alarms, which is why the
 * settings screen re-runs scheduling on every foreground transition.
 */
export async function openExactAlarmSettings(): Promise<PermissionOutcome> {
  if (!isAndroidNative()) {
    return { granted: true, message: 'Exact alarms are always allowed here.', needsSystemSettings: false };
  }
  try {
    const status = await LocalNotifications.changeExactNotificationSetting();
    const granted = status.exact_alarm === 'granted';
    return {
      granted,
      message: granted
        ? 'Exact alarms are allowed. Prayer notifications will fire on time.'
        : 'Exact alarms are still disabled. Prayer notifications may arrive a few minutes late.',
      needsSystemSettings: !granted,
    };
  } catch (error) {
    return {
      granted: false,
      message:
        error instanceof Error
          ? `Could not open the exact alarm settings: ${error.message}`
          : 'Could not open the exact alarm settings.',
      needsSystemSettings: true,
    };
  }
}

/** Full status snapshot used by the settings screen and diagnostics panel. */
export interface NotificationDiagnostics {
  platform: string;
  notificationsGranted: boolean;
  exactAlarmsGranted: boolean;
  /** Number of notifications currently armed with the OS. */
  pendingCount: number;
  /** Human readable summary of the next armed notification. */
  nextScheduled: string | null;
  /** Windows only: whether the tray process is in charge of scheduling. */
  desktopTrayActive: boolean;
}

export async function getNotificationDiagnostics(): Promise<NotificationDiagnostics> {
  const platform = getRuntimePlatform();
  const notificationsGranted = await isNotificationPermissionGranted();
  const exactAlarmsGranted = await isExactAlarmAllowed();

  if (platform === 'android') {
    let pendingCount = 0;
    let nextScheduled: string | null = null;
    try {
      const pending = await LocalNotifications.getPending();
      pendingCount = pending.notifications.length;
      const upcoming = pending.notifications
        .filter((item) => item.schedule?.at)
        .map((item) => ({
          title: item.title,
          at: new Date(item.schedule!.at as unknown as string).getTime(),
        }))
        .filter((item) => !Number.isNaN(item.at))
        .sort((a, b) => a.at - b.at)[0];
      if (upcoming) {
        nextScheduled = `${upcoming.title} - ${new Date(upcoming.at).toLocaleString()}`;
      }
    } catch {
      // Diagnostics are best-effort.
    }
    return {
      platform: 'android',
      notificationsGranted,
      exactAlarmsGranted,
      pendingCount,
      nextScheduled,
      desktopTrayActive: false,
    };
  }

  if (platform === 'desktop') {
    const bridge = getDesktopBridge();
    if (bridge) {
      try {
        const state = await bridge.getScheduleState();
        return {
          platform: 'windows',
          notificationsGranted: true,
          exactAlarmsGranted: true,
          pendingCount: state.scheduledCount,
          nextScheduled:
            state.nextFireAt && state.nextFireTitle
              ? `${state.nextFireTitle} - ${new Date(state.nextFireAt).toLocaleString()}`
              : null,
          desktopTrayActive: state.trayActive,
        };
      } catch {
        // fall through to the generic response
      }
    }
    return {
      platform: 'windows',
      notificationsGranted: true,
      exactAlarmsGranted: true,
      pendingCount: 0,
      nextScheduled: null,
      desktopTrayActive: false,
    };
  }

  return {
    platform: 'web',
    notificationsGranted,
    exactAlarmsGranted: true,
    pendingCount: 0,
    nextScheduled: null,
    desktopTrayActive: false,
  };
}

export { NOTIFICATION_SMALL_ICON };
