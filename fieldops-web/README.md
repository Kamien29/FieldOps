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
| logowanie | `POST /api/login` → `{ token, user }` |
| lista zleceń | `GET /api/jobs` → `{ serverTime, jobs }` (wszystkie zlecenia użytkownika, bez paginacji) |
| szczegóły zlecenia | brak `GET /api/jobs/:id` – wybierane z listy |
| wylogowanie | tylko lokalnie (backend ma bezstanowy token ważny 30 dni) |

Całą komunikację zawiera `src/services/api.js` (jedyny `fetch`), `auth.js` i `jobs.js`.

### Mapowanie modelu (granica aplikacji: `services/jobs.js → mapJob`)

| Frontend | Backend |
|---|---|
| `id`, `title`, `address`, `status`, `updatedAt` | bez zmian |
| `clientName` | `customer` |
| `dueDate` | `scheduledAt` |
| `description`, `createdAt` | backend ich nie zwraca (puste / `null`) |

Statusy zgodne z backendem: `new`, `in_progress`, `done` (początkowy: `new`, nie `TODO`).

## Sesja i bezpieczeństwo

Token Bearer jest trzymany tylko w pamięci (nie w `localStorage`), więc **odświeżenie strony wymaga ponownego logowania** – backend nie ma `/me` ani ciasteczek HttpOnly. Wygaśnięcie sesji (401) wylogowuje użytkownika. Autoryzacja i izolacja zleceń są egzekwowane przez backend.

## Znane braki (backend nie udostępnia endpointów)

Ekrany **Rejestracja** i **Nowe zlecenie** są w interfejsie, ale mają wyłączony przycisk i komunikat wyjaśniający – backend nie ma `register` ani `POST /api/jobs`. Flagi: `src/services/capabilities.js`.
