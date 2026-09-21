const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  shell,
  Tray,
} = require('electron');

const { AdhaanAudioPlayer } = require('./lib/audio-player.cjs');
const {
  DEFAULT_ADHAAN_SOUND_ID,
  resolveAlertAudio,
} = require('./lib/constants.cjs');
const { buildCalendar, buildPlan } = require('./lib/prayer-times.cjs');
const { DesktopStore } = require('./lib/store.cjs');

const APP_ID = 'com.haris.nurapp';
const OUT_DIR = path.join(app.getAppPath(), 'out');
const INDEX_PATH = path.join(OUT_DIR, 'index.html');
const DEFAULT_ICON = path.join(app.getAppPath(), 'build', 'icon.ico');
const PACKAGED_ICON = path.join(process.resourcesPath, 'icon.ico');
const FALLBACK_ICON = path.join(app.getAppPath(), 'public', 'icon.png');
const CHANNELS = {
  syncSettings: 'nurplus:sync-settings',
  getSettings: 'nurplus:get-settings',
  getScheduleState: 'nurplus:get-schedule-state',
  sendTestNotification: 'nurplus:send-test-notification',
  sendTestAdhaan: 'nurplus:send-test-adhaan',
  openNotificationSettings: 'nurplus:open-notification-settings',
  quitApp: 'nurplus:quit-app',
};

let mainWindow = null;
let tray = null;
let store = null;
let audioPlayer = null;
let scheduler = null;
let isQuitting = false;
let refreshInterval = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

function iconPath() {
  const candidates = [PACKAGED_ICON, DEFAULT_ICON, FALLBACK_ICON];
  return candidates.find((candidate) => fs.existsSync(candidate)) || FALLBACK_ICON;
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 600,
    show: false,
    icon: iconPath(),
    title: 'Nur+',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && process.platform !== 'darwin') {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (mainWindow && url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  if (fs.existsSync(INDEX_PATH)) {
    void mainWindow.loadFile(INDEX_PATH).catch((error) => {
      console.error('[Nur+] Could not load the desktop application:', error);
    });
  } else {
    console.error('[Nur+] Missing out/index.html. Run npm run build before starting Electron.');
  }

  return mainWindow;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
}

function createTray() {
  const image = nativeImage.createFromPath(iconPath());
  if (image.isEmpty()) return;

  tray = new Tray(image.resize({ width: 16, height: 16 }));
  tray.setToolTip('Nur+');
  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) hideMainWindow();
    else showMainWindow();
  });
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const visible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: visible ? 'Hide Nur+' : 'Show Nur+',
        click: visible ? hideMainWindow : showMainWindow,
      },
      { type: 'separator' },
      {
        label: 'Test Notification',
        click: () => {
          if (scheduler) void scheduler.sendTest('notification', DEFAULT_ADHAAN_SOUND_ID);
        },
      },
      {
        label: 'Test Adhaan',
        click: () => {
          if (scheduler) void scheduler.sendTestAdhaan(DEFAULT_ADHAAN_SOUND_ID);
        },
      },
      {
        label: 'Test Allahu Akbar',
        click: () => {
          if (scheduler) void scheduler.sendTest('takbir', DEFAULT_ADHAAN_SOUND_ID);
        },
      },
      {
        label: 'Reschedule',
        click: () => {
          if (scheduler) void scheduler.refresh({ force: true });
        },
      },
      { type: 'separator' },
      {
        label: 'Quit Nur+',
        click: () => app.quit(),
      },
    ]),
  );
}

function notificationIcon() {
  const image = nativeImage.createFromPath(iconPath());
  return image.isEmpty() ? undefined : image;
}

class DesktopScheduler {
  constructor(storeInstance, audioInstance) {
    this.store = storeInstance;
    this.audioPlayer = audioInstance;
    this.timers = new Map();
    this.state = {
      scheduledCount: 0,
      nextFireAt: null,
      nextFireTitle: null,
      trayActive: false,
      locationConfigured: false,
      lastRefreshAt: null,
      lastError: null,
    };
  }

  async start() {
    this.state.trayActive = Boolean(tray);
    await this.refresh({ force: false });
    refreshInterval = setInterval(() => {
      void this.refresh({ force: false });
    }, 60 * 60 * 1000);
    refreshInterval.unref();
  }

  async sync(payload) {
    this.store.saveSettings(payload);
    const plan = Array.isArray(payload?.plan) ? payload.plan : null;
    if (plan) {
      this.store.savePlan(plan);
      this.armPlan(plan);
      this.emitState();
      return this.result(`Desktop schedule updated with ${this.state.scheduledCount} alert${
        this.state.scheduledCount === 1 ? '' : 's'
      }.`);
    }

    await this.refresh({ force: false });
    return this.result(
      this.state.lastError
        ? this.state.lastError
        : `Desktop schedule updated with ${this.state.scheduledCount} alert${
            this.state.scheduledCount === 1 ? '' : 's'
          }.`,
    );
  }

  async refresh(options = {}) {
    const preferences = this.store.preferences;
    const location = this.store.location;
    const hasLocation =
      typeof location?.latitude === 'number' &&
      typeof location?.longitude === 'number' &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude);

    this.state.locationConfigured = hasLocation;
    if (!preferences?.enabled) {
      this.store.savePlan([]);
      this.clearTimers();
      this.state.lastError = null;
      this.state.lastRefreshAt = new Date().toISOString();
      this.emitState();
      return this.result('Desktop notifications are disabled.');
    }

    if (!hasLocation) {
      this.store.savePlan([]);
      this.clearTimers();
      this.state.lastError = 'Set a location before enabling desktop notifications.';
      this.state.lastRefreshAt = new Date().toISOString();
      this.emitState();
      return this.result(this.state.lastError, false);
    }

    try {
      const calendarCache = this.store.calendar || {};
      const calendar = await buildCalendar(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          method: this.store.calculationMethod || '2',
          school: this.store.asrJuristic === 'hanafi' ? '1' : '0',
          days: 32,
        },
        calendarCache,
        Boolean(options.force),
      );
      this.store.saveCalendar(calendarCache);
      const plan = buildPlan(calendar, preferences, { horizonDays: 30 });
      this.store.savePlan(plan);
      this.armPlan(plan);
      this.state.lastError = null;
      this.state.lastRefreshAt = new Date().toISOString();
      this.emitState();
      return this.result(`Scheduled ${plan.length} desktop alert${plan.length === 1 ? '' : 's'}.`);
    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : String(error);
      this.state.lastRefreshAt = new Date().toISOString();
      this.emitState();
      return this.result(`Desktop schedule refresh failed: ${this.state.lastError}`, false);
    }
  }

  armPlan(plan) {
    this.clearTimers();
    const now = Date.now();
    const upcoming = [];
    for (const item of plan) {
      const at = new Date(item.at);
      if (!item || !Number.isFinite(at.getTime())) continue;
      const delay = Math.max(0, at.getTime() - now);
      const timer = setTimeout(() => {
        this.timers.delete(item.id);
        void this.fire(item);
      }, Math.min(delay, 2_147_483_647));
      this.timers.set(item.id, timer);
      upcoming.push({ ...item, at: at.toISOString() });
    }
    upcoming.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    this.state.scheduledCount = upcoming.length;
    this.state.nextFireAt = upcoming[0]?.at ?? null;
    this.state.nextFireTitle = upcoming[0]?.title ?? null;
  }

  async fire(item, options = {}) {
    const preferences = this.store.preferences || {};
    const style = options.style || preferences.alertStyle || 'notification';
    const sound = options.sound || resolveAlertAudio(style, preferences.adhaanSoundId);
    const playsAudio = style === 'adhaan' || style === 'takbir';
    const icon = notificationIcon();
    try {
      const notification = new Notification({
        title: item.title,
        body: item.body,
        icon,
        silent: style === 'silent' || playsAudio,
      });
      notification.on('click', showMainWindow);
      notification.show();
      if (playsAudio) {
        this.audioPlayer.play(pathToFileURL(path.join(OUT_DIR, sound.webFile)).toString(), 0.9);
      }
      return true;
    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : String(error);
      this.emitState();
      return false;
    }
  }

  async sendTest(alertStyle, adhaanSoundId) {
    const sound = resolveAlertAudio(alertStyle, adhaanSoundId);
    const playsAudio = alertStyle === 'adhaan' || alertStyle === 'takbir';
    const isAdhaan = alertStyle === 'adhaan';
    const isTakbir = alertStyle === 'takbir';
    const ok = await this.fire({
      id: isAdhaan ? 900002 : isTakbir ? 900003 : 900001,
      kind: 'test',
      prayer: 'fajr',
      at: new Date().toISOString(),
      title: isAdhaan
        ? 'Nur+ Adhaan test'
        : isTakbir
          ? 'Nur+ Allahu Akbar test'
          : 'Nur+ test notification',
      body: isAdhaan
        ? "Hayya 'alas-Salah - the Adhaan alert path is working."
        : isTakbir
          ? 'Allahu Akbar - the opening Takbir alert path is working.'
          : alertStyle === 'silent'
            ? 'Silent desktop notifications are working.'
            : 'Desktop prayer notifications are working.',
    }, { style: alertStyle, sound });
    return {
      ok,
      message: ok
        ? isAdhaan
          ? 'Desktop Adhaan test sent.'
          : isTakbir
            ? 'Desktop Allahu Akbar test sent.'
            : 'Desktop test notification sent.'
        : 'Desktop notifications are unavailable on this system.',
      ...(playsAudio && !sound.available ? { audioMissing: true } : {}),
    };
  }

  async sendTestAdhaan(adhaanSoundId) {
    return this.sendTest('adhaan', adhaanSoundId);
  }

  clearTimers() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.state.scheduledCount = 0;
    this.state.nextFireAt = null;
    this.state.nextFireTitle = null;
  }

  result(message, ok = true) {
    return { ok, scheduledCount: this.state.scheduledCount, message };
  }

  getState() {
    return { ...this.state };
  }

  emitState() {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('nurplus:schedule-updated', this.getState());
    }
  }

  destroy() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = null;
    this.clearTimers();
  }
}

function registerIpc() {
  ipcMain.handle(CHANNELS.getSettings, () => (store ? store.snapshot() : null));
  ipcMain.handle(CHANNELS.getScheduleState, () =>
    scheduler ? scheduler.getState() : {
      scheduledCount: 0,
      nextFireAt: null,
      nextFireTitle: null,
      trayActive: false,
      locationConfigured: false,
      lastRefreshAt: null,
      lastError: null,
    },
  );
  ipcMain.handle(CHANNELS.syncSettings, (_event, payload) => {
    if (!scheduler) return { ok: false, scheduledCount: 0, message: 'Desktop scheduler unavailable.' };
    return scheduler.sync(payload);
  });
  ipcMain.handle(CHANNELS.sendTestNotification, (_event, payload) => {
    if (!scheduler) return { ok: false, message: 'Desktop scheduler unavailable.' };
    const options = typeof payload === 'string' ? { alertStyle: payload } : payload || {};
    return scheduler.sendTest(options.alertStyle || 'notification', options.adhaanSoundId || DEFAULT_ADHAAN_SOUND_ID);
  });
  ipcMain.handle(CHANNELS.sendTestAdhaan, (_event, payload) => {
    if (!scheduler) return { ok: false, message: 'Desktop scheduler unavailable.' };
    const soundId = typeof payload === 'string' ? payload : payload?.adhaanSoundId;
    return scheduler.sendTestAdhaan(soundId || DEFAULT_ADHAAN_SOUND_ID);
  });
  ipcMain.handle(CHANNELS.openNotificationSettings, async () => {
    if (process.platform === 'win32') {
      await shell.openExternal('ms-settings:notifications');
    }
  });
  ipcMain.handle(CHANNELS.quitApp, () => {
    app.quit();
  });
}

app.whenReady().then(async () => {
  store = new DesktopStore(app.getPath('userData'));
  audioPlayer = new AdhaanAudioPlayer();
  scheduler = new DesktopScheduler(store, audioPlayer);
  registerIpc();
  createMainWindow();
  createTray();
  await scheduler.start();
  updateTrayMenu();

  powerMonitor.on('resume', () => {
    if (scheduler) void scheduler.refresh({ force: true });
  });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  else showMainWindow();
});

app.on('window-all-closed', (event) => {
  if (tray) event.preventDefault();
});

app.on('before-quit', () => {
  isQuitting = true;
  if (scheduler) scheduler.destroy();
  if (audioPlayer) audioPlayer.destroy();
  if (tray) tray.destroy();
});

app.on('will-quit', () => {
  if (refreshInterval) clearInterval(refreshInterval);
});

app.on('second-instance', () => showMainWindow());
