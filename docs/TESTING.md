# Testing

## Automated (backend) — `cd backend && npm test`

Runs the authentication and report-input validation unit tests without connecting to PostgreSQL. The legacy
`test/api.test.js` targets an older SQLite backend API and is not part of the current PostgreSQL test command. Report
transaction, access-control, and authenticated photo delivery should be verified against a disposable local PostgreSQL
database after migrations; never point these checks at production.

## Web — manual report flow

Run the Vite client and PostgreSQL API locally as described in the root README. In the active `fieldops-web/index.html`
interface, verify:

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Required completion report | Start a job; try to submit an empty report, then submit with a work description, recipient full name, and drawn signature | Empty or incomplete reports are blocked; a valid report saves and completes the job in one action |
| 2 | Photos and retry | Add valid JPEG/PNG/WebP images, remove one, then submit; interrupt an upload and retry | Previews and removal work; successful uploads are reused; the report links only to uploaded photos |
| 3 | Optional location | Submit without requesting location, then repeat and request it after granting browser permission | Location is absent unless explicitly requested and granted |
| 4 | Saved report | Open a completed job's report and click a photo | Report fields, signature, and private authenticated photos are visible; no report edit action is offered |
| 5 | Completion guard | Inspect an in-progress job before submitting its report | The UI offers report completion, not a direct `done` status action |

## Mobile — checks to run
`cd mobile && npm run typecheck` (must be clean), then the manual scenarios below on a **real device** (camera, GPS and
airplane mode are unreliable on emulators).

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Happy path online | Login → open job → start → fill report → submit | Job `Zakończone`, banner "Wszystko zsynchronizowane", server has report |
| 2 | Full offline work | Start job online, enable airplane mode, add note/QR/photo/location/signature, submit | List shows "Czeka na wysłanie"; banner offline with count |
| 3 | Auto sync on reconnect | Disable airplane mode | Within seconds: count → 0, state synced, photos show ✓ |
| 4 | App killed while offline | Do #2, force-close, reopen (still offline) | Data intact; still pending |
| 5 | Lost response | Submit, kill network right after send (or stop server), retry | No duplicate reports/versions on server (idempotency) |
| 6 | Conflict – keep mine | Offline edit, run `npm run simulate-change -- J-1001`, go online | Conflict panel; "Zachowaj moje" → synced; server has my report and new address |
| 7 | Conflict – use server | As #6, choose "Użyj wersji z serwera" | Local changes dropped, server data shown |
| 8 | Permission denied | Deny camera/location | Message with guidance, app doesn't crash; scan/photo/location can be retried |
| 9 | Draft safety | Type a note, leave screen, return; pull-to-refresh while editing | Note preserved, never overwritten by sync |
| 10 | Logout guard | Logout with unsent data | Blocked with explanation; works after sync |
| 11 | Token expiry | Change `TOKEN_SECRET`, restart server, trigger sync | Returned to login screen (local unsent data is cleared on forced logout — see note) |
| 12 | Large photos on slow network | Take 5 photos on weak 3G | Reports wait for uploads; no crash, retried later |

**Note on #11:** `onAuthExpired` forces logout and wipes local data. If you need to preserve unsent work across
expired sessions, change `App.tsx` to keep the DB and show the login screen only (small change; deliberately left strict to avoid
mixing data between users).

## Release checklist
- [ ] `TOKEN_SECRET` set, HTTPS in front of backend, DB backup
- [ ] Change bundle ids, add icon/splash, set `EXPO_PUBLIC_API_URL` to the HTTPS URL
- [ ] Remove demo email prefill in `LoginScreen`, remove seeded demo users
- [ ] Run scenarios 1–12 on one iOS and one Android device
