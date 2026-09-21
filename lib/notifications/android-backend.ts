/**
 * Android delivery backend (Capacitor Local Notifications).
 *
 * VERIFIED AGAINST THE INSTALLED PLUGIN SOURCE (8.3.1)
 * ---------------------------------------------------
 *  - `schedule.at` is declared as a `Date` in `definitions.d.ts`, and the native
 *    parser (`LocalNotificationSchedule.kt`) reads it with
 *    `SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")` in the **UTC** timezone.
 *    Passing a real `Date` is correct: the Capacitor bridge JSON-serialises it to
 *    exactly that ISO-8601 UTC form, so the absolute instant is preserved.
 *  - `smallIcon` is resolved with `AssetUtil.getResourceID(ctx, name, "drawable")`
 *    in BOTH `LocalNotification.resolveSmallIcon` and the plugin default. It must
 *    therefore be a **drawable** resource, not a mipmap launcher icon.
 *  - A one-shot `at` schedule sets `isExactNotification = true` by default, and the
 *    native side then calls `AlarmManager.setExactAndAllowWhileIdle()` whenever
 *    `canScheduleExactAlarms()` allows it. `allowWhileIdle: true` is what selects
 *    the wake-up variant.
 *  - `schedule()` rejects the whole call with `NOTIFICATIONS_DISABLED` when
 *    `areNotificationsEnabled()` is false, so denial surfaces as a real error and
 *    is reported to the user rather than failing silently.
 *  - Re-arming an already scheduled id cancels the previous alarm first, so this
 *    backend is safely idempotent.
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import {
  initializeNotificationChannels,
  isAndroidNative,
  NOTIFICATION_ICON_COLOR,
  NOTIFICATION_SMALL_ICON,
} from './channels';
import { isManagedId, TEST_ADHAAN_NOTIFICATION_ID, TEST_NOTIFICATION_ID, TEST_TAKBIR_NOTIFICATION_ID } from './ids';
import type { PlannedNotification, TestOutcome } from './types';
import { resolveAlertAudio } from './adhaan-sounds';
import { requestNotificationPermission } from './permissions';
import type { AlertStyle } from './types';

/**
 * Android caps the number of alarms a single app may hold. Staying an order of
 * magnitude below the platform ceiling keeps re-scheduling cheap and reliable.
 */
const ANDROID_MAX_ALARMS = 500;

/** Bridge payloads are chunked to keep a single call small. */
const SCHEDULE_CHUNK_SIZE = 80;

export interface AndroidSyncResult {
  scheduled: number;
  cancelled: number;
  /** True when the OS refused because notifications are disabled for the app. */
  notificationsDisabled: boolean;
  message: string;
}

/** Convert one planned notification into the plugin's wire format. */
function toWireFormat(item: PlannedNotification) {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    channelId: item.channelId,
    smallIcon: NOTIFICATION_SMALL_ICON,
    iconColor: NOTIFICATION_ICON_COLOR,
    autoCancel: true,
    // `sound` only takes effect on Android 7.x (and on 8+ it is ignored in favour
    // of the channel), but setting it keeps the legacy path correct.
    ...(item.soundFile ? { sound: item.soundFile } : {}),
    schedule: {
      at: item.at,
      allowWhileIdle: true,
    },
    extra: {
      source: 'nurplus',
      kind: item.kind,
      prayer: item.prayer,
      scheduledBy: 'prayer-scheduler',
    },
  };
}

/** Reads the ids the OS currently holds for this app. */
async function getPendingIds(): Promise<number[]> {
  try {
    const pending = await LocalNotifications.getPending();
    return pending.notifications.map((item) => item.id);
  } catch (error) {
    console.warn('[Nur+] Could not read pending notifications:', error);
    return [];
  }
}

/**
 * Make the OS schedule exactly match `plan`.
 *
 * Only ids inside this app's scheduling namespace are ever cancelled, so running
 * this is safe while other notifications (a running Adhaan alert, a future remote
 * announcement) are on screen.
 */
export async function syncAndroidSchedule(
  plan: PlannedNotification[],
): Promise<AndroidSyncResult> {
  if (!isAndroidNative()) {
    return {
      scheduled: 0,
      cancelled: 0,
      notificationsDisabled: false,
      message: 'Android scheduling is not active on this platform.',
    };
  }

  await initializeNotificationChannels();

  const wanted = plan.filter((item) => isManagedId(item.id));
  const capped = wanted.slice(0, ANDROID_MAX_ALARMS);
  const wantedIds = new Set(capped.map((item) => item.id));

  // Cancel only what we own and no longer need.
  const pendingIds = await getPendingIds();
  const staleIds = pendingIds.filter((id) => isManagedId(id) && !wantedIds.has(id));
  let cancelled = 0;
  for (let index = 0; index < staleIds.length; index += SCHEDULE_CHUNK_SIZE) {
    const slice = staleIds.slice(index, index + SCHEDULE_CHUNK_SIZE);
    try {
      await LocalNotifications.cancel({
        notifications: slice.map((id) => ({ id })),
      });
      cancelled += slice.length;
    } catch (error) {
      console.warn('[Nur+] Failed to cancel stale notifications:', error);
    }
  }

  if (capped.length === 0) {
    return {
      scheduled: 0,
      cancelled,
      notificationsDisabled: false,
      message:
        cancelled > 0
          ? `Cleared ${cancelled} scheduled notification${cancelled === 1 ? '' : 's'}.`
          : 'Nothing to schedule.',
    };
  }

  let scheduled = 0;
  try {
    for (let index = 0; index < capped.length; index += SCHEDULE_CHUNK_SIZE) {
      const slice = capped.slice(index, index + SCHEDULE_CHUNK_SIZE);
      await LocalNotifications.schedule({
        notifications: slice.map(toWireFormat),
      });
      scheduled += slice.length;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notificationsDisabled = /notifications? (are )?disabled|NOTIFICATIONS_DISABLED/i.test(
      message,
    );
    return {
      scheduled,
      cancelled,
      notificationsDisabled,
      message: notificationsDisabled
        ? 'Notifications are turned off for Nur+ in Android settings, so nothing could be scheduled.'
        : `Scheduling failed: ${message}`,
    };
  }

  return {
    scheduled,
    cancelled,
    notificationsDisabled: false,
    message: `Scheduled ${scheduled} notification${scheduled === 1 ? '' : 's'}${
      cancelled > 0 ? `, cleared ${cancelled} stale` : ''
    }.`,
  };
}

/** Remove every notification this app has armed. */
export async function clearAndroidSchedule(): Promise<number> {
  if (!isAndroidNative()) return 0;
  const pendingIds = await getPendingIds();
  const managed = pendingIds.filter(isManagedId);
  for (let index = 0; index < managed.length; index += SCHEDULE_CHUNK_SIZE) {
    const slice = managed.slice(index, index + SCHEDULE_CHUNK_SIZE);
    try {
      await LocalNotifications.cancel({
        notifications: slice.map((id) => ({ id })),
      });
    } catch {
      // best effort
    }
  }
  return managed.length;
}

/**
 * Fire a real notification straight away, using the exact same channel, icon and
 * sound pipeline as a scheduled prayer alert.
 */
export async function sendAndroidTestNotification(options: {
  alertStyle: AlertStyle;
  adhaanSoundId: string;
  title: string;
  body: string;
}): Promise<TestOutcome> {
  if (!isAndroidNative()) {
    return { success: false, message: 'Android notifications are not active here.' };
  }

  const permission = await requestNotificationPermission({ includeExactAlarm: false });
  if (!permission.granted) {
    return { success: false, message: permission.message };
  }

  await initializeNotificationChannels();

  const sound = resolveAlertAudio(options.alertStyle, options.adhaanSoundId);
  const { channelIdForPrayer, channelIdForReminder } = await import('./channels');
  const channelId =
    options.alertStyle === 'adhaan' || options.alertStyle === 'takbir'
      ? channelIdForPrayer(options.alertStyle, sound)
      : channelIdForReminder(options.alertStyle);

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id:
            options.alertStyle === 'adhaan'
              ? TEST_ADHAAN_NOTIFICATION_ID
              : options.alertStyle === 'takbir'
                ? TEST_TAKBIR_NOTIFICATION_ID
                : TEST_NOTIFICATION_ID,
          title: options.title,
          body: options.body,
          channelId,
          smallIcon: NOTIFICATION_SMALL_ICON,
          iconColor: NOTIFICATION_ICON_COLOR,
          autoCancel: true,
          ...(options.alertStyle === 'adhaan' || options.alertStyle === 'takbir'
            ? { sound: sound.androidRawFile }
            : {}),
          schedule: {
            // A moment in the future keeps the call on the same code path as a
            // scheduled prayer alert instead of relying on the "already stale"
            // catch-up branch.
            at: new Date(Date.now() + 1_000),
            allowWhileIdle: true,
          },
          extra: { source: 'nurplus', kind: 'test', alertStyle: options.alertStyle },
        },
      ],
    });

    if (options.alertStyle === 'adhaan' || options.alertStyle === 'takbir') {
      const label = options.alertStyle === 'takbir' ? 'Allahu Akbar' : 'Adhaan';
      return {
        success: true,
        message: sound.available
          ? `Test ${label} notification sent. It will appear within a second.`
          : `Test sent, but no ${label} audio file is bundled yet.`,
      };
    }
    if (options.alertStyle === 'silent') {
      return { success: true, message: 'Silent test notification sent.' };
    }
    return { success: true, message: 'Test notification sent. It will appear within a second.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: /disabled/i.test(message)
        ? 'Notifications are turned off for Nur+ in Android settings.'
        : `Could not send the test notification: ${message}`,
    };
  }
}

/** Number of notifications currently armed with Android. */
export async function getAndroidPendingCount(): Promise<number> {
  if (!isAndroidNative()) return 0;
  return (await getPendingIds()).length;
}
