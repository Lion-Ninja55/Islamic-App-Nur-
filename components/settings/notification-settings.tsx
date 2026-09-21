'use client'

/**
 * Notification settings.
 *
 * Every control on this card is wired to something real:
 *  - the master switch and the seven per-prayer/marker switches change what the scheduler
 *    arms, through the shared settings object the provider watches;
 *  - "Reminder before Adhan" changes the pre-prayer alert offset;
 *  - the alert style picks the Android channel (and therefore the sound) that a
 *    prayer notification is posted to;
 *  - the Adhaan recording picker selects which bundled channel carries the Adhaan.
 *
 * There are no decorative settings here, and the platform notes state plainly what
 * each platform can and cannot do rather than implying more.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSettings } from '@/context/settings-context'
import { useNotifications } from '@/context/notification-context'
import {
  ADHAAN_SOUNDS,
  ALERT_STYLES,
  PRAYER_DISPLAY_NAMES,
  PRAYER_KEYS,
  isExactAlarmAllowed,
  openExactAlarmSettings,
  requestNotificationPermission,
  resetNotificationChannelsForUser,
  type AlertStyle,
  type PrayerKey,
} from '@/lib/notifications'
import {
  AlertCircle,
  Bell,
  BellOff,
  CheckCircle2,
  Info,
  RefreshCw,
  ShieldAlert,
  Volume2,
  VolumeX,
} from 'lucide-react'

const ALERT_STYLE_COPY: Record<AlertStyle, { label: string; hint: string }> = {
  notification: { label: 'Notification only', hint: 'System notification tone' },
  adhaan: { label: 'Full Adhaan', hint: 'Complete call to prayer' },
  takbir: { label: 'Allahu Akbar only', hint: 'Opening Takbir phrase' },
  silent: { label: 'Silent', hint: 'Banner, no sound' },
}

interface StatusMessage {
  type: 'success' | 'error' | 'info'
  message: string
}

export function NotificationSettings() {
  const { settings, updateNestedSettings } = useSettings()
  const { scheduling, sendTest, sendTestAdhaan, sendTestTakbir, reload, diagnostics } = useNotifications()
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [exactAlarmAllowed, setExactAlarmAllowed] = useState(true)

  const notifications = settings.notifications

  const refreshExactAlarmState = useCallback(async () => {
    setExactAlarmAllowed(await isExactAlarmAllowed())
  }, [])

  useEffect(() => {
    if (!notifications.enabled) return
    void refreshExactAlarmState()
  }, [notifications.enabled, refreshExactAlarmState])

  const setPreference = (key: keyof typeof notifications, value: boolean | number | string) => {
    updateNestedSettings('notifications', { [key]: value })
  }

  const onGrantPermission = async () => {
    setBusy('permission')
    try {
      const outcome = await requestNotificationPermission()
      setStatus({ type: outcome.granted ? 'success' : 'error', message: outcome.message })
      await refreshExactAlarmState()
      reload()
    } finally {
      setBusy(null)
    }
  }

  const onAllowExactAlarms = async () => {
    setBusy('exact')
    try {
      const outcome = await openExactAlarmSettings()
      setStatus({ type: outcome.granted ? 'success' : 'info', message: outcome.message })
      await refreshExactAlarmState()
      reload()
    } finally {
      setBusy(null)
    }
  }

  const onResetChannels = async () => {
    setBusy('channels')
    try {
      const outcome = await resetNotificationChannelsForUser()
      setStatus({ type: outcome.success ? 'success' : 'error', message: outcome.message })
      reload()
    } finally {
      setBusy(null)
    }
  }

  const onSendTest = async () => {
    setBusy('test')
    try {
      const outcome = await sendTest()
      setStatus({ type: outcome.success ? 'success' : 'error', message: outcome.message })
    } finally {
      setBusy(null)
    }
  }

  const onSendTestAdhaan = async () => {
    setBusy('testAdhaan')
    try {
      const outcome = await sendTestAdhaan()
      setStatus({ type: outcome.success ? 'success' : 'error', message: outcome.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="overflow-hidden border-accent/20">
      <CardHeader className="bg-gradient-to-r from-accent/10 to-transparent border-b border-accent/10">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-accent/20 flex items-center justify-center">
            <Bell className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Prayer time alerts, Adhaan and reminders - on Android and Windows
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ---- master switch ------------------------------------------- */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {notifications.enabled ? (
              <Bell className="h-5 w-5 text-primary" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div className="space-y-0.5">
              <Label>Enable Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive alerts for prayer times
              </p>
            </div>
          </div>
          <Switch
            checked={notifications.enabled}
            onCheckedChange={(checked) => setPreference('enabled', checked)}
          />
        </div>

        {/* ---- status line ------------------------------------------- */}
        {status && (
          <div
            className={`p-3 rounded-lg flex items-start gap-2.5 text-sm ${
              status.type === 'success'
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                : status.type === 'error'
                  ? 'bg-destructive/15 text-destructive border border-destructive/30'
                  : 'bg-muted text-muted-foreground border border-border'
            }`}
          >
            {status.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            ) : status.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <span>{status.message}</span>
          </div>
        )}

        {notifications.enabled && (
          <>
            <Separator />

            {/* ---- permission ---------------------------------------- */}
            <div className="space-y-3">
              <Label>Permission</Label>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full border ${
                    scheduling.notificationsDisabled
                      ? 'border-destructive/40 text-destructive bg-destructive/10'
                      : 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
                  }`}
                >
                  {scheduling.notificationsDisabled ? (
                    <ShieldAlert className="h-3.5 w-3.5" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  {scheduling.notificationsDisabled
                    ? 'Notification permission denied'
                    : 'Notification permission granted'}
                </span>

                {scheduling.notificationsDisabled && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy === 'permission'}
                    onClick={onGrantPermission}
                    className="gap-2"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    Allow notifications
                  </Button>
                )}

                {!exactAlarmAllowed && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy === 'exact'}
                    onClick={onAllowExactAlarms}
                    className="gap-2 border-amber-500/40 text-amber-700 dark:text-amber-400"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Allow exact alarms
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {scheduling.message ||
                  'Turning notifications on asks for permission the first time only.'}
              </p>
              {!exactAlarmAllowed && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Without "Alarms & reminders" access, Android may deliver prayer
                  alerts up to 15 minutes late.
                </p>
              )}
            </div>
<Separator />

            {/* ---- per-prayer switches ------------------------------- */}
            <div className="space-y-4">
              <Label>Notify for these prayers</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {PRAYER_KEYS.map((prayer: PrayerKey) => (
                  <div key={prayer} className="flex items-center justify-between gap-3">
                    <Label className="font-normal">{PRAYER_DISPLAY_NAMES[prayer]}</Label>
                    <Switch
                      checked={notifications[prayer]}
                      onCheckedChange={(checked) => setPreference(prayer, checked)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* ---- reminder offset ----------------------------------- */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Reminder Before Adhan</Label>
                <span className="text-sm text-muted-foreground">
                  {notifications.beforeAdhan} minutes
                </span>
              </div>
              <Slider
                value={[notifications.beforeAdhan]}
                min={0}
                max={60}
                step={5}
                onValueChange={([value]) => setPreference('beforeAdhan', value)}
                className="max-w-md"
              />
              <p className="text-sm text-muted-foreground">
                An extra alert before Fajr, Dhuhr, Asr, Maghrib and Isha. Set to 0 to
                turn reminders off. Sunrise and sunset never receive reminders.
              </p>
            </div>

            <Separator />

            {/* ---- alert style --------------------------------------- */}
            <div className="space-y-3">
              <Label>Notification Alert Style</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {ALERT_STYLES.map((style) => {
                  const copy = ALERT_STYLE_COPY[style]
                  const Icon = style === 'silent' ? VolumeX : style === 'adhaan' || style === 'takbir' ? Volume2 : Bell
                  return (
                    <Button
                      key={style}
                      type="button"
                      variant={notifications.alertStyle === style ? 'default' : 'outline'}
                      onClick={() => setPreference('alertStyle', style)}
                      className="flex items-center justify-start gap-2 h-auto py-3 px-4"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div className="text-left">
                        <div className="font-medium text-sm">{copy.label}</div>
                        <div className="text-xs opacity-75">{copy.hint}</div>
                      </div>
                    </Button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {notifications.alertStyle === 'adhaan'
                  ? 'The full Adhaan plays at the prayer time. Reminders before it still use the normal notification tone.'
                  : notifications.alertStyle === 'takbir'
                    ? 'Only the opening Allahu Akbar phrase plays at the prayer time. Reminders before it use the normal notification tone.'
                    : notifications.alertStyle === 'silent'
                      ? 'Prayer alerts appear silently, with no sound and no vibration.'
                      : 'Prayer alerts and reminders both use your device’s standard notification tone.'}
              </p>
            </div>

            {/* ---- Adhaan recording ---------------------------------- */}
            {notifications.alertStyle === 'adhaan' && (
              <div className="space-y-3 pt-1">
                <Label>Adhaan Recording</Label>
                <Select
                  value={notifications.adhaanSoundId}
                  onValueChange={(value) => setPreference('adhaanSoundId', value)}
                >
                  <SelectTrigger className="w-full max-w-md">
                    <SelectValue placeholder="Select a recording" />
                  </SelectTrigger>
                  <SelectContent>
                    {ADHAAN_SOUNDS.map((sound) => (
                      <SelectItem key={sound.id} value={sound.id}>
                        <div className="flex flex-col">
                          <span>{sound.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {sound.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Android fixes a channel's sound when the channel is first created, so
                  changing the file later needs a channel reset (below). Add another
                  recording by dropping the file into{' '}
                  <code className="bg-muted px-1 rounded">res/raw/</code> and{' '}
                  <code className="bg-muted px-1 rounded">public/</code> and registering it
                  in <code className="bg-muted px-1 rounded">lib/notifications/adhaan-sounds.ts</code>.
                </p>
              </div>
            )}
            <Separator />

            {/* ---- test actions -------------------------------------- */}
            <div className="space-y-4 pt-1">
              <div>
                <Label className="text-base font-semibold">Test Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  These fire a real notification through the exact same channel and sound
                  that a scheduled prayer alert uses. No need to wait for a prayer time.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={onSendTest}
                  className="gap-2"
                >
                  <Bell className="h-4 w-4 text-primary" />
                  {busy === 'test' ? 'Sending...' : 'Send Test Notification'}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={onSendTestAdhaan}
                  className="gap-2"
                >
                  <Volume2 className="h-4 w-4 text-amber-500" />
                  {busy === 'testAdhaan' ? 'Sending...' : 'Test Adhaan Notification'}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={sendTestTakbir}
                  className="gap-2"
                >
                  <Volume2 className="h-4 w-4 text-emerald-500" />
                  {busy === 'testTakbir' ? 'Sending...' : 'Test Allahu Akbar'}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={reload}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reschedule now
                </Button>
              </div>

              {/*
                Android fixes a notification channel's sound at creation time. This is
                the platform-supported escape hatch, offered explicitly rather than
                pretending a sound setting can simply be toggled.
              */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={onResetChannels}
                className="gap-2 text-muted-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {busy === 'channels' ? 'Resetting...' : 'Reset notification channels'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Resetting recreates the Android channels so a newly supplied Adhaan file
                is picked up. It clears any per-channel sound or vibration you changed in
                system settings.
              </p>
            </div>

            {/* ---- diagnostics --------------------------------------- */}
            {diagnostics && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </p>
                <p className="text-sm">
                  Platform: <span className="font-medium capitalize">{diagnostics.platform}</span>
                </p>
                <p className="text-sm">
                  Armed with the system:{' '}
                  <span className="font-medium">{diagnostics.pendingCount}</span>
                </p>
                {diagnostics.platform === 'android' && (
                  <p className="text-sm">
                    Exact alarms:{' '}
                    <span className="font-medium">
                      {diagnostics.exactAlarmsGranted ? 'allowed' : 'not allowed'}
                    </span>
                  </p>
                )}
                {diagnostics.platform === 'windows' && (
                  <p className="text-sm">
                    Background tray process:{' '}
                    <span className="font-medium">
                      {diagnostics.desktopTrayActive ? 'running' : 'not running'}
                    </span>
                  </p>
                )}
                {diagnostics.nextScheduled && (
                  <p className="text-sm">
                    Next alert: <span className="font-medium">{diagnostics.nextScheduled}</span>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
