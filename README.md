# DartDeck v0.8.1 — Clean Local-First Docker/PWA

DartDeck v0.8.1 is the clean public/local-first build. The one-time legacy server migration tools from v0.8.0 have been removed.

## Storage model

- Players, matches, head-to-head history, leaderboards and Training Centre data are stored locally in IndexedDB in each browser/PWA.
- The Docker container serves the application only. It does not store DartDeck player or match history.
- Every device/browser gets its own private DartDeck database.
- Full backup export plus Import & Merge / Import & Replace remain available under Settings → Data & backup.

## Upgrading from v0.8.0

If you already copied the old server history into the workshop tablet, redeploying v0.8.1 at the **same URL/domain/port** preserves that local browser database. The migration controls simply disappear.

Before upgrading, an Export Backup is strongly recommended.

Do not clear browser/site data, change the DartDeck hostname/domain/port, or uninstall the PWA unless you have a backup. Those actions can make the local database unavailable to the new origin/profile.

The old Docker named volume is no longer mounted or required by this compose file. Removing the mount does not itself erase the browser data already stored on the tablet.

## Sharing DartDeck

Friends opening your DartDeck URL start with a clean local database on their own device. They cannot access or migrate the old workshop server history. Their players, games and statistics remain local to their browser/device.

## Backup

Settings → Data & backup provides:

- **Export backup** — saves a portable DartDeck JSON backup.
- **Import & merge** — adds records from a backup while keeping existing local history.
- **Import & replace** — replaces the local device database with the selected backup.

## Docker deployment

```yaml
services:
  dartdeck:
    build: .
    container_name: dartdeck
    ports:
      - "8788:8000"
    restart: unless-stopped
```

No DartDeck data volume is required in v0.8.1.
