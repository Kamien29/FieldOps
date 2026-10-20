# FieldOps — zakres tygodnia 1–2 (wersja demonstracyjna)

Samodzielny, uruchamialny prototyp zakresu pierwszych dwóch tygodni:
- rejestracja i logowanie serwisanta;
- sesja Bearer token;
- izolacja zleceń i urządzeń per użytkownik;
- tworzenie, odczyt, edycja i usuwanie zleceń;
- statusy: `to_do` → `in_progress` → `done`, anulowanie z dowolnego statusu;
- filtrowanie po statusie, dacie i urządzeniu;
- paginacja listy zleceń;
- rejestr urządzeń, wyszukiwanie po nazwie/numerze, powiązanie urządzenia ze zleceniem;
- identyfikacja przez wpisanie numeru seryjnego; kod QR jest reprezentowany przez ten sam identyfikator (skanowanie kamerą wymaga osobnej integracji).

## Wymagania
Node.js >= 22.13 (używa wbudowanego `node:sqlite`), bez dodatkowych paczek.

## Uruchomienie
```bash
npm start
```
Otwórz http://localhost:3000

Dane demonstracyjne:
- użytkownik: `demo@fieldops.local`
- hasło: `Demo123!`

Możesz też założyć nowe konto przez ekran rejestracji.

## API
Szczegóły w `docs/API.md`. Test zdrowia: `GET /health`.

## Ważne ograniczenia
To samodzielny prototyp do demonstracji, nie automatyczna poprawka repozytorium GitHub. Nie zawiera jeszcze raportów, uploadu zdjęć/podpisów, natywnej aplikacji mobilnej ani synchronizacji offline. Przed produkcją należy dodać testy bezpieczeństwa, ograniczenia prób logowania, rotację/wygaśnięcie sesji i pełny proces wdrożenia. SQLite zapisuje dane w `data/fieldops.sqlite`; na hostingu potrzebny jest trwały dysk.
