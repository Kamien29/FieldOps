#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo '[1/4] Backend — testy autoryzacji, raportów, migracji i izolowanego HTTP'
(cd backend && npm test)
echo '[2/4] Składnia backendu i vercel.json'
for f in backend/src/*.js backend/api/*.js; do node --check "$f"; done
node -e 'const c = require("./vercel.json"); if (!c.services?.backend || !c.services?.["fieldops-web"]) process.exit(1);'
echo '[3/4] Frontend Vite — wymagane wcześniejsze npm ci w fieldops-web'
if [[ -x fieldops-web/node_modules/.bin/vite ]]; then (cd fieldops-web && npm run build); else echo 'POMINIĘTO: najpierw cd fieldops-web && npm ci'; fi
echo '[4/4] Mobile TypeScript — wymagane wcześniejsze npm install w mobile'
if [[ -x mobile/node_modules/.bin/tsc ]]; then (cd mobile && npx tsc --noEmit); else echo 'POMINIĘTO: najpierw cd mobile && npm install'; fi
echo 'Koniec. Test Vercel/Neon i aparatu wymaga osobnego środowiska.'
