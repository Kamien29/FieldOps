# Architecture

```
┌──────────────── Phone ────────────────┐            ┌──────── Backend ────────┐
│ Screens ──► db.ts (SQLite)            │            │ node:http  REST + JSON  │
│   │            │ jobs / reports /     │            │ node:sqlite             │
│   │            │ photos / OUTBOX      │   HTTPS    │ jobs(version) reports   │
│   └─ syncNow() ┴─► sync.ts ───────────┼───────────►│ photos idempotency      │
│        ▲  NetInfo, AppState, 60s timer│            └─────────────────────────┘
└───────────────────────────────────────┘
```

## Principles

1. **The UI only talks to SQLite.** Every edit is written locally first, so the app behaves identically online and offline.
2. **Outbox pattern.** Each change that must reach the server is a row in `outbox` (`photo`, `status`, `report`), ordered by `seq`.
3. **Idempotent mutations.** The outbox row id is sent as `Idempotency-Key`. If the response is lost (tunnel, timeout) and the
   client retries, the server replays the stored result instead of applying the change twice.
4. **Optimistic concurrency.** Every job has an integer `version`. Mutations carry `baseVersion`; if it differs from the server's
   version the server answers `409` with its current copy.
5. **Push, then pull.** Sync first sends the outbox, then fetches `GET /api/jobs?since=<last serverTime>`.

## Data model (device)

| Table | Purpose |
|---|---|
| `jobs` | Server fields + `version` + `sync_state` + `sync_error` + `conflict_json` |
| `reports` | One draft/submitted report per job; includes recipient name and local completion timestamp |
| `photos` | Local file *name* (not path), `uploaded` flag |
| `outbox` | Pending mutations (`seq`, `id`, `job_id`, `kind`, `payload`) |
| `meta` | `last_sync` (server time of last pull) |

`sync_state`: `synced` (nothing pending) · `pending` (outbox has pending mutations) · `conflict` (server rejected with 409) ·
`error` (permanent 4xx or missing local file).

## Sync algorithm (`src/sync.ts`)

```
syncNow():  single-flight — concurrent callers share one run; a call during a run schedules one more.
push():
  blocked = jobs in state conflict/error
  for m in outbox ORDER BY seq:
     skip if m.job in blocked                 # preserves per-job ordering
     send(m)  with baseVersion = jobs.version (read at send time)
        2xx            → delete m, jobs.version = server.version, state=synced if nothing left
        409 + server   → state=conflict (store server copy), block job
        401/408/429/5xx/network → abort run, retry next trigger (nothing is lost)
        other 4xx / missing file → state=error, block job
pull():
  GET /api/jobs?since=last_sync → upsert jobs without local unsent work; keep unsent drafts; save serverTime
```

Photos are queued the moment they are taken, so they upload *before* the report (lower `seq`); the server rejects a
report that references an unknown photo (`422`), which guarantees reports never point to missing images. The report
mutation contains the recipient's full name and drawn signature; it atomically stores the report and marks the server
job complete. No separate `done` status mutation is queued.

**Triggers:** app start · connectivity regained (NetInfo) · app returns to foreground · every 60 s while online ·
after each local submit/start/photo · pull-to-refresh.

## Conflict resolution

Detected when the server's `version` changed while the technician worked offline (e.g. dispatcher edited the job).
The job is frozen (`conflict`), outgoing mutations for it are held, and the screen shows both versions:

- **Keep my changes** → adopt the server's base data (title, address, schedule) and its `version`, keep my status/report, resend.
- **Use server version** → delete my queued status/report mutations and overwrite the local job and report with the server copy.

Error state: **Retry** or **Discard my changes** (clears the outbox for that job and forces a full pull to restore server state).

## Permissions & UX decisions

- Camera (QR + photos) and location are requested at the moment of use, with a clear Polish rationale and a fallback message
  when denied. QR scanning accepts only the first code (camera emits repeatedly).
- Note and recipient name are autosaved (debounced 600 ms and on leaving the screen). Signature is stored as an **SVG string** (no image
  rendering dependency, a few KB) and rendered with `react-native-svg`.
- Photos are resized to 1600 px / JPEG 60 % before storing to save mobile data and storage.
- Location uses balanced accuracy with a 20 s timeout and falls back to the last known position.
- A banner always shows online/offline and the count of unsent changes. Logout is blocked while unsent data exists.

## Security notes

Passwords hashed with scrypt; tokens are HMAC-SHA256 signed with expiry; jobs and photos are only accessible by the assigned user
(`404` otherwise); request bodies are capped at 15 MB; all inputs validated. Production hardening checklist: HTTPS only,
strong `TOKEN_SECRET`, rate limiting on `/api/login`, token refresh/revocation, object storage for photos, DB backups.
