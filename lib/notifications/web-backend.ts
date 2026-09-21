/**
 * Browser delivery backend.
 *
 * HONEST SCOPE
 * ------------
 * A plain web page can only display a notification while a script of that origin
 * is alive. Without a service worker plus push infrastructure (which this release
 * deliberately does not introduce) there is no way for a closed browser tab to
 * raise a prayer alert. So on the web we:
 *
 *  - schedule the nearest upcoming alerts with in-page timers, which work while
 *    the Nur+ tab stays open (including when it is in a background tab), and
 *  - say so plainly in the settings UI instead of implying otherwise.
 *
 * The web build exists primarily for the Netlify deployment and for using Nur+ on
 * a desktop browser; Android and Windows are where reliable closed-app delivery is
 * delivered, each through its own native mechanism.
 */

import type { PlannedNotification, TestOutcome, AlertStyle } from './types';
import { resolveAlertAudio } from './adhaan-sounds';

/** Browser timers are capped at ~24.8 days; we stay far below that. */
const MAX_TIMEOUT_MS = 2_000_000_000;

/** How many upcoming alerts to keep armed in the page at once. */
const MAX_ARMED_TIMERS = 12;

const armedTimers = new Map<number, ReturnType<typeof setTimeout>>();

let activeAudio: HTMLAudioElement | null = null;

/** True when this environment can show web notifications at all. */
export function isWebNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Play the selected alert audio through the page. */
export function playAlertAudio(
  alertStyle: AlertStyle,
  adhaanSoundId: string,
  volume = 1.0,
): HTMLAudioElement | null {
  if (alertStyle !== 'adhaan' && alertStyle !== 'takbir') return null;
  if (typeof window === 'undefined') return null;
  const sound = resolveAlertAudio(alertStyle, adhaanSoundId);
  try {
    stopAdhaanAudio();
    const audio = new Audio(`/${sound.webFile}`);
    audio.volume = volume;
    void audio.play().catch((error) => {
      // Autoplay policy: a page that has not been interacted with cannot start audio.
      console.warn('[Nur+] Alert audio was blocked by the browser autoplay policy:', error);
    });
    activeAudio = audio;
    return audio;
  } catch (error) {
    console.warn('[Nur+] Could not play the alert audio:', error);
    return null;
  }
}

/** Play the full Adhaan recording through the page. */
export function playAdhaanAudio(volume = 1.0): HTMLAudioElement | null {
  return playAlertAudio('adhaan', 'default-makkah', volume);
}

export function stopAdhaanAudio(): void {
  if (!activeAudio) return;
  try {
    activeAudio.pause();
    activeAudio.currentTime = 0;
  } catch {
    // ignore
  }
  activeAudio = null;
}

/** Show one notification immediately. */
export function showWebNotification(options: {
  title: string;
  body: string;
  alertStyle: AlertStyle;
  adhaanSoundId: string;
}): TestOutcome {
  if (!isWebNotificationSupported()) {
    return { success: false, message: 'This browser does not support notifications.' };
  }
  if (Notification.permission !== 'granted') {
    return {
      success: false,
      message: 'Notification permission has not been granted for this site.',
    };
  }

  try {
    const sound = resolveAlertAudio(options.alertStyle, options.adhaanSoundId);
    new Notification(options.title, {
      body: options.body,
      icon: '/icon.png',
      silent: options.alertStyle === 'silent',
      tag: 'nurplus-prayer',
    });

    if (options.alertStyle === 'adhaan' || options.alertStyle === 'takbir') {
      playAlertAudio(options.alertStyle, options.adhaanSoundId, 0.9);
      const label = options.alertStyle === 'takbir' ? 'Allahu Akbar' : 'Adhaan';
      return {
        success: true,
        message: sound.available
          ? `Test notification shown, with the ${label} audio playing in this tab.`
          : `Test notification shown. No ${label} audio file is bundled yet.`,
      };
    }
    return { success: true, message: 'Test notification shown.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Could not show the notification.',
    };
  }
}

/** Cancel every armed in-page timer. */
export function clearWebTimers(): void {
  for (const timer of armedTimers.values()) clearTimeout(timer);
  armedTimers.clear();
}

/**
 * Arm in-page timers for the nearest notifications in the plan.
 *
 * Anything beyond `MAX_ARMED_TIMERS` or further away than the browser timer limit
 * is skipped: it will be picked up the next time the app runs the scheduler, which
 * happens on every load and every foreground transition.
 */
export function armWebTimers(
  plan: PlannedNotification[],
  onFire: (item: PlannedNotification) => void,
): number {
  clearWebTimers();
  if (!isWebNotificationSupported()) return 0;

  const now = Date.now();
  let armed = 0;
  for (const item of plan) {
    if (armed >= MAX_ARMED_TIMERS) break;
    const delay = item.at.getTime() - now;
    if (delay <= 0 || delay > MAX_TIMEOUT_MS) continue;
    const timer = setTimeout(() => {
      armedTimers.delete(item.id);
      onFire(item);
    }, delay);
    armedTimers.set(item.id, timer);
    armed += 1;
  }
  return armed;
}
