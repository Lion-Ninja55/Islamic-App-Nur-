/**
 * Windows delivery backend (Electron main process).
 *
 * ARCHITECTURE AND ITS HONEST LIMITS
 * ----------------------------------
 *  - The renderer never shows notifications itself. It hands the computed plan and
 *    the user's settings to the Electron main process over IPC, and main owns
 *    delivery from then on.
 *  - This is what makes "close the window, keep getting prayer alerts" work: main
 *    keeps running in the system tray and its timers are unaffected by the window
 *    being destroyed.
 *  - If the user picks **Quit** (from the tray menu or Ctrl+Q), the process really
 *    does exit. Windows gives a terminated Electron process no way to fire a local
 *    notification, so after a full quit nothing fires until Nur+ is started again.
 *    That is a genuine platform limitation, not a bug, and the tray menu says so.
 *  - A future remote/FCM layer would hook in at `registerRemoteNotificationHook`
 *    below without touching any of the scheduling code.
 */

import { getDesktopBridge } from '@/lib/platform';
import type { PlannedNotification, TestOutcome, NotificationPreferences } from './types';
import type { PrayerTimes } from './types';

export interface DesktopSyncOptions {
  preferences: NotificationPreferences;
  location: {
    latitude: number | null;
    longitude: number | null;
    city: string;
    country: string;
    timezone: string;
  };
  calculationMethod: string;
  asrJuristic: string;
  /** Optional: the plan the renderer already computed, used to seed main instantly. */
  plan?: PlannedNotification[];
  /** Today's timings, so the tray tooltip can show the next prayer immediately. */
  prayerTimes: PrayerTimes | null;
}

export interface DesktopSyncOutcome {
  ok: boolean;
  scheduledCount: number;
  message: string;
}

/** Serialise a plan for the IPC boundary (Dates become ISO strings). */
function serialisePlan(plan: PlannedNotification[]) {
  return plan.map((item) => ({
    id: item.id,
    kind: item.kind,
    prayer: item.prayer,
    at: item.at.toISOString(),
    title: item.title,
    body: item.body,
    channelId: item.channelId,
    soundFile: item.soundFile,
  }));
}

/** Push settings, location and (optionally) a pre-computed plan to Electron main. */
export async function syncDesktopSchedule(
  options: DesktopSyncOptions,
): Promise<DesktopSyncOutcome> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return { ok: false, scheduledCount: 0, message: 'Desktop bridge unavailable.' };
  }

  try {
    const result = await bridge.syncSettings({
      settings: {
        preferences: options.preferences,
        calculationMethod: options.calculationMethod,
        asrJuristic: options.asrJuristic,
      },
      location: options.location,
      prayerTimesToday: options.prayerTimes,
      calculationMethod: options.calculationMethod,
      asrJuristic: options.asrJuristic,
      ...(options.plan ? { plan: serialisePlan(options.plan) } : {}),
    });

    return {
      ok: result.ok,
      scheduledCount: result.scheduledCount,
      message: result.message,
    };
  } catch (error) {
    return {
      ok: false,
      scheduledCount: 0,
      message:
        error instanceof Error
          ? `Could not hand the schedule to the desktop process: ${error.message}`
          : 'Could not hand the schedule to the desktop process.',
    };
  }
}

/** Fire an immediate test notification through the Windows notification centre. */
export async function sendDesktopTestNotification(options: {
  alertStyle: string;
  adhaanSoundId: string;
}): Promise<TestOutcome> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return { success: false, message: 'Desktop bridge unavailable.' };
  }
  try {
    const result = await bridge.sendTestNotification(options.alertStyle, options.adhaanSoundId);
    return { success: result.ok, message: result.message };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Could not send the test notification.',
    };
  }
}

/** Fire an immediate test Adhaan notification, audio included. */
export async function sendDesktopTestAdhaan(options: {
  adhaanSoundId: string;
}): Promise<TestOutcome> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return { success: false, message: 'Desktop bridge unavailable.' };
  }
  try {
    const result = await bridge.sendTestAdhaan(options.adhaanSoundId);
    return { success: result.ok, message: result.message };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : 'Could not send the test Adhaan notification.',
    };
  }
}

/**
 * Extension point for future remote announcements.
 *
 * Left as an explicit no-op hook rather than an omitted feature: adding FCM or a
 * web-push receiver later means implementing this one function, and nothing in the
 * scheduling, channel or settings code has to change.
 */
export function registerRemoteNotificationHook(): void {
  const bridge = getDesktopBridge();
  if (!bridge) return;
  // Intentionally empty for the local-only release. See docs/RELEASE.md.
}
