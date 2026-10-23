# Changelog

## 0.9.0

- Consolidated Docker/PWA v0.8.2 and Android Mobile 0.1.3 into one repository and version number.
- One shared `src/` now drives Web/PWA and Android builds.
- Preserved IndexedDB database name `dartdeck-local` for existing Web/PWA history.
- Preserved Android application ID `com.dartdeck.app`.
- Retained local-first data, player profiles, Head-to-Head, DartBot, Dartboard View, curated themes, Training Centre and Doubles Trainer.
- Web/PWA retains backup import/export, persistent-storage diagnostics and Last Backup indicator.
- Added shared build scripts, Android GitHub Actions workflow and Docker validation workflow.
- Removed the FastAPI runtime; Docker now serves the generated static PWA with a lightweight Python server only.
