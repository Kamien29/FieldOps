# REST API

Base URL: `http://<host>:3000`. JSON everywhere. Authenticated routes need `Authorization: Bearer <token>`.
Errors: `{ "error": "<code>", ...extra }`.

Mutating job routes (`status`, `report`) **require** header `Idempotency-Key` (≤100 chars) and body field `baseVersion` (integer).

## `GET /health` → `{ ok: true }`

## `POST /api/login`
Body `{ email, password }` → `200 { token, user: { id, name, email } }` · `401 invalid_credentials`

## `GET /api/jobs?since=<ISO>`
Jobs assigned to the user with `updatedAt >= since` (omit for all). → `200 { serverTime, jobs: [Job] }`

```json
Job = { "id": "J-1001", "title": "...", "customer": "...", "address": "...", "scheduledAt": "ISO",
        "status": "new|in_progress|done", "version": 3, "updatedAt": "ISO",
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
| 404 | `job_not_found`, `photo_not_found`, `not_found` | Also returned for jobs of other users |
| 409 | `conflict` (+ `server: Job`), `id_taken` | Stale `baseVersion` / id clash. 409 responses are **not** cached by idempotency, so the same key can be reused after resolving |
| 413 | `payload_too_large` | Body > 15 MB |
| 422 | `unknown_photo` | Report references missing photo |
