import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSettings } from '@/context/settings-context'
import { NotificationSettings } from '@/components/settings/notification-settings'

const calculationMethods = [
  { value: '0', label: 'Jafari / Shia Ithna-Ashari', description: 'Ithna Ashari' },
  { value: '1', label: 'University of Islamic Sciences, Karachi', description: 'Pakistan' },
  { value: '2', label: 'Islamic Society of North America (ISNA)', description: 'USA & Canada' },
  { value: '3', label: 'Muslim World League', description: 'Europe, Far East, etc.' },
  { value: '4', label: 'Umm Al-Qura University, Makkah', description: 'Arabian Peninsula' },
  { value: '5', label: 'Egyptian General Authority of Survey', description: 'Africa, Syria, Lebanon' },
  { value: '7', label: 'Institute of Geophysics, University of Tehran', description: 'Iran' },
  { value: '8', label: 'Gulf Region', description: 'Gulf countries' },
  { value: '9', label: 'Kuwait', description: 'Kuwait' },
  { value: '10', label: 'Qatar', description: 'Qatar' },
  { value: '11', label: 'Majlis Ugama Islam Singapura', description: 'Singapore' },
  { value: '12', label: 'Union Organization Islamic de France', description: 'France' },
  { value: '13', label: 'Diyanet Isleri Baskanligi', description: 'Turkey' },
  { value: '14', label: 'Spiritual Administration of Muslims of Russia', description: 'Russia' },
  { value: '15', label: 'Moonsighting Committee Worldwide', description: 'Worldwide' },
]

const highLatitudeRules = [
  { value: 'angle', label: 'Middle of the Night', description: 'Angle-based method' },
  { value: 'oneseventh', label: 'One-Seventh of the Night', description: 'Divides night into sevenths' },
  { value: 'midnight', label: 'Midnight', description: 'Angle from Midnight' },
]

export function SalahSettings() {
  const { settings, updateSettings, updateNestedSettings } = useSettings()

  const handleAdjustmentChange = (prayer: keyof typeof settings.adjustments, value: number) => {
    updateNestedSettings('adjustments', { [prayer]: value })
  }

  return (
    <div className="space-y-6">
      {/* Calculation Method */}
      <Card className="overflow-hidden border-primary/10">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-primary/10">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-primary">
                <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                <path d="M22 12A10 10 0 0 0 12 2v10z" />
              </svg>
            </div>
            <div>
              <CardTitle>Calculation Method</CardTitle>
              <CardDescription>
                Choose the calculation method used to determine prayer times
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Method</Label>
            <Select
              value={settings.calculationMethod}
              onValueChange={(value) => updateSettings({ calculationMethod: value })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select calculation method" />
              </SelectTrigger>
              <SelectContent>
                {calculationMethods.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    <div className="flex flex-col">
                      <span>{method.label}</span>
                      <span className="text-xs text-muted-foreground">{method.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Juristic Method */}
      <Card className="overflow-hidden border-accent/20">
        <CardHeader className="bg-gradient-to-r from-accent/10 to-transparent border-b border-accent/10">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-accent/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-accent-foreground">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <div>
              <CardTitle>Juristic Settings</CardTitle>
              <CardDescription>
                Configure juristic methods for specific prayers
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Asr Calculation</Label>
            <div className="flex gap-3">
              <Button
                variant={settings.asrJuristic === 'standard' ? 'default' : 'outline'}
                onClick={() => updateSettings({ asrJuristic: 'standard' })}
                className="flex-1"
              >
                <div className="flex flex-col">
                  <span>Standard</span>
                  <span className="text-xs font-normal opacity-70">Shafi, Maliki, Hanbali</span>
                </div>
              </Button>
              <Button
                variant={settings.asrJuristic === 'hanafi' ? 'default' : 'outline'}
                onClick={() => updateSettings({ asrJuristic: 'hanafi' })}
                className="flex-1"
              >
                <div className="flex flex-col">
                  <span>Hanafi</span>
                  <span className="text-xs font-normal opacity-70">Later Asr time</span>
                </div>
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Midnight Calculation</Label>
            <div className="flex gap-3">
              <Button
                variant={settings.midnightMode === 'standard' ? 'default' : 'outline'}
                onClick={() => updateSettings({ midnightMode: 'standard' })}
                className="flex-1"
              >
                Standard
              </Button>
              <Button
                variant={settings.midnightMode === 'jafari' ? 'default' : 'outline'}
                onClick={() => updateSettings({ midnightMode: 'jafari' })}
                className="flex-1"
              >
                Jafari
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
{/* High Latitude Rule */}
      <Card className="overflow-hidden border-muted-foreground/10">
        <CardHeader className="bg-gradient-to-r from-muted/50 to-transparent border-b border-muted-foreground/10">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <div>
              <CardTitle>High Latitude Rule</CardTitle>
              <CardDescription>
                For locations at high latitudes where twilight may persist
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Rule</Label>
            <Select
              value={settings.highLatitudeRule}
              onValueChange={(value) => updateSettings({ highLatitudeRule: value })}
            >
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder="Select rule" />
              </SelectTrigger>
              <SelectContent>
                {highLatitudeRules.map((rule) => (
                  <SelectItem key={rule.value} value={rule.value}>
                    <div className="flex flex-col">
                      <span>{rule.label}</span>
                      <span className="text-xs text-muted-foreground">{rule.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Manual Adjustments */}
      <Card className="overflow-hidden border-primary/10">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-primary/10">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-primary">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <CardTitle>Manual Time Adjustments</CardTitle>
              <CardDescription>
                Fine-tune prayer times by adding or subtracting minutes. These corrections
                are also applied to scheduled prayer notifications.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {(['fajr', 'sunrise', 'dhuhr', 'asr', 'sunset', 'maghrib', 'isha'] as const).map((prayer) => (
            <div key={prayer} className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="capitalize">{prayer}</Label>
                <span className="text-sm text-muted-foreground">
                  {settings.adjustments[prayer] > 0 ? '+' : ''}{settings.adjustments[prayer]} min
                </span>
              </div>
              <Slider
                value={[settings.adjustments[prayer]]}
                min={-30}
                max={30}
                step={1}
                onValueChange={([value]) => handleAdjustmentChange(prayer, value)}
                className="max-w-md"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/*
        Notifications live in their own component and read their state from the
        app-level NotificationProvider rather than from this page, so the controls
        act on the same scheduler the rest of the app uses.
      */}
      <NotificationSettings />
    </div>
  )
}
