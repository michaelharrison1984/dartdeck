#!/usr/bin/env bash
set -euo pipefail
npm install
npm run build:mobile
[ -d ios ] || npx cap add ios
npx cap sync ios
npx capacitor-assets generate --ios
npx cap open ios
