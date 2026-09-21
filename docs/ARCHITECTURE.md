# Nur+ Architecture

Nur+ is a single Next.js application that runs in three environments:

1. **Web** — a normal browser deployment (Vercel, Netlify, self-hosted).
2. **Android** — the same bundle inside a Capacitor WebView, with the
   `@capacitor/local-notifications` plugin providing OS-level alarms.
3. **Windows** — the same bundle inside an Electron renderer, with the Electron
   main process owning notifications and the system tray.

The deliberate design goal is that **one codebase, one build, three platforms**.
The application never branches on `process.platform` or on `Capacitor.getPlatform()`
in a way that changes what the app *is*. It branches only on *where it is running*,
which changes *how* a notification is delivered — never *whether* one should exist.

## Layer overview

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer                                                     │
│  app/  components/  context/  hooks/                          │
│  Pure consumers. Never touch a platform API directly.        │
└───────────────┬─────────────────────────────────────────────┘
                │ useSettings() / useNotifications()
┌───────────────▼─────────────────────────────────────────────┐
│  Application Layer                                            │
│  lib/notifications/index.ts                                   │
│  The single public API. Builds one canonical plan,            │
│  hands it to exactly one backend.                             │
└───────────────┬─────────────────────────────────────────────┘
                │ syncPrayerNotifications()
┌───────────────▼─────────────────────────────────────────────┐
│  Delivery Layer (exactly one is active)                      │
│  android-backend.ts  →  Capacitor Local Notifications         │
│  desktop-backend.ts  →  Electron main process (IPC)          │
│  web-backend.ts      →  in-page timers + Web Notification    │
└─────────────────────────────────────────────────────────────┘
```

## The rule that shaped everything

> **Nothing in the application cancels notifications on unmount.**

The original defect was that notification scheduling lived inside `HomePage`.
`HomePage` unmounts the moment the user navigates to Quran or Settings, and its
`useEffect` cleanup could reach `cancelAll()`. A single route change therefore
wiped every alarm the user had armed.

The fix was structural, not a patch:

1. `NotificationProvider` lives in `app/layout.tsx`, above every route. It owns
   the prayer calendar, today's timings, and the scheduling hook. Moving between
   routes unmounts pages — it never unmounts the provider.
2. `usePrayerNotifications` has **no cleanup function that touches
   notifications**. Its teardown only flips a `mountedRef` flag to prevent a
   late state update. The only path that withdraws alarms is
   `preferences.enabled === false`, which is a deliberate user action handled
   inside `lib/notifications/index.ts`.
3. Scheduling is keyed on a stable serialised signature. It re-runs when — and
   only when — something that actually changes the schedule changes.

## State management

- **Settings** live in `context/settings-context.tsx` via React Context with
  automatic `localStorage` persistence. There is no Redux or Zustand; Context
  is sufficient for this scope.
- **Notification state** lives in `context/notification-context.tsx`. It exposes
  today's timings, the calendar, the live scheduling status, test actions, and
  diagnostics.
- **UI state** (loading, search, dropdowns) stays in local `useState` inside
  each component. No component lifts UI state into Context.

## Data fetching

- Client-side `fetch` API. No SWR, no React Query.
- The Quran reader issues parallel requests for Arabic text and translation.
- The prayer calendar is fetched once per month via `/v1/calendar/{year}/{month}`,
  cached in `localStorage`, and refreshed on a rolling window. This is what makes
  scheduling correct: each day has its own exact time rather than today's times
  being reused for the next seven days.

## Styling

- Tailwind CSS v4 with `@tailwindcss/postcss`.
- CSS custom properties in OKLCH for perceptually uniform, accessible colors.
- Mobile-first responsive design.
- Google Fonts: Amiri (Arabic), Geist (sans-serif), Geist Mono (monospace).