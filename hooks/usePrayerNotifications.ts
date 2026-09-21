'use client';

/**
 * The React bridge to the notification system.
 *
 * THE DEFECT THIS FILE REPLACES
 * ----------------------------
 * The original hook performed scheduling from a `useEffect` whose teardown path
 * could reach `LocalNotifications.cancelAll()`. Because `HomePage` unmounts the
 * moment the user taps over to Quran or Settings, merely navigating inside the app
 * could wipe every alarm the user had armed for the coming weeks.
 *
 * The rules now enforced here:
 *
 *  1. **There is no cleanup function that touches notifications.** Unmounting is
 *     incapable of changing the schedule, so there is no code path from teardown
 *     to cancellation.
 *  2. The only way notifications are withdrawn is `preferences.enabled === false`,
 *     which is a deliberate user action handled inside the notification module.
 *  3. Scheduling is keyed on a stable serialised signature, so it re-runs when -
 *     and only when - something that actually changes the schedule changes.
 *  4. A foreground listener re-runs the scheduler whenever the app returns to the
 *     foreground. This keeps the rolling window topped up and recovers from the two
 *     Android events that silently drop exact alarms: the user revoking
 *     "Alarms & reminders", and a timezone or wall-clock change.
 *
 * Foreground detection deliberately uses `document.visibilitychange` rather than
 * pulling in an extra Capacitor plugin: the Capacitor Android WebView dispatches it
 * on pause/resume, and it works unchanged in the browser and in Electron.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettings } from '@/context/settings-context';
import type { PrayerCalendar } from '@/lib/notifications/schedule';
import {
  syncPrayerNotifications,
  requestNotificationPermission,
  hasUsableLocation,
  type SyncOutcome,
} from '@/lib/notifications';
import type { PrayerTimes } from '@/lib/notifications/types';
import { getRuntimePlatform, type RuntimePlatform } from '@/lib/platform';

export interface PrayerNotificationState {
  /** True once at least one scheduling pass has completed. */
  ready: boolean;
  /** How many alerts are currently armed on this platform. */
  scheduledCount: number;
  /** Result of the most recent scheduling pass, ready to display. */
  message: string;
  /** True when the OS has notifications switched off for the app entirely. */
  notificationsDisabled: boolean;
  /** Which backend is in charge on this device. */
  platform: RuntimePlatform;
  /** Force an immediate reschedule. */
  refresh: () => void;
}

/** Everything that can change what gets scheduled. */
function scheduleSignature(input: {
  enabled: boolean;
  alertStyle: string;
  adhaanSoundId: string;
  beforeAdhan: number;
  prayers: Record<string, boolean>;
  latitude: number | null;
  longitude: number | null;
  calculationMethod: string;
  asrJuristic: string;
  calendarSize: number;
}): string {
  return JSON.stringify(input);
}

export function usePrayerNotifications(
  prayerTimes: PrayerTimes | null,
  calendar: PrayerCalendar | null,
): PrayerNotificationState {
  const { settings } = useSettings();
  const [state, setState] = useState<Omit<PrayerNotificationState, 'refresh'>>({
    ready: false,
    scheduledCount: 0,
    message: '',
    notificationsDisabled: false,
    platform: getRuntimePlatform(),
  });
  const [refreshToken, setRefreshToken] = useState(0);
  const mountedRef = useRef(true);

  const preferences = settings.notifications;
  const { latitude, longitude } = settings.location;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      // Deliberately only flips a flag. Scheduling state is never touched here.
      mountedRef.current = false;
    };
  }, []);

  // ---- 1. Ask for permission when the user switches notifications on --------
  useEffect(() => {
    if (!preferences.enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const outcome = await requestNotificationPermission();
        if (cancelled || !mountedRef.current) return;
        if (!outcome.granted) {
          setState((previous) => ({
            ...previous,
            message: outcome.message,
            notificationsDisabled: true,
          }));
        }
      } catch (error) {
        console.error('[Nur+] Notification permission request failed:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preferences.enabled]);

  // ---- 2. Keep the OS schedule in step with the user's settings -------------
  const calendarSize = calendar?.size ?? 0;
  const signature = scheduleSignature({
    enabled: preferences.enabled,
    alertStyle: preferences.alertStyle,
    adhaanSoundId: preferences.adhaanSoundId,
    beforeAdhan: preferences.beforeAdhan,
    prayers: {
      fajr: preferences.fajr,
      sunrise: preferences.sunrise,
      dhuhr: preferences.dhuhr,
      asr: preferences.asr,
      sunset: preferences.sunset,
      maghrib: preferences.maghrib,
      isha: preferences.isha,
    },
    latitude,
    longitude,
    calculationMethod: settings.calculationMethod,
    asrJuristic: settings.asrJuristic,
    calendarSize,
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const locationIsUsable = hasUsableLocation({ latitude, longitude });

      // With notifications off we still call through, because that is the one and
      // only path that withdraws a previously armed schedule.
      if (preferences.enabled && (!locationIsUsable || !calendar || calendarSize === 0)) {
        if (!cancelled && mountedRef.current) {
          setState({
            ready: true,
            scheduledCount: 0,
            message: !locationIsUsable
              ? 'Set your location to schedule prayer notifications.'
              : 'Waiting for prayer times before scheduling notifications.',
            notificationsDisabled: false,
            platform: getRuntimePlatform(),
          });
        }
        return;
      }

      try {
        const outcome: SyncOutcome = await syncPrayerNotifications({
          prayerTimes,
          preferences,
          calendar: calendar ?? new Map(),
          location: settings.location,
          calculationMethod: settings.calculationMethod,
          asrJuristic: settings.asrJuristic,
        });
        if (cancelled || !mountedRef.current) return;
        setState({
          ready: true,
          scheduledCount: outcome.scheduled,
          message: outcome.message,
          notificationsDisabled: outcome.notificationsDisabled,
          platform: outcome.platform,
        });
      } catch (error) {
        console.error('[Nur+] Scheduling prayer notifications failed:', error);
        if (cancelled || !mountedRef.current) return;
        setState((previous) => ({
          ...previous,
          ready: true,
          message:
            error instanceof Error
              ? `Could not schedule notifications: ${error.message}`
              : 'Could not schedule notifications.',
        }));
      }
    };

    void run();
    return () => {
      // Only prevents a late state update. It must never cancel alarms.
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, refreshToken]);

  // ---- 3. Re-run whenever the app comes back to the foreground --------------
  useEffect(() => {
    const bump = () => setRefreshToken((token) => token + 1);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') bump();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  return { ...state, refresh };
}
