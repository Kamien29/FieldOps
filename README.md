# FieldOps — firmy, przekazania, czat i zdjęcia profilowe

**Nowe funkcje**: tworzenie/dołączanie do firm, zaproszenia, przekazywanie zleceń z akceptacją, czat firmowy i prywatny oraz zdjęcia profilowe — w panelu WWW i w aplikacji Expo. Dotychczasowe funkcje tygodnia 4 (synchronizacja offline, raporty, podpisy, zdjęcia, Neon) pozostają zachowane.

**Zacznij od `WDROZ-FIRMY-I-CZAT.md`.** Wymagana jest nowa migracja `003_teams_and_collaboration.sql` na bazie PostgreSQL, po wykonaniu jej kopii zapasowej.

---

# FieldOps — Tydzień 4

**START:** przeczytaj [TYDZIEN-4-START.md](TYDZIEN-4-START.md) i [instrukcję uruchomienia](docs/WDROZENIE-TYDZIEN-4.md).

Projekt zawiera synchronizację offline, obsługę konfliktów danych i testy automatyczne. To pełne archiwum z bazą kodu ze starszej paczki; przed połączeniem z nowszym GitHub porównaj pliki.

---

# FieldOps — PostgreSQL + Vercel Services

FieldOps includes a Vite-served web client (`fieldops-web/index.html`), a Node.js API (`backend`), and a mobile client (`mobile`). The active web entrypoint is a standalone HTML/JavaScript application; the separate React source tree is not loaded by it.

Production persistence is provided by PostgreSQL rather than ephemeral SQLite. Accounts, jobs, devices, reports, photos, and synchronization idempotency are stored in PostgreSQL. No demo accounts are seeded by default.

## Local development

Use a local PostgreSQL database named `fieldops_demo` (create it with `createdb fieldops_demo` or `CREATE DATABASE fieldops_demo` in `psql`). No Docker or hosted database is required. From `backend/`, install dependencies with `npm ci`, copy `.env.example` to `.env`, and fill in only local database credentials and a random `TOKEN_SECRET` (at least 32 characters). Never commit `.env`.

Apply the additive, repeatable schema migrations and start the API:

```powershell
cd backend
npm ci
npm run migrate
npm start
```

The API requires `DATABASE_URL` and `TOKEN_SECRET` in the shell or in `.env`; the migration command must only be pointed at the local demo database.

To create fictional sample data in an empty local database, explicitly opt in:

```powershell
$env:FIELDOPS_DEMO_SEED = '1'
npm run seed:demo
Remove-Item Env:FIELDOPS_DEMO_SEED
```

The seed command refuses non-local hosts, databases other than `fieldops_demo`, production mode, missing opt-in, or databases that already contain users. It prints a randomly generated temporary password once. Demo data is stored only in PostgreSQL; delete the local demo database when it is no longer needed.

In a second terminal, run the web client:

```powershell
cd fieldops-web
npm ci
npm run dev
```

For mobile, use `cd mobile`, run `npm install`, then `npm start`. Its report drafts and outbox are stored in Expo SQLite; image files are in the app-private `documentDirectory/photos` directory. Remove the app's local data to clear them.

Run checks with `cd backend; npm test`, `cd fieldops-web; npm test; npm run build`, and `cd mobile; npm run typecheck`. Remove demo PostgreSQL data only by dropping the local `fieldops_demo` database (`dropdb fieldops_demo`). Do not run migrations or seed commands against production or an unverified database.

### Future deployment notes (not part of local development)

- Create a PostgreSQL database (e.g. Neon) and enable backups.
- Set `DATABASE_URL`, strong `TOKEN_SECRET` (at least 32 characters), `COOKIE_SECURE=1` for the backend.
- The local `npm run migrate` command intentionally refuses non-local databases; production migrations and deployment require a separate reviewed process.
- Use the `Services` project framework on Vercel and keep the `vercel.json` routing.
- Test full web/mobile API flows, permissions, and synchronization on a staging database.
- Add rate limiting, monitoring, backup restores, session revocation, and object storage for large-scale photos before serious production usage.

For detailed instructions and migration from SQLite, see the `README-START.md` included with the fix bundle.
