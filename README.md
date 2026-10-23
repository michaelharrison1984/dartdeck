# DartDeck v0.8.0 — Local-First Docker/PWA

DartDeck v0.8.0 changes the Docker/PWA edition from shared server-side game storage to local device storage.

## What this means

- Players, matches, head-to-head history, leaderboards and Training Centre data are stored in IndexedDB in the browser/PWA on the device being used.
- New game data is **not written to the Docker SQLite database**.
- The existing `/data/dartdeck.db` is retained only as a read-only migration source.
- The app matches the current Android mobile UX: curated themes, accent colour, Dartboard View during games, DartBot pause/reveal, player profiles, head-to-head stats and the Training Centre including Doubles Trainer.
- Full backup export plus Merge / Replace import is built in.

## Upgrade from v0.7.2

Keep the existing `dartdeck_data` Docker volume when you redeploy. It contains the history that DartDeck needs to copy to the workshop tablet.

1. Deploy/rebuild v0.8.0 using the same stack and existing volume.
2. Open DartDeck on the **workshop tablet/browser that will own the data**.
3. Go to **Settings → Existing server history**.
4. Check the displayed legacy counts (players, matches, training sessions and 180s).
5. Press **Copy server history to this device**.
6. Open Players / Stats / Head-to-Head and confirm the history looks correct.
7. Return to **Settings → Data & backup** and press **Export backup**.
8. Keep that backup somewhere safe before clearing browser data, reinstalling the PWA or changing the DartDeck URL.

The migration is safe to run again. Legacy records have stable IDs and already imported matches/training sessions are skipped.

## Important local-storage behaviour

Local data belongs to the browser origin and browser profile. In practice:

- the same workshop tablet + same browser/PWA + same DartDeck URL sees the same data;
- another phone or PC starts with its own database;
- changing the hostname/domain/port may create a different browser origin and therefore a different local database;
- clearing site data can remove DartDeck history;
- removing/reinstalling a PWA can behave differently by browser, so do not rely on uninstall preserving data.

Use **Export backup** regularly. Settings also includes a **Protect local data** control where the browser supports persistent storage.

## Backup import

**Import & merge** is the normal choice. It keeps the device's existing players/history and skips records already present.

**Import & replace** clears the local DartDeck database first, then restores the selected backup. Export a backup before using Replace.

## Docker deployment

```yaml
services:
  dartdeck:
    build: .
    container_name: dartdeck
    ports:
      - "8788:8000"
    volumes:
      - dartdeck_data:/data
    environment:
      - DARTDECK_LEGACY_DB=/data/dartdeck.db
    restart: unless-stopped

volumes:
  dartdeck_data:
```

The volume is still present in v0.8.0 solely so the old database can be migrated/downloaded. New scores do not use it.

## Future cleanup

Once you have migrated the workshop tablet, verified the stats/head-to-head history, and exported a local backup, a future release can remove the legacy database dependency entirely and serve DartDeck as a lightweight static application.
