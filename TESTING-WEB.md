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
| CSS dedupe — utility classes (field-label/text-input/error-banner/spinner-white/link-teal/back-link/auth-heading/auth-footer-text/icon-status) | `refactor/css-dedupe-utilities` (PR #6, commit `0759d6e`) | `e2e/01-03` (regression, 2 clean runs) + spot-check of all 9 classes across 4 representative pages | 🟢 GREEN — see "PR #6 verification" below | 2026-09-24 |

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

Same answer as the mobile repo's `TESTING.md`: not applicable to this repo
directly, but worth noting here since browser E2E doesn't have the native
Xcode constraint mobile does — Playwright's WebKit engine *can* run on
Windows/Linux without a Mac, so if Safari-specific web bugs ever matter,
add a `webkit` project to `playwright.config.ts`. Not done yet since
Chromium coverage is the priority while the E2E layer is brand new.
