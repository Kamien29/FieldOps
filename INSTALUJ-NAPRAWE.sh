#!/usr/bin/env bash
set -euo pipefail
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$HOME/Documents/fieldops}"
if [[ ! -f "$TARGET/backend/src/team-api.js" || ! -f "$TARGET/fieldops-web/public/team.js" ]]; then
  echo "Nie znaleziono plików FieldOps w: $TARGET" >&2
  exit 1
fi
# Refuse to overwrite newer customized versions; user can merge manually.
expected=(
  "fieldops-web/public/team.js:ee0e435b68091d9aba6a27fb2b5d570f37ba94171d189ee4561e57707b99a7b4"
  "backend/src/team-api.js:a8f6967f89df241222bee234bb7c123cd8d6dec73bc4a1e3ae138864a58d76e1"
)
for entry in "${expected[@]}"; do
  path="${entry%%:*}"; hash="${entry#*:}"
  actual="$(sha256sum "$TARGET/$path" | cut -d' ' -f1)"
  if [[ "$actual" != "$hash" ]]; then
    echo "UWAGA: $path różni się od wersji bazowej. Przerywam, aby nie nadpisać zmian." >&2
    echo "Użyj ręcznego scalenia lub skontaktuj się z asystentem." >&2
    exit 2
  fi
done
backup="$TARGET/.fieldops-backups/naprawa-firmy-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
for path in "fieldops-web/public/team.js" "backend/src/team-api.js" "backend/test/team-api.test.js"; do
  mkdir -p "$backup/$(dirname "$path")"
  cp "$TARGET/$path" "$backup/$path"
  cp "$BASE/$path" "$TARGET/$path"
done
echo "Poprawka zainstalowana. Kopia poprzednich plików: $backup"
echo "Sprawdź: cd "$TARGET/backend" && npm test"
echo "Wdrożenie na Vercel wymaga osobnej czynności użytkownika."
