# Testing notes (web)

Working notes on setting up automated (E2E) testing for the SolvyMed web
dashboard, kept as we go rather than written up after the fact. Unit tests
(Vitest + RTL) already existed before this — this file is specifically about
the new E2E layer. Companion to `TESTING.md` (mobile E2E flows, in the
`solvymed-mobile` repo) and `DEVELOPING.md` (overall workflow, in both
repos).

## Merge gate

**Do not merge a feature branch until its row below says 🟢.** A row only
gets 🟢 after its Playwright flow(s) have actually been *run* against a real
browser and passed — not just written. If a feature has no row yet, its E2E
coverage doesn't exist yet; that's a gap, not a blocker, unless the feature
is in the table below.

| Feature | Branch | Flows | Status | Last run |
|---|---|---|---|---|
| Patient self-rescheduling | `feat/patient-rescheduling` | `e2e/patient-request-reschedule.spec.ts`, `e2e/doctor-respond-reschedule.spec.ts` | 🔴 PENDING — written, not yet executed (blocked on shared test account credentials, see below) | — |

## Talking to the other agents

There are three Claude Code agents on this project: a **developer** agent,
a **mobile tester** agent (Maestro, `solvymed-mobile` repo), and this **web
tester** agent (Playwright, this repo). Per the user: we can and should talk
to each other directly (cross-session messages) about testing status, bugs,
approaches, limitations, and conventions — not just report up through the
green-light files. Use that instead of duplicating investigation someone
else already did, or silently diverging on a convention (e.g. testID/env
var naming, shared test accounts). This file and `TESTING.md` are still the
durable record — messages are for coordinating in the moment, not a
substitute for writing the result down here.

Known so far from that channel:
- Mobile tester (`d1`) and I share one pair of test accounts rather than
  each minting our own — see "Test accounts" below.
- No seed SQL / fixture data exists in either repo's `supabase/migrations`
  for test accounts — confirmed by the developer agent when asked.

## Tool choice: Playwright

Picked over Cypress because it's the more natural fit for a Next.js 15 /
App Router app: first-class multi-tab/redirect handling (relevant here —
`next-intl` middleware does a locale redirect on every route, see below),
auto-waiting, a single `@playwright/test` dependency, and a trace
viewer/UI mode that makes failures easy to debug without re-running headed.
Cypress's component-testing story wasn't needed here since Vitest + RTL
already covers unit/component tests; this layer is black-box browser E2E
only, same role Maestro plays for mobile.

Nothing was installed before this — `@playwright/test` and the Chromium
browser binary were added as part of this work (`npm install -D
@playwright/test`, `npx playwright install chromium`).

## Locale routing gotcha

`src/middleware.ts` runs `next-intl`'s middleware plus geo-IP-based locale
detection on every request. In practice: `/en/auth/login` 307-redirects to
`/auth/login` (English has no path prefix), and a fresh session without a
`NEXT_LOCALE` cookie could in theory redirect to a different locale first
based on detected country. Flows navigate to unprefixed paths
(`/auth/login`, `/my-appointments`, `/dashboard/schedule`) and assert on
`data-testid`, not on locale-specific text, so this shouldn't bite — but if
a flow ever needs a non-English locale on purpose, set the `NEXT_LOCALE`
cookie explicitly rather than relying on geo-detection (non-deterministic
in CI).

## Status as of 2026-09-23

**Flows written, harness verified, not yet run end-to-end.** One blocker
remains:

- **Test accounts — blocked.** No seeded patient/professional accounts
  exist in the shared Supabase project, and no seed SQL exists in either
  repo. Per the user (relayed via the mobile tester agent), throwaway
  accounts may be created directly in the shared project, and the mobile
  tester (`d1`) started creating one shared pair (`e2e-test-patient@…` /
  `e2e-test-doctor@…`, pre-confirmed via the Supabase admin API, plus one
  seeded confirmed appointment between them) so both testers use the same
  pair instead of multiplying test rows. That attempt is currently stuck:
  `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` looks malformed/invalid (the
  admin API 401s), so no accounts exist yet. `d1` has flagged this to the
  user directly. Once real credentials land, fill them into `.env.e2e`
  (see `.env.e2e.example`) as `PATIENT_EMAIL` / `PATIENT_PASSWORD` /
  `DOCTOR_EMAIL` / `DOCTOR_PASSWORD` and re-run.

What *has* been verified on this machine, so the remaining gap is narrowly
"needs real credentials," not "needs debugging":

- `@playwright/test` + the Chromium binary are installed
  (`npx playwright install chromium` completed).
- `npm run test:e2e` was run against a live `next dev` instance with dummy
  credentials (`PATIENT_EMAIL=nonexistent@example.com` etc.). Both specs
  navigated to `/auth/login`, resolved `login-email`/`login-password`/
  `login-submit` via `data-testid`, submitted, and failed cleanly on the
  post-login `toHaveURL` assertion (stayed on `/auth/login`, as expected
  for bad credentials) — confirming the harness, selectors, and
  `webServer` auto-start all work end-to-end up to the auth boundary.
- The locale-redirect behavior documented above was confirmed for real:
  `GET /en/auth/login` → `307` → `/auth/login`.

Not yet exercised: anything past login (both specs stop at the credential
check above). Treat the first real run as a shakeout: slot-loading waits
and the day/slot chip selection are best-guess pending a real run against
seeded availability data.

## What's covered

Feature: patient-initiated appointment rescheduling (`feat/patient-rescheduling`).

- `e2e/helpers/login.ts` — shared login helper (`/auth/login` →
  `/discover` or `/dashboard` redirect), plus an `requireEnv` guard so
  missing credentials fail fast with a clear message instead of a
  confusing selector timeout.
- `e2e/patient-request-reschedule.spec.ts` — patient opens
  `/my-appointments`, finds a confirmed appointment with a reschedule
  button, requests a new slot, verifies the dialog closes and the card's
  status badge flips to "Reschedule Pending".
- `e2e/doctor-respond-reschedule.spec.ts` — professional opens
  `/dashboard/schedule`, finds the incoming patient-initiated request row,
  accepts it, verifies the accept/decline buttons disappear from that row.

Not covered yet (documented, not silently skipped — same gaps as the
mobile flows, kept in sync deliberately):
- Decline path on the professional side (same shape as accept, second
  flow — didn't want to duplicate before the accept flow has run once for
  real).
- The slot-taken race on accept (`acceptRescheduleRequest` returning
  `error: "slot_taken"`, which triggers a native `alert()` in
  `BookingRequestsPanel.tsx`). Playwright auto-dismisses native dialogs, so
  today that path just fails the "buttons disappear" assertion rather than
  being asserted on directly — worth a dedicated `page.on("dialog", ...)`
  test later.
- The existing professional-initiated proposal flow (accept/propose/reject
  on a `tentative` booking) — unaffected by this feature per the PR
  description, but no regression coverage exists for it either.
- Multi-day slot search: the patient flow only tries the first day chip
  (tomorrow). If that professional has no open slots that day, the flow
  fails at the slot-tap step — exact same open question as the mobile
  flow's `reschedule-day-chip` index note. Extend by looping day chips
  under a "No available slots for this day." guard once seed data makes it
  clear it's needed.
- Booking the initial confirmed appointment: both flows assume one already
  exists for the test patient/professional pair (seed data precondition —
  see "Test accounts" above), rather than driving the booking flow first.

## testIDs added

The changed files had no `data-testid`s (or any other stable selector —
matched by CSS class only) before this. Added identifiers instead of
matching translated text, for the same reason the mobile flows added
`testID`s: fragile across locales (this app supports the same ~18 locales
as mobile via `next-intl`), and several of these strings ("Accept",
"Decline", "Request reschedule") aren't even run through `t()` yet on the
web side. Deliberately named to match the mobile `testID` convention
one-for-one where the concept is shared, so the two test suites read the
same way:

| data-testid | File | Element |
|---|---|---|
| `login-email` / `login-password` / `login-submit` | `auth/login/page.tsx` | login form inputs + submit button |
| `appointment-card` | `my-appointments/MyAppointmentsClient.tsx` | each appointment card (repeated; also carries `data-status={appt.status}`) |
| `appointment-status-badge` | `my-appointments/MyAppointmentsClient.tsx` | the card's status pill (asserted post-reschedule for "Reschedule Pending") |
| `reschedule-request-button` | `my-appointments/MyAppointmentsClient.tsx` | patient's "Request reschedule" button on a confirmed/scheduled appointment |
| `reschedule-dialog` | `my-appointments/MyAppointmentsClient.tsx` | reschedule modal root |
| `reschedule-day-chip` | `my-appointments/MyAppointmentsClient.tsx` | date picker chip (repeated per day, select by index) |
| `reschedule-slot-chip` | `my-appointments/MyAppointmentsClient.tsx` | time slot chip (repeated per slot, select by index) |
| `reschedule-submit-button` | `my-appointments/MyAppointmentsClient.tsx` | "Send Reschedule Request" button |
| `booking-request-row` | `dashboard/schedule/BookingRequestsPanel.tsx` | each booking request row (repeated) |
| `reschedule-accept-button` / `reschedule-decline-button` | `dashboard/schedule/BookingRequestsPanel.tsx` | professional's Accept/Decline on a *patient-initiated* reschedule request row (scoped separately from the pre-existing professional-initiated proposal buttons, which have no testIDs yet since they're outside this feature) |

## Running (once the prerequisites above are met)

```bash
cp .env.e2e.example .env.e2e   # fill in PATIENT_EMAIL/PASSWORD, DOCTOR_EMAIL/PASSWORD
npx playwright install chromium   # one-time, if not already done

# runs both flows headless against a locally-started `next dev` (see playwright.config.ts webServer)
set -a; source .env.e2e; set +a
npm run test:e2e

# or target one flow, with UI mode for debugging:
npm run test:e2e:ui -- e2e/patient-request-reschedule.spec.ts
```

By default `playwright.config.ts` starts `npm run dev` itself and waits for
it to come up (`reuseExistingServer: true`, so it'll happily attach to a
`next dev` you already have running). Set `E2E_BASE_URL` to point at a
different environment (e.g. a deployed preview) instead — doing so skips
the auto-started dev server.

## iOS — open question

Same answer as the mobile repo's `TESTING.md`: not applicable to this repo
directly, but worth noting here since browser E2E doesn't have the native
Xcode constraint mobile does — Playwright's WebKit engine *can* run on
Windows/Linux without a Mac, so if Safari-specific web bugs ever matter,
add a `webkit` project to `playwright.config.ts`. Not done yet since
Chromium coverage is the priority while the E2E layer is brand new.
