# FieldOps — TYDZIEŃ 3: kompletna paczka (WWW + API + Android Expo)

Data opracowania: 25 października 2026. Wersja scalona lokalnie na podstawie archiwum `FieldOps-SCALONY-MOBILE-QR.zip` z rozmowy. Żadnych zmian na GitHubie, w Vercel ani w bazie Neon nie wykonano za użytkownika.

## Co jest uruchamiane w produkcji

- **WWW:** `fieldops-web/index.html`, Vite, pod `/` — ten plik zawiera aktywny panel, raporty i profil. Pozostałe komponenty React w `fieldops-web/src` są historyczną, nieaktywną wersją interfejsu.
- **API:** `backend/src/server.js`, PostgreSQL `backend/src/db.js`, Vercel `backend/api/handler.js`, ścieżki `/api/*`.
- **Mobile:** `mobile/App.tsx`, Expo SDK 58, lokalna SQLite i prywatny katalog zdjęć, synchronizacja w `mobile/src/sync.ts`.
- **Baza:** istniejąca Neon PostgreSQL z danymi użytkowników; **nie usuwać jej i nie tworzyć nowej, jeśli aktualna działa**.
- **Nieaktywne:** `backend/server.js` (stary serwer SQLite), `frontend/index.html` (stary prototyp), `backend/src/seed.js` (demo). Nie uruchamiać ich na Vercel.

## Co zostało dodane lub poprawione

1. Raport: opis, nazwisko odbiorcy, podpis SVG, opcjonalna lokalizacja i do 10 zdjęć; zapis raportu oznacza zlecenie jako wykonane — transakcyjnie.
2. WWW: podpis na canvas, galeria zdjęć, podgląd zapisanych raportów; zdjęcia powyżej 2,5 MiB automatycznie kompresowane **przed** wysyłką.
3. Backend: odrzucanie nieprawidłowych zdjęć, limity dopasowane do **4,5 MB na żądanie funkcji Vercel**, stabilne chronione endpointy do zdjęć i podpisu.
4. Mobile: SDK 58, `expo-file-system/legacy` (kompatybilność), `babel-preset-expo`, zdjęcia z aparatu oraz galerii, podgląd i trwałe zapisywanie zdjęć do pamięci aplikacji.
5. Mobile: offline SQLite + kolejka zdjęcie → raport, ponawianie i ochrona przed podwójną wysyłką, informacja o statusie synchronizacji, pobieranie zdjęć raportów WWW do offline.
6. Mobile: automatyczne zmniejszanie również starych, niewysłanych zdjęć przed wysyłką na Vercel.
7. Mobile: wygasły token **nie kasuje** niesynchronizowanych raportów; ponowne logowanie, kontrola granicy konta użytkownika.
8. Migracja Neon: powtarzalna `backend/db/migrations/002_report_completion.sql` dodaje kolumny brakujące w bazach utworzonych przed raportami. **Brak automatycznej migracji na produkcji.**
9. Rejestracja: niesprawny `TOKEN_SECRET` jest wykrywany przed zapisem konta.

### Ograniczenia

- Zredukowane zdjęcia mogą mieć mniejszą rozdzielczość niż oryginały. Osobny magazyn obiektowy (np. Blob/S3) jest potrzebny do obsługi pełnowymiarowych plików >2,5 MiB bez kompresji oraz rozbudowanej galerii.
- Report service i testy backendu są sprawdzone bez połączenia z rzeczywistą bazą. **Nie przetestowano tej paczki na fizycznym Androidzie ani z prawdziwym Neon/Vercel**.
- Funkcje poboczne tygodnia 3 (edycja zakończonego raportu, rysowanie strzałek na zdjęciach, automatyczny szkic w przeglądarce, osobne miniatury serwerowe) nie wchodzą do zakresu minimum i nie są tu obiecane.
- Praca offline obejmuje **wcześniej pobrane** zlecenia. Pierwsze logowanie wymaga internetu. Pełna synchronizacja edycji/tworzenia nowych zleceń offline jest zakresem tygodnia 4.

## 1. Najpierw testy na komputerze, BEZ Vercel

Otwórz Git Bash w rozpakowanym folderze. Przykład: `cd ~/Documents/FieldOps-TYDZIEN-3`.

```bash
cd backend
npm ci
npm test
cd ../fieldops-web
npm ci
npm run build
```

Dla aplikacji mobilnej:

```bash
cd ../mobile
npm install
npx expo install --fix
npx expo-doctor@latest
npx tsc --noEmit
```

Po tych poleceniach powinno być 0 błędów. Nie używaj `npm audit fix --force` ani `npm install --legacy-peer-deps` w celu ukrycia konfliktu.

## 2. NEON: migracja istniejącej bazy (jednorazowo)

**Zrób kopię przez utworzenie gałęzi zapasowej Neon przed zmianami**, zapisz jej nazwę i sprawdź możliwość przywrócenia. Upewnij się, że wybrano właściwą bazę/gałąź Production.

### Zalecana, najprostsza metoda: Neon SQL Editor

1. Otwórz `https://console.neon.tech`, wybierz projekt używany przez obecne FieldOps.
2. Otwórz **SQL Editor** i upewnij się, że edytujesz właściwą bazę, nie gałąź przypadkową.
3. Wklej całą zawartość pliku `NEON-MIGRACJA-RAPORTOW.sql` z tej paczki i uruchom.
4. Sprawdź kolumny:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='reports'
ORDER BY ordinal_position;
```

Wynik musi zawierać: `recipient_full_name`, `location_accuracy`, `created_at`, `completed_at`, `signature_svg`, `photo_ids`.

**Uwaga:** skrypt używa `ADD COLUMN IF NOT EXISTS`; nie usuwa raportów i może być uruchomiony ponownie. Tabela `reports` i inne podstawowe tabele muszą jednak istnieć — dla zupełnie pustej bazy użyj metody CLI poniżej.

### Alternatywa: pełny migrator z Git Bash

W folderze `backend` utwórz prywatny `.env` z `DATABASE_URL` oraz `TOKEN_SECRET`, na podstawie `.env.example`. Adres Neon zawiera tajne hasło — nie wysyłaj go nikomu.

```bash
cd backend
npm ci
FIELDOPS_MIGRATE_CONFIRM=YES_I_HAVE_A_BACKUP npm run migrate
```

Polecenie wypisze **nazwę hosta i bazy bez hasła** i wykona kolejno `001_initial.sql` i `002_report_completion.sql` w jednej transakcji. Bez `FIELDOPS_MIGRATE_CONFIRM=YES_I_HAVE_A_BACKUP` migrator odmówi połączenia z bazą zdalną. W Vercel nie ustawiaj tej zmiennej, bo aplikacja nie ma uruchamiać migracji przy każdym żądaniu.

## 3. Vercel: aktualizacja działającej strony

1. Otwórz projekt Vercel przypisany do `https://fieldops-6mm7.vercel.app`.
2. **Settings → Build and Deployment:** Root Directory = **`./`** (katalog zawierający `vercel.json`), Framework = **Services**. Pozostaw konfigurację `vercel.json` z tej paczki (API `/api/*` i panel `/`). Opcja Services musi być dostępna dla Twojego projektu.
3. **Settings → Environment Variables:** przypisz do środowiska **Production**, a jeśli panel oferuje wybór usługi — backendowi:

| Nazwa | Wartość |
|---|---|
| `DATABASE_URL` | Prawidłowe połączenie do istniejącej Neon (najlepiej pooled connection string) |
| `TOKEN_SECRET` | **Ten sam** losowy sekret min. 32 znaki co w obecnym wdrożeniu, żeby nie wylogować użytkowników |
| `COOKIE_SECURE` | `1` |
| `PG_POOL_MAX` | `3` (opcjonalne) |

**Nigdy nie wpisuj `DATABASE_URL` ani `TOKEN_SECRET` do `EXPO_PUBLIC_*`, frontendowego JS ani repozytorium.**

4. Udostępnij nowe pliki Vercel. Dwie drogi:
   - **Bez GitHuba**: `npm install -g vercel`, potem z głównego katalogu projektu `vercel login`, `vercel link` (wybierz **istniejący** FieldOps), `vercel` (podgląd/Preview). Po sprawdzeniu `vercel --prod`. Vercel CLI wysyła pliki z komputera, **bez git push**.
   - **Z GitHubem**: przenieś zawartość paczki do swojego lokalnego repozytorium **z zachowaniem `.env` wyłącznie lokalnie**, sprawdź `git diff`, zatwierdź i samodzielnie wypchnij na `main` (Vercel automatycznie wdroży, jeśli integracja działa). Asystent nie wykonuje pusha.
5. W Vercel w **Deployments** poczekaj na Ready. Jeśli Services nie jest aktywne lub build nie przejdzie, sprawdź logi builda zamiast zmieniać losowo Root Directory.

### Test po wdrożeniu

Otwórz `https://fieldops-6mm7.vercel.app/api/health` — wynik `{"ok":true}`.

Wykonaj na **osobnym testowym zleceniu**: login → rozpoczęcie pracy → zdjęcie (np. 5 MB; przeglądarka zmniejszy je automatycznie) → opis → podpis → zapisz raport → zobacz w gotowym raporcie to samo zdjęcie i podpis → odśwież stronę → sprawdź, że zlecenie jest `Wykonane`.

Jeżeli dostaniesz `500`, w Vercel → Logs znajdź `FieldOps API request failed`. Błąd `42703` oznacza zwykle brak kolumny PostgreSQL, `413` przekroczony limit żądania, `401` nieważny token, `409` wersję/status zlecenia.

## 4. Android / Expo Go SDK 58

**Wersja mobilna nie jest wdrażana na Vercel**. Vercel obsługuje jej API.

```bash
cd mobile
cp .env.example .env
notepad .env
```

Sprawdź zawartość:

```env
EXPO_PUBLIC_API_URL=https://fieldops-6mm7.vercel.app
```

Potem:

```bash
npm install
npx expo install --fix
npx expo-doctor@latest
npx tsc --noEmit
npx expo start --clear
```

Otwórz projekt w Expo Go SDK 58. Możesz zalogować się tym samym kontem co w WWW (pod warunkiem, że `/api/health` zwraca `{"ok":true}`). Wi-Fi komputer/telefon lub tryb tunnel mogą być potrzebne do połączenia z Metro, ale **API FieldOps** jest publicznym URL Vercel.

### Test offline / synchronizacji

1. Online: zaloguj się i pobierz listę zleceń; rozpocznij nowe testowe zlecenie, poczekaj aż stan będzie zsynchronizowany.
2. Wyłącz internet **na telefonie** (tryb samolotowy). Otwórz pobrane zlecenie.
3. Dodaj opis, nazwisko odbiorcy, podpis, 2 zdjęcia (aparat/galeria), zatwierdź raport. Powinieneś widzieć informację o zmianach oczekujących na wysłanie — bez komunikatu, że raport zniknął.
4. Zamknij aplikację i uruchom ją ponownie nadal offline. Wcześniejsze dane i kolejka mają pozostać.
5. Włącz internet i użyj odświeżania/synchronizacji. W WWW sprawdź jeden gotowy raport z tymi samymi zdjęciami. Sprawdź, czy dwa odświeżenia nie dublują zdjęć.
6. Sprawdź odmowę dostępu do aparatu i ręczne wpisywanie kodu. Jeśli coś nie działa, zachowaj log błędu Metro + logi Vercel.

Nie testuj na niezastąpionych zleceniach klientów. NIE wylogowuj się i nie usuwaj aplikacji podczas testów niewysłanej kolejki (odinstalowanie usuwa pamięć aplikacji).

## Raport testów w paczce

Patrz `docs/WEEK3-TEST-RESULTS.md`. **Testy na produkcyjnym Neon/Vercel i na prawdziwym telefonie wymagają Twojego uruchomienia.**
