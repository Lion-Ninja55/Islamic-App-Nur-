/**
 * Constants shared by every Electron main-process module.
 *
 * These MUST stay in step with their TypeScript counterparts on the web side:
 *   - the notification id layout  -> lib/notifications/ids.ts
 *   - the Adhaan/Takbir audio registry -> lib/notifications/adhaan-sounds.ts
 *
 * They are duplicated rather than imported because the main process is CommonJS
 * and is loaded by Electron directly, without a bundler or a TypeScript build step.
 * The duplication is confined to these small, stable tables: only the *scheduling
 * loop* is also mirrored in this CommonJS module, and the mirror is verified
 * against the TypeScript original by `npm run electron:check`.
 */

/** Must match ADHAAN_SOUNDS in lib/notifications/adhaan-sounds.ts. */
const TAKBIR_SOUND = {
  id: 'opening-takbir',
  label: 'Allahu Akbar only',
  webFile: 'takbir.wav',
  available: true,
};

const ADHAAN_SOUNDS = [
  {
    id: 'default-makkah',
    label: 'Adhaan (default)',
    webFile: 'adhan.mp3',
    available: true,
  },
];

const DEFAULT_ADHAAN_SOUND_ID = 'default-makkah';

function resolveAlertAudio(alertStyle, id) {
  return alertStyle === 'takbir'
    ? TAKBIR_SOUND
    : resolveAdhaanSound(id);
}

/** Must match DEFAULT_ADHAAN_SOUND_ID resolution on the web side. */
function resolveAdhaanSound(id) {
  return (
    ADHAAN_SOUNDS.find((sound) => sound.id === id) ||
    ADHAAN_SOUNDS.find((sound) => sound.id === DEFAULT_ADHAAN_SOUND_ID) ||
    ADHAAN_SOUNDS[0]
  );
}

/**
 * Notification id layout - identical to lib/notifications/ids.ts:
 *   100000 + cycle * 1000 + prayerIndex * 20 + kindIndex * 10
 */
const ID_NAMESPACE = 100000;
const MAX_SCHEDULE_CYCLES = 364;

const PRAYER_INDEX = {
  fajr: 0,
  sunrise: 1,
  dhuhr: 2,
  asr: 3,
  sunset: 4,
  maghrib: 5,
  isha: 6,
};

const KIND_INDEX = { prayer: 0, reminder: 1 };

function notificationId(cycle, prayer, kind) {
  return (
    ID_NAMESPACE +
    cycle * 1000 +
    PRAYER_INDEX[prayer] * 20 +
    KIND_INDEX[kind] * 10
  );
}

/** Day-cycle index for a date, matching cycleIndexForDate() in ids.ts. */
function cycleIndexForDate(date) {
  const dayNumber = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000,
  );
  return ((dayNumber % (MAX_SCHEDULE_CYCLES + 1)) + MAX_SCHEDULE_CYCLES + 1) %
    (MAX_SCHEDULE_CYCLES + 1);
}

const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'sunset', 'maghrib', 'isha'];

/** Prayers that get a pre-prayer reminder. Sunrise is a boundary, not a prayer. */
const REMINDABLE_PRAYER_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const PRAYER_DISPLAY_NAMES = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  sunset: 'Sunset',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

/** Maps a preference key onto the AlAdhan timings property name. */
const PRAYER_TIMES_KEY = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  sunset: 'Sunset',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

module.exports = {
  ADHAAN_SOUNDS,
  TAKBIR_SOUND,
  DEFAULT_ADHAAN_SOUND_ID,
  resolveAdhaanSound,
  resolveAlertAudio,
  ID_NAMESPACE,
  MAX_SCHEDULE_CYCLES,
  notificationId,
  cycleIndexForDate,
  PRAYER_KEYS,
  REMINDABLE_PRAYER_KEYS,
  PRAYER_DISPLAY_NAMES,
  PRAYER_TIMES_KEY,
};
