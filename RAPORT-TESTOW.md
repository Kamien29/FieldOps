# FieldOps — wyniki kontroli, 26.10.2026

| Kontrola | Wynik |
|---|---|
| Backend: `npm test` | **13/13 PASS** |
| Mobile: `npm run test:offline` | **5/5 PASS** |
| JavaScript backendu: `node --check` | PASS |
| JavaScript w `fieldops-web/index.html`: parser Node | PASS |
| 23 pliki mobilne TS/TSX: kontrola składni TypeScript | PASS |
| Skrypt `INSTALUJ-TYDZIEN-4.sh` na niezmienionym archiwum bazowym | PASS |
| Skrypt instalacyjny na pliku lokalnie zmienionym | PASS — przerwał bez nadpisywania |
| Expo SDK 58 — `npm run typecheck`, Metro, uruchomienie na telefonie | **NIEPRZETESTOWANE** — brak paczek npm i fizycznego urządzenia |
| Pełne PostgreSQL (Neon) + Vercel Services | **NIEPRZETESTOWANE** — brak podłączonych środowisk testowych |
| Osiem zdjęć / sieć przerywana, tryb samolotowy, logowanie po 30 dniach | **WYMAGA RĘCZNEGO TESTU** |

**Zakres testów jednostkowych:** walidacja podpisu i zdjęć, zapis raportu, transakcja i cofanie przy błędzie, uwierzytelnianie, izolowany test HTTP tworzenia zleceń z idempotencją, konflikt wersji, zabezpieczenie migracji, kolejność zmian w SQLite, tworzenie i edycja offline, oznaczanie synchronizacji oraz wzrost opóźnienia ponawiania.

**Uwaga:** kontrola składni TS/TSX nie zastępuje kompilacji TypeScript ani testu działania Expo Go.
