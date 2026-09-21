'use client'

/**
 * Application-wide notification owner.
 *
 * WHY THIS EXISTS AT THE ROOT OF THE TREE
 * ---------------------------------------
 * Notification scheduling used to live inside `HomePage`. That is precisely what
 * made the original defect possible: navigating away from Home unmounted the only
 * component that owned the schedule, and its teardown could reach `cancelAll()`.
 *
 * Scheduling now belongs to the app shell instead of to a page. Home and Settings
 * are both pure consumers, so moving between routes - or unmounting either page
 * entirely - has no effect whatsoever on the alarms that are armed with the OS.
 *
 * The provider owns exactly four things:
 *   1. the multi-day prayer calendar (fetched once per month, cached in localStorage),
 *   2. today's timings, derived from that calendar,
 *   3. the scheduling hook, which reconciles the OS alarm set with the settings, and
 *   4. the manual test actions and the diagnostics snapshot the settings UI shows.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useSettings } from '@/context/settings-context'
import { usePrayerNotifications, type PrayerNotificationState } from '@/hooks/usePrayerNotifications'
import { getPrayerCalendar } from '@/lib/prayer-times/calendar'
import {
  CALENDAR_FETCH_DAYS,
  getNotificationDiagnostics,
  sendTestAdhaanNotification,
  sendTestTakbirNotification,
  sendTestNotification,
  type NotificationDiagnostics,
  type PrayerCalendar,
  type PrayerTimes,
  type TestOutcome,
} from '@/lib/notifications'

interface NotificationContextValue {
  /** Today's timings derived from the calendar, or null while loading. */
  prayerTimes: PrayerTimes | null
  /** The multi-day calendar backing the schedule. */
  calendar: PrayerCalendar | null
  /** Live scheduling status (armed count, messages, platform). */
  scheduling: PrayerNotificationState
  /** Re-fetch the calendar and reschedule immediately. */
  reload: () => void
  /** Fire a real test notification using the user's current alert style. */
  sendTest: () => Promise<TestOutcome>
  /** Fire a real test Adhaan notification. */
  sendTestAdhaan: () => Promise<TestOutcome>
  /** Fire a real test using only the opening Allahu Akbar phrase. */
  sendTestTakbir: () => Promise<TestOutcome>
  /** Latest diagnostics snapshot, or null before the first read. */
  diagnostics: NotificationDiagnostics | null
  /** Refresh the diagnostics snapshot from the OS. */
  refreshDiagnostics: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

/** Local `yyyy-MM-dd` key, matching the calendar map. */
function todayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const [calendar, setCalendar] = useState<PrayerCalendar | null>(null)
  const [calendarToken, setCalendarToken] = useState(0)
  const [diagnostics, setDiagnostics] = useState<NotificationDiagnostics | null>(null)

  const locationLatitude = settings.location.latitude
  const locationLongitude = settings.location.longitude
  const calculationMethod = settings.calculationMethod
  const asrJuristic = settings.asrJuristic

  // Today's timings, derived from the calendar rather than fetched separately.
  const prayerTimes = useMemo<PrayerTimes | null>(() => {
    if (!calendar) return null
    return calendar.get(todayKey(new Date())) ?? null
  }, [calendar])

  const loadCalendar = useCallback(async () => {
    if (typeof locationLatitude !== 'number' || typeof locationLongitude !== 'number') {
      setCalendar(null)
      return
    }
    try {
      const result = await getPrayerCalendar(
        {
          latitude: locationLatitude,
          longitude: locationLongitude,
          method: calculationMethod,
          school: asrJuristic === 'hanafi' ? '1' : '0',
        },
        CALENDAR_FETCH_DAYS,
      )
      setCalendar(result)
    } catch (calendarError) {
      console.warn('[Nur+] Could not load the prayer calendar:', calendarError)
    }
  }, [locationLatitude, locationLongitude, calculationMethod, asrJuristic])

  useEffect(() => {
    void loadCalendar()
  }, [loadCalendar, calendarToken])

  const scheduling = usePrayerNotifications(prayerTimes, calendar)

  const refreshDiagnostics = useCallback(async () => {
    try {
      setDiagnostics(await getNotificationDiagnostics())
    } catch (error) {
      console.warn('[Nur+] Could not read notification diagnostics:', error)
    }
  }, [])

  // Re-read diagnostics whenever a scheduling pass completes.
  useEffect(() => {
    if (!scheduling.ready) return
    void refreshDiagnostics()
  }, [scheduling.ready, scheduling.scheduledCount, refreshDiagnostics])

  const sendTest = useCallback(
    () => sendTestNotification(settings.notifications),
    [settings.notifications],
  )

  const sendTestAdhaan = useCallback(
    () => sendTestAdhaanNotification(settings.notifications),
    [settings.notifications],
  )

  const sendTestTakbir = useCallback(
    () => sendTestTakbirNotification(settings.notifications),
    [settings.notifications],
  )

  const reload = useCallback(() => {
    setCalendarToken((token) => token + 1)
    scheduling.refresh()
  }, [scheduling])

  // Refresh the rolling window whenever the app returns to the foreground. The
  // scheduler already does this; reloading the calendar at the same moment also
  // picks up a new month when a month boundary has been crossed.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setCalendarToken((token) => token + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const value = useMemo<NotificationContextValue>(
    () => ({
      prayerTimes,
      calendar,
      scheduling,
      reload,
      sendTest,
      sendTestAdhaan,
      sendTestTakbir,
      diagnostics,
      refreshDiagnostics,
    }),
    [prayerTimes, calendar, scheduling, reload, sendTest, sendTestAdhaan, sendTestTakbir, diagnostics, refreshDiagnostics],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}
