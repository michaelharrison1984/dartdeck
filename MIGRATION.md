# Workshop migration checklist

Do **not** delete the existing DartDeck Docker volume before migration.

- [ ] Redeploy v0.8.0 with the existing `dartdeck_data` volume.
- [ ] Open DartDeck on the workshop tablet using the normal URL.
- [ ] Settings → Existing server history shows sensible counts.
- [ ] Click **Copy server history to this device**.
- [ ] Check Players and Head-to-Head.
- [ ] Check 180s / highest checkout / leaderboards.
- [ ] Check Training Centre history.
- [ ] Settings → Data & backup → **Export backup**.
- [ ] Store the JSON backup somewhere outside the tablet.

The original SQLite database remains unchanged and can also be downloaded from Settings while the legacy volume remains attached.
