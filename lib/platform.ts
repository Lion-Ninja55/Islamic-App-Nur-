/**
 * Runtime platform detection for Nur+.
 *
 * The exact same web bundle runs in three places:
 *  - a browser / Netlify deployment           -> "web"
 *  - an Android Capacitor WebView             -> "android"
 *  - an Electron renderer (Windows desktop)   -> "desktop"
 *
 * Notification delivery is completely different in each, so every
 * notification code path starts by asking this module where it is running.
 */

import { Capacitor } from '@capacitor/core';

export type RuntimePlatform = 'android' | 'desktop' | 'web';

/** Shape injected by `electron/preload.cjs` via contextBridge. */
export interface DesktopBridge {
  readonly isDesktop: true;
  readonly appVersion: string;
  readonly platform: string;
  getSettings(): Promise<DesktopPersistedSettings | null>;
  syncSettings(payload: DesktopSyncPayload): Promise<DesktopSyncResult>;
  sendTestNotification(alertStyle: string, adhaanSoundId: string): Promise<DesktopTestResult>;
  sendTestAdhaan(adhaanSoundId: string): Promise<DesktopTestResult>;
  getScheduleState(): Promise<DesktopScheduleState>;
  openSystemNotificationSettings(): Promise<void>;
  quitApp(): Promise<void>;
}

export interface DesktopPersistedSettings {
  settings: unknown;
  prayerTimes: unknown;
  savedAt: string;
}

export interface DesktopSyncPayload {
  settings: unknown;
  location: {
    latitude: number | null;
    longitude: number | null;
    city: string;
    country: string;
    timezone: string;
  };
  prayerTimesToday: unknown;
  calculationMethod: string;
  asrJuristic: string;
  plan?: SerializedPlannedNotification[];
}

export interface SerializedPlannedNotification {
  id: number;
  kind: string;
  prayer: string;
  at: string;
  title: string;
  body: string;
  channelId: string;
  soundFile: string | null;
}

export interface DesktopSyncResult {
  ok: boolean;
  /** Number of prayer notifications the desktop scheduler has armed. */
  scheduledCount: number;
  message: string;
}

export interface DesktopTestResult {
  ok: boolean;
  message: string;
  /** Present when the Adhaan sound file could not be found on disk. */
  audioMissing?: boolean;
}

export interface DesktopScheduleState {
  scheduledCount: number;
  nextFireAt: string | null;
  nextFireTitle: string | null;
  trayActive: boolean;
  locationConfigured: boolean;
  lastRefreshAt: string | null;
  lastError: string | null;
}

declare global {
  interface Window {
    nurplusDesktop?: DesktopBridge;
  }
}

/** True when running inside the Electron desktop shell. */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return window.nurplusDesktop?.isDesktop === true;
}

/**
 * Native (Android) platform check.
 *
 * `@capacitor/core` is imported lazily and defensively: the Electron and web
 * builds must never crash if the Capacitor bridge is absent.
 */
export function isNativeAndroid(): boolean {
  try {
    return Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getRuntimePlatform(): RuntimePlatform {
  if (isDesktop()) return 'desktop';
  if (isNativeAndroid()) return 'android';
  return 'web';
}

/** True when this bundle is running inside an iframe-less desktop shell. */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return window.nurplusDesktop ?? null;
}
