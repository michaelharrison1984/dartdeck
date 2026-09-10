# DartDeck

A self-hosted darts scoring and practice PWA for Docker / Portainer.

## Included in this first build

- X01: 301 / 501 / 701
- 1–4 players
- Straight-in or double-in
- Straight-out, double-out or master-out
- Best-of legs
- Quick score entry or dart-by-dart entry
- Checkout suggestions and basic setup-shot advice
- Live 3-dart average, first-9 display, high visit, 100+/140+/180 counters
- Saved players and X01 history in SQLite
- Lifetime player stats
- Party games: Cricket, Killer, Shanghai, Halve-It, Around the Clock, Count-Up
- Solo modes: Checkout Trainer, 121, Bob's 27, Doubles Around the Board, Scoring Trainer, Solo X01
- PWA/service worker support

## Portainer deployment

### Option A — Build from files

1. Put this folder on your Docker host, for example `/opt/dartdeck`.
2. In Portainer, create a stack using the included `docker-compose.yml`, or run:

```bash
docker compose up -d --build
```

3. Open:

```text
http://YOUR-SERVER-IP:8788
```

### Option B — Portainer Git stack

Put these files into a Git repository, then use Portainer's **Repository** build method and point it at `docker-compose.yml`.

## Data

Persistent data is stored in the named Docker volume:

```text
dartdeck_data
```

The SQLite database is `/data/dartdeck.db` inside the container.

## Notes

- Double-in is intentionally forced to dart-by-dart input because the app needs to know which dart opened the leg.
- A finishing visit in double-out/master-out also needs dart-by-dart input so the final dart can be validated.
- This is an MVP intended to be iterated after real dartboard use.
