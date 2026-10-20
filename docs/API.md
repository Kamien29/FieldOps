# Kontrakt API — FieldOps, zakres tygodnia 1–2

Wszystkie odpowiedzi JSON. Chronione endpointy wymagają `Authorization: Bearer <token>`.
Błędy mają format `{ "error": { "message": "..." } }`.

## Uwierzytelnianie
- `POST /api/register` — body: `{ "name", "email", "password" }`; zwraca `201` i `{data:{user,token}}`.
- `POST /api/login` — body: `{ "email", "password" }`; zwraca `200` i `{data:{user,token}}`.
- `POST /api/logout` — unieważnia token w pamięci procesu.
- `GET /api/me` — dane zalogowanego użytkownika.
- `GET /health` — status usługi.

## Zlecenia
- `GET /api/jobs?page=1&limit=10&status=to_do&from=2026-10-01&to=2026-10-31&device_id=1`
  - zwraca `{data: Job[], meta:{page,limit,total,totalPages}}`;
  - domyślne sortowanie po terminie rosnąco.
- `POST /api/jobs` — wymagane: `title`, `client_name`, `address`, `due_date`; opcjonalne: `description`, `device_id`. Nowe zlecenie ma status `to_do`.
- `GET /api/jobs/:id` — szczegóły własnego zlecenia.
- `PATCH /api/jobs/:id` — częściowa aktualizacja pól albo `status`.
- `DELETE /api/jobs/:id` — usunięcie własnego zlecenia.

Statusy:
- `to_do` → `in_progress` lub `cancelled`
- `in_progress` → `done` lub `cancelled`
- `done` → `cancelled`
- `cancelled` → brak dalszych przejść

## Urządzenia
- `GET /api/devices?q=klima` — wyszukiwanie po nazwie, numerze lub modelu.
- `POST /api/devices` — wymagane `serial`, `name`; opcjonalne `model`, `location`.
- `PATCH /api/devices/:id` — edycja własnego urządzenia.
- `DELETE /api/devices/:id` — usunięcie; zlecenia pozostają, ale bez powiązanego urządzenia.
- `GET /api/devices/identify?serial=FO-AC-001` — identyfikacja urządzenia po numerze.

## Bezpieczeństwo i ograniczenia
Każde zapytanie do danych biznesowych jest ograniczone do `user_id` z sesji. Hasła są haszowane przez scrypt z unikalną solą. Tokeny są przechowywane w pamięci procesu (po restarcie wymagane ponowne logowanie). To demonstrator, nie pełna konfiguracja produkcyjna.
