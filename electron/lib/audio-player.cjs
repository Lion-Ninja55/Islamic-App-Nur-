/**
 * Adhaan audio playback for the Windows build.
 *
 * WHY THIS IS A HIDDEN WINDOW
 * ---------------------------
 * Electron's main process has no audio output of its own - `Notification` on
 * Windows cannot play a custom sound file at all, and Node has no media APIs. The
 * only reliable way to play a bundled audio file from a background Electron process
 * is a renderer, so this module keeps one tiny, permanently hidden BrowserWindow
 * whose sole job is to hold an `<audio>` element.
 *
 * IMPORTANT DESIGN POINT: this window is created with `show: false` and is never a
 * user-visible window. It is destroyed only when the whole app quits, so Adhaan
 * playback works even when the main window has been closed to the tray.
 *
 * The player page lives at electron/audio/player.html and receives a file URL
 * from the main process, so it can play files from the exported web bundle.
 */

const path = require('node:path');
const { BrowserWindow } = require('electron');

class AdhaanAudioPlayer {
  constructor() {
    /** @type {BrowserWindow | null} */
    this.window = null;
    this.ready = false;
    this.pending = null;
  }

  /** Create the hidden player. Safe to call repeatedly. */
  ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return;

    this.window = new BrowserWindow({
      show: false,
      width: 320,
      height: 240,
      skipTaskbar: true,
      webPreferences: {
        // The player only plays audio; it needs no privileges at all.
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    });

    // Never let this window steal focus or appear in alt-tab.
    this.window.setSkipTaskbar(true);

    this.window.webContents.on('did-finish-load', () => {
      this.ready = true;
      if (this.pending) {
        const command = this.pending;
        this.pending = null;
        this.play(command.file, command.volume);
      }
    });

    this.window.loadFile(path.join(__dirname, '..', 'audio', 'player.html')).catch((error) => {
      console.error('[Nur+] Could not load the Adhaan audio player:', error);
      this.ready = false;
    });
  }

  /**
   * Play an audio file using its file URL.
   *
   * @param {string} file File URL or path for an exported web asset, e.g. adhan.mp3.
   * @param {number} volume 0..1
   */
  play(file, volume = 0.9) {
    if (!file) return;
    this.ensureWindow();

    if (!this.ready || !this.window || this.window.isDestroyed()) {
      // The window is still loading. Remember the request and run it on load.
      this.pending = { file, volume };
      return;
    }

    const script = `window.nurplusPlay(${JSON.stringify(file)}, ${Number(volume)});`;
    this.window.webContents.executeJavaScript(script, true).catch((error) => {
      console.warn('[Nur+] Adhaan audio playback failed:', error.message);
    });
  }

  /** Stop whatever is currently playing. */
  stop() {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents
      .executeJavaScript('window.nurplusStop();', true)
      .catch(() => {
        // Nothing playing is not an error.
      });
  }

  destroy() {
    this.stop();
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
    this.ready = false;
  }
}

module.exports = { AdhaanAudioPlayer };
