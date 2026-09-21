/**
 * Persistent state for the desktop build.
 *
 * Everything the background scheduler needs lives in a single JSON file under
 * `app.getPath('userData')`, so it survives the window closing, the app being
 * quit, and a machine reboot. No database, no external dependency.
 *
 * Writes are atomic (write to a temp file, then rename) because the scheduler
 * writes on every reschedule and a half-written settings file would leave the app
 * unable to compute prayer times on next launch.
 */

const fs = require('node:fs');
const path = require('node:path');

const STORE_FILENAME = 'nurplus-desktop-state.json';
const STORE_VERSION = 1;

const EMPTY_STATE = {
  version: STORE_VERSION,
  savedAt: null,
  /** The notification preferences object sent by the renderer. */
  preferences: null,
  /** Location + calculation settings used to (re)compute prayer times offline. */
  location: null,
  calculationMethod: '2',
  asrJuristic: 'standard',
  /** Last schedule handed over by the renderer, as ISO strings. */
  plan: [],
  /** Cached month calendar, keyed `yyyy-MM-dd`. */
  calendar: {},
  calendarFetchedAt: null,
  /** Diagnostics only. */
  lastRefreshAt: null,
  lastError: null,
};

class DesktopStore {
  /** @param {string} userDataDir Directory to persist into. */
  constructor(userDataDir) {
    this.filePath = path.join(userDataDir, STORE_FILENAME);
    this.state = this.#read();
  }

  #read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== STORE_VERSION) {
        // A future schema bump: start clean rather than misread old fields.
        return { ...EMPTY_STATE };
      }
      return { ...EMPTY_STATE, ...parsed };
    } catch {
      // Missing or corrupt file: first run, or a crash mid-write.
      return { ...EMPTY_STATE };
    }
  }

  #write() {
    const payload = { ...this.state, savedAt: new Date().toISOString() };
    const tempPath = `${this.filePath}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tempPath, this.filePath);
    } catch (error) {
      console.error('[Nur+] Could not persist desktop state:', error);
    }
  }

  /** Replace the persisted settings block. */
  saveSettings(payload) {
    const preferences = payload?.settings?.preferences;
    this.state.preferences = preferences ?? this.state.preferences;
    this.state.location = payload?.location ?? this.state.location;
    this.state.calculationMethod =
      payload?.calculationMethod ?? this.state.calculationMethod;
    this.state.asrJuristic = payload?.asrJuristic ?? this.state.asrJuristic;
    this.#write();
  }

  savePlan(plan) {
    this.state.plan = Array.isArray(plan) ? plan : [];
    this.state.lastRefreshAt = new Date().toISOString();
    this.state.lastError = null;
    this.#write();
  }

  saveCalendar(calendar) {
    this.state.calendar = calendar ?? {};
    this.state.calendarFetchedAt = new Date().toISOString();
    this.#write();
  }

  recordError(message) {
    this.state.lastError = message ? String(message) : null;
    this.#write();
  }

  /** Everything the renderer receives on `getSettings()`. */
  snapshot() {
    return {
      settings: {
        preferences: this.state.preferences,
        calculationMethod: this.state.calculationMethod,
        asrJuristic: this.state.asrJuristic,
      },
      prayerTimes: null,
      savedAt: this.state.savedAt,
    };
  }

  get preferences() {
    return this.state.preferences;
  }

  get location() {
    return this.state.location;
  }

  get calculationMethod() {
    return this.state.calculationMethod;
  }

  get asrJuristic() {
    return this.state.asrJuristic;
  }

  get plan() {
    return this.state.plan;
  }

  get calendar() {
    return this.state.calendar;
  }

  get calendarFetchedAt() {
    return this.state.calendarFetchedAt;
  }

  get lastRefreshAt() {
    return this.state.lastRefreshAt;
  }

  get lastError() {
    return this.state.lastError;
  }
}

module.exports = { DesktopStore, STORE_FILENAME };
