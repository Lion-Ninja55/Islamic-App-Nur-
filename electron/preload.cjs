/**
 * Nur+ Electron preload script.
 *
 * The only bridge between the web bundle and the desktop process. It runs with
 * `contextIsolation` on and `nodeIntegration` off, and it exposes a deliberately
 * narrow, promise-based API - no `ipcRenderer`, no `require` and no filesystem
 * access ever reaches the renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

/** Channel names, kept in one place so main and preload cannot drift apart. */
const CHANNELS = {
  syncSettings: 'nurplus:sync-settings',
  getSettings: 'nurplus:get-settings',
  getScheduleState: 'nurplus:get-schedule-state',
  sendTestNotification: 'nurplus:send-test-notification',
  sendTestAdhaan: 'nurplus:send-test-adhaan',
  openNotificationSettings: 'nurplus:open-notification-settings',
  quitApp: 'nurplus:quit-app',
  scheduleUpdated: 'nurplus:schedule-updated',
};

contextBridge.exposeInMainWorld('nurplusDesktop', {
  isDesktop: true,
  appVersion: process.env.NURPLUS_VERSION || '1.0.0',
  platform: process.platform,

  /** Read back whatever settings/schedule the desktop process last persisted. */
  getSettings: () => ipcRenderer.invoke(CHANNELS.getSettings),

  /** Hand settings, location and a pre-computed schedule to the scheduler. */
  syncSettings: (payload) => ipcRenderer.invoke(CHANNELS.syncSettings, payload),

  /** Diagnostics for the settings screen. */
  getScheduleState: () => ipcRenderer.invoke(CHANNELS.getScheduleState),

  /** Fire a real Windows notification now, using the given alert style. */
  sendTestNotification: (alertStyle, adhaanSoundId) =>
    ipcRenderer.invoke(CHANNELS.sendTestNotification, { alertStyle, adhaanSoundId }),

  /** Fire a real Windows notification plus Adhaan audio now. */
  sendTestAdhaan: (adhaanSoundId) =>
    ipcRenderer.invoke(CHANNELS.sendTestAdhaan, { adhaanSoundId }),

  /** Open the Windows notification settings page for Nur+. */
  openSystemNotificationSettings: () => ipcRenderer.invoke(CHANNELS.openNotificationSettings),

  /** Quit the whole application, tray included. */
  quitApp: () => ipcRenderer.invoke(CHANNELS.quitApp),

  /**
   * Notify the renderer whenever the main process re-arms the schedule (after a
   * long sleep, a daily refresh, or a settings change), so the UI stays accurate.
   */
  onScheduleUpdated: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on(CHANNELS.scheduleUpdated, listener);
    return () => ipcRenderer.removeListener(CHANNELS.scheduleUpdated, listener);
  },
});
