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
| Patient self-rescheduling | `feat/patient-rescheduling` (✅ merged to master 2026-09-23) | `e2e/01-patient-request-reschedule.spec.ts`, `e2e/02-doctor-respond-reschedule.spec.ts` | 🟢 GREEN — re-verified post migrations 027–033 | 2026-09-23 |
| Patient self-rescheduling (decline path) | `feat/patient-rescheduling` (✅ merged to master 2026-09-23) | `e2e/03-doctor-decline-reschedule.spec.ts` | 🟢 GREEN — self-contained, doesn't need 01/02 to run first; re-verified post migrations 027–033 | 2026-09-23 |
| CSS extraction (pure refactor, no logic changes) | `refactor/css-extract` (PR #2 — merged, then reverted: merged before a fresh Copilot review landed on the final commit) | `e2e/01`–`03` (regression) + manual visual check of the 5 refactored pages | 🟢 GREEN — see "CSS refactor visual verification" below (content re-verified against `8f6be7a`) | 2026-09-24 |
| CSS extraction — re-land | `refactor/css-extract-redo` (PR #4 — ✅ merged to master 2026-09-24, commit `15407f6`) | `e2e/01-03` | 🟢 GREEN — fresh run against this exact commit, not carried over from PR #2 | 2026-09-24 |
| CSS dedupe (shared AuthPageShell/AuthCard/Logo/BrandMark/IconBadge components) | `refactor/css-dedupe-classnames` (PR #5 — ✅ merged to master 2026-09-24, commit `89a2ee8`) | `e2e/01-03` (regression) + manual check of 12 of 13 listed states live, remainder backed by diff review (see caveats below) | 🟢 GREEN — see "PR #5 visual verification" below | 2026-09-24 |
| CSS dedupe — utility classes (field-label/text-input/error-banner/spinner-white/link-teal/back-link/auth-heading/auth-footer-text/icon-status) | `refactor/css-dedupe-utilities` (PR #6 — ✅ merged to master 2026-09-24, commit `0759d6e`) | `e2e/01-03` (regression, 2 clean runs) + spot-check of all 9 classes across 4 representative pages | 🟢 GREEN — see "PR #6 verification" below | 2026-09-24 |
| Disable doctor discovery, require invite code (PO decision) | `feat/disable-doctor-discovery` (PR #7, commit `9ffa778`) | `e2e/01-03` (regression) + real functional pass | 🔴 blocking bug found, fixed in round 2 — see round 1 below | 2026-09-24 |
| ↳ round 2 (RPC fixes, invite-required retry form, dashboard allowlist guard) | same PR, commit `6e168e5` | `e2e/01-03` (regression, blocked) + retry-form guard test + dashboard-lockout reproduction | 🔴 **NEW, MORE SEVERE BUG: doctor accounts fully locked out of /dashboard** — see "PR #7 round 2" below | 2026-09-24 |
| ↳ round 3 (self-heal fix for missing `user_roles` rows) | same PR, commit `a80071b` | `e2e/01-03` (regression, 2 clean runs) + doctor self-heal reproduction + graceful-degradation check | 🟢 **GREEN** — see "PR #7 round 3" below | 2026-09-24 |
| ↳ round 4 (Copilot findings: verified self-heal, invite-attach metadata gate) | same PR, commit `c10796a` | `e2e/01-03` (regression, 2nd clean run) + doctor login regression + invite-required metadata-gate test | 🟢 **GREEN — recommend this as the merge commit** — see "PR #7 round 4" below | 2026-09-24 |
| ↳ round 5 (invite-attach race + silent upsert-failure fix) | same PR, commit `1b449fb` | typecheck + all-locale string check + `e2e/01-03` (regression, 2 clean runs after a `.next` corruption blip) | 🟢 GREEN — narrow fix, only reachable on the still-untestable successful-link path (see round 1's note); verified by code review + regression | 2026-09-24 |
| ↳ round 6 (upsert-error checks in original confirm flows + root-page redirect fix) | same PR, commit `37a01c4` | `e2e/01-03` (regression, clean) + root-page redirect regression (linked patient + doctor) | 🟢 **GREEN — recommend this as the merge commit instead of round 4** — see "PR #7 round 6" below | 2026-09-24 |

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
- **Commit author convention**: all three agents commit into the *same*
  git checkout, so per-repo `git config user.*` is shared state — setting
  it as "mine" silently changes what every other agent's commits look like
  too (learned this the hard way: set it locally, mobile tester pointed out
  the checkout is shared, reverted it back to the `BurrowSoft
  <support@burrowsoft.com>` baseline). Use `git commit --author="..."`
  per-commit instead. Convention in use: `Claude Sonnet 4.6 (developer)
  <noreply@anthropic.com>` for the developer agent, `Claude Sonnet 5
  (web-tester) <noreply@anthropic.com>` for this one — presumably
  `(android-tester)` or similar for mobile, confirm in `TESTING.md`/
  `DEVELOPING.md` if it matters to you.

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

**🟢 Both flows pass end-to-end against the seeded accounts.** Along the
way this run surfaced one real app bug (fixed by the developer agent) and
two test-harness issues (fixed here) — full trail below since the
diagnosis is worth keeping, not just the final green result.

Credentials were provided by the mobile tester
(`e2e-test-patient+…@burrowsoft.com` / `e2e-test-doctor+…@burrowsoft.com`,
seeded with working hours every day 09:00–18:00 and one confirmed
appointment). With those in `.env.e2e`:

```
Running 2 tests using 1 worker
  ok 1 [chromium] › e2e\01-patient-request-reschedule.spec.ts (21.3s)
  ok 2 [chromium] › e2e\02-doctor-respond-reschedule.spec.ts (19.2s)
  2 passed (42.6s)
```

### App bug found and fixed: RLS blocked slot lookup

First run failed 100% of the time before the fix below — not a
test/seed-data problem. `patient-request-reschedule.spec.ts` logged in,
opened `/my-appointments`, found the confirmed appointment, opened the
reschedule dialog — then every day showed "No available slots for this
day.", even though the professional has 09:00–18:00 hours every day and no
conflicting bookings on the date tried. `doctor-respond-reschedule.spec.ts`
failed as a downstream consequence: there was never a pending reschedule
request to accept.

**Root cause (confirmed, not guessed)** — isolated by calling the
Supabase REST API directly as each test account (bypassing the UI) to
narrow down where the empty result came from:

`getAvailableSlotsForDate` in
[`booking-actions.ts:521-527`](src/app/%5Blocale%5D/dashboard/schedule/booking-actions.ts#L521-L527)
reads the professional's `working_hours` with a direct table query:

```ts
const { data: profData } = await supabase
  .from("professionals")
  .select("working_hours")
  .eq("id", professionalId)
  .maybeSingle();
```

This runs as the **patient's** session (this function is called from the
patient-facing `RescheduleDialog`). Confirmed via REST: signed in as the
doctor, `GET /professionals?id=eq.<doctor-id>&select=working_hours` returns
the row with correct data (`enabled: true` all 7 days). Signed in as the
patient, the *identical* query against the *same* professional row returns
`[]` — RLS on `professionals` doesn't allow a patient to read another
user's `working_hours` this way. So `profData` is always `null` for a
patient, `wh` defaults to `{}`, `dayHours` is `undefined`, and the function
returns `[]` unconditionally — for every patient, every professional, every
day. `get_busy_slots` (the other data source in the same function) *is* a
security-definer RPC and returns correctly regardless of caller.

The fix was already established elsewhere in this codebase: the *original*
booking flow at
[`book/[professionalId]/BookingClient.tsx:228`](src/app/%5Blocale%5D/book/%5BprofessionalId%5D/BookingClient.tsx#L228)
reads working hours the same way a patient needs to, via
`supabase.rpc("get_professional_working_hours", { p_professional_id })` —
a security-definer RPC that already existed for this exact purpose.
Flagged to the developer agent with this diagnosis rather than fixing it
myself (outside the tester role) — they patched `getAvailableSlotsForDate`
to call that same RPC in commit `39b1ff6`. Re-run after pulling that commit
got past the slot-lookup step immediately, confirming the diagnosis.

### Test-harness issues found and fixed (not app bugs)

Two more failures showed up after the RLS fix — both traced to the test
suite itself via direct RPC/REST calls that proved the backend was
behaving correctly in each case, so neither was "fixed" by touching app
code:

1. **Spec file execution order.** `playwright.config.ts` uses `workers: 1`
   / `fullyParallel: false` so both specs run in one worker, in the order
   Playwright collects them — alphabetically by default. That put
   `doctor-respond-reschedule.spec.ts` *before*
   `patient-request-reschedule.spec.ts`, so the doctor flow never found a
   pending request (the patient flow that creates one hadn't run yet).
   Fixed by prefixing the filenames `01-`/`02-` to force the intended
   order; documented inline in `02-doctor-respond-reschedule.spec.ts`.
2. **Reschedule-badge assertion raced `router.refresh()`.** After
   submitting a reschedule request, the UI relies on a client-side
   `router.refresh()` to show the "Reschedule Pending" badge. Waiting on
   that (even at 15–30s) was unreliable against `next dev` — confirmed
   this wasn't a real bug by calling `request_appointment_reschedule` via
   REST directly (instant, correct) and by restarting the dev server fresh
   (`.next` cleared, new port) and reproducing the same client-side delay
   anyway, ruling out stale dev-server state as the cause too. Most likely
   explanation is plain `next dev` compile/re-render latency on a route
   that isn't hit often, which a production build wouldn't have — but
   since it *was* reproducible here, the test was changed to force a hard
   `page.reload()` before the final assertion instead of trusting the
   client transition's timing. This also required re-locating the card
   after reload by its date/time text rather than by "has a
   reschedule-request-button" (that filter stops matching the instant the
   request succeeds, since the button disappears once the appointment is
   no longer reschedulable).

What's been verified end-to-end on this machine, beyond the two spec runs
themselves:
- `@playwright/test` + Chromium installed and working.
- Login, locale-redirect (`GET /en/auth/login` → `307` → `/auth/login`),
  and every selector in both specs resolve correctly through
  `data-testid`.
- Ground-truth checks via direct Supabase REST calls (as each test
  account, bypassing the UI/Next.js entirely) at multiple points, to
  separate "the RPC/RLS layer is wrong" from "the UI/test just hasn't
  caught up yet" — this is what let each of the three issues above get
  diagnosed correctly instead of guessed at.

### Re-verification against `0708535` (Copilot-findings commit)

The developer agent pushed `0708535` (translation strings for the dialog
+ panel, an `end-datetime` fix to `canReschedule`, decline guards, a
zero-duration guard) after the green light above and reasonably guessed a
re-run wasn't needed since testIDs were untouched. Re-ran anyway — the
merge gate rule is "actually run," not "assessed as low-risk," and an
independent check is the point of having a separate tester agent.

First attempt (immediately after clearing `.next` and restarting the dev
server) failed in a new way: the reschedule dialog got stuck on "Sending…"
for the full 30s test timeout, never closing. Before assuming a
regression, checked the database directly — the mutation *had* landed
(the appointment's time had actually changed to the requested slot, and
the doctor-accept spec that ran right after found and accepted a pending
request fine). So the server action succeeded; the client just never
observed the response in time. Re-ran twice more against the now-warm
server (no cache clear) and both passed cleanly in normal time (~22s each,
consistent with every prior successful run). Conclusion: first-hit compile
latency on a freshly-cleared `next dev` cache, same category as the
router.refresh() race above, not a regression from `0708535` — logged here
rather than silently dismissed, since "stuck on Sending forever" is a
real-looking failure mode and future runs hitting it after a cache clear
shouldn't cause alarm.

### Re-verification against `8e0b60a` (auth guard, ARIA, error UI)

Reviewed the diff first this time before running (auth check in
`getAvailableSlotsForDate`, RPC-returned notification fields in
`acceptRescheduleRequest`, `isObsolete` fix for patient proposals in
`BookingRequestsPanel`, error state + ARIA attrs in `RescheduleDialog`,
plus a copyedit to this suite's own `e2e/helpers/login.ts` error message)
— all `data-testid`s were untouched and the new error/ARIA markup only
renders conditionally, so didn't expect selector breakage.

First full-suite run failed both specs (state-dependent: `02-` failing
was a downstream consequence of `01-` failing). Re-running `01-` alone
immediately after, with no other change, passed cleanly — so not a
deterministic regression. Two more full fresh runs both passed (~46s,
~48s). Best guess: a `git pull` landed 19 changed files (including all 15
locale JSON files) while the dev server was still running, and Fast
Refresh hit a transient inconsistent-reload state on that first request
after the pull — consistent with the dev-server flakiness already seen
twice above, not a code regression. Flagging the "ran once, failed, reran
clean" pattern explicitly rather than treating either the failure or the
pass as automatically definitive: if this shows up again in a way that
correlates with something other than "right after a pull," that's worth
revisiting as a real bug.

## What's covered

Feature: patient-initiated appointment rescheduling (`feat/patient-rescheduling`).

- `e2e/helpers/login.ts` — shared login helper (`/auth/login` →
  `/discover` or `/dashboard` redirect), plus an `requireEnv` guard so
  missing credentials fail fast with a clear message instead of a
  confusing selector timeout.
- `e2e/01-patient-request-reschedule.spec.ts` — patient opens
  `/my-appointments`, finds a confirmed appointment with a reschedule
  button, requests a new slot, reloads, and verifies the card's status
  badge flips to "Reschedule Pending".
- `e2e/02-doctor-respond-reschedule.spec.ts` — professional opens
  `/dashboard/schedule`, finds the incoming patient-initiated request row,
  accepts it, verifies the accept/decline buttons disappear from that row.
  Must run after the patient spec (numeric filename prefixes enforce
  this — see "Test-harness issues found and fixed" above).
- `e2e/03-doctor-decline-reschedule.spec.ts` — self-contained (creates its
  own pending request as the patient, then declines it as the
  professional in the same test) so it doesn't depend on `01`/`02` having
  run first. See "Re-verification against `b488b54`" above for why it
  waits rather than reloads after the decline click.

Not covered yet (documented, not silently skipped — same gaps as the
mobile flows, kept in sync deliberately):
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

### Re-verification against `b488b54`: migrations 027/028 question, decline-path spec

The developer asked whether the E2E specs break with migrations 027/028
(`accept_patient_reschedule` secretary-delegation two-arg overload, plus
dropping the old single-arg one) committed but **not yet applied** to the
live database. Verified by reading `booking-actions.ts`'s
`acceptRescheduleRequest`: it only adds the `p_acting_as_professional` arg
when `effectiveProfId !== user.id` (i.e. the caller is a secretary acting
for someone else). Neither test account is a secretary, so the RPC is
always called with just `p_appointment_id` — the same shape the *old*
single-arg overload (migration 026, still live) expects. Ran all three
specs against `b488b54` to confirm empirically rather than trust the
read-through alone: all pass. **Answer: no, the specs don't need 027/028
applied**, because the code path they exercise doesn't touch the
secretary-delegation branch.

Also reviewed and ran the new `03-doctor-decline-reschedule.spec.ts`
(added by the developer for Copilot finding `PRRT_kwDOS0VOSc6lAFwF`,
decline-path coverage that didn't exist before). First run failed with
the decline button stuck `disabled` forever — looked identical to the
router.refresh() race from `01-`, so applied the same fix (`page.reload()`
before the final assertion). That made it *worse*: the very next run
failed with the button still `visible` after reload, even though a direct
DB check showed the decline had actually succeeded. Root cause: unlike in
`01-`, where `dialog.toBeHidden()` is a real signal tied to the mutation's
promise resolving (`onSuccess()` only fires after `await
requestReschedule(...)` settles), there's no equivalent signal for the
decline button — `row.click()` resolves as soon as the click event
dispatches, not once the async transition it kicked off finishes.
Reloading immediately after just races the in-flight mutation and can
catch a stale pre-mutation snapshot. Fix: reverted the reload, went back
to a plain `toBeHidden()` wait matching `02-`'s accept assertion (which
has been reliable on every run this session) with a longer timeout, and
bumped the test's overall timeout to 60s since this spec does two full
logins plus a complete reschedule-request cycle before it even attempts
the decline, comfortably over the 30s default once dev-server latency is
factored in. Confirmed stable: 2 isolated runs + 1 full 3-spec run, all
green. Lesson for future specs in this suite: **don't reflexively add a
reload after every action** — only where there's already a real
client-side signal (like a dialog closing) that the mutation has
completed; otherwise a plain generous wait is the safer default, as
proven by `02-` never needing a reload at all.

### Re-verification after migrations 027–033 applied to the live database

The mobile tester applied all 7 pending migrations to the shared Supabase
project (`npx supabase db push`), including two more revisions to
`accept_patient_reschedule` beyond the one reviewed above: `029` (lock
ordering) and `031` (repeats the stale-proposed-time check after the
advisory lock is acquired, closing a window where a slow accept could
land on an already-expired proposal). Read `031`'s final version before
re-running rather than assuming "signature unchanged" was enough: the
`p_acting_as_professional` parameter still defaults to `NULL` and the
non-secretary call path is untouched, and the stale check only rejects
proposals whose time has already passed — irrelevant to these flows since
they always propose a next-day slot. Ran all 3 specs against the live
(now fully migrated) database to confirm rather than rely on that
read-through alone: all green, no behavior change observed.

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
npm run test:e2e:ui -- e2e/01-patient-request-reschedule.spec.ts
```

Each run consumes the single seeded appointment (moves it to a new
date/time via the accept step). Re-running the suite is safe — the patient
spec just picks whatever day/slot is first available from wherever the
appointment currently sits — but don't run `01-` and `02-` against a
*fresh* seed out of order (e.g. via `--grep` or running one file directly)
without either running `01-` first or otherwise leaving a pending
patient-initiated request for `02-` to find.

By default `playwright.config.ts` starts `npm run dev` itself and waits for
it to come up (`reuseExistingServer: true`, so it'll happily attach to a
`next dev` you already have running). Set `E2E_BASE_URL` to point at a
different environment (e.g. a deployed preview) instead — doing so skips
the auto-started dev server.

## CSS refactor visual verification (PR #2, `refactor/css-extract`)

Pure style refactor — every `style=` attribute across 5 files (patient-
welcome, professional-welcome, `CalendarView.tsx`, `dashboard/schedule/
page.tsx`, `ClinicMap.tsx`) moved into `globals.css` classes or Tailwind
utilities, no logic changes. Read the diff first: every converted value is
the same literal pixel/percentage computation, just delivered via a
Tailwind arbitrary-value class or a CSS custom property (`--appt-top`,
`--now-top`, `--line-top`, consumed by new `.calendar-*` classes) instead
of an inline `style` object — mechanically equivalent, not just "should
look the same."

**Before-state reference**: captured full-page screenshots of all 5 pages
against a clean `master` checkout *before* touching the shared working
directory, using an isolated `git worktree` (junctioned `node_modules` +
copied `.env.local`, dev server on a separate port) specifically so this
didn't collide with the developer's own in-progress edits on the same
checkout. Worktree removed after capturing.

**After-state comparison**: same pages captured against `refactor/
css-extract` (PR #2, commit `8f6be7a`). Side-by-side, byte-for-byte where
comparable:
- `/auth/patient-welcome`, `/auth/professional-welcome` — pixel-identical
  at the same countdown tick (progress bar empty at t=0, as expected from
  the `PROGRESS_WIDTH_CLASS` lookup starting at `w-0`).
- `/dashboard/schedule` — Day, Week, and Month views all render correctly
  with the grid lines and hour labels properly aligned. Specifically
  checked the thing the developer flagged (appointment block position +
  "now" line): navigated to the actual seeded appointment's date
  (2026-09-25, 09:30–10:00) in all three views — the block renders in the
  correct slot in Day, Week, and Month view every time. (First screenshot
  attempt of Day/Week/Month showed the view toggle hadn't actually
  switched — that was my script not waiting for the `router.push`
  navigation, not an app issue; fixed by waiting on the URL query param.)
- `/discover` in Map mode (the actual refactored component — the default
  tab is List, easy to miss) — Leaflet map renders at full size with
  correct min-height, markers placed correctly, `.clinic-map` class
  applied cleanly in place of the old inline `style`.

**E2E regression**: ran `01`/`02`/`03` against PR #2 (they don't touch any
of the 5 refactored files, but a pure-CSS refactor can still break
layout-dependent interactions like clicking a day/slot chip). First
attempt showed 2 failures — same cold-dev-server-after-cache-clear pattern
documented earlier in this file, not a regression: two clean 3/3 runs
followed on the warm server.

### Re-verification: PR #2 → reverted → re-landed as PR #4

PR #2 merged, then got reverted — it landed before a fresh Copilot review
covered the final commit, so the user pulled it back via GitHub's revert.
The developer re-landed the same change on a clean branch,
`refactor/css-extract-redo` (PR #4). Asked to re-run rather than carry the
old green light forward, which is the right call — a revert means the
gate that mattered was never actually satisfied for the commit that's
about to ship. Verified the "identical content" claim myself rather than
taking it as given: diffed PR #4's commit (`15407f6`) against PR #2's
(`8f6be7a`) for the 5 refactored files — one line differs, a comment added
above `CalendarView.tsx`'s `HOUR_H`/`FIRST_H`/`LAST_H` constants
explaining why they can't drive the Tailwind classes directly. No
functional or visual difference, so the earlier visual verification above
still holds; only re-ran the E2E suite (`npm run test:e2e`, as asked)
against this exact commit rather than redoing the screenshots too.

First `npm run test:e2e` attempt: 3 failures, including an unusual
`net::ERR_ABORTED` navigating to `/dashboard/schedule`. Before concluding
anything, checked the DB directly and the failure snapshot: the seeded
appointment was sitting in `proposal`/"Reschedule Pending" — leftover from
this run's own first spec failing to complete cleanly (likely the same
cold-server first-hit pattern, compounded this time by three specs
failing in the same run without a chance to self-clean). A second run's
specs 02/03 self-healed it back to `confirmed` (accept, then a fresh
decline cycle) despite 01 still failing on stale state. Cleared state and
ran twice more on the now-warm server: both 3/3 clean. Recorded as its own
row rather than overwriting PR #2's, so the "reverted" history stays
visible.

## PR #5 visual verification (`refactor/css-dedupe-classnames`)

Extracts 5 shared components (`AuthPageShell`, `AuthCard`, `Logo`,
`BrandMark`, `IconBadge`) and migrates 10 auth-family pages to use them —
pure markup consolidation, developer says no visual/behavioral change
intended. Read every touched page's diff before running anything: each is
a mechanical swap of the same inline `<div className="...">` wrapper for
the equivalent shared component, with the exact same JSX nested inside
every conditional branch (confirmed for all 4 states of
`ConfirmClient.tsx`, all 3 states of `reset-password`, both states of
`signup`, and every other touched file). Two different logo treatments
exist (`Logo` = img-based, `BrandMark` = SVG on teal) and the diff
correctly keeps them distinct per page rather than collapsing into one.
Because this is pure JSX restructuring (unlike the earlier CSS-extract
refactor, which recomputed pixel values through Tailwind arbitrary
values/CSS custom properties), a single clean "after" render per state is
enough to confirm correct wiring — no paired before/after pixel diff
needed this time.

**E2E regression**: `01`/`02`/`03` against `89a2ee8` (`login.tsx` is one of
the touched files). 4 runs: clean, 1-failure-cold-start (known pattern),
clean, then one run failed both `01` and `03` on an already-warm server
with no cold-start explanation available — DB showed the appointment
already `proposal`/"Reschedule Pending" at the very start of that run,
before spec `01` had done anything. Re-verified twice more from a
confirmed-clean starting state: both 3/3 clean. Logged rather than
hand-waved away, since it doesn't fit the usual cold-start pattern, but
not chased further given the touched-file diff has zero logic changes
relevant to the reschedule flow.

**Visual check — 13 states across 10 pages**, captured via direct
navigation against a running `next dev`:

| Page | State | Result |
|---|---|---|
| `/auth/login` | form | ✅ |
| `/auth/signup` | form | ✅ |
| `/auth/forgot-password` | form | ✅ |
| `/auth/forgot-password` | success | ✅ (`Logo` + `IconBadge` wired correctly) |
| `/auth/reset-password` | form (valid token) | ✅ |
| `/auth/reset-password` | error (no token) | ✅ |
| `/auth/confirm` | unknown (no code) | ✅ |
| `/auth/patient-welcome` | — | ✅ pixel-identical to prior verification |
| `/auth/professional-welcome` | — | ✅ pixel-identical to prior verification |
| `/feedback` | form | ✅ |
| `/join/[professionalId]` | 404 | ✅ (`max-w-sm` card correctly kept distinct from `AuthCard`'s `max-w-md`) |
| `/join/[professionalId]` | valid | ⚠️ not verified — see below |
| `/account/delete` | form | ✅ (`Logo`, not `BrandMark`, matching the diff) |

Not verified, with reasons (relied on the diff review instead, which
already confirms these are unchanged JSX):
- **`/join/[professionalId]` valid state** — not a refactor issue, a test-
  data gap: the page queries `professionals` on `user_id`, and the doctor
  test account's id didn't match under that column (unrelated to this PR
  — the query itself wasn't touched).
- **`/auth/confirm` signup/recovery states** — require a real Supabase
  auth `code` from an actual signup/recovery email; not practical to
  fabricate safely.
- **`/auth/reset-password` success state** — reaching it means actually
  submitting a new password for the test account, which would break its
  known credentials for every other E2E spec. Skipped deliberately.
- **`/auth/signup` success state** — reaching it means actually creating
  a new account. Skipped to avoid stray test accounts.
- **`/account/delete` done state** — reaching it means actually
  submitting an account-deletion request against the test account.
  Skipped — too destructive to trigger for real.

**Found and fixed a test-methodology bug, not an app bug**: the
`reset-password` form-state screenshot initially came back identical to
the error state. Isolated with a dedicated diagnostic spec: visiting
`/auth/reset-password` with no token *first*, in the same browser
context, leaves the Supabase client such that a *later* visit with a
valid access-token hash silently fails `setSession()` — reproduced
directly (hash-first works, hash-after-no-hash-visit doesn't). Confirmed
this is pre-existing and unrelated to this PR (the page's session
`useEffect` is byte-identical in the diff, only the wrapper JSX changed).
Fixed by capturing the form-state screenshot in a fresh browser context
before touching the no-hash state. Worth knowing if this project ever
writes a real E2E spec for password reset: don't visit the no-token state
before the token state in the same context.

## PR #6 verification (`refactor/css-dedupe-utilities`)

Follow-up to PR #5: 9 named CSS classes (`field-label`, `text-input`,
`error-banner`, `spinner-white`, `link-teal`, `back-link`, `auth-heading`,
`auth-footer-text`, `icon-status`) replacing duplicated utility-class
strings across the same auth-page cluster plus `BookingClient`'s status
icon/spinner. Read the full diff (all 10 files) before running anything:
every one of the 9 classes is defined in `globals.css` via Tailwind's
`@apply` directive, and every usage site swaps in the class name for the
*exact* utility string the class was defined from — verified each
substitution matches its `@apply` definition, not just "looks about
right." This makes the risk profile meaningfully lower than PR #5:
`@apply` is a build-time CSS compilation, so the rendered output is
provably identical regardless of which component uses the class — not a
runtime-computed value like the CSS-custom-property work in the original
`css-extract` refactor.

**Live verification, precisely scoped this time** (see the PR #5 lesson
above about summary-row precision): ran the E2E suite twice, both clean
3/3. Spot-checked all 9 classes across 4 pages via direct navigation and
one triggered error state — login (form + `error-banner` via bad
credentials), signup (form), forgot-password (success state:
`icon-status`, `auth-heading`, `auth-footer-text`, `link-teal`),
account/delete (form, including the `text-input resize-none` compound
class on the textarea). All pixel-identical to the equivalent PR #5
screenshots, as expected for a pure class-name swap.

**Not live-checked, by design**: `BookingClient`'s confirmation screen —
the only two classes it uses (`icon-status`, `spinner-white`) are both
already covered by the spot-check above on other pages, and `@apply`
guarantees identical output regardless of usage site. Reaching that
screen live means driving the full booking flow (procedure selection,
slot picking, contact form, submit) and creating a real tentative booking
in the shared test data for close to zero marginal verification value.
Skipped deliberately, not overlooked — noting explicitly per the PR #5
lesson rather than letting the summary row imply full live coverage.

## PR #7 functional verification (`feat/disable-doctor-discovery`)

The PO decided patients shouldn't be able to search for doctors (puts
doctors in competition with each other) — see the roadmap memory's
"Product decision" entry for the full business context. This PR removes
`/discover`, makes the patient signup invite code required instead of
optional, and enforces that requirement server-side in two parallel
confirm paths (`api/auth/callback/route.ts` and `auth/confirm/page.tsx`
handle different signup entry points but needed the identical fix). Asked
for a real functional pass rather than a code read, given the security
angle — did both.

**Read first, confirmed correct by inspection:**
- Both server-side paths only upsert a `user_roles` "patient" row if the
  invite code resolves via `patient_by_invite_code` or
  `professional_by_invite_code`; otherwise no row is created at all and
  the redirect goes to the new `/auth/invite-required` page instead of
  `/auth/patient-welcome`. No leftover unlinked-patient path.
- Client-side signup form now has a JS guard (`if (role === "patient" &&
  !joinProfId && !inviteCode.trim())`) *and* the input has `required` —
  layered, but the real boundary is server-side either way.

**Live-tested, all correct:**
- Real browser test: selecting "Patient" on `/auth/signup`, filling
  everything except the invite code, and clicking "Create account" stays
  on `/auth/signup` — confirmed via the invite code input's own
  `validationMessage` ("Please fill out this field"), not just "URL
  didn't change."
- `/discover` returns a real `404`, not a broken page.
- Existing patient (`e2e-test-patient@…`) login → `/my-appointments`
  directly, no `/discover` in the redirect chain.
- `/auth/invite-required` renders correctly (`AuthPageShell`/`AuthCard`
  wiring intact, matches the pattern from PRs #5/#6).
- The two RPCs both server-side paths depend on
  (`professional_by_invite_code`, `patient_by_invite_code`) called
  directly with both a real invite code and a bogus one, confirming they
  return exactly what the route's `if (patientData?.length)` /
  `if (profData?.length)` branches assume — the doctor test account had
  no `public_invite_code` set, so one was assigned (`TSTE2E`) to make this
  possible; left in place, it's reusable for future invite-flow testing.

**Not live-tested, and why:** couldn't complete a full signup → email
confirm → redirect round trip for a fresh account (the "valid invite code
end-to-end" and "bypass the client entirely" cases web dev specifically
asked for). `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` is genuinely
malformed — decoding it as a JWT produces garbage, not an expired/wrong-
role token — so there's no way to programmatically confirm a test
account's email without real inbox access. Confirmed "Confirm email" is
in fact still required (a raw `signup` REST call returns no session, just
`confirmation_sent_at`) rather than assuming. This blocked the two most
security-critical live checks; substituted the RPC-level verification
above as the closest available alternative, but it isn't a full
substitute for watching the actual redirect happen.

**🔴 Found a real, reproducible bug — not a code-review nit:**
`my-appointments/page.tsx`'s new logic (added in this PR) to find the
patient's linked doctor for the "Book Appointment" CTA:

```ts
let myProfessionalId = (userRoleData?.invited_by_professional_id as string | null) ?? null;
if (!myProfessionalId && userRoleData?.linked_patient_id) {
  const { data: patientRow } = await supabase
    .from("patients")
    .select("professional_id")
    .eq("id", userRoleData.linked_patient_id as string)
    .maybeSingle();
  myProfessionalId = (patientRow?.professional_id as string | null) ?? null;
}
```

The `patients` table query runs under the *patient's own* session
(`createClient()` here is the per-request cookie-bound client, not a
service client) — and patients can't read the `patients` table via RLS,
not even their own linked row. Reproduced directly: queried the same
`patients` row via REST as the actual test patient (who has
`linked_patient_id` set, `invited_by_professional_id` null — exactly this
code path) and got `[]` back, matching what the Server Component would
see. Confirmed in the real browser too: logged in as this patient,
`/my-appointments` loads fine and shows the real confirmed appointment,
but the "Book Appointment" header link is entirely absent (the JSX gates
it on `{bookPath && (...)}`, and `bookPath` is `null` here).

This only affects patients linked via `linked_patient_id` — i.e.
patients a professional manually pre-added to their patient list, who
later signed up using *that patient's* invite code (`patient_by_invite_code`
matches). Patients who signed up fresh via a *professional's own* invite
code (`invited_by_professional_id`, read straight off `user_roles`, which
patients can read for themselves) are unaffected. Confirmed this is new
code in this PR, not a pre-existing gap, and confirmed no existing
SECURITY DEFINER RPC already bridges this lookup — grepped every
migration mentioning `linked_patient_id`, none of them expose
`professional_id` back to the patient. Needs either a new RPC (matching
the established pattern — `get_professional_working_hours`,
`get_manual_patient_profile` — both exist for exactly this "patient needs
a piece of data RLS would otherwise block" reason) or an RLS policy
addition.

**Not re-run yet:** `e2e/01-03` regression — holding off until the bug
above is addressed, since re-running now would just burn a cycle against
code that's about to change.

## PR #7 round 2 (`6e168e5`) — RPC fixes, retry form, dashboard guard

Web dev's round-2 commit fixed the `linked_patient_id` bridge (now calls
new RPCs `get_linked_professional_id` / `get_professional_public_info`
instead of a direct `patients` table query), added an interactive retry
form on `/auth/invite-required` (any authenticated user can enter a
corrected code without re-signing-up), tightened `dashboard/layout.tsx`'s
patient-exclusion into an explicit professional/secretary allowlist, and
fixed a join-link routing gap in `api/auth/callback/route.ts`. Re-read
every changed file against the diff before testing, same as round 1.

**Cross-repo dependency check — the two new RPCs don't exist yet.** Before
testing the fix, checked whether mob dev's migrations (060–066, on mobile
PR #5) are actually applied to the shared DB, rather than assuming. They
aren't: `get_linked_professional_id` and `get_professional_public_info`
both return `PGRST202` (function not found), and `get_public_clinics` is
still fully callable with the anon key — the backend lockdown from the
original audit is still open. The web code is correct, but until these
migrations land, the round-1 "Book Appointment" bug isn't actually fixed
end-to-end — it'll just fail with an RPC-not-found error instead of a
silent RLS-blocked empty result, same visible symptom (missing CTA).
Flagged to web dev; this is a mob-dev-side blocker, not a web PR defect.

**Live-tested, correct:**
- `e2e/helpers/login.ts`'s fix (`/my-appointments` instead of `/discover`
  in the wait-for regex) works — confirmed via the existing-patient login
  test.
- The retry form's new "already has a role" guard: logged in as the
  existing linked patient (who already has `role: patient,
  linked_patient_id` set), navigated directly to `/auth/invite-required`,
  submitted the valid `TSTE2E` code — correctly refused with "This account
  already has a role and can't be linked as a patient," and confirmed via
  REST that their `user_roles` row was untouched by the attempt.
- Could not test the retry form's *successful* linking path — needs a
  genuinely role-less authenticated account, which needs a fresh
  email-confirmed signup, blocked by the same malformed service-role-key
  issue as round 1. The form's logic was read closely instead: it's
  session-driven (`supabase.auth.getUser()`), not dependent on how the
  user arrived at the page, so the mechanism itself should work for any
  qualifying account — just not independently confirmed live.

**🔴 Found a new, more severe bug — reproduced live on a clean server,
twice:** the `e2e-test-doctor` account is now completely locked out of
`/dashboard`. Login "succeeds" (form submits with no error), then
immediately bounces back to `/auth/login`. Root cause: this account has a
`professionals` row and `user_metadata.role: "professional"`, but *no row
in `user_roles` at all* — confirmed via direct REST query, empty result.
It was seeded via the Supabase admin API early in the project and never
went through the normal signup → callback flow that upserts `user_roles`.
The **old** guard (`if role === "patient" redirect`) let this account
through by accident, since a null role isn't `"patient"`. The **new**
allowlist (`if role !== "professional" && role !== "secretary" redirect
to login`) is more correct in spirit — but for any account whose
`user_roles` row is missing for *any* reason, professional or not, it now
bounces to a login dead-end instead of letting them in or offering a
recovery path. This isn't just a test-account artifact: any real
professional whose `user_roles` row never got created (partial migration,
an older signup path, admin-created account, anything) would hit the same
wall — more severe than the CTA bug from round 1, since it fully blocks
the professional dashboard rather than hiding one button. It also meant
E2E test cleanup couldn't go through the doctor UI at all this round; had
to accept a leftover reschedule proposal via a direct RPC call instead.

Caught web dev mid-edit on this exact file, already drafting a fix (a
`metaRole === "patient"` branch routing to `/auth/invite-required`) —
checked it against the actual doctor account's `user_metadata.role`
before reporting rather than assuming it would help: it's `"professional"`,
not `"patient"`, so that specific branch doesn't cover this case as
drafted. Flagged directly and immediately given they were actively working
on the exact file. Holding this row until a fix lands and I can do a fresh
pass — this is the second severe issue in two rounds on this PR, worth a
careful full re-test rather than a spot-check next time too.

## PR #7 round 3 (`a80071b`) — self-heal fix, 🟢 GREEN

Web dev's fix: `dashboard/layout.tsx`'s guard now self-heals a missing
`user_roles` row instead of bouncing it. If there's no row at all: a
`user_metadata.role === "patient"` case still correctly routes to
`/auth/invite-required` (can't assume patient linkage without a resolved
code); anything else upserts a `professional`/`secretary` role (based on
metadata, default professional) and lets the request continue, mirroring
what the confirmation callback already does for a fresh signup. Read the
diff closely before testing — confirmed the reassignment (`let roleRow`,
falls through to the existing allowlist check afterward with the healed
value) actually takes effect rather than just logging/upserting and still
redirecting.

**Live-tested, confirmed:**
- Reset check: confirmed via REST the doctor account still had zero
  `user_roles` rows going into this test (hadn't been touched since round
  2's failure) — a genuinely unhealed case, not something already fixed by
  a side effect.
- Doctor login → `/dashboard` → `/dashboard/schedule`: works end-to-end
  now, screenshotted. Confirmed via REST immediately after that a
  `user_roles` row was actually created (`role: "professional"`) — this is
  a permanent fix for the account, not a per-request workaround.
- `e2e/01-03` regression: 2 clean 3/3 runs (patient reschedule request,
  doctor accept, doctor decline) — the doctor-dependent specs 02/03 that
  were completely blocked in round 2 now pass normally.
- Cross-repo RPC status: mob dev clarified migrations 060–066 are staged
  on their PR branch, not deployed — `PGRST202` on the two new RPCs is
  *expected* right now, not a defect on either side; resolves once that PR
  merges and migrates. Verified the specific claim that mattered for my
  green light — "UI degrades gracefully, no crash, just falls back to no
  CTA" — live: logged in as the patient, `/my-appointments` renders fully
  and correctly (appointment card, status, reschedule button all present),
  no Next.js error overlay, only the header "Book Appointment" link is
  silently absent, exactly as described. Re-verifying the actual CTA
  linking behavior is a follow-up once PR #5 (mobile) merges and its
  migrations are live — noting here so it isn't forgotten, not blocking
  this PR on it.

**Also noticed, not blocking:** web dev has further proactive consistency
commits in progress uncommitted in the shared checkout as of this pass
(applying the same `metaRole === "patient"` → `/auth/invite-required`
pattern to `subscribe/page.tsx`, matching what's already correct in
`dashboard/layout.tsx` and `auth/login/page.tsx`) — minor hardening, not a
response to anything I found this round, didn't block finalizing this
green light.

**Merge gate: clear on my end for `a80071b`.** Given this PR's track
record (2 severe bugs found and fixed across 3 rounds), worth Copilot
confirming clean on this exact commit too before merge, same as every
other PR this session.

## PR #7 round 4 (`c10796a`) — tightened self-heal, 🟢 GREEN

Two more Copilot findings, both tightening trust boundaries: (1) the
round-3 self-heal granted `professional` off *absent or unrecognized*
metadata rather than positive proof — now it only self-heals to
`professional` when a real `professionals` table row exists for that user
id; anything else with no persisted role and no `professionals` row now
explicitly redirects to login (secretary self-heal still trusts metadata,
since there's no equivalent verification table for secretaries — same
trust level the confirmation callback already places in that field). (2)
the invite-required retry form only checked for an *existing persisted*
role — a role-less professional (exactly the case round 3 fixed) could
open the page directly and attach a patient invite to their own account.
Now gated on `user_metadata.role === "patient"` first, before touching
`user_roles` at all.

**Methodology note — couldn't fully re-test the two accounts change most
directly, and why:** wanted to re-verify with a genuinely role-less
account again, so attempted to delete the doctor's `user_roles` row via
REST to recreate round 3's starting state. The DELETE returned `204` but
a follow-up `SELECT` showed the row unchanged — confirmed via the
migrations (grepped for `user_roles` policies) that there's no `FOR
DELETE` policy on that table at all, only `SELECT`/`INSERT`/`UPDATE` — a
deliberate design (create/update your own role, never delete it
yourself), not a bug, but it means I can no longer reset this account to
role-less via self-service REST. Creating a *different* fresh role-less
account is still blocked by the same malformed-service-key issue as every
prior round. Adjusted the test plan around this rather than skip it:

- **Doctor login regression**: confirmed still reaches `/dashboard/schedule`
  end to end — this doesn't re-exercise the self-heal code path itself
  (the account already has a persisted role from round 3), but confirms
  no regression for the now-common case.
- **Invite-required's new metadata gate — genuinely re-tested**, and this
  one didn't need the contrived role-less state at all: the check is
  `user.user_metadata?.role !== "patient"`, evaluated before any
  `user_roles` read. The doctor account's metadata role is `"professional"`
  regardless of what's persisted in `user_roles`, so logging in as them
  and submitting a code on `/auth/invite-required` directly tests exactly
  this new gate. Confirmed: rejected immediately with the new message
  ("This account wasn't created as a patient signup, so an invite code
  can't be attached here"), not the old "already has a role" message —
  screenshotted. Confirmed via REST the account's `user_roles` row was
  untouched by the attempt.
- **The specific "no `professionals` row + no patient metadata → login"
  branch** (the other half of finding #1) could not be live-tested this
  round — none of the available accounts have that exact shape, and I
  won't risk deleting the doctor's `professionals` row to manufacture one
  given the cascade risk to real appointment/booking data tied to it.
  Read the code closely instead: the `else` branch is an explicit
  `redirect` with no fall-through, structurally identical to the
  already-proven `metaRole === "patient"` branch beside it — sound by
  inspection, just not independently exercised live.
- `e2e/01-03`: clean 3/3 (second consecutive clean run on this PR since
  the round-3 fix).

**Merge gate: clear on my end for `c10796a`. Recommend this as the actual
merge commit**, per web dev's own suggestion — it's the one Copilot's
being asked to confirm against.

## PR #7 round 5 (`1b449fb`) — invite-attach race fix, 🟢 GREEN

Small, scoped: `ignoreDuplicates: true` added to the retry form's upsert
(a losing concurrent request — double-click, second tab — now no-ops
instead of overwriting whatever the winning request wrote), plus the
upsert's `error` is now actually checked before navigating to
`patient-welcome` (previously ignored entirely — a write failure would
silently still show success). Verified `linkFailed` exists in all 15
locale files. Ran `npm run typecheck` independently — clean.

This fix only matters on the successful-link path, which — same as every
prior round — needs a genuinely role-less, patient-metadata account to
reach, still blocked by the malformed service-role key. Verified by code
review (sound: `ON CONFLICT DO NOTHING` semantics are the right fix for
this exact race, and the error check is a straightforward gate). Ran
`e2e/01-03` as the regression check: 2 clean runs after one `.next`
build-cache corruption blip (a recurring infra quirk in this environment,
documented earlier — not code-related, fixed by clearing `.next` and
restarting).

## PR #7 round 6 (`37a01c4`) — upsert-error checks + root-page fix, 🟢 GREEN

Two more Copilot findings on code outside this round's own diff, caught on
a re-scan: (1) the two *original* confirmation entry points
(`api/auth/callback/route.ts`, `auth/confirm/page.tsx`) had the same
silently-ignored-upsert-error bug round 5 fixed in the retry form —
`linked` was hardcoded `true` right after the upsert call regardless of
whether it actually succeeded. Now `linked = !upsertError` in both places.
(2) Root `page.tsx`'s patient redirect went straight to `/my-appointments`
based on `user_metadata.role` alone, with no check for the pending/
role-less case — could land a patient whose invite never resolved on a
page with no retry CTA and nothing to look at. Now mirrors the exact
pattern already proven in `dashboard/layout.tsx` and `auth/login/page.tsx`:
checks `user_roles`, redirects to `/auth/invite-required` if there's no
persisted role.

**Live-tested:**
- Root page's *existing* branch (patient with a real linked role,
  visiting `/` directly) still correctly lands on `/my-appointments` —
  confirmed with the real test patient account.
- Doctor login regression: still reaches `/dashboard`.
- `e2e/01-03`: clean 3/3.

**Not independently live-tested, same reason as every round-5/6-adjacent
case:** the *new* root-page branch (`metaRole === "patient"` with no
persisted role → `/auth/invite-required`) needs the same unavailable
account shape. The two upsert-error-check changes are the same
one-line pattern already verified correct in round 5's identical fix to
the retry form — not re-derived from scratch, just confirmed consistent.

**Merge gate: clear on my end for `37a01c4`. This supersedes round 4 as
the recommended merge commit** — it's a strict superset (round 4 +
5 + 6's fixes), and per web dev's message this is the one Copilot's final
confirmation is being requested against.

## iOS — open question

Same answer as the mobile repo's `TESTING.md`: not applicable to this repo
directly, but worth noting here since browser E2E doesn't have the native
Xcode constraint mobile does — Playwright's WebKit engine *can* run on
Windows/Linux without a Mac, so if Safari-specific web bugs ever matter,
add a `webkit` project to `playwright.config.ts`. Not done yet since
Chromium coverage is the priority while the E2E layer is brand new.
