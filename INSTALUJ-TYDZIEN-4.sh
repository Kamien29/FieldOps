#!/usr/bin/env bash
# Optional safe local merge for a project matching the uploaded 23 Oct baseline.
# Never writes to GitHub, Vercel or Neon.
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-}"
if [[ -z "$TARGET" || ! -d "$TARGET/backend" || ! -d "$TARGET/mobile" ]]; then
  echo "Użycie: bash INSTALUJ-TYDZIEN-4.sh ~/Documents/fieldops" >&2
  exit 2
fi
TARGET="$(cd "$TARGET" && pwd)"
MISMATCH=0
while IFS=$'\t' read -r file expected; do
  [[ -z "$file" ]] && continue
  dest="$TARGET/$file"
  if [[ "$expected" == 'NEW' ]]; then
    if [[ -e "$dest" ]]; then
      echo "KONFLIKT (plik juz istnieje): $file"
      MISMATCH=1
    fi
  elif [[ -e "$dest" ]]; then
    actual="$(sha256sum "$dest" | awk '{print $1}')"
    if [[ "$actual" != "$expected" ]]; then
      echo "KONFLIKT (nowszy / inny plik): $file"
      MISMATCH=1
    fi
  else
    echo "KONFLIKT (brakuje pliku): $file"
    MISMATCH=1
  fi
done <<'CHECKSUMS'
TYDZIEN-4-START.md	NEW
backend/package.json	8b82a63357bec64a992089c5d5ecd08f07af21b2873bd2065cc9062e4e73eded
backend/src/migrate.js	dfb810832d6f11585f9bcb49fb846bdd933064a65bcf1e31aaa8236f12131cba
backend/src/migration-policy.js	NEW
backend/src/server.js	6163887f0c1d88fcbbb3b73f81f04da95e8ddbe498cb674bc84b0169ac2a7e22
backend/test/migration-policy.test.js	NEW
backend/test/week4-http.test.js	NEW
docs/TEST-TYDZIEN-4.md	NEW
docs/WDROZENIE-TYDZIEN-4.md	NEW
fieldops-web/index.html	2747804b50b6f3ac91b95abb524cb3b5c1d64dd87fc615ac54d651d60c3122be
mobile/.env.example	c83ab64009439293caa4abdceae28cf86ebb9a68a2ccdf8501b3e9698cd48e58
mobile/App.tsx	beb1b7bacc87b4bb16e2591bf2cb14a9a75e36fc6c66c9ed3c3f2f8e1f7c02e2
mobile/package.json	2f8491f30e8177fb4781a568d5c754c5f96568aef497a70ad7afcf6bb5e4f25e
mobile/src/SyncContext.tsx	e1820f06ecbf788230f55ed4f67a7c189db6f2d618b83a5c00b4c76d8e7566a9
mobile/src/config.ts	ecc489f008f01216afe9bf45eeb35ab7f267d3ad122de2780b53812640c918dd
mobile/src/db.ts	ae05ed79266423172f1c937bb92822a1ba07736894c60736203dde59c8109b28
mobile/src/files.ts	5edc862224d6bd3a8e800831f97bdb249e3a3f18e8df2d639724932563407ce8
mobile/src/nav.ts	2a3072e5dc52878c10d542f3c891f54450ccf7d3d9b4b31a7ecf7bb7713e0157
mobile/src/photo-processing.ts	NEW
mobile/src/retry-policy.ts	NEW
mobile/src/screens/JobDetailScreen.tsx	e82461009c72e58d582ad1f540f83744ffcf91ddb2a3beedf74ba25e5f95e758
mobile/src/screens/JobEditorScreen.tsx	NEW
mobile/src/screens/JobListScreen.tsx	11c6164fb20585de6d6e593e5d3a4a7726629e9f5c01964e2b13ede4e95cd78a
mobile/src/screens/LoginScreen.tsx	ab9b929498278f652bb9626924b949d9f5e81f1e60f654c8939aa98755c128df
mobile/src/strings.ts	bf52fe7a0acf9e714799cf865ab7bf83ecb17dc98bd9e1343c496f8b0f1c5979
mobile/src/sync.ts	0d8eac55796e0578beb61fe3fd5dbef8b9d9a975eedc14408fdbabd6b9d5a294
mobile/src/types.ts	245a8e2669533e9f23c8644a609685e04968d11f92704210f9bcee50421589d2
mobile/src/ui.tsx	4a0485d64cc69e429c811786ef22401dec0eb09da26545c8aa70734d1fe10cf1
mobile/test/retry-policy.test.mjs	NEW
mobile/test/week4-sqlite.test.mjs	NEW
CHECKSUMS
if [[ "$MISMATCH" -ne 0 ]]; then
  echo "Wstrzymano bez zmian. Twoj projekt nie odpowiada bazowej paczce; wykonaj reczne scalenie." >&2
  exit 3
fi
BACKUP="$(dirname "$TARGET")/fieldops-backup-week4-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
while IFS=$'\t' read -r file expected; do
  [[ -z "$file" ]] && continue
  dest="$TARGET/$file"
  if [[ -f "$dest" ]]; then
    mkdir -p "$BACKUP/$(dirname "$file")"
    cp -p "$dest" "$BACKUP/$file"
  fi
  mkdir -p "$(dirname "$dest")"
  cp -p "$SRC/$file" "$dest"
done <<'CHECKSUMS'
TYDZIEN-4-START.md	NEW
backend/package.json	8b82a63357bec64a992089c5d5ecd08f07af21b2873bd2065cc9062e4e73eded
backend/src/migrate.js	dfb810832d6f11585f9bcb49fb846bdd933064a65bcf1e31aaa8236f12131cba
backend/src/migration-policy.js	NEW
backend/src/server.js	6163887f0c1d88fcbbb3b73f81f04da95e8ddbe498cb674bc84b0169ac2a7e22
backend/test/migration-policy.test.js	NEW
backend/test/week4-http.test.js	NEW
docs/TEST-TYDZIEN-4.md	NEW
docs/WDROZENIE-TYDZIEN-4.md	NEW
fieldops-web/index.html	2747804b50b6f3ac91b95abb524cb3b5c1d64dd87fc615ac54d651d60c3122be
mobile/.env.example	c83ab64009439293caa4abdceae28cf86ebb9a68a2ccdf8501b3e9698cd48e58
mobile/App.tsx	beb1b7bacc87b4bb16e2591bf2cb14a9a75e36fc6c66c9ed3c3f2f8e1f7c02e2
mobile/package.json	2f8491f30e8177fb4781a568d5c754c5f96568aef497a70ad7afcf6bb5e4f25e
mobile/src/SyncContext.tsx	e1820f06ecbf788230f55ed4f67a7c189db6f2d618b83a5c00b4c76d8e7566a9
mobile/src/config.ts	ecc489f008f01216afe9bf45eeb35ab7f267d3ad122de2780b53812640c918dd
mobile/src/db.ts	ae05ed79266423172f1c937bb92822a1ba07736894c60736203dde59c8109b28
mobile/src/files.ts	5edc862224d6bd3a8e800831f97bdb249e3a3f18e8df2d639724932563407ce8
mobile/src/nav.ts	2a3072e5dc52878c10d542f3c891f54450ccf7d3d9b4b31a7ecf7bb7713e0157
mobile/src/photo-processing.ts	NEW
mobile/src/retry-policy.ts	NEW
mobile/src/screens/JobDetailScreen.tsx	e82461009c72e58d582ad1f540f83744ffcf91ddb2a3beedf74ba25e5f95e758
mobile/src/screens/JobEditorScreen.tsx	NEW
mobile/src/screens/JobListScreen.tsx	11c6164fb20585de6d6e593e5d3a4a7726629e9f5c01964e2b13ede4e95cd78a
mobile/src/screens/LoginScreen.tsx	ab9b929498278f652bb9626924b949d9f5e81f1e60f654c8939aa98755c128df
mobile/src/strings.ts	bf52fe7a0acf9e714799cf865ab7bf83ecb17dc98bd9e1343c496f8b0f1c5979
mobile/src/sync.ts	0d8eac55796e0578beb61fe3fd5dbef8b9d9a975eedc14408fdbabd6b9d5a294
mobile/src/types.ts	245a8e2669533e9f23c8644a609685e04968d11f92704210f9bcee50421589d2
mobile/src/ui.tsx	4a0485d64cc69e429c811786ef22401dec0eb09da26545c8aa70734d1fe10cf1
mobile/test/retry-policy.test.mjs	NEW
mobile/test/week4-sqlite.test.mjs	NEW
CHECKSUMS
echo "Zainstalowano zmiany tygodnia 4. Kopia: $BACKUP"
echo "Dalej: cd "$TARGET/backend" && npm test; cd "$TARGET/mobile" && npm install && npm run test:offline && npm run typecheck"
echo "Nic nie wyslano na GitHub ani Vercel."
