# Raport testów — FieldOps: moduł współpracy

Data: 26 października 2026. Środowisko izolowane, bez produkcyjnej bazy Neon i bez Vercel.

## Zaliczone

- `cd backend && npm test`: **20 / 20 testów zaliczonych**. Zakres: tokeny, migracja-policy, raporty, HTTP tygodnia 4, zaproszenia, autoryzacja członkostwa, prywatny i firmowy czat, przekazanie zadania z akceptacją, ochrona przed podwójną akceptacją, wygaśnięcie propozycji po zmianie wersji, opuszczenie firmy i awatar.
- `cd mobile && node --experimental-strip-types --test test/*.test.mjs`: **5 / 5 testów** (kolejka offline, retry/backoff, konflikt).
- `node --check`: backend `server.js`, `team-api.js`, skrypt przeglądarkowy `team.js` i skrypt inline panelu WWW — brak błędów składni.
- Kompilacja składniowa nowych plików TS/TSX przy użyciu globalnego TypeScript 5.8.3 — brak błędów parsera.
- Sprawdzenie spójności statycznych identyfikatorów sekcji HTML, formularzy i skryptów.
- Weryfikacja, że migracja nie zawiera poleceń `DROP TABLE` ani `DELETE`, i że jest wymagana świadoma zgoda przed jej zastosowaniem do zdalnej bazy.

## Ograniczenia

- Pełne `npm ci` i `npm run build` frontendowego Vite: **nieukończone** z powodu brakującego `xmlchars-2.2.0.tgz` w lokalnym cache npm (w tym środowisku brak dostępu do kompletnego registry). Połączenie z registry należy przetestować na własnym komputerze.
- Pełny TypeScript `mobile/npm run typecheck` oraz uruchomienie kamery, czatu i nawigacji na telefonie: **niezweryfikowane na urządzeniu**. Przeprowadzono kontrolę składni i istniejące testy offline.
- Integracja z prawdziwą bazą PostgreSQL/Neon, transakcje pod współbieżnym obciążeniem i produkcyjny Vercel: **nieprzetestowane**. Testy backendu używają adaptera bazodanowego w pamięci; to nie zastępuje testu migracji w Neon.
- Czat odświeża dane okresowo (15 s), a nie przez WebSocket.

## Minimalny test ręczny na dwóch kontach

1. Utwórz firmę i zaproś drugiego użytkownika.
2. Otwórz drugie konto: przyjmij zaproszenie. Sprawdź, czy trzecie, niepowiązane konto nie widzi firmy.
3. Wyślij wiadomość na czat firmowy i prywatną do członka firmy; upewnij się, że odbiorca widzi tylko właściwy kanał.
4. Dodaj zlecenie firmowe, zaproponuj je drugiej osobie i zaakceptuj na drugim koncie. Dopiero po akceptacji powinno pojawić się u odbiorcy.
5. Wyślij propozycję przekazania innego zlecenia, zmień je, a potem spróbuj zaakceptować starą propozycję: musi zostać odrzucona.
6. Dodaj zdjęcie profilowe, wyloguj się, zaloguj ponownie — awatar powinien pozostać.
7. Sprawdź dotychczasową synchronizację offline, raporty, zdjęcia i podpisy.
