# DartDeck v0.7.2

A self-hosted darts scoring and practice PWA for Docker / Portainer.

## Included

- X01: 301 / 501 / 701
- 1–4 players
- Straight-in or double-in
- Straight-out, double-out or master-out
- Best-of legs
- Quick score entry or dart-by-dart entry
- Checkout suggestions and setup-shot advice
- Live 3-dart average, first-9 display, high visit, 100+/140+/180 counters
- Saved players and X01 history in SQLite
- Rich player dashboards with X01, party-game and training stats
- Two-player X01 head-to-head rivalry stats and streaks
- Party games: Cricket, Killer, Shanghai, Halve-It
- Training Centre: Checkout Trainer, Doubles Trainer, 121 (9 darts / 3 visits with quick-score tally), Bob's 27 (D1–D20 then Bull)
- Custom theme colours and font choice
- Uploadable app icon / favicon, automatically resized for the browser and PWA
- Installable PWA manifest with 192px / 512px icons and iOS home-screen icon
- Optional Screen Wake Lock while a game or practice session is active
- Optional Dartboard Mode with distraction-free scoring and tablet landscape layout
- DartBot X01 opponent with seven skill levels
- Saved Checkout Trainer / 121 sessions and Bob's 27 double-by-double analytics
- In-app PWA diagnostics / install status

## Portainer / Docker deployment

The included Compose file uses host port **8788**:

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
      - DARTDECK_DB=/data/dartdeck.db
    restart: unless-stopped

volumes:
  dartdeck_data:
```

Build / update with:

```bash
docker compose up -d --build
```

Then open:

```text
http://YOUR-SERVER-IP:8788
```

## GitHub / Portainer Git stack

If the project is stored at `michaelharrison1984/dartdeck`, keep `docker-compose.yml` and `Dockerfile` at the repository root. In Portainer, use the repository stack and set the Compose path to:

```text
docker-compose.yml
```

After pushing an updated version, redeploy/re-pull the stack so the image is rebuilt.

## Settings

Open **Settings** in DartDeck to change:

- Primary colour
- Accent colour
- Background colour
- Panel colour
- Main text colour
- Muted text colour
- Font style
- Keep-screen-awake behaviour
- Dartboard Mode
- App icon / favicon

Theme and branding settings are stored centrally in the same persistent Docker data volume, so they are shared by all devices using DartDeck.

Uploaded icons can be PNG, JPG or WebP up to 5 MB. DartDeck centre-crops the image to a square and automatically creates 64, 180, 192 and 512 pixel PNG versions.

## PWA installation and HTTPS

A normal page can be opened over:

```text
http://YOUR-SERVER-IP:8788
```

However, browser security rules normally require a **secure context** for PWA installation and Screen Wake Lock. `localhost` is treated specially, but another device accessing a LAN IP over plain HTTP usually is not.

For reliable PWA installation and the keep-screen-awake feature, expose DartDeck through **HTTPS**, for example through an existing reverse proxy such as Nginx Proxy Manager, Caddy or Traefik.

Once HTTPS is working:

- Chrome / Edge / Android: DartDeck will show its **Install** button when the browser makes the install prompt available.
- iPhone / iPad: open DartDeck in Safari, tap **Share**, then **Add to Home Screen**.
- The Settings page reports whether the current connection is secure, whether service workers and Wake Lock are supported, and whether DartDeck is already running as an installed app.

## Screen Wake Lock

With **Keep screen awake** enabled, DartDeck requests a screen wake lock when an X01 match, party game or practice session starts. It releases the lock when you leave the scoring session and attempts to reacquire it when you return to the app after switching tabs/apps.

Wake Lock requires HTTPS (or localhost), a visible page and browser support. Device/browser power-saving policies can still override it in some situations.

## Data

Persistent data is stored in the named Docker volume:

```text
dartdeck_data
```

The SQLite database is:

```text
/data/dartdeck.db
```

Uploaded branding icons are stored under:

```text
/data/branding
```

Rebuilding or replacing the DartDeck container does not remove this data as long as the named volume is retained.

## Notes

- Double-in is intentionally forced to dart-by-dart input because DartDeck needs to know which dart opened the leg.
- Quick Score checkouts ask how many darts the finish took; exact dart-by-dart entry remains available when you want to record the route.


## Updating from v0.4.0
v0.6.0 keeps the focused game list from v0.4.0 and adds real-play refinements:

- X01 checkout confirmation returns automatically to Quick Score.
- All multiplayer game setup screens remember the last-used players and order; Training remembers its last player.
- Checkout routing favours safer single setup darts instead of unnecessary intermediate doubles (for example 112 = T20 → 12 → D20).
- X01 Quick Score has a one-tap Miss button for a 0-point visit.

The retained game set remains:

- 121 now uses the quick-score keypad and keeps a live remaining total across all 9 darts.
- Bob’s 27 runs D1 through D20 and then Bull, and ends if the score reaches zero or below.
- Cricket has a conventional marks board, clearer rules and dart-by-dart target entry.
- Killer uses a clearer doubles-based flow with visible **KILLER** badges and life markers.
- Shanghai uses large Single / Double / Treble / Miss buttons and a prominent current-target block.
- Halve-It uses the quick-score keypad.
- Doubles Around the Board, Scoring Trainer, Around the Clock and Count-Up have been removed for now.
- The screen wake lock still works when enabled, but the floating **Screen awake** badge has been removed.

Redeploy/rebuild the container, then reload DartDeck once. Existing data in the `dartdeck_data` volume is preserved.


## v0.6.0 additions

- More compact Cricket scoring screen and final-score display.
- Persistent Shanghai, Halve-It and Bob's 27 top-five leaderboards.
- Cricket and Killer win leaderboards.
- Dynamic player honours/badges for leaderboard leaders, most 180s, highest checkout and best checkout percentage (minimum 10 attempts).
- Party-game results are saved from v0.6.0 onward so leaderboards can build over time.


## v0.6.1 additions

- Quick Score checkouts now ask **Number of darts?** instead of forcing dart-by-dart reconstruction.
- The selected 1 / 2 / 3 dart count is used for averages and checkout statistics.
- Impossible dart counts are disabled based on the minimum valid checkout route.
- Exact dart-by-dart checkout entry remains available as an optional fallback.
- Quick Score returns to normal automatically after checkout confirmation.


## v0.7.1 additions

- Rich player dashboards with badges, X01 career stats, party-game records, recent results and training analytics.
- Head-to-head X01 rivalry view with match wins, legs, averages, 180s, highest checkout, recent meetings and current streak. Only true two-player matches count toward rivalry stats.
- Improved end-of-game screens with stronger summaries, direct rematch, player-dashboard links and final score tables.
- Dartboard Mode: hides navigation during active play, enlarges scoring controls and automatically uses a two-pane X01 layout on landscape tablets.
- DartBot for one-human X01 games, with seven levels from Beginner (~30 avg) to Pro (~95 avg) and separate checkout ability. DartBot currently uses straight-in.
- Checkout Trainer and 121 sessions can now be ended and saved.
- Bob's 27 records hits per double, allowing player dashboards to show strongest doubles over time.
- Training setup screens show the selected player's relevant history before starting a session.

Existing SQLite data remains compatible; the new analytics build on recorded history as new training sessions are saved.


## v0.7.2 additions

- Renamed Training to **Training Centre** across the home screen, PWA shortcut and practice flow.
- Added a dedicated **Doubles Trainer** with four session types: All Doubles, Checkout Doubles, Weakest Doubles and Custom.
- Doubles Trainer supports 1–3 passes through the selected targets and records 0–3 hits from each three-dart visit.
- Weakest Doubles uses the player's recorded Doubles Trainer hit rates and falls back to common checkout doubles until enough history exists.
- Added per-double hit-rate analytics, strongest/weakest doubles, session accuracy and all-time accuracy to Player Dashboards and training finish screens.
- Existing SQLite data remains compatible; Doubles Trainer analytics start building from sessions recorded in v0.7.2 onward.
