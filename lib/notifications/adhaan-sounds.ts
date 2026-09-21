/**
 * Registry of the Adhaan audio assets actually bundled with the application.
 *
 * PLATFORM REALITY (why this is a registry and not a hardcoded string)
 * -------------------------------------------------------------------
 *  - Android 8.0+ plays the *channel* sound. A channel's sound is fixed the
 *    moment the channel is created and can never be changed programmatically
 *    afterwards. Any selectable recording therefore needs its own channel.
 *    `androidChannelId` below is that channel.
 *  - The Android asset lives in `android/app/src/main/res/raw/<androidRawFile>`.
 *  - The Windows/Electron asset lives in `public/<webFile>` and is copied into
 *    the static export by Next.js.
 *
 * To add another reciter:
 *   1. drop `<name>.wav` into `android/app/src/main/res/raw/`
 *   2. drop `<name>.mp3` into `public/`
 *   3. add an entry here with a NEW, never-reused `id` and a NEW channel id.
 *
 * Never repoint an existing `id` at a different file: Android keeps the already
 * created channel and the user would keep hearing the old recording.
 */

import type { AlertStyle } from './types';

export interface AdhaanSound {
  /** Stable id persisted in settings. Never change once shipped. */
  id: string;
  /** Human readable name shown in the settings UI. */
  label: string;
  /** Short description (reciter / source). */
  description: string;
  /** File inside `public/`, used by Electron and the browser. */
  webFile: string;
  /** File inside `android/app/src/main/res/raw/`, extension included. */
  androidRawFile: string;
  /** Android notification channel that carries this sound. */
  androidChannelId: string;
  /** True when a real, licensable audio file is present in the repository. */
  available: boolean;
}

export const TAKBIR_SOUND: AdhaanSound = {
  id: 'opening-takbir',
  label: 'Allahu Akbar only',
  description: 'Opening Takbir phrase from the bundled Adhaan recording.',
  webFile: 'takbir.wav',
  androidRawFile: 'takbir.wav',
  androidChannelId: 'nurplus.prayer.takbir.v1',
  available: true,
};

export const ADHAAN_SOUNDS: readonly AdhaanSound[] = [
  {
    id: 'default-makkah',
    label: 'Adhaan (default)',
    description: 'Bundled Adhaan recording - replaceable with your own file.',
    webFile: 'adhan.mp3',
    androidRawFile: 'adhan.wav',
    androidChannelId: 'nurplus.prayer.adhaan.default.v1',
    available: true,
  },
];

export const DEFAULT_ADHAAN_SOUND_ID = 'default-makkah';

/** Resolve a persisted id, falling back to the default when unknown/removed. */
export function resolveAdhaanSound(id: string | undefined | null): AdhaanSound {
  const match = ADHAAN_SOUNDS.find((sound) => sound.id === id);
  if (match) return match;
  const fallback = ADHAAN_SOUNDS.find((sound) => sound.id === DEFAULT_ADHAAN_SOUND_ID);
  return fallback ?? ADHAAN_SOUNDS[0];
}

export function resolveAlertAudio(alertStyle: AlertStyle, id: string | undefined | null) {
  if (alertStyle === 'takbir') return TAKBIR_SOUND;
  return resolveAdhaanSound(id);
}

/** True when the Adhaan recording picker should be offered for this style. */
export function showsAdhaanSoundPicker(alertStyle: AlertStyle): boolean {
  return alertStyle === 'adhaan';
}
