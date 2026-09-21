"use client"

import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Settings, MapPin, RefreshCw, Clock, Calendar } from 'lucide-react'
import { useSettings } from '@/context/settings-context'
import { useNotifications } from '@/context/notification-context'
import { useState, useEffect } from 'react'

interface PrayerTimesData {
  Fajr: string
  Sunrise: string
  Dhuhr: string
  Asr: string
  Sunset: string
  Maghrib: string
  Isha: string
}

interface DateInfo {
  readable: string
  hijri: {
    date: string
    day: string
    weekday: { en: string; ar: string }
    month: { number: number; en: string; ar: string }
    year: string
  }
}

const prayers = [
  { name: 'Fajr', key: 'Fajr' as const },
  { name: 'Sunrise', key: 'Sunrise' as const },
  { name: 'Dhuhr', key: 'Dhuhr' as const },
  { name: 'Asr', key: 'Asr' as const },
  { name: 'Sunset', key: 'Sunset' as const },
  { name: 'Maghrib', key: 'Maghrib' as const },
  { name: 'Isha', key: 'Isha' as const },
]

export default function HomePage() {
  const { settings, updateNestedSettings } = useSettings()
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimesData | null>(null)
  const [dateInfo, setDateInfo] = useState<DateInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [nextPrayer, setNextPrayer] = useState<{ name: string; time: string; remaining: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  /*
    Scheduling state is read from the app-level provider, not owned here. This page
    is now a pure consumer: unmounting it - by navigating to Quran or Settings, or
    by any other means - cannot disturb a single armed alarm.
  */
  const { scheduling } = useNotifications()

   useEffect(() => {
     if (settings.location.latitude && settings.location.longitude) {
       fetchPrayerTimes()
     } else {
       requestLocation()
     }
   }, [settings.location.latitude, settings.location.longitude, settings.calculationMethod, settings.asrJuristic, settings.hijriAdjustment])

  useEffect(() => {
    if (prayerTimes) {
      const interval = setInterval(() => {
        updateNextPrayer()
      }, 1000)
      updateNextPrayer()
      return () => clearInterval(interval)
    }
  }, [prayerTimes])

  const requestLocation = () => {
    setIsLoading(true)
    setError(null)
    if (!navigator.geolocation) {
      setError('Geolocation not supported')
      setIsLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        try {
          const geoRes = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          )
          const geoData = await geoRes.json()
          updateNestedSettings('location', {
            latitude,
            longitude,
            city: geoData.city || geoData.locality || 'Unknown',
            country: geoData.countryName || 'Unknown',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })
        } catch {
          updateNestedSettings('location', { latitude, longitude, city: 'Unknown', country: 'Unknown', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
        }
      },
      () => {
        setError('Unable to get location')
        setIsLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const fetchPrayerTimes = async () => {
    if (!settings.location.latitude || !settings.location.longitude) return
    setIsLoading(true)
    setError(null)
    try {
      const today = new Date()
      const date = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`
      const params = new URLSearchParams({
        latitude: settings.location.latitude.toString(),
        longitude: settings.location.longitude.toString(),
        method: settings.calculationMethod,
        school: settings.asrJuristic === 'hanafi' ? '1' : '0',
        adjustment: settings.hijriAdjustment.toString(),
      })
      const response = await fetch(`https://api.aladhan.com/v1/timings/${date}?${params}`)
      const data = await response.json()
      if (data.code === 200) {
        setPrayerTimes(data.data.timings)
        setDateInfo(data.data.date)
      } else {
        setError('Failed to fetch prayer times')
      }
    } catch {
      setError('Failed to fetch prayer times')
    } finally {
      setIsLoading(false)
    }
  }

  const updateNextPrayer = () => {
    if (!prayerTimes) return
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    for (const prayer of prayers) {
      const time = prayerTimes[prayer.key]
      const [hours, minutes] = time.split(':').map(Number)
      const prayerMinutes = hours * 60 + minutes
      if (prayerMinutes > currentMinutes) {
        const diff = prayerMinutes - currentMinutes
        const hoursLeft = Math.floor(diff / 60)
        const minsLeft = diff % 60
        setNextPrayer({ name: prayer.name, time, remaining: hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}m` : `${minsLeft}m` })
        return
      }
    }
    const [fajrHours, fajrMins] = prayerTimes.Fajr.split(':').map(Number)
    const diff = (24 * 60 - currentMinutes) + (fajrHours * 60 + fajrMins)
    setNextPrayer({ name: 'Fajr', time: prayerTimes.Fajr, remaining: `${Math.floor(diff / 60)}h ${diff % 60}m` })
  }

  const formatTime = (time: string) => {
    if (settings.timeFormat === '24h') return time
    const [hours, minutes] = time.split(':').map(Number)
    return `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
  }

  const today = new Date()
  const formattedDate = today.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1">
        <section className="py-6 bg-secondary/20 border-b border-border/50">
          <div className="container px-4">
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <span className="text-lg font-medium">{formattedDate}</span>
              </div>
              <div className="hidden md:block w-px h-6 bg-border" />
              {dateInfo && (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-primary" dir="rtl">
                    {dateInfo.hijri.day} {dateInfo.hijri.month.ar} {dateInfo.hijri.year}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="py-12 md:py-16">
          <div className="container px-4">
            <div className="max-w-2xl mx-auto text-center">
              <p className="font-[var(--font-amiri)] text-3xl md:text-4xl leading-relaxed text-primary mb-4" dir="rtl">
                بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
              </p>
              <p className="text-muted-foreground">
                In the name of Allah, the Most Gracious, the Most Merciful
              </p>
            </div>
          </div>
        </section>

        <section className="py-8 bg-secondary/30">
          <div className="container px-4">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Prayer Times</h2>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {settings.location.city || 'Current Location'} ✓
                  </p>
                  {settings.notifications.enabled && scheduling.ready && (
                    <p
                      className={`text-xs mt-0.5 ${
                        scheduling.notificationsDisabled
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {scheduling.notificationsDisabled
                        ? 'Notifications are switched off in system settings'
                        : `${scheduling.scheduledCount} prayer notification${
                            scheduling.scheduledCount === 1 ? '' : 's'
                          } scheduled`}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={requestLocation} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Update
                </Button>
                <Link href="/settings">
                  <Button variant="ghost" size="sm">
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {nextPrayer && !isLoading && (
              <Card className="mb-6 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-primary-foreground/80 text-sm mb-1">Next Prayer</p>
                      <p className="text-3xl font-bold">{nextPrayer.name}</p>
                      <p className="text-primary-foreground/80">{formatTime(nextPrayer.time)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-primary-foreground/80 text-sm mb-1">Time Remaining</p>
                      <p className="text-4xl font-bold">{nextPrayer.remaining}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {error ? (
              <Card className="p-8 text-center">
                <p className="text-destructive mb-4">{error}</p>
                <Button onClick={requestLocation}>Allow Location Access</Button>
              </Card>
            ) : isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
                {prayers.map((prayer) => (
                  <Card key={prayer.key} className="p-4 text-center">
                    <div className="h-6 bg-muted rounded animate-pulse mb-2" />
                    <div className="h-4 bg-muted rounded animate-pulse" />
                  </Card>
                ))}
              </div>
            ) : prayerTimes && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
                {prayers.map((prayer) => {
                  const time = prayerTimes[prayer.key]
                  const isNext = nextPrayer?.name === prayer.name
                  return (
                    <Card key={prayer.key} className={`p-4 text-center ${isNext ? 'ring-2 ring-primary' : ''}`}>
                      <p className="font-medium text-sm mb-1">{prayer.name}</p>
                      <p className="text-lg font-semibold">{formatTime(time)}</p>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6">
        <div className="container px-4">
          <p className="text-sm text-muted-foreground text-center">
            May Allah accept your prayers and guide you on the straight path.
          </p>
        </div>
      </footer>
    </div>
  )
}
