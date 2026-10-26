# FieldOps Week 3 — dla programisty przejmującego projekt

## Przepływ pojedynczego raportu

### WWW
`fieldops-web/index.html` → `POST /api/jobs/{id}/photos` (każdy plik osobno, Base64 JPEG/PNG/WebP, <=2.5MiB binarnie) → `PUT /api/jobs/{id}/report` (opis, nazwisko, podpis SVG, opcjonalna lokalizacja i lista photoIds). Backend wykonuje transakcję, sprawdza właściciela i `baseVersion`, tworzy **jeden** raport i przełącza status na `done`. Serwer zwraca status i raport.

### Mobile
`src/screens/JobDetailScreen.tsx` → `src/photo-processing.ts` (kompresja JPEG) → `src/files.ts` (persistent documentDirectory) → `src/db.ts` (SQLite: `photos`, `reports`, `outbox`). Zapis raportu OFFLINE odbywa się lokalnie, a `src/sync.ts` wysyła mutacje w kolejności status → zdjęcia → raport, z odpowiednimi identyfikatorami. Wysłane zdjęcia potwierdzane są atomowo w SQLite; retry to ten sam photo ID, zapisy raportu chroni Idempotency-Key. Wygasły token przełącza na login **bez kasowania kolejki**.

### Zapis i autoryzacja
- Użytkownik jest właścicielem zlecenia (`assigned_to` w PostgreSQL).
- `GET /api/photos/{photoId}` i `GET /api/jobs/{jobId}/signature` zwracają prywatne materiały po zalogowaniu. WWW używa cookie HttpOnly; aplikacja mobilna musi dołączyć Bearer.
- Pola bazy `reports.recipient_full_name`, `reports.location_accuracy`, `reports.created_at`, `reports.completed_at` są tworzone przez `002_report_completion.sql` także w starszych bazach.
- Limity: do 10 zdjęć, maks. 2,5MiB na przyjmowany plik, do 40MiB łącznie według backendu. W praktyce 10×2,5MiB; limit Vercel to 4,5 MB **na pojedyncze żądanie**, dlatego zdjęcia wysyłamy pojedynczo.

## Podstawowe pliki do czytania

- `backend/src/server.js` — routing HTTP, autoryzacja, zlecenia, urządzenia, zdjęcia, raporty.
- `backend/src/report-service.js` — transakcyjny zapis raportu.
- `backend/src/report-validation.js` — walidacja opisu, podpisu i plików.
- `backend/src/migration-policy.js` — zapobiega przypadkowym migracjom Neon.
- `backend/src/migrate.js`, `backend/db/migrations/*.sql` — schema PostgreSQL.
- `mobile/src/db.ts` — SQLite i outbox.
- `mobile/src/sync.ts` — przesyłanie i pobieranie z retry / deduplikacją.
- `mobile/src/photo-processing.ts`, `mobile/src/files.ts` — ograniczanie wielkości i trwałość fotografii.
- `mobile/src/screens/JobDetailScreen.tsx` — UI raportu: aparat, galeria, podpis, opis, lokalizacja.
- `fieldops-web/index.html` — aktywne UI WWW (w tym raportowy dialog).
- `vercel.json` — produkcyjne mapowanie usług.

## Kontrakty i błędy

- Raporty wymagają `baseVersion` i `Idempotency-Key`. Brak: `400`.
- Zlecenie już zmienione w innym kliencie: `409 conflict` z aktualną wersją.
- Raport istnieje / zlecenie poza realizacją: `409 report_already_exists` / `job_not_in_progress`.
- Brak zdjęcia w DB dla `photoId`: `422 unknown_photo`.
- Zbyt duży plik: `413 payload_too_large` (lub na poziomie Vercel `FUNCTION_PAYLOAD_TOO_LARGE`).
- Prawdziwe awarie PostgreSQL lub schematu: `500 internal_error` — szczegóły tylko w Vercel Logs; nie wyświetlać SQL/secrets użytkownikowi.

## Bezpieczeństwo

- `DATABASE_URL` i `TOKEN_SECRET` tylko po stronie backendu / lokalnym `.env` poza repo.
- `EXPO_PUBLIC_API_URL` jest PUBLICZNYM adresem strony, nie sekretem.
- Wylogowanie na żądanie czyści local SQLite; przy wygaśnięciu sesji dane offline są chronione. Próba logowania na inne konto z niewysłaną kolejką jest blokowana.
- Podpis SVG jest zatwierdzany restrykcyjnym wzorcem przed zapisem; GET podpisu ma `nosniff` i CSP `sandbox`.
- Nie wkładać dużych plików w jedną odpowiedź Vercel; duży raport ma oddzielne stabilne endpointy mediów.
