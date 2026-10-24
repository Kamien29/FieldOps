# FieldOps – scalona kompletna kopia (24.10.2026)

## Źródła i decyzja o scaleniu

- **Baza:** przesłany `FieldOps-main.7z` (pełny projekt, 106 plików).
- **Zmiany:** `svsdfsdfsdf(1).rar`, z którego przeniesiono *zgodne funkcjonalnie usprawnienia kamery i skanowania*, zamiast podmieniać całą aplikację mobilną.
- Archiwum RAR zawiera również znacznie szerszą i inną wersję mobilnego interfejsu/API. Bezpośrednie nadpisanie nim trzech plików spowodowałoby niezgodność z nawigacją, typami oraz funkcjami z `FieldOps-main`. Dlatego te zmiany zostały dostosowane do wersji bazowej.
- **Nie nadpisano** backendu, strony WWW, profilu, PostgreSQL, migracji, istniejących zleceń ani danych użytkownika.

## Wprowadzone funkcje (mobile)

1. W `mobile/src/screens/JobDetailScreen.tsx`: po odmowie uprawnienia kamery przy robieniu zdjęcia pojawia się zrozumiały komunikat z przyciskiem **Otwórz ustawienia**.
2. W `mobile/src/screens/ScanScreen.tsx`: wyjaśnienie uprawnień, możliwość przejścia do ustawień, awaryjne ręczne wpisanie numeru urządzenia, czytnik QR/Code128/EAN.
3. Po zeskanowaniu lub wpisaniu numeru aplikacja pokazuje **Sprawdzam urządzenie w rejestrze…**; sprawdza `GET /api/devices/identify?serial=...` z istniejącego backendu. Komunikat rozróżnia brak urządzenia oraz błąd połączenia.
4. Kiedy urządzenie istnieje, kod zapisuje się jako `deviceCode` w lokalnym raporcie. W trybie offline lub gdy urządzenia nie ma w rejestrze, użytkownik może jawnie wybrać **Zapisz kod bez potwierdzenia**. Nie jest to potwierdzenie powiązania urządzenia ze zleceniem.
5. Teksty i komunikaty w `mobile/src/strings.ts`.

## Instalacja lokalna

1. Rozpakuj projekt, np. `C:\Users\wojma\Documents\FieldOps-SCALONY`.
2. **Nie kopiuj w ciemno `.env` ani bazy.** Zachowaj dotychczasowy prywatny plik `backend/.env` w bezpiecznym miejscu; skonfiguruj ponownie u siebie, nie publikuj sekretów.
3. Dla aplikacji mobilnej (Git Bash):

```bash
cd ~/Documents/FieldOps-SCALONY/mobile
npm install
npm run typecheck
npx expo start
```

4. Przetestuj aparat i skan na fizycznym telefonie (Expo Go / build zgodny z Expo SDK), w szczególności odmowę uprawnienia, wpisanie kodu ręcznie, poprawny kod oraz brak połączenia.
5. Backend i web uruchamiaj zgodnie z głównym `README.md`; archiwum bazowe posiada własne wymagania dla lokalnej bazy testowej.
6. Jeśli chcesz opublikować zmiany, świadomie porównaj z obecnym repozytorium i wdrażaj **dopiero po sprawdzeniu**. Wersja mobilna **nie jest wdrażana przez stronę Vercel**.

## Wyniki sprawdzenia w środowisku przygotowawczym

- 10 z 10 izolowanych testów backendu: OK (sesje/hasła i raporty).
- `node --check` dla serwera i migracji: OK.
- Kontrola struktury plików i ścieżek między nawigacją a skanerem: OK.
- Pełne `npm run typecheck` aplikacji mobilnej: **nieuruchomione** — archiwum bazowe nie zawiera `mobile/package-lock.json`, a zależności Expo/React Native nie były zainstalowane w tym środowisku. Uruchom `npm install` przed testem typów.
- Brak testów na urządzeniu fizycznym, prawdziwym Neon i Vercel. Nie należy uważać ich za przeprowadzone.

## Wrażliwe pliki

Nie dołączono `.env`, `node_modules`, `dist`, prywatnych plików SQLite ani poświadczeń. Brak zmian na GitHubie i Vercel.
