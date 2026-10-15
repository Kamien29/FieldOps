# FieldOps — mobile assistant for service technicians

Offline-first mobile app: the technician sees assigned jobs, scans a device QR code, takes photos, captures
location and a customer signature, and fills in a report — **without network coverage**. Data waits in a local
queue and syncs automatically when the network returns, with retry and conflict resolution.

| Part | Stack | Folder |
|---|---|---|
| Mobile app | React Native (Expo SDK 52), TypeScript, expo-sqlite | `mobile/` |
| Backend | Node.js ≥ 22.13, **zero npm dependencies** (built-in `node:http` + `node:sqlite`) | `backend/` |
| Web | React 19, Vite 8, React Router 7 | `fieldops-web/` (instrukcja: `fieldops-web/README.md`) |
| Docs | architecture, API, test plan | `docs/` |

## MVP scope (from the brief) → where it lives

| Requirement | Implementation |
|---|---|
| List of jobs with date, address, status | `JobListScreen`, `jobs` table, `GET /api/jobs` |
| Report: note, photos, location, signature, QR scan | `JobDetailScreen`, `ScanScreen`, `SignatureScreen` |
| Local DB + sync-state marking | `src/db.ts` (SQLite), per-job `sync_state`: `synced / pending / conflict / error` |
| Retry + conflict resolution | `src/sync.ts` outbox + idempotency keys; optimistic versioning (`baseVersion` → `409`) + resolution UI |
| Mobile challenges: permissions, offline, sync, UX | runtime permission handling, offline banner, single-flight sync, autosave drafts |

## Quick start

### 1. Backend (needs Node ≥ 22.13)

```bash
cd backend
npm test            # 10 integration tests
npm start           # http://0.0.0.0:3000, seeds demo data on first run
```

Demo accounts (password `fieldops123`): `jan@fieldops.local` (5 jobs), `anna@fieldops.local` (1 job).
Environment: `PORT` (3000), `DB_FILE` (`./data/fieldops.db`), `TOKEN_SECRET` (**set in production**).
Docker: `docker build -t fieldops-backend backend && docker run -p 3000:3000 -v fo:/data -e TOKEN_SECRET=change-me fieldops-backend`.

### 2. Mobile

```bash
cd mobile
cp .env.example .env          # set EXPO_PUBLIC_API_URL to your computer's LAN IP, e.g. http://192.168.0.23:3000
npm install
npx expo install --fix        # aligns native module versions with the installed Expo SDK
npm run typecheck
npx expo start
```

Open with a development build or Expo Go **on a SDK-52-compatible client** (Expo Go supports only the latest SDKs;
if your store version is newer, run `npx expo install expo@latest --fix`, or use `npx expo run:android|ios`).
The phone and computer must be on the same Wi-Fi. Plain `http://` works in Expo Go; for release builds use HTTPS.

### 3. Try the offline scenario

1. Log in, open a job, tap **Rozpocznij zlecenie**.
2. Turn on airplane mode. Fill the report (note, QR, photo, location, signature) → **Zakończ i wyślij raport**.
3. The list shows "Czeka na wysłanie". Turn the network back on → it syncs by itself.
4. Conflict demo: go offline, edit a job, then on the server run
   `cd backend && npm run simulate-change -- J-1001 "ul. Nowa 1"`; go online → conflict screen appears.

More scenarios: `docs/TESTING.md`.

## Known limitations (deliberate MVP boundaries — be aware before production)

- **Not compiled here.** The backend was run and tested; the mobile app was written without network access
  to install dependencies, so it has **not** been compiled or run on a device. Expect to run `npx expo install --fix`
  and possibly fix minor type/version issues on first `npm run typecheck`.
- First login requires internet; after that the app works offline (token stored in SecureStore, 30-day expiry).
- Photos taken on *other* devices are not downloaded (endpoint `GET /api/photos/:id` exists).
- Submitted reports are read-only on the device; there is no dispatcher web panel (use `simulate-change` or SQL).
- Single status flow `new → in_progress → done`; no job creation in the app.
- Auth is a minimal HMAC token; for production use a real identity provider, HTTPS, rate limiting, and Postgres.
- UI language: Polish (`src/strings.ts`). Replace the demo email prefilled in `LoginScreen`.
- Bundle identifiers `com.example.fieldops` and the missing app icon/splash must be changed before store release.
