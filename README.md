# DartDeck v0.4.0

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
- Lifetime player stats
- Party games: Cricket, Killer, Shanghai, Halve-It
- Training modes: Checkout Trainer, 121 (9 darts / 3 visits with quick-score tally), Bob's 27 (D1–D20 then Bull)
- Custom theme colours and font choice
- Uploadable app icon / favicon, automatically resized for the browser and PWA
- Installable PWA manifest with 192px / 512px icons and iOS home-screen icon
- Optional Screen Wake Lock while a game or practice session is active
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
- A finishing visit in double-out/master-out also needs dart-by-dart input so the final dart can be validated. When a quick-score entry would finish the leg, DartDeck now keeps a persistent confirmation panel on screen while you enter the finishing darts.


## Updating from v0.3.0
v0.4.0 deliberately simplifies the app around the modes that benefit most from scoring support:

- 121 now uses the quick-score keypad and keeps a live remaining total across all 9 darts.
- Bob’s 27 runs D1 through D20 and then Bull, and ends if the score reaches zero or below.
- Cricket has a conventional marks board, clearer rules and dart-by-dart target entry.
- Killer uses a clearer doubles-based flow with visible **KILLER** badges and life markers.
- Shanghai uses large Single / Double / Treble / Miss buttons and a prominent current-target block.
- Halve-It uses the quick-score keypad.
- Doubles Around the Board, Scoring Trainer, Around the Clock and Count-Up have been removed for now.
- The screen wake lock still works when enabled, but the floating **Screen awake** badge has been removed.

Redeploy/rebuild the container, then reload DartDeck once. Existing data in the `dartdeck_data` volume is preserved.
