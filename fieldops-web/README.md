# FieldOps – aplikacja webowa

Aktywnym entrypointem jest samodzielna aplikacja HTML/JavaScript w `index.html`, serwowana przez Vite i korzystająca z backendu `../backend`. Katalog `src/` zawiera oddzielne źródła React, które nie są obecnie ładowane przez entrypoint.

## Uruchomienie

```sh
# Uruchom lokalny backend zgodnie z instrukcją w głównym README.
# W drugim terminalu:
cd fieldops-web
npm ci
npm run dev        # http://localhost:5173, żądania /api idą przez proxy na http://localhost:3000
```

Inny adres backendu: `VITE_API_PROXY=http://host:port npm run dev`.

`npm run build` buduje aktywny plik `index.html`; `npm test` i `npm run lint` dotyczą oddzielnego źródła React w `src/`,
które nie jest obecnie entrypointem.

## Uwagi do nieaktywnego źródła React

| Operacja | Wywołanie |
|---|---|
| rejestracja | `POST /api/register` → 201, backend zakłada sesję |
| logowanie | `POST /api/login` |
| bieżący użytkownik (po odświeżeniu) | `GET /api/me` |
| wylogowanie | `POST /api/logout` (kasuje ciasteczko) |
| lista zleceń | `GET /api/jobs?page=&limit=` → `{ jobs, pagination }`, sortowanie po terminie |
| szczegóły | `GET /api/jobs/:id` |
| nowe zlecenie | `POST /api/jobs` (status początkowy `new` ustawia backend) |

Pełny opis API: `../docs/API.md`. Scenariusze testów aktywnego interfejsu: `../docs/TESTING.md`.

### Mapowanie modelu (granica aplikacji: `services/jobs.js`)

| Frontend | Backend |
|---|---|
| `id`, `title`, `description`, `address`, `status`, `createdAt`, `updatedAt` | bez zmian |
| `clientName` | `customer` |
| `dueDate` (pole `datetime-local`, wysyłane jako ISO) | `scheduledAt` |

Statusy zgodne z backendem: `new` („Do wykonania”), `in_progress`, `done`.

## Raport serwisowy

Zlecenie w trakcie realizacji można zakończyć wyłącznie przez zapisanie raportu. Raport wymaga opisu wykonanych czynności,
pełnego imienia i nazwiska osoby odbierającej oraz odręcznego podpisu. Zdjęcia JPEG, PNG i WebP są opcjonalne (maksymalnie
10 plików po 10 MiB, łącznie do 40 MiB). Lokalizacja jest pobierana tylko po kliknięciu i zgodzie użytkownika. Raport i
zmiana statusu na `done` są zapisywane atomowo; nie ma osobnej akcji zakończenia bez raportu. Zapisany raport można
wyświetlić na liście zleceń, a zdjęcia są pobierane z prywatnego endpointu wymagającego sesji.

## Sesja i bezpieczeństwo

Sesja to ciasteczko `fieldops_session` (**HttpOnly**, `SameSite=Strict`) ustawiane przez backend – aplikacja nie zapisuje tokenu ani hasła w przeglądarce (`localStorage`/`sessionStorage`). Po odświeżeniu strony sesję odtwarza `GET /api/me`; wygaśnięcie sesji (401) przenosi na ekran logowania. Zmiany stanu wysyłane są z nagłówkiem `X-Requested-With` (ochrona CSRF). Autoryzacja i izolacja zleceń są egzekwowane przez backend, a nie przez ukrywanie przycisków.

Wymaganie: web i API muszą mieć wspólny origin (w developmencie zapewnia to proxy Vite, na produkcji reverse proxy). Za HTTPS ustaw na backendzie `COOKIE_SECURE=1`.

## Znane ograniczenia

- Filtr statusu na liście działa na bieżącej stronie (filtrowanie po stronie serwera to zakres tygodnia 2).
- Aplikacja mobilna nie jest częścią tej integracji: używa Bearer tokenów i `GET /api/jobs` bez paginacji (zgodność zachowana).
