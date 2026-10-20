FieldOps — profil i edycja profilu

PLIKI DO DODANIA:
- fieldops-web/src/components/ProfilePage.jsx
- fieldops-web/src/services/profile.js

PLIKI DO PODMIANY:
- fieldops-web/src/App.jsx
- fieldops-web/src/components/AppLayout.jsx

DODATKOWO:
1. Dopisz zawartość fieldops-web/src/index.css.patch na końcu fieldops-web/src/index.css.
2. Dopisz blok z backend/src/server.js.patch w backend/src/server.js bezpośrednio po obsłudze GET /api/me.
3. Uruchom test kompilacji: w fieldops-web wykonaj npm run build.

Profil jest pod adresem /profile. Zapisuje nazwę i e-mail; opcjonalnie pozwala zmienić hasło po podaniu obecnego hasła.
Backendowy endpoint PATCH /api/me jest konieczny — samo dodanie komponentu nie wystarczy.
Pliki nie zostały zapisane w repozytorium GitHub.
