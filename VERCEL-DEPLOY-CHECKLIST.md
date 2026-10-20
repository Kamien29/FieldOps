# FieldOps production rollout (manual checklist)

[ ] Create Neon Postgres database and configure backups.
[ ] Store `DATABASE_URL` in the Vercel backend service environment.
[ ] Store random `TOKEN_SECRET` of 32+ chars; keep value unchanged across redeploys.
[ ] Set `COOKIE_SECURE=1` in production.
[ ] Install dependencies, execute schema migration on the correct database.
[ ] If needed, run one-time SQLite importer into *empty* database; verify records and photo bytes.
[ ] Check `npm test` and Vite build on the full patched repository.
[ ] Configure Vercel framework `Services` and review rewrites.
[ ] Deploy preview manually; verify `/api/health`, register/login/session/cookie, CRUD, photos, 404, and mobile bearer API.
[ ] Verify app deep links `/<some-route>` are served by SPA.
[ ] Restore test from backup before going live.
[ ] Add rate limiting / auth security controls and production monitoring.

CAUTION: This bundle has NOT been deployed or validated against a live database or Vercel deployment.
