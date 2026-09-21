'use client'

/**
 * Renders its children only in a real web deployment.
 *
 * Vercel Analytics is only meaningful on the hosted web build. The Windows build
 * serves the same bundle from the local filesystem with no server behind it, and
 * the Android build runs inside the Capacitor WebView; in both of those the
 * analytics script would be a pointless outbound request at best and a console
 * error at worst. Suppressing it there also keeps the promise that the shipped
 * Android and Windows apps contain no analytics or tracking.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { isDesktop, isNativeAndroid } from '@/lib/platform'

export function DesktopAnalyticsGate({ children }: { children: ReactNode }) {
  // Start hidden: the platform is only knowable after hydration, and rendering the
  // analytics script during SSR would defeat the point of gating it.
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(!isDesktop() && !isNativeAndroid())
  }, [])

  if (!enabled) return null
  return <>{children}</>
}
