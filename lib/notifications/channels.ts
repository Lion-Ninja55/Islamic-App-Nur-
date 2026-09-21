/**
 * Android notification channels.
 *
 * ANDROID RULES THAT SHAPE THIS FILE
 * ----------------------------------
 *  1. A channel is created once. Calling `createChannel` again with the same id
 *     is a no-op for every property except name/description. In particular the
 *     **sound can never be changed programmatically** after creation, and neither
 *     can importance, vibration or lights. The user owns those afterwards.
 *  2. Because of (1), "change the Adhaan sound" is implemented as "use a
 *     different channel", which is why every entry in `ADHAAN_SOUNDS` carries its
 *     own channel id.
 *  3. Recreating a channel is possible via delete-then-create, but that throws
 *     away the user's per-channel customisations. It is therefore only offered as
 *     an explicit "Reset notification channels" action, never automatically.
 *  4. Ids are versioned (`...v1`) so that replacing an audio file can ship a new
 *     channel id instead of silently keeping the old sound.
 *
 * Importance 4 = IMPORTANCE_HIGH: status bar icon, heads-up banner, sound and
 * vibration. That is deliberately the ceiling we use - IMPORTANCE_MAX (5) is
 * reserved by Google for alarm-clock style apps and some OEM firmware treats it
 * inconsistently.
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ADHAAN_SOUNDS, TAKBIR_SOUND, type AdhaanSound } from './adhaan-sounds';
import type { AlertStyle } from './types';

/** Channel used for ordinary prayer alerts and for pre-prayer reminders. */
export const CHANNEL_REMINDER_ID = 'nurplus.prayer.reminder.v1';

/** Channel used when the user picks the "Silent" alert style. */
export const CHANNEL_SILENT_ID = 'nurplus.prayer.silent.v1';

/**
 * Drawable used as the notification small icon. Monochrome, alpha-only, 24dp -
 * Android tints it, so it must NOT be a full-colour launcher icon (which is what
 * the previous implementation passed, causing a solid white/grey square).
 */
export const NOTIFICATION_SMALL_ICON = 'ic_stat_nur';

/** Accent colour applied to the small icon on Android 5+. */
export const NOTIFICATION_ICON_COLOR = '#10B981';

const IMPORTANCE_HIGH = 4 as const;
const IMPORTANCE_LOW = 2 as const;
const VISIBILITY_PUBLIC = 1 as const;
const VISIBILITY_SECRET = 0 as const;

/** Channel id that carries a prayer-time alert for the given style. */
export function channelIdForPrayer(style: AlertStyle, sound: AdhaanSound): string {
  switch (style) {
    case 'adhaan':
    case 'takbir':
      return style === 'takbir' ? TAKBIR_SOUND.androidChannelId : sound.androidChannelId;
    case 'silent':
      return CHANNEL_SILENT_ID;
    case 'notification':
    default:
      return CHANNEL_REMINDER_ID;
  }
}

/**
 * Channel id for a pre-prayer reminder.
 *
 * A reminder never plays the full Adhaan - hearing a 3 minute call to prayer
 * before the actual prayer time would be wrong - so the `adhaan` style falls
 * back to the ordinary reminder channel here.
 */
export function channelIdForReminder(style: AlertStyle): string {
  return style === 'silent' ? CHANNEL_SILENT_ID : CHANNEL_REMINDER_ID;
}

/** True when the app is running in the Android WebView on a real device. */
export function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

let channelsInitialised = false;

/**
 * Create every channel the app needs.
 *
 * Safe to call repeatedly: after the first successful run within a process it
 * returns immediately, and even across processes the platform call is idempotent
 * so no duplicate channels are ever produced.
 *
 * @param force When true, existing channels are deleted first and their Android
 *              settings reset. Only used by the explicit user-initiated reset.
 */
export async function initializeNotificationChannels(force = false): Promise<boolean> {
  if (!isAndroidNative()) {
    channelsInitialised = true;
    return false;
  }
  if (channelsInitialised && !force) return true;

  try {
    if (force) {
      await resetNotificationChannels();
    }

    // 1. Standard prayer tone / pre-prayer reminder.
    await LocalNotifications.createChannel({
      id: CHANNEL_REMINDER_ID,
      name: 'Prayer notifications',
      description: 'Prayer time alerts and reminders before the Adhaan.',
      importance: IMPORTANCE_HIGH,
      visibility: VISIBILITY_PUBLIC,
      vibration: true,
      lights: true,
      lightColor: NOTIFICATION_ICON_COLOR,
    });

    // 2. One channel per bundled Adhaan recording. Windows and the browser pick
    //    the file by name at play time instead.
    for (const sound of [...ADHAAN_SOUNDS, TAKBIR_SOUND]) {
      await LocalNotifications.createChannel({
        id: sound.androidChannelId,
        name: `Adhaan - ${sound.label}`,
        description: sound.description,
        importance: IMPORTANCE_HIGH,
        visibility: VISIBILITY_PUBLIC,
        vibration: true,
        lights: true,
        lightColor: '#F59E0B',
        // Android expects the file name relative to res/raw, extension included.
        sound: sound.available ? sound.androidRawFile : undefined,
      });
    }

    // 3. Silent banner-only channel.
    await LocalNotifications.createChannel({
      id: CHANNEL_SILENT_ID,
      name: 'Silent prayer notifications',
      description: 'Prayer notifications with no sound and no vibration.',
      importance: IMPORTANCE_LOW,
      visibility: VISIBILITY_SECRET,
      vibration: false,
      lights: false,
    });

    channelsInitialised = true;
    return true;
  } catch (error) {
    console.error('[Nur+] Failed to create Android notification channels:', error);
    return false;
  }
}

/** Delete and recreate the app's channels. Explicit user action only. */
async function resetNotificationChannels(): Promise<void> {
  const ids = [
    CHANNEL_REMINDER_ID,
    CHANNEL_SILENT_ID,
    ...ADHAAN_SOUNDS.map((sound) => sound.androidChannelId),
    TAKBIR_SOUND.androidChannelId,
  ];
  for (const id of ids) {
    try {
      await LocalNotifications.deleteChannel({ id });
    } catch {
      // A channel that does not exist yet is not an error here.
    }
  }
}

/**
 * Android-only: wipe and recreate the channels so newly configured sounds and
 * importance levels take effect. Returns a message for the settings UI.
 */
export async function resetNotificationChannelsForUser(): Promise<{
  success: boolean;
  message: string;
}> {
  if (!isAndroidNative()) {
    return {
      success: false,
      message: 'Channel reset is only needed on Android.',
    };
  }
  try {
    await resetNotificationChannels();
    channelsInitialised = false;
    await initializeNotificationChannels();
    return {
      success: true,
      message:
        'Notification channels were recreated. Custom sound and vibration settings have been reset to the app defaults.',
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Could not reset the notification channels.',
    };
  }
}

/** Diagnostic helper used by the settings screen. */
export async function listNotificationChannels(): Promise<
  Array<{ id: string; name: string; importance: number }>
> {
  if (!isAndroidNative()) return [];
  try {
    const result = await LocalNotifications.listChannels();
    return result.channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      importance: channel.importance ?? 0,
    }));
  } catch {
    return [];
  }
}
