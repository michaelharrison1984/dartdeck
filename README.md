# DartDeck 0.9.0

One DartDeck codebase for **Docker/PWA and Android**.

DartDeck is an offline-first darts scoring, competition and training app. Version 0.9.0 consolidates the former Docker v0.8.x and Android Mobile 0.1.x projects into one repository so game rules, DartBot, profiles, Head-to-Head, Training Centre, themes and future localisation are changed once and shipped to both platforms.

## Repository layout

```text
dartdeck/
├── src/                    # Shared DartDeck app + local data layer
│   ├── app.js
│   ├── store.js
│   ├── styles.css
│   ├── index.html
│   └── icons/
├── assets/                 # Master native icon/splash assets
├── scripts/
│   ├── build.mjs           # Builds Web or Android web assets
│   └── smoke-test.mjs
├── .github/workflows/
│   ├── android-debug.yml
│   └── docker-check.yml
├── Dockerfile
├── docker-compose.yml
├── capacitor.config.json
└── package.json
```

## Important upgrade note for existing Docker/PWA users

DartDeck 0.9.0 keeps the IndexedDB database name **`dartdeck-local`**.

To retain existing v0.8.x players, matches, stats, Head-to-Head and Training Centre history:

1. Deploy 0.9.0 at the **same scheme + hostname + port** as the current DartDeck installation.
2. Do not clear site data in the browser/PWA.
3. Export a DartDeck backup before upgrading as an additional safeguard.

The Docker container no longer owns match data. Each browser/PWA installation owns its own local data.

## Docker / Portainer

The external port remains 8788:

```yaml
services:
  dartdeck:
    build: .
    container_name: dartdeck
    ports:
      - "8788:8000"
    restart: unless-stopped
```

Build locally:

```bash
docker compose up -d --build
```

Then open `http://YOUR-SERVER:8788` or your existing HTTPS reverse-proxy URL.

No Docker data volume is required.

## Android via GitHub Actions

The repository contains `.github/workflows/android-debug.yml`.

After pushing to GitHub:

1. Open **Actions**.
2. Select **Build Android debug APK**.
3. Choose **Run workflow**.
4. Download the `DartDeck-0.9.0-debug-apk` artifact.
5. The APK inside is `app-debug.apk`.

The Android application ID remains `com.dartdeck.app`.

### Test APK signing warning

GitHub debug builds use a temporary Gradle debug signing key. A build from a different runner may not install over an older debug APK. Android may require the old test APK to be uninstalled first, which also removes that app's local data.

Before public/beta distribution we should establish a stable signing key and native backup/SQLite strategy. Do **not** use a disposable debug key for the eventual Play Store release.

## Local Android development

Requires Node 24+, Java 21 and a current Android SDK/Android Studio.

Windows helper:

```powershell
./scripts/setup-android.ps1
```

Or manually:

```bash
npm install
npm run build:mobile
npx cap add android
npx cap sync android
npx capacitor-assets generate --android
npx cap open android
```

## Shared development

Make feature changes in `src/`, not separate platform copies.

Validate both outputs:

```bash
npm test
```

Build only the web/PWA assets:

```bash
npm run build:web
```

Build only the Android/Capacitor assets:

```bash
npm run build:mobile
```

## Data

Both platforms are local-first. DartDeck currently uses IndexedDB named `dartdeck-local` for player, match, practice and settings data.

The Web/PWA edition includes JSON Export / Import & Merge / Import & Replace and the Last Backup indicator. Android retains the same underlying local data model, with native backup and native SQLite planned as the next mobile foundation work.
