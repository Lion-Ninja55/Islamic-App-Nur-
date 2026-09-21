import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Amiri } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { SettingsProvider } from '@/context/settings-context'
import { NotificationProvider } from '@/context/notification-context'
import { AccentColorHandler } from '@/components/accent-color-handler'
import { DesktopAnalyticsGate } from '@/components/desktop-analytics-gate'
import './globals.css'

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
const amiri = Amiri({ 
  weight: ['400', '700'],
  subsets: ["arabic", "latin"],
  variable: "--font-amiri"
})

export const metadata: Metadata = {
  title: 'Nur+ | Islamic Companion',
  description: 'Your comprehensive Islamic companion for Quran reading and prayer times',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f0' },
    { media: '(prefers-color-scheme: dark)', color: '#1a2e1a' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-accent="green">
      <body className={`${geist.variable} ${geistMono.variable} ${amiri.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SettingsProvider>
            {/*
              NotificationProvider sits above every route, so the prayer schedule
              belongs to the application rather than to the home page. Leaving or
              unmounting a page can therefore never disturb scheduled alarms.
            */}
            <NotificationProvider>
              <AccentColorHandler />
              {children}
            </NotificationProvider>
          </SettingsProvider>
        </ThemeProvider>
        {/*
          Vercel Analytics is a web-deployment concern. On Windows the app runs from
          the local filesystem with no server, so the script is suppressed there -
          Nur+ ships no analytics or tracking on the desktop or Android builds.
        */}
        {process.env.NODE_ENV === 'production' && <DesktopAnalyticsGate>{<Analytics />}</DesktopAnalyticsGate>}
      </body>
    </html>
  )
}
