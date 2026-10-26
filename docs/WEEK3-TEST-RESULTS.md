# FieldOps — kontrola tygodnia 3

Środowisko: izolowana kopia kodu ze scalonej paczki przekazanej wcześniej w rozmowie. Brak dostępu do danych rzeczywistych.

## Wykonano w środowisku testowym

- `cd backend && npm test`: **17/17 PASS** (Node 22). Testy obejmują haszowanie haseł, sesje, izolowany serwer HTTP rejestracji i logowania, profil, CSRF, odmowę rejestracji bez sekretu, walidację raportu i zdjęć, transakcyjny zapis raportu, migrator wymagający kopii zapasowej oraz rozmiar JSON zdjęć dla Vercel.
- `node --check` na JS backendu i `fieldops-web/index.html` (skrypt inline): **PASS**.
- TypeScript AST parse dla 21 plików `.ts` i `.tsx` mobilnego klienta: **0 błędów składni**.
- `vercel.json`: nadal zawiera konfigurację dwóch Services i routing `/api/*` oraz `/`.
- Zawartość ZIP: kompletny katalog WWW + backend + mobile, bez `.env`, bez `node_modules`, bez `.git`.

## Nie można było przeprowadzić tutaj

- `npm ci` / `vite build` dla WWW: brak dostępu do rejestru npm w tym środowisku, paczki nie zostały pobrane.
- `npx tsc --noEmit` z typami React Native / Expo SDK 58: brak instalacji zależności z npm. Parser TypeScript **nie zastępuje** kompilacji typów.
- `npx expo-doctor` / faktyczny build Metro SDK 58 oraz aparat/galeria na Androidzie: brak zainstalowanego SDK i urządzenia fizycznego.
- Integracyjne SQL na żywym PostgreSQL: nie podłączano Neon i nie wolno było modyfikować produkcji.
- Wdrożenie na Vercel: nie wykonano.

## Znane ograniczenia / do następnego etapu

- Pełny upload fotografii powyżej 2,5 MiB bez kompresji wymaga osobnego object storage (np. Vercel Blob/S3) z bezpośrednim uploadem.
- Automatyczny szkic WWW po odświeżeniu, edycja zakończonego raportu, miniatury serwerowe i oznaczanie zdjęć strzałką to zadania poboczne, **nie zaimplementowane**.
- Pełne tworzenie/edycja zleceń offline oraz zaawansowane konflikty zleceń są zakresem tygodnia 4.
- Przetestować duże, historyczne zdjęcia >4,5MB zapisane przed aktualizacją: mogą wymagać migracji do object storage.
- Przed realną eksploatacją: backup i test odtworzenia Neon, monitoring Vercel, rate limiting auth, aktualizacja podatnych zależności po review `npm audit`.
