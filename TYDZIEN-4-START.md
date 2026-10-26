# FieldOps — Tydzień 4: synchronizacja offline i konflikty

**Data przygotowania:** 26 października 2026 r.  
**Źródło zakresu:** przesłana przez użytkownika specyfikacja FieldOps (`Wklejony tekst(1).txt`, sekcja "Tydzień 4").  
**Baza plików:** użytkownikowe archiwum `FieldOps-main.7z`, poprzednio scalone z poprawkami w paczce `FieldOps-SCALONY-MOBILE-QR.zip` (stan paczki 23.10.2026). Repozytorium GitHub jest nowsze — nie nadpisuj go bez porównania zmian.

## Co wykonano

| Zadanie z tygodnia 4 | Realizacja |
|---|---|
| Trwała kolejka `create`, `edit`, `status`, `photo`, `report` | SQLite `mobile/src/db.ts`; kolejność po `seq`, atomowe zapisy lokalne |
| Nowe zlecenie offline i edycja offline | Ekran `mobile/src/screens/JobEditorScreen.tsx` |
| Synchronizacja ręczna/automatyczna | `SyncContext.tsx`, przycisk **Synchronizuj**, start, wznowienie sieci, powrót do aplikacji, timer |
| Brak równoległych uploadów | `sync.ts` — mechanizm `running` single-flight |
| Ponawianie błędów chwilowych | `retry-policy.ts`; 5, 10, 20, 40… sek., do 5 min; stan zapisany w SQLite `meta` |
| Błąd trwały nie blokuje pozostałych zleceń | `sync.ts`, oznaczenie `error` przy konkretnym zleceniu |
| Nie powielaj zleceń utworzonych offline | `POST /api/jobs` akceptuje stabilne ID klienta i wymaga `Idempotency-Key` dla takich żądań |
| Status/raporty bez duplikatów | Zachowane istniejące `Idempotency-Key`, walidacja wersji `baseVersion` |
| Zdjęcia w przerwanym uploadzie | Osobne żądanie na zdjęcie; powtarzanie z tym samym ID; potwierdzenia w SQLite; kompresja do 2,5 MiB |
| Synchronizacja przyrostowa | Zachowane `GET /api/jobs?since=...`, lokalny znacznik ostatniego pobrania |
| Konflikty w telefonie | Widok obu wersji, wyróżnienie różnic, **Zachowaj moje** / **Użyj serwera** z potwierdzeniem |
| Konflikty w przeglądarce | Okno porównania z zachowaniem wpisanego formularza (`fieldops-web/index.html`) |
| Aktualne dane w panelu | Automatyczne odświeżenie listy co 30 s, czas ostatniej aktualizacji i ostrzeżenie przy edycji zlecenia w realizacji |
| Wygaśnięcie sesji | Dane offline nie są kasowane przy błędzie 401, ponowne logowanie musi być na to samo konto |

## Granice i ograniczenia

- **Nie przeprowadzono pełnego testu w trybie samolotowym na prawdziwym urządzeniu** ani symulacji utraty sieci podczas fizycznego transferu ośmiu zdjęć. Scenariusz testowy jest w `docs/TEST-TYDZIEN-4.md`.
- **Brak testu na produkcyjnej bazie Neon/Vercel.** Test HTTP używa izolowanej symulacji PostgreSQL; lokalne testy kolejki korzystają z SQLite Node.
- Nie wykonano pełnego `npm install`, `npm run typecheck` ani bundlowania Expo SDK 58 w tym środowisku (brak dostępu do repozytorium npm). Te kroki wykonaj na Windows zgodnie z instrukcją.
- Działający projekt Vercel może mieć nowszy kod od bazowego archiwum. Zawsze scalaj zmiany i testuj przed nadpisaniem produkcji.
- Nie wykonano zadań pobocznych: offline w przeglądarce, synchronizacji w tle przy zamkniętej aplikacji, eksportu raportu PDF ani szczegółowych statystyk pracy.
- Usunięcie zlecenia na serwerze nie jest aktualnie przesyłane jako przyrostowy *tombstone*: usunięty rekord może pozostać w SQLite telefonu do pełnego resetu/pobrania. Podczas próby edycji otrzyma błąd 404. Wymaga osobnej migracji/endpointu.
- Dodatkowe zmiany po stronie przeglądarki podczas otwartego formularza są sygnalizowane przez `409`, gdy formularz zostaje zapisany. Sam polling nie zastępuje blokady współbieżności.

## Mapa kodu dla programisty

- `backend/src/server.js`: autoryzacja, tworzenie zleceń ze stabilnym ID, idempotencja, `409 conflict`, lista przyrostowa.
- `backend/src/db.js`: pula PostgreSQL, `one`, `all`, `transaction`.
- `backend/src/report-service.js`: raport transakcyjny i zakończenie pracy.
- `backend/src/migrate.js` oraz `migration-policy.js`: migracje z ochroną zewnętrznej bazy.
- `mobile/src/db.ts`: trwały lokalny model, outbox, zapis offline i rozwiązywanie konfliktów.
- `mobile/src/sync.ts`: wysyłanie kolejki, odbiór zmienionych zleceń, obsługa błędów.
- `mobile/src/retry-policy.ts`: deterministyczna polityka ponawiania.
- `mobile/src/SyncContext.tsx`: wyzwalacze synchronizacji i stan interfejsu.
- `mobile/src/screens/JobEditorScreen.tsx`: tworzenie i edycja bez sieci.
- `fieldops-web/index.html`: aktualny interfejs WWW publikowany przez usługę Vite (nie mylić z osobnymi starszymi komponentami React).

**Zasada krytyczna:** identyfikatora i klucza idempotencji danej operacji nie zmieniaj po pierwszej próbie wysłania. Nie modyfikuj też treści oczekującego `create` — kolejna edycja musi być odrębną operacją w outboxie, ponieważ poprzednie żądanie mogło już zostać zapisane na serwerze.

## Instalacja do starszej lokalnej wersji

Jeśli Twój folder jest identyczny z pierwotną paczką `FieldOps-SCALONY-MOBILE-QR.zip`, możesz uruchomić:

```bash
bash INSTALUJ-TYDZIEN-4.sh ~/Documents/fieldops
```

Skrypt **najpierw porównuje sumy SHA-256** wszystkich plików, które zamierza zmienić. Gdy znajdzie nowszy albo inny plik, kończy pracę **bez nadpisywania czegokolwiek**. Przy zgodności wykonuje kopię zapasową poza katalogiem projektu i instaluje zmiany tylko lokalnie. **Jeśli masz nowszy kod z GitHuba, skrypt prawdopodobnie przerwie instalację; to celowe zabezpieczenie.** W takim przypadku porównaj źródła w edytorze i przenieś zmiany ręcznie.
