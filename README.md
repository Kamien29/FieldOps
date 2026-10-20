# FieldOps — PostgreSQL + Vercel Services

FieldOps includes a Vite/React web frontend (`fieldops-web`), a Node.js API (`backend`), and a mobile client (`mobile`).

Production persistence is provided by PostgreSQL rather than ephemeral SQLite. Accounts, jobs, devices, reports, photos, and synchronization idempotency are stored in PostgreSQL. No demo accounts are seeded by default.

## Getting started

From `backend/` install npm dependencies, set environment variables from `.env.example`, run `npm run migrate`, then `npm start`. For the web app use `cd fieldops-web && npm ci && npm run dev`.

Important: `npm run migrate` and `npm start` expect `DATABASE_URL` and `TOKEN_SECRET` to be exported by the shell, supplied by your process manager, or loaded with `node --env-file=.env`.

### Production checklist

- Create a PostgreSQL database (e.g. Neon) and enable backups.
- Set `DATABASE_URL`, strong `TOKEN_SECRET` (at least 32 characters), `COOKIE_SECURE=1` for the backend.
- Run migrations on the target database **before** enabling production traffic.
- Use the `Services` project framework on Vercel and keep the `vercel.json` routing.
- Test full web/mobile API flows, permissions, and synchronization on a staging database.
- Add rate limiting, monitoring, backup restores, session revocation, and object storage for large-scale photos before serious production usage.

For detailed instructions and migration from SQLite, see the `README-START.md` included with the fix bundle.
