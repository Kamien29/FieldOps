# FieldOps — wdrożenie na Vercel (24.10.2026)

Ta paczka to **kompletny projekt** z ostatniego scalonego FieldOps, nie overlay. Ma backend PostgreSQL/Neon, frontend React ze stroną Profil oraz kod mobilny Expo. **Vercel wdraża stronę i API; kod `mobile/` nie staje się automatycznie aplikacją przeglądarkową.** Poprawki aparatu i QR działają w aplikacji Expo na telefonie, nie w przeglądarce.

## 0. Przed rozpoczęciem

- Zachowaj kopię aktualnego folderu, GitHuba i **backup Neona**.
- **Nie kopiuj `.env` do repozytorium i nie dołączaj go do wdrażanych plików.** Paczka nie zawiera sekretów.
- Zmiany w folderze `mobile/` nie są uruchamiane na Vercel.
- Projekt wymaga współczesnego Node.js 22 (zalecane **Node.js 22.22.2 lub nowszy 22.x** albo zgodnej nowszej wersji); wybrane zależności frontendu wymagają nowszego wydania niż 22.16.

## 1. Ustaw projekt Vercel

W istniejącym projekcie `fieldops-6mm7` otwórz **Settings → Build and Deployment**:

- Framework Preset: **Services**.
- Root Directory: katalog główny projektu, czyli `.`.
- `vercel.json` musi pozostać w głównym katalogu.
- Zostaw dwie usługi: `backend` (Node API) i `fieldops-web` (Vite/React). Przekierowania `/api/*` trafiają do backendu, pozostałe URL do aplikacji.

Vercel Services to funkcja Beta. Jeżeli **Services** nie jest dostępne w ustawieniach Twojego projektu, nie wdrażaj tej paczki przez preset Vite; potrzebna będzie inna konfiguracja (np. dwa projekty lub przebudowa wejścia API).

## 2. Zmienne w Vercel

W **Settings → Environment Variables** ustaw (Production):

| Zmienna | Wartość |
| --- | --- |
| `DATABASE_URL` | Połączenie do Twojej **istniejącej** bazy Neon |
| `TOKEN_SECRET` | **Ten sam sekret co dotychczas** (co najmniej 32 znaki), bo jego zmiana wyloguje użytkowników |
| `COOKIE_SECURE` | `1` |
| `PG_POOL_MAX` | `3` (opcjonalnie) |

Jeśli Vercel wskazuje osobne konfiguracje środowiska usług, upewnij się, że **backend** otrzymuje zmienne `DATABASE_URL` i `TOKEN_SECRET`. Nie wpisuj tu `ALLOW_REMOTE_MIGRATIONS`.

## 3. Migracje PostgreSQL — tylko jeśli nowa wersja ich wymaga

Ta paczka zawiera `001_initial.sql` i `002_report_completion.sql`. Jeśli na Neon wykonano tylko `001`, to **przed wdrożeniem** trzeba wykonać `002`. Skrypt `backend/src/migrate.js` stosuje obie, ponowne uruchomienie jest zamierzone jako bezpieczne dla istniejących tabel, ale każda migracja produkcyjna niesie ryzyko: **najpierw wykonaj snapshot/backup w Neon i upewnij się, że `DATABASE_URL` wskazuje właściwą bazę**.

Skrypt domyślnie odmawia migracji bazy zdalnej. Aby wykonać ją JEDNORAZOWO z komputera w Git Bash:

```bash
cd ~/Documents/FieldOps-Vercel/FieldOps/backend
npm ci
# Utwórz bezpieczny backend/.env ze swoimi DATABASE_URL i TOKEN_SECRET.
# Sprawdź docelowy host i nazwę bazy przed zmianą danych.
ALLOW_REMOTE_MIGRATIONS=YES node --env-file=.env src/migrate.js
```

Prawidłowy komunikat: `FieldOps PostgreSQL schema ready`. Nie ustawiaj `ALLOW_REMOTE_MIGRATIONS` na serwerze Vercel i nie uruchamiaj migracji automatycznie przy każdym request.

## 4. Instalacja i kontrola lokalna

W Git Bash w rozpakowanym katalogu projektu:

```bash
cd backend
npm ci
npm test
cd ../fieldops-web
npm ci
npm run build
cd ..
```

Jeżeli instalacja zależności zgłasza `EBADENGINE`, zaktualizuj Node.js i spróbuj ponownie. Pliki `backend/.env` i `node_modules` nie trafiają do Git.

## 5. Wdrożenie bez pusha na GitHub (Vercel CLI)

Ten wariant nie zmienia repozytorium GitHub:

1. Przenieś rozpakowany **cały folder** `FieldOps` w dogodną lokalizację i wejdź do niego w Git Bash.
2. `npm install -g vercel`
3. `vercel login`
4. `vercel link` — wskaż **istniejący** projekt `fieldops-6mm7` (nie twórz nowego).
5. `vercel deploy` — opcjonalna wersja Preview do przetestowania.
6. Gdy Preview działa, `vercel deploy --prod` — wdrożenie produkcyjne.

Uwaga: połączenie projektu z GitHubem nadal może powodować kolejne automatyczne wdrożenia starego kodu po następnym pushu. Aby zachować zgodność, po lokalnym sprawdzeniu zmian samodzielnie zsynchronizuj swoje repozytorium.

**Alternatywa:** ręcznie przenieś zweryfikowane pliki z tego folderu do istniejącego lokalnego repozytorium `Kamien29/FieldOps`, sprawdź `git diff`, a następnie **samodzielnie** wypchnij je do GitHuba, jeśli chcesz automatycznych deploymentów. Nigdy nie publikuj `.env`.

## 6. Kontrola strony po wdrożeniu

```bash
node scripts/smoke-test.mjs https://fieldops-6mm7.vercel.app
```

Test jest **tylko odczytowy**. Sprawdza `/api/health` (200 + PostgreSQL), `/api/me` (401 bez logowania), `/login` i `/profile` (czy działają ścieżki SPA). Potem ręcznie przetestuj logowanie, profil, urządzenia, zlecenia i raporty na koncie testowym.

Gdy `/api/health` zwraca 500, sprawdź `DATABASE_URL`, połączenie Neon i Vercel Logs. Jeśli rejestracja zwraca 500, sprawdź też `TOKEN_SECRET`.

## 7. Zakres testowania tej paczki

- Backend `npm test`: 10/10 — przeszło.
- Składnia JS, JSON Vercel, struktura tras i skrypt smoke test — sprawdzone lokalnie.
- Frontend `npm ci`/`npm run build`: nie udało się wykonać w środowisku przygotowawczym — brak części paczek w offline cache oraz Node 22.16 jest za stary dla części zależności.
- **Nie wykonano rzeczywistego wdrożenia Vercel**, migracji na Twoim Neon ani testu Expo na telefonie.

## Uwaga o danych

Nie usuwaj ani nie twórz ponownie bazy Neon. Wdrożenie nowego kodu nie powinno usuwać kont ani zleceń, o ile zachowasz dotychczasowy `DATABASE_URL` i wykonasz tylko wymagane migracje.
