# FieldOps – aplikacja webowa

React 19 + Vite 8 + React Router 7. Korzysta z backendu z katalogu `../backend` (kontrakt: `../docs/API.md`).

## Uruchomienie

```sh
# 1. backend (Node >= 22.13, port 3000, seed: jan@fieldops.local / anna@fieldops.local, hasło fieldops123)
cd backend && npm start

# 2. web (w drugim terminalu)
cd fieldops-web
npm ci
npm run dev        # http://localhost:5173, żądania /api idą przez proxy na http://localhost:3000
```

Inny adres backendu: `VITE_API_PROXY=http://host:port npm run dev`.

Kontrole jakości: `npm test`, `npm run lint`, `npm run build`.

## Kontrakt API używany przez web

| Operacja | Wywołanie |
|---|---|
| rejestracja | `POST /api/register` → 201, backend zakłada sesję |
| logowanie | `POST /api/login` |
| bieżący użytkownik (po odświeżeniu) | `GET /api/me` |
| wylogowanie | `POST /api/logout` (kasuje ciasteczko) |
| lista zleceń | `GET /api/jobs?page=&limit=` → `{ jobs, pagination }`, sortowanie po terminie |
| szczegóły | `GET /api/jobs/:id` |
| nowe zlecenie | `POST /api/jobs` (status początkowy `new` ustawia backend) |

Pełny opis: `../docs/API.md`. Całą komunikację zawiera `src/services/api.js` (jedyny `fetch`), `auth.js` i `jobs.js`.

### Mapowanie modelu (granica aplikacji: `services/jobs.js`)

| Frontend | Backend |
|---|---|
| `id`, `title`, `description`, `address`, `status`, `createdAt`, `updatedAt` | bez zmian |
| `clientName` | `customer` |
| `dueDate` (pole `datetime-local`, wysyłane jako ISO) | `scheduledAt` |

Statusy zgodne z backendem: `new` („Do wykonania”), `in_progress`, `done`.

## Sesja i bezpieczeństwo

Sesja to ciasteczko `fieldops_session` (**HttpOnly**, `SameSite=Strict`) ustawiane przez backend – aplikacja nie zapisuje tokenu ani hasła w przeglądarce (`localStorage`/`sessionStorage`). Po odświeżeniu strony sesję odtwarza `GET /api/me`; wygaśnięcie sesji (401) przenosi na ekran logowania. Zmiany stanu wysyłane są z nagłówkiem `X-Requested-With` (ochrona CSRF). Autoryzacja i izolacja zleceń są egzekwowane przez backend, a nie przez ukrywanie przycisków.

Wymaganie: web i API muszą mieć wspólny origin (w developmencie zapewnia to proxy Vite, na produkcji reverse proxy). Za HTTPS ustaw na backendzie `COOKIE_SECURE=1`.

## Znane ograniczenia

- Filtr statusu na liście działa na bieżącej stronie (filtrowanie po stronie serwera to zakres tygodnia 2).
- Aplikacja mobilna nie jest częścią tej integracji: używa Bearer tokenów i `GET /api/jobs` bez paginacji (zgodność zachowana).
