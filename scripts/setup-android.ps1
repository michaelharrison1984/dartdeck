$ErrorActionPreference = "Stop"
npm install
npm run build:mobile
if (-not (Test-Path "android")) { npx cap add android }
npx cap sync android
npx capacitor-assets generate --android
npx cap open android
