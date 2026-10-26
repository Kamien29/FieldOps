# FieldOps — firmy, zdjęcia profilowe, przekazywanie zleceń i czat

To jest **cały projekt** kontynuujący **Tydzień 4**; nie tylko nakładka. Aplikacja WWW i mobilna korzystają z tego samego backendu PostgreSQL (Neon).

## Co nowego

- Zdjęcie profilowe: WWW i Expo, z automatycznym zmniejszaniem, limitem 300 KiB. Zdjęcie jest przechowywane w PostgreSQL, nie w Vercel Filesystem.
- Firmy / grupy: tworzenie, zaproszenia po adresie e-mail, przyjęcie/odrzucenie zaproszeń, lista członków, opuszczenie firmy i usunięcie członka przez uprawnioną osobę.
- Zlecenia firmowe: wszyscy członkowie widzą podstawową listę firmowych zleceń. Twórca zlecenia zostaje pierwszym wykonawcą; może wysłać propozycję przekazania.
- Przekazywanie zleceń: również między niezależnymi kontami FieldOps po adresie e-mail. **Żadne zlecenie nie zmienia wykonawcy przed świadomą akceptacją odbiorcy.**
- Czat całej firmy oraz prywatne rozmowy między członkami **tej samej** firmy, odświeżane co 15 sekund.
- W aplikacji mobilnej widoki **Firmy i czat**, **Przekazania**, **Profil** są dostępne z listy zleceń. Czat i przekazywanie wymagają internetu; offline nadal działa dotychczasowa kolejka zleceń.

## Uruchomienie lokalne (Git Bash / Windows)

1. Rozpakuj ZIP do **osobnego** folderu, np. `~/Documents/FieldOps-FIRMY-CZAT`. Nie nadpisuj starego projektu bez kopii.
2. W `backend/.env` wpisz prawidłowy `DATABASE_URL` i `TOKEN_SECRET` (min. 32 znaki). Dla lokalnego HTTP ustaw `COOKIE_SECURE=0`. **Nie kopiuj `.env` do repozytorium ani nie wysyłaj go innym.**
3. Wykonaj **kopię bezpieczeństwa Neon** lub nową gałąź bazy. Migracja dodaje tabele i kolumny; nie usuwa istniejących kont ani raportów. Z bazą testową/branch Neon uruchom:

```bash
cd backend
npm install
FIELDOPS_MIGRATE_CONFIRM=YES_I_HAVE_A_BACKUP node --env-file=.env src/migrate.js
npm test
node --env-file=.env src/index.js
```

4. W **drugim** terminalu:

```bash
cd fieldops-web
npm ci
npm run build
npm run dev
```

Otwórz `http://localhost:5173`. Backend API działa na `http://localhost:3000`, a Vite przekazuje `/api` przez proxy.

### Telefon — Expo SDK 58

```bash
cd mobile
npm install
npm run typecheck
npx expo-doctor@latest
npx expo start --clear
```

`mobile/.env` może zawierać `EXPO_PUBLIC_API_URL=https://fieldops-6mm7.vercel.app` (bez `/api`). Telefon musi widzieć działający backend. **Nie używaj localhost:3000 jako API na fizycznym telefonie.**

## Aktualizacja istniejącej bazy Neon / Vercel

**Najpierw zrób kopię bazy Neon i przetestuj nową migrację na jej osobnej gałęzi.** Dopiero po sprawdzeniu przenieś do produkcji. W `backend/db/migrations/003_teams_and_collaboration.sql` są tylko `CREATE TABLE` i `ALTER TABLE ADD COLUMN IF NOT EXISTS` (brak kasowania kont). Dla już utworzonych baz skrypt `backend/src/migrate.js` wykonuje migracje 001, 002 i 003 transakcyjnie. Upewnij się, że istniejący schemat bazy jest zgodny z migracjami poprzednich tygodni. 

1. Zachowaj dotychczasowe zmienne `DATABASE_URL`, `TOKEN_SECRET`, `COOKIE_SECURE=1` na produkcyjnym backendzie Vercel. **Nie zmieniaj istniejącego `TOKEN_SECRET`**, bo unieważnisz aktualne sesje.
2. Na swoim komputerze w `backend/.env` ustaw adres właściwej, uprzednio zarchiwizowanej bazy. Migracja zdalnej bazy wymaga świadomego potwierdzenia w zmiennej `FIELDOPS_MIGRATE_CONFIRM=YES_I_HAVE_A_BACKUP`; nie ustawiaj tej wartości na stałe w Vercel.
3. Sprawdź migrację i testy w **stagingu**, następnie wykonaj migrację produkcyjną w oknie serwisowym (z kopią zapasową i planem wycofania).
4. W Vercel pozostaw **Root Directory: główny folder** i **Framework Preset: Services**. Konfiguracja `vercel.json` kieruje `/api/*` do backendu i `/` do interfejsu Vite.
5. Wdróż **świadomie** nową wersję. Możesz użyć istniejącego połączenia GitHub i ręcznie wykonać commit/push ze swojego komputera albo uruchomić Vercel CLI z katalogu głównego (po wcześniejszym `vercel link`): `npx vercel deploy --prod`. **Asystent nie wykonał żadnej z tych operacji.**
6. Po wdrożeniu sprawdź na dwóch kontach: `/api/health`, logowanie, stworzenie firmy, zaproszenie/akceptację, utworzenie zlecenia firmowego, przekazanie/akceptację, czat grupowy/prywatny, zdjęcie oraz dotychczasowy raport. Nie testuj destrukcyjnych zmian na prawdziwych zleceniach klientów.

## Istotne zasady i ograniczenia

- Dostęp do czatu ma tylko członek firmy; wiadomości prywatne są widoczne tylko dla dwóch uczestników, ale **nie są szyfrowane end-to-end**.
- Zaproszenia **nie wysyłają e-maili**. Czekają na odbiorcę w jego zakładce „Firmy i czat”. Konto może powstać po wysłaniu zaproszenia, ale adres e-mail konta musi być identyczny.
- Przekazać można zlecenie bez raportu, bez zdjęć i w statusie „nowe” albo „w trakcie”. Nieudany / przestarzały transfer nie zmienia właściciela. Przy transferze odłączane jest prywatne urządzenie nadawcy.
- Gdy oferta dotyczy zlecenia firmowego, zarówno nadawca, jak i odbiorca muszą należeć do tej firmy. Zlecenia prywatne można przekazać innemu zarejestrowanemu wykonawcy.
- Członek może opuścić firmę dopiero po przekazaniu swoich firmowych zleceń; właściciel nie może sam opuścić firmy. Przekazywanie właścicielstwa i usuwanie firmy to zakres dalszego rozwoju.
- Wysyłanie wiadomości i ofert wymaga internetu. Synchronizacja offline z tygodnia 4 dotyczy dotychczasowych zleceń, zdjęć, raportów i statusów — nie czatu.
- Do użytku z realnymi klientami potrzebne są jeszcze m.in. rate limiting, audyt dostępu, procedury backup/restore i polityka retencji wiadomości/zdjęć. Nie testowano produkcyjnej bazy użytkownika ani wdrożenia Vercel.

## Pliki z nowymi funkcjami

`backend/src/team-api.js` — API i autoryzacja współpracy.

`backend/db/migrations/003_teams_and_collaboration.sql` — migracja PostgreSQL.

`fieldops-web/public/team.js` — logika nowego interfejsu WWW, `fieldops-web/index.html` — jego widoki.

`mobile/src/team-api.ts`, `mobile/src/screens/TeamScreen.tsx`, `mobile/src/screens/ProfileScreen.tsx` — wersja mobilna.

`backend/test/team-api.test.js` — testy reguł biznesowych i uprawnień.

Szczegółową mapę endpointów znajdziesz w `docs/TEAM-API.md`, a status testów w `RAPORT-FIRMY-I-CZAT.md`.
