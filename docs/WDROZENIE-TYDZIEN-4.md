# Uruchomienie i wdrożenie FieldOps — tydzień 4

## 1. Zachowanie danych i kodu

1. Nie nadpisuj działającego folderu `~/Documents/fieldops` bez zrobienia kopii.
2. To pełne archiwum projektu oparte na wcześniejszym scaleniu. W GitHub mogą być nowsze pliki! **Najpierw porównaj różnice i scal, nie zamieniaj całego repozytorium na starszy snapshot.**
3. Nie kopiuj `.env`, haseł ani tokenów do GitHuba. Plików z `.env.example` używaj tylko jako wzorów.
4. Nie wykonuj automatycznego wdrożenia produkcyjnego przed testem w Preview.

## 2. Backend (Windows / Git Bash)

```bash
cd ~/Documents/fieldops/backend
npm install
npm test
```

W `.env` (lokalnie, **nie publikować**) ustaw prawidłowe `DATABASE_URL` i `TOKEN_SECRET`. Dla Neon trzymaj te wartości w Vercel → Environment Variables usługi `backend`.

Jeżeli istniejąca baza Neon **nie ma jeszcze kolumn raportów** dodanych w `002_report_completion.sql`, po backupie wykonaj migrację świadomie:

```bash
cd ~/Documents/fieldops/backend
FIELDOPS_MIGRATE_CONFIRM=YES_I_HAVE_A_BACKUP npm run migrate
```

Migracja korzysta z `DATABASE_URL` w `backend/.env`; komenda wymaga faktycznej kopii zapasowej. **Nie uruchamiaj, jeśli nie wiesz, do jakiej bazy podłączasz się.** Tydzień 4 nie dodaje nowych tabel w Neon: tworzenie offline używa już istniejących `jobs` i `idempotency`.

## 3. Aplikacja mobilna (Expo SDK 58)

```bash
cd ~/Documents/fieldops/mobile
npm install
npm run test:offline
npx expo install --check
npx expo-doctor@latest
npm run typecheck
npx expo start --clear
```

W `mobile/.env` użyj:

```env
EXPO_PUBLIC_API_URL=https://fieldops-6mm7.vercel.app
```

Aplikacja łączy się z tym URL domyślnie, ale jawna konfiguracja ułatwia przekazanie projektu nowej osobie. Telefon i komputer z Expo muszą móc się komunikować; Expo Go musi być zgodne z SDK 58. Zeskanuj kod QR i wykonaj testy z `TEST-TYDZIEN-4.md`.

## 4. Panel WWW + API na Vercel

Zmiany tygodnia 4 wprowadza się do istniejącego repozytorium po lokalnym scaleniu: `backend/src/server.js`, migracje i `fieldops-web/index.html`. W projektach Vercel Services zachowaj usługę `backend`, usługę `fieldops-web` i przekierowania z `vercel.json`. Przed produkcją:

```bash
cd ~/Documents/fieldops/fieldops-web
npm install
npm run build
```

Sprawdź w Preview `GET /api/health`, logowanie, edycję zleceń, raporty i konflikt 409. Następnie wdrożenie może być opublikowane ręcznie lub przez połączenie GitHub → Vercel (tylko przez właściciela projektu).

**Strona Vercel nie uruchamia aplikacji mobilnej Expo.** QR i offline mobilne trzeba testować w Expo Go / kompilacji Android/iOS. Nie zmieniaj `TOKEN_SECRET` bez wyraźnego powodu; wylogowałoby to istniejące sesje.

## 5. Jeśli coś się nie synchronizuje

- **Brak połączenia:** sprawdź `https://fieldops-6mm7.vercel.app/api/health`, `mobile/.env`, zasięg telefonu.
- **401:** zaloguj się ponownie na to samo konto. Nie kasuj danych telefonu.
- **409:** porównaj wersję telefonu i serwera w ekranie szczegółów zlecenia.
- **4xx:** szczegóły błędu są oznaczone przy zleceniu, możesz ręcznie wybrać ponowienie.
- **5xx:** Vercel → projekt FieldOps → Logs; nie powtarzaj ręcznie zmian w bazie.
- **Błąd zdjęć:** pojedyncze zdjęcie kompresowane do 2,5 MiB przed uploadem z telefonu, a Vercel ma limit wielkości żądania.
