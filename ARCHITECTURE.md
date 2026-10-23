# DartDeck 0.9 architecture

DartDeck now uses one source tree for Web/PWA and Android.

## Shared

`src/` contains the application UI, scoring/game logic, statistics, DartBot, Training Centre and IndexedDB data layer.

The database name remains `dartdeck-local`. Keeping the same web origin therefore preserves existing v0.8.x PWA data.

## Web / PWA

`npm run build:web` creates `dist/web`. Docker serves only these static files. There is no server-side player or match database.

Web-only integration currently includes:

- PWA manifest and service worker
- install/persistent-storage diagnostics
- JSON backup export/import
- Last Backup indicator

## Android

`npm run build:mobile` creates `dist/mobile`, which Capacitor packages into `com.dartdeck.app`.

Android uses the same app/game/store source, with PWA-only controls hidden. Native SQLite remains a future storage upgrade; 0.9.0 deliberately keeps the existing IndexedDB store so consolidation does not change game data semantics at the same time.

## Build-time platform flag

`scripts/build.mjs` creates `platform.js` in each output:

- Web: `DARTDECK_NATIVE=false`
- Android: `DARTDECK_NATIVE=true`

This is the only platform switch the shared UI needs for the current release.
