# REST API

Base URL: `http://<host>:3000`. JSON everywhere.

**Authentication** – two equivalent mechanisms, same token:
- mobile: `Authorization: Bearer <token>` (token from `login`/`register`, kept in secure storage);
- web: HttpOnly cookie `fieldops_session` (`SameSite=Strict`, 30 days; `Secure` when `COOKIE_SECURE=1` or `X-Forwarded-Proto: https`) set by `login`/`register`. The browser app never sees the token. State-changing requests authenticated by cookie must send any non-empty `X-Requested-With` header, otherwise `403 csrf_blocked`. The web app must be served from the same origin as the API (dev: Vite proxy; prod: reverse proxy).
Errors: `{ "error": "<code>", ...extra }`.

Mutating job routes (`status`, `report`) **require** header `Idempotency-Key` (≤100 chars) and body field `baseVersion` (integer).

## `GET /health` → `{ ok: true }`

## `POST /api/register`
Body `{ name (≤100), email, password (8–200 chars) }` → `201 { token, user: { id, name, email } }` and sets the session cookie.
E-mail is trimmed and lower-cased; passwords are stored only as salted scrypt hashes.
`400 invalid_name|invalid_email|invalid_password` · `409 email_taken`

## `POST /api/login`
Body `{ email, password }` → `200 { token, user: { id, name, email } }` and sets the session cookie · `401 invalid_credentials`

## `POST /api/logout` → `200 { ok: true }`
Clears the session cookie (the token itself is stateless and stays valid until it expires).

## `GET /api/me` → `200 { user: { id, name, email } }`
Restores the session after a page reload. `401 unauthorized` when there is no valid session.

## `GET /api/jobs?since=<ISO>&page=<n>&limit=<n>`
Jobs assigned to the user with `updatedAt >= since` (omit for all), sorted by `scheduledAt`. → `200 { serverTime, jobs: [Job] }`

Pagination is **opt-in**: without `page`/`limit` the full list is returned (used by mobile sync). With either parameter
(`page` ≥ 1, default 1; `limit` 1–100, default 10) the response also contains
`pagination: { page, limit, total, totalPages }` (`totalPages` ≥ 1). A page beyond the end returns an empty list.
`400 invalid_page|invalid_limit`

## `GET /api/jobs/:id` → `200 { job }`
`404 job_not_found` for unknown ids **and** for jobs of other users.

## `POST /api/jobs`
Body `{ title (≤200), description (≤5000), customer (≤200), address (≤300), scheduledAt (ISO date-time, years 2000–2100) }` – all required.
→ `201 { job }`. The job is assigned to the caller and always starts as `status: "new"` ("do wykonania"); a client-supplied status is ignored.
`400 invalid_title|invalid_description|invalid_customer|invalid_address|invalid_scheduledAt`

```json
Job = { "id": "J-1001", "title": "...", "description": "...", "customer": "...", "address": "...", "scheduledAt": "ISO",
        "status": "new|in_progress|done", "version": 3, "createdAt": "ISO", "updatedAt": "ISO",
        "report": null | { "note": "", "lat": 50.0, "lng": 21.9, "deviceCode": "DEV-1",
                           "signatureSvg": "<svg…>", "photoIds": ["…"], "updatedAt": "ISO" } }
```

## `POST /api/jobs/:id/status`
Body `{ status: "new"|"in_progress"|"done", baseVersion }` → `200 { job }`

## `PUT /api/jobs/:id/report`
Body `{ note (required, ≤10 000), lat?, lng?, deviceCode?, signatureSvg? (≤200 000), photoIds? (≤50), baseVersion }` → `200 { job }`
`422 unknown_photo` if a photo id was not uploaded for this job.

## `POST /api/jobs/:id/photos`
Body `{ id, mime: image/jpeg|png|webp, dataBase64 }` → `201 { id }` (first time) / `200 { id }` (repeat — idempotent by `id`).
`id` must match `^[A-Za-z0-9-]{8,64}$`. `409 id_taken` if the id belongs to another job.

## `GET /api/photos/:id` → image bytes (only for the assigned user)

## Common errors
| Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_*`, `baseVersion_required`, `idempotency_key_required`, `invalid_json` | Bad request |
| 401 | `unauthorized`, `invalid_credentials` | Missing/invalid/expired token |
| 403 | `csrf_blocked` | Cookie-authenticated change without `X-Requested-With` |
| 404 | `job_not_found`, `not_found` | Unknown resource (or another user's job) |
| 409 | `email_taken`, `conflict`, `id_taken` | Duplicate e-mail / stale `baseVersion` / photo id owned by another job |
| 404 | `job_not_found`, `photo_not_found`, `not_found` | Also returned for jobs of other users |
| 409 | `conflict` (+ `server: Job`), `id_taken` | Stale `baseVersion` / id clash. 409 responses are **not** cached by idempotency, so the same key can be reused after resolving |
| 413 | `payload_too_large` | Body > 15 MB |
| 422 | `unknown_photo` | Report references missing photo |
