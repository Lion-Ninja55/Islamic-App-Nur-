"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { AlertStyle } from '@/lib/notifications/types'
import { DEFAULT_ADHAAN_SOUND_ID } from '@/lib/notifications/adhaan-sounds'

export interface Settings {
  // Accent Color
  accentColor: string
  
  // Quran Settings
  quranFontSize: number
  quranTranslation: string
  quranReciter: string
  showTranslation: boolean
  ayahNumbering: 'arabic' | 'urdu' | 'english'
  
  // Salah Settings
  calculationMethod: string
  asrJuristic: 'standard' | 'hanafi'
  highLatitudeRule: string
  midnightMode: 'standard' | 'jafari'
  adjustments: {
    fajr: number
    sunrise: number
    dhuhr: number
    asr: number
    sunset: number
    maghrib: number
    isha: number
  }
  notifications: {
    enabled: boolean
    fajr: boolean
    sunrise: boolean
    dhuhr: boolean
    asr: boolean
    sunset: boolean
    maghrib: boolean
    isha: boolean
    beforeAdhan: number
    /** How prayer notifications announce themselves. */
    alertStyle: AlertStyle
    /** Which bundled Adhaan recording to use (see lib/notifications/adhaan-sounds). */
    adhaanSoundId: string
  }
  
  // Location
  location: {
    latitude: number | null
    longitude: number | null
    city: string
    country: string
    timezone: string
  }
  
  // General
  hijriAdjustment: number
  timeFormat: '12h' | '24h'
  dateFormat: string
}

const defaultSettings: Settings = {
  // Accent Color
  accentColor: 'green',
  
  // Quran Settings
  quranFontSize: 28,
  quranTranslation: 'en.sahih',
  quranReciter: 'ar.alafasy',
  showTranslation: true,
  ayahNumbering: 'english',
  
  // Salah Settings
  calculationMethod: '2', // ISNA
  asrJuristic: 'standard',
  highLatitudeRule: 'angle',
  midnightMode: 'standard',
  adjustments: {
    fajr: 0,
    sunrise: 0,
    dhuhr: 0,
    asr: 0,
    sunset: 0,
    maghrib: 0,
    isha: 0,
  },
  notifications: {
    enabled: false,
    fajr: true,
    sunrise: false,
    dhuhr: true,
    asr: true,
    sunset: false,
    maghrib: true,
    isha: true,
    beforeAdhan: 15,
    alertStyle: 'notification',
    adhaanSoundId: DEFAULT_ADHAAN_SOUND_ID,
  },
  
  // Location
  location: {
    latitude: null,
    longitude: null,
    city: '',
    country: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  
  // General
  hijriAdjustment: 0,
  timeFormat: '12h',
  dateFormat: 'dd_MM_yyyy',
}

/**
 * Reconcile a value loaded from localStorage with the current Settings shape.
 *
 * Two jobs, both of which matter for a shipped app that already has users:
 *
 *  1. Deep-merge, so a settings object saved by an older build cannot leave a
 *     newly added key `undefined`. A shallow spread on `notifications` would do
 *     exactly that, and an `undefined` alert style silently breaks scheduling.
 *  2. Migrate the legacy `soundType` key (and the never-implemented `adhaanReciter`)
 *     onto the current `alertStyle` / `adhaanSoundId` fields, so an upgrading user
 *     keeps the alert style they already chose instead of silently reverting.
 */
interface RawNotifications extends Partial<Settings['notifications']> {
  /** Legacy key, renamed to `alertStyle`. */
  soundType?: string
}

function normaliseSettings(raw: unknown): Settings {
  const source = (raw ?? {}) as Partial<Settings> & {
    notifications?: RawNotifications
  }

  const sourceNotifications: RawNotifications = source.notifications ?? {}

  // `soundType` was the previous name for `alertStyle`; prefer the new key.
  const rawStyle = sourceNotifications.alertStyle ?? sourceNotifications.soundType
  const alertStyle: AlertStyle =
    rawStyle === 'adhaan' || rawStyle === 'takbir' || rawStyle === 'silent' || rawStyle === 'notification'
      ? rawStyle
      : defaultSettings.notifications.alertStyle

  const beforeAdhanRaw = Number(sourceNotifications.beforeAdhan)
  const beforeAdhan = Number.isFinite(beforeAdhanRaw)
    ? Math.min(Math.max(Math.round(beforeAdhanRaw), 0), 60)
    : defaultSettings.notifications.beforeAdhan

  return {
    ...defaultSettings,
    ...source,
    adjustments: { ...defaultSettings.adjustments, ...(source.adjustments ?? {}) },
    notifications: {
      ...defaultSettings.notifications,
      ...sourceNotifications,
      alertStyle,
      beforeAdhan,
      adhaanSoundId:
        typeof sourceNotifications.adhaanSoundId === 'string' &&
        sourceNotifications.adhaanSoundId.length > 0
          ? sourceNotifications.adhaanSoundId
          : defaultSettings.notifications.adhaanSoundId,
    },
    location: { ...defaultSettings.location, ...(source.location ?? {}) },
  }
}

interface SettingsContextType {
  settings: Settings
  updateSettings: (newSettings: Partial<Settings>) => void
  updateNestedSettings: <K extends keyof Settings>(
    key: K,
    value: Partial<Settings[K]>
  ) => void
  resetSettings: () => void
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('nurplus-settings')
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings)
        setSettings(normaliseSettings(parsed))
      } catch (e) {
        console.error('Failed to parse settings:', e)
      }
    }
    setIsLoaded(true)
  }, [])

  // Save settings to localStorage when they change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('nurplus-settings', JSON.stringify(settings))
    }
  }, [settings, isLoaded])

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }))
  }

  const updateNestedSettings = <K extends keyof Settings>(
    key: K,
    value: Partial<Settings[K]>
  ) => {
    setSettings(prev => ({
      ...prev,
      [key]: { ...(prev[key] as object), ...(value as object) },
    }))
  }

  const resetSettings = () => {
    setSettings(defaultSettings)
    localStorage.removeItem('nurplus-settings')
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, updateNestedSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
