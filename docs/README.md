# Nur+ Documentation

This directory holds the long-form documentation that does not belong in the
root `README.md`. The root README is the first thing a visitor reads; these
files are for maintainers, contributors, and anyone who needs to understand a
specific subsystem in depth.

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — how the application is built, how the
  pieces fit together, and the rules that hold it together.
- **[NOTIFICATIONS.md](NOTIFICATIONS.md)** — the notification system end to end:
  scheduling, the three delivery backends, the alert styles, and the platform
  limitations that are real rather than imagined.
- **[DATA_FLOW.md](DATA_FLOW.md)** — what happens from the moment the app loads
  to the moment a prayer alert fires, in chronological order.
- **[PLATFORMS.md](PLATFORMS.md)** — what runs where, what each platform can and
  cannot do, and how the same bundle serves all three.
- **[SETTINGS.md](SETTINGS.md)** — the full settings schema, every value, and
  what changing it does.
- **[RELEASE.md](RELEASE.md)** — how to build, sign, and ship a release for each
  platform.