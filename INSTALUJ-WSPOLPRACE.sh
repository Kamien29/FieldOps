#!/usr/bin/env bash
# Safe installer: applies the collaboration module ONLY onto the original Week 4 base.
# Any diverged target file stops the installation BEFORE touching the project.
set -euo pipefail
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "Użycie: bash INSTALUJ-WSPOLPRACE.sh ~/Documents/fieldops" >&2
  exit 2
fi
TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || { echo "Brak folderu: $TARGET"; exit 2; }
if [[ "$TARGET" == "$SOURCE" ]]; then echo "To już jest wersja gotowa; nie instaluj jej na sobie.";exit 0;fi
if [[ ! -d "$TARGET/backend/src" || ! -f "$TARGET/fieldops-web/index.html" || ! -d "$TARGET/mobile/src" ]]; then
  echo "To nie jest kompletny folder FieldOps. Nie podmieniono plików." >&2;exit 2
fi
# Files replaced from the baseline week-4 project.
declare -A expected=(
  ["backend/src/server.js"]="437730ff8aaee7b03246cc0628e86c25835c7690184da51651e1798fb06a8b28"
  ["backend/src/migrate.js"]="bd15f9eefe89e751155913ab85b40e5662b5c6ac445e453ffb043816711c6578"
  ["backend/package.json"]="7fd3d799d4a0d1cf715cf523dbb0764f70f9f1dcdac9e73f78f3f103a465fb44"
  ["backend/test/week4-http.test.js"]="7ad9211fe2b0507ebb86da056b175f7e03277654146c445f551bce02e4fbc1cd"
  ["fieldops-web/index.html"]="4b8266f0b5ffd87b56459f53aba8d1f787168302ebe971ba22562615b28a1ba3"
  ["mobile/App.tsx"]="bb80c9967c9bf4ef07eee9ed9496d972e48e70a69d1a1bb9ee39fa648ba3b908"
  ["mobile/src/nav.ts"]="fd1643ba19bcb1b74382ce465f09c39a7abfd3bf52b90e083f37761eef8ff020"
  ["mobile/src/screens/JobListScreen.tsx"]="79d4cff2f77853fdc675e7efd5767bee9c545dfbbfd6a12618bb9ff9242273f6"
 )
newfiles=(
  "backend/src/team-api.js"
  "backend/db/migrations/003_teams_and_collaboration.sql"
  "backend/test/team-api.test.js"
  "fieldops-web/public/team.js"
  "mobile/src/team-api.ts"
  "mobile/src/screens/TeamScreen.tsx"
  "mobile/src/screens/ProfileScreen.tsx"
 )
for path in "${!expected[@]}";do
  if [[ ! -f "$TARGET/$path" ]];then echo "Brakuje pliku: $path. Nic nie zmieniono." >&2;exit 1;fi
  current="$(sha256sum "$TARGET/$path" | cut -d' ' -f1)"
  sourcehash="$(sha256sum "$SOURCE/$path" | cut -d' ' -f1)"
  if [[ "$current" != "${expected[$path]}" && "$current" != "$sourcehash" ]];then
    echo "KONFLIKT: $path różni się od bazy Tydzień 4. Nic nie zmieniono." >&2
    echo "Zachowaj swoje zmiany i połącz je ręcznie albo korzystaj z kompletnej paczki ZIP jako nowego folderu." >&2
    exit 1
  fi
done
for path in "${newfiles[@]}";do
  if [[ -f "$TARGET/$path" ]] && ! cmp -s "$TARGET/$path" "$SOURCE/$path";then
    echo "KONFLIKT: istniejący $path jest inny. Nic nie zmieniono." >&2;exit 1
  fi
done
backup="$SOURCE/kopia-przed-wspolpraca-$(date +%Y%m%d-%H%M%S)"
for path in "${!expected[@]}";do
  if [[ -f "$TARGET/$path" ]];then mkdir -p "$backup/$(dirname "$path")";cp "$TARGET/$path" "$backup/$path";fi
done
for path in "${!expected[@]}" "${newfiles[@]}";do
  mkdir -p "$TARGET/$(dirname "$path")";cp "$SOURCE/$path" "$TARGET/$path"
done
mkdir -p "$TARGET/docs"
cp "$SOURCE/docs/TEAM-API.md" "$TARGET/docs/TEAM-API.md"
cp "$SOURCE/WDROZ-FIRMY-I-CZAT.md" "$TARGET/WDROZ-FIRMY-I-CZAT.md"
cp "$SOURCE/RAPORT-FIRMY-I-CZAT.md" "$TARGET/RAPORT-FIRMY-I-CZAT.md"
echo "GOTOWE: zainstalowano moduł Firmy + Czat + Przekazania + Profil."
echo "Kopia poprzednich plików: $backup"
echo "Wymagana nowa migracja PostgreSQL 003 po wykonaniu backupu Neon."
echo "Nie zmieniono .env, GitHuba, Vercel ani bazy danych."
echo "Następny krok: przeczytaj WDROZ-FIRMY-I-CZAT.md i uruchom testy."
