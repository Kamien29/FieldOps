# FieldOps API

All routes return JSON unless noted. Web requests use the `HttpOnly` session cookie and the `X-Requested-With: fieldops-web` CSRF header; mobile requests use a bearer token. Business data is always scoped to the authenticated user. Errors are returned as `{ "error": "error_code" }`.

## Authentication

- `POST /api/register` — `{ name, email, password }`.
- `POST /api/login` — `{ email, password }`.
- `POST /api/logout` — clears the session cookie.
- `GET /api/me` — current user.
- `GET /health` or `GET /api/health` — database health check.

## Jobs

- `GET /api/jobs?page=1&limit=10` — current user's jobs; each job contains `report: null | Report`.
- `GET /api/jobs/:id` — details for an owned job, including its report.
- `POST /api/jobs` — create a job; status starts as `new`.
- `PATCH /api/jobs/:id` — update job fields; include `baseVersion` and `Idempotency-Key`.
- `POST /api/jobs/:id/status` — body `{ status, baseVersion }`; include `Idempotency-Key`.

Job statuses are `new`, `in_progress`, `done`, and `cancelled`. A report can only be submitted while the job is `in_progress`. Setting `done` directly is rejected unless the job already has a report; submitting a report creates it and changes the status to `done` in the same database transaction.

## Reports and private photos

### Upload a photo

`POST /api/jobs/:id/photos` accepts one image at a time:

```json
{ "id": "client-generated-id", "mime": "image/jpeg", "dataBase64": "..." }
```

Allowed formats are JPEG, PNG, and WebP. The server checks the file signature bytes, not just the declared MIME type. Limits are 10 MiB per image, 10 images per job, and 40 MiB total per job. Uploads require an owned `in_progress` job. Repeating an upload with the same ID and identical bytes is safe.

`GET /api/photos/:id` returns the image only to the owner of its job. Responses are private and non-cacheable; photo data is not exposed through public URLs.

`DELETE /api/jobs/:id/photos/:photoId` removes an unreported image from an owned job that is still `in_progress`. The mobile outbox queues this operation when a previously uploaded photo is removed offline.

### Submit a report

`PUT /api/jobs/:id/report` requires `Idempotency-Key` and `baseVersion` and accepts:

```json
{
  "note": "Required work description",
  "recipientFullName": "Demo Recipient",
  "signatureSvg": "<svg ...>...</svg>",
  "photoIds": ["client-generated-id"],
  "baseVersion": 4,
  "lat": 50.0,
  "lng": 20.0
}
```

The description, a full name (at least two name parts), and a non-empty signature drawn in the app are required. The signature format is restricted to the app's path-only SVG representation. Photo IDs must refer to images uploaded for this job. Location is optional; latitude and longitude must be supplied together and within their geographic ranges. `locationAccuracy` in meters may be included only with both coordinates.

The report table's unique `job_id` enforces one report per job. The API locks the job, checks ownership, status, version, and existing report, then inserts the report and changes the job to `done` atomically. A repeated request using the same idempotency key replays its original result. A second report request receives `409 report_already_exists`. Report edits are intentionally not supported.

The response includes the updated job and `report` fields: `note`, `recipientFullName`, `signatureSvg`, `photoIds`, optional `lat`/`lng`/`locationAccuracy`, `createdAt`, `completedAt`, and `updatedAt`.

## Offline mobile client

The mobile client stores drafts and files in its local SQLite database/files directory and sends queued photo uploads before the report. The report's idempotency key is its outbox ID. Report submission itself completes the job, so completion and report data cannot diverge on the server. This is an existing local-first queue, not a new or simulated sync mechanism.
