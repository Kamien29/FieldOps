# Testing

## Automated (backend) — `cd backend && npm test`
10 integration tests (real HTTP server + in-memory SQLite): auth, ownership isolation, delta sync, idempotent replay,
required headers, optimistic-version conflict (409) and resend, photo upload + report + photo access control, validation.

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
