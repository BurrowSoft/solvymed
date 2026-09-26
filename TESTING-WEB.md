# Testing notes (web)

Working notes on setting up automated (E2E) testing for the SolvyMed web
dashboard, kept as we go rather than written up after the fact. Unit tests
(Vitest + RTL) already existed before this — this file is specifically about
the new E2E layer. Companion to `TESTING.md` (mobile E2E flows, in the
`solvymed-mobile` repo) and `DEVELOPING.md` (overall workflow, in both
repos).

## Merge gate

**Current gate (since 2026-09-26), all three required on the exact HEAD being merged:**
1. **Code review:** the dedicated **code reviewer** agent (never the PR's
   author) reviews the exact HEAD and posts findings on the PR, tagged
   BLOCKING or FOLLOW-UP. Only BLOCKING findings (correctness, security,
   data loss, crash, real UX break) must be fixed; follow-ups go to the
   post-launch list. Re-rounds cover only the new delta, and any commit
   after a clean review needs a quick delta check before merging. Web
   tester records it here as "review: clean at `<SHA>`".
2. **Web tester's 🟢** in this file, scoped to that SHA (a docs-only
   addendum on top is fine after the code reviewer's delta check).
3. **CI:** the required "Typecheck and unit tests" check is green (branch
   protection enforces it).

GitHub Copilot review is **retired** (user decision, 2026-09-26), so
don't request `@copilot`. Mentions of Copilot in the entries below are
historical records of how those PRs were reviewed.

Merging to `master` deploys to production (www.solvymed.com).

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
| ↳ round 7 (my-appointments direct-access guard + label a11y fixes) | same PR, commit `5adbcac` | typecheck + `e2e/01-03` (regression, clean) + real accessibility test (label-click-focuses-input, not just DOM presence) | 🟢 GREEN — see "PR #7 round 7" below | 2026-09-24 |
| ↳ round 8 (privilege-escalation fix: removed client-controlled secretary self-heal) | same PR, commit `bfbb71d` | typecheck + `e2e/01-03` (regression, clean 3/3 after a `.next` corruption blip) + doctor self-heal regression + code review of the deleted branch | 🟢 **GREEN — recommend this as the merge commit instead of round 7** — see "PR #7 round 8" below | 2026-09-25 |
| ↳ round 9 (consistency fix: guard original confirm flows against role overwrite) | same PR, commit `7e3ea04` | code review only (narrow, same pattern as an already-proven guard) | 🟢 GREEN — see "PR #7 round 9" below | 2026-09-25 |
| ↳ round 10 (root-page redirect ordering fix: persisted role before metadata) | same PR, commit `00f4914` | typecheck + `e2e/01-03` (regression, clean 3/3) + real metadata-tampering reproduction of the exact bug precondition | 🟢 GREEN — see "PR #7 round 10" below | 2026-09-25 |
| ↳ round 11 (invite-linking rebuild on mob dev's new RPC/confirmation model) | same PR, commits `3d1ee98`..`1daad5a` (rebuild `0104398` + eligibility/error-propagation fix `1daad5a`) | typecheck + `e2e/01-03` (regression, clean 3/3) + live test of the one reachable new guard (professional at `/my-appointments` → `/dashboard`) + full code review of the 3-state routing rebuild across 6 entry points | 🟡 GREEN for what's testable then — see "PR #7 round 11" below | 2026-09-25 |
| ↳ round 12 (migrations 060-071 now live: closed role-less-professional self-heal gap, locale-prefix fix) | same PR, commit `f713a70` | typecheck + `e2e/01-03` (regression, clean 3/3) + doctor login regression + live RPC probing confirming `link_patient_by_invite_code`/`link_by_professional_public_code` are genuinely deployed + code review of the self-heal removal and invite-required hardening | 🟡 GREEN for what's testable — see round 12 below | 2026-09-25 |
| ↳ round 13 (remaining locale-prefix misses: callback route, root page, my-appointments) | same PR, commit `d941823` | typecheck + `e2e/01-03` (regression, clean 3/3) + 2 live tests confirming the fix actually works (non-English prefix survives the redirect chain, both authenticated and not) | 🟢 GREEN — see "PR #7 round 13" below | 2026-09-25 |
| ↳ round 14 (last locale-prefix miss: join-flow redirect) | same PR, commit `615a3c2` | typecheck + `e2e/01-03` (regression, clean 3/3) + code review (same already-proven `localePrefix` mechanism from round 13, one-line application) | 🟢 **GREEN — recommend this as the merge commit for what's currently testable** — see "PR #7 round 14" below | 2026-09-25 |

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

## PR #7 round 7 (`5adbcac`) — my-appointments guard + a11y fixes, 🟢 GREEN

Narrowly scoped, matching web dev's description: (1) `my-appointments/page.tsx`
was the one direct-access route missing the pending-patient guard every
other entry point (`/`, `/dashboard`, `/auth/login`) already had — a
role-less patient-metadata account could open it directly and see an
empty appointments page with no way back to the retry form. Now checks
`userRoleData?.role` and redirects to `/auth/invite-required` if missing,
same pattern as everywhere else. (2) the invite-code `<label>`s on
`/auth/signup` and `/auth/invite-required` weren't associated with their
`<input>`s via `htmlFor`/`id` — now they are.

**Live-tested, both genuinely verifiable this round — no infra
limitation:**
- Accessibility fix: real test, not just checking the DOM has matching
  `for`/`id` attributes — clicked each `<label>` and asserted the
  associated `<input>` actually received focus (the real behavioral proof
  a screen reader / label click depends on). Both pass on
  `/auth/signup` (role: patient selected first) and
  `/auth/invite-required`.
- `my-appointments`'s *existing* behavior (normal linked patient landing
  there via login) still works — confirmed with the real test patient.
- `npm run typecheck`: clean. `e2e/01-03`: clean 3/3.

**Still not independently live-tested:** the new guard's actual redirect
branch, for the same reason as every prior round — needs a role-less,
patient-metadata account, still blocked by the malformed service-role
key. Verified by code review: identical one-line pattern to the guards
already proven correct in rounds 3/4/6, applied to a route that had been
missed.

**Merge gate: clear on my end for `5adbcac`. Recommend this as the merge
commit**, superseding round 6 — narrowly scoped as described, nothing
else changed.

## PR #7 round 8 (`bfbb71d`) — privilege-escalation fix, 🟢 GREEN

Copilot caught a genuine privilege-escalation hole in `dashboard/layout.tsx`'s
self-heal logic (added round 3): `user_metadata` is client-writable via
`supabase.auth.updateUser()`, and the secretary self-heal branch trusted it
directly with no independent verification — unlike the professional
self-heal, which only fires after confirming a real `professionals` table
row exists. Any authenticated account, including a role-less pending
patient, could set `role: "secretary"` in their own metadata and
self-provision `/dashboard` access just by visiting it. Fixed by deleting
the branch entirely — there's no equivalent verification table for
secretaries, so the only safe answer is not to self-heal it. A secretary
with a genuinely missing `user_roles` row now falls through to
`/auth/login` unverified, same as anyone else.

**Verified by code review (high confidence — this is a deletion, not a new
conditional):** diffed `5adbcac..bfbb71d` on `dashboard/layout.tsx` and
confirmed the `else if (metaRole === "secretary") { ...upsert... }` branch
is completely gone, replaced with a comment explaining why. There's no
remaining code path anywhere in the file that writes a role based on
`user_metadata` alone — the only self-heal left is the professional one,
gated on a real `professionals` row.

**Live-tested:**
- Doctor login (the professional self-heal path, untouched by this fix) —
  confirmed still reaches `/dashboard` cleanly, both in isolation and as
  part of a full clean `e2e/01-03` run.
- `npm run typecheck`: clean. `e2e/01-03`: 3/3 clean (see note below — the
  first attempt hit a `.next` corruption blip, not a regression).

**Deliberately not attempted — metadata-tampering test on the patient
account:** web dev asked if I could simulate a patient setting their own
metadata to `role: "secretary"` and confirm they still can't reach
`/dashboard`. I considered this but decided against actually doing it, for
a reason specific to this fix rather than the usual service-role-key
limitation: my only patient account already has a *persisted* `user_roles`
row (`role: "patient"`). `dashboard/layout.tsx` checks `roleRow?.role`
first and redirects patients to `/my-appointments` **before** the code ever
reaches the self-heal block — so tampering with that account's metadata
would test persisted-role-priority (a real but different property), not
the actual vulnerability, which only ever existed for accounts with **no**
persisted role. I don't have a role-less account to test with (confirmed
back in round 4: `user_roles` has no `DELETE` policy, so neither test
account can be reset to role-less), and manufacturing one by stripping the
doctor's real `professionals` data isn't something I'm willing to do to a
shared seed account. Given the fix is a clean deletion of the only
metadata-trusting code path, code review already answers the question with
high confidence; a live test here would've added risk (real, if reversible,
tampering with the patient account's metadata) without actually exercising
the vulnerable precondition. Flagging this transparently rather than
skipping it silently.

**`.next` corruption note:** the first `e2e/01-03` attempt this round hit
the same recurring corruption pattern documented earlier in this PR
(`ENOENT: routes-manifest.json` / `app-paths-manifest.json`) after a fresh
`rm -rf .next` + restart — some requests during the cold compile raced the
manifest write and the dev server never recovered on its own. Killed the
process, force-killed anything still on port 3000, `rm -rf .next`,
restarted clean, then hit a second, unrelated snag: leftover
"Reschedule Pending" state on the shared test appointment from an earlier
interrupted run (spec 01 timed out waiting for a request button that
wasn't there because a request was already pending). Cleared it by running
spec 02 alone (accepts the pending request, returning the appointment to
`confirmed`), then re-ran `01-03` fresh — clean 3/3. Neither issue is an
app bug; both are shared-environment/test-state artifacts, now documented
here for whichever agent hits them next.

**Merge gate: clear on my end for `bfbb71d`. Recommend this as the merge
commit**, superseding round 7 — this is the fix for the most severe finding
in the PR so far and code review gives it unusually high confidence.

## PR #7 round 9 (`7e3ea04`) — guard original confirm flows against role overwrite, 🟢 GREEN

Consistency fix per web dev: the invite-required retry form already refused
to touch an account with an existing `user_roles` row (added round 4), but
the two *original* confirmation entry points —
`api/auth/callback/route.ts` and `auth/confirm/page.tsx` — didn't have the
same guard. Without it, an `onConflict` upsert on either path could
silently overwrite an existing professional/secretary/already-linked-patient
role if the handler ever ran again for such an account. Both now check for
an existing `user_roles` row first and redirect based on it
(`/my-appointments` if already patient, `/dashboard` otherwise) instead of
proceeding to the invite-code upsert.

**Verified by code review only, high confidence:** diffed `bfbb71d..7e3ea04`
on both files. The added guard is the identical `existingRole` check +
early-return pattern already live and reasoned-about in
`auth/invite-required/page.tsx` since round 4 — narrow, 2-file change, no
new logic shape introduced. Not independently live-tested for the same
reason as almost every edge case in this PR: exercising it needs a fresh
signup/confirmation flow, which needs a working `SUPABASE_SERVICE_ROLE_KEY`
to create test accounts — still malformed, unfixed all PR. Didn't re-run
`e2e/01-03` for this round specifically since the change is confined to
signup/confirmation code paths the permanent suite doesn't touch (it uses
pre-existing, already-authenticated accounts) — round 8's clean 3/3 run
already covers the reschedule flows this PR could plausibly have affected.

**Merge gate: clear on my end for `7e3ea04`. Recommend this as the merge
commit**, superseding round 8 — narrow consistency fix, same reasoning
pattern as round 5's invite-attach fix (also code-review-only, also a
proven pattern applied to a missed spot).

## PR #7 round 10 (`00f4914`) — root-page redirect ordering fix, 🟢 GREEN

Copilot finding, narrow: `page.tsx` (root landing) checked
`user_metadata.role === "patient"` *first*, and only used the persisted
`user_roles` row as a truthy flag inside that branch — so a
professional/secretary whose client-writable metadata happened to say
`"patient"` would get routed to `/my-appointments` instead of `/dashboard`.
Reordered to check the persisted role first: `roleRow?.role === "patient"`
→ `/my-appointments`; no persisted role at all + metadata says patient →
`/auth/invite-required`; otherwise `/dashboard`. Same persisted-role-first
pattern already used everywhere else in this PR (`dashboard/layout.tsx`,
`auth/login`, `subscribe`).

**This one I could actually live-test properly**, unlike round 8 — the bug
here didn't depend on having a role-less account; it reproduced on *any*
account whose metadata and persisted role disagreed, which I can safely
and reversibly manufacture on an account that already has a persisted
role. Recorded the doctor account's exact `user_metadata` first
(`role: "professional"`, rest unchanged), then via the Supabase Auth REST
API (`PUT /auth/v1/user` with the doctor's own access token — the same
mechanism `supabase.auth.updateUser()` uses client-side, i.e. faithfully
reproducing the actual attack vector) set `role: "patient"` in their
metadata while their `user_roles` row still says `professional`. Logged in
as the doctor through the real login form and visited `/`: landed on
`/dashboard`, confirming persisted role now wins regardless of tampered
metadata — this is precisely the bug Copilot flagged, and it's fixed.
Restored the doctor's metadata to the exact recorded original immediately
after (verified by re-fetching it — byte-for-byte match) before running
anything else.

**Also live-tested:** `npm run typecheck` clean; `e2e/01-03` clean 3/3
(fresh run after the metadata was restored, confirming no side effects
from the tamper/restore cycle on the account's normal behavior).

**Infra note:** hit the `.next` corruption pattern a third time this PR
partway through this round (`MODULE_NOT_FOUND: ./vendor-chunks/@supabase.js`
this time, different symptom, same root cause) — happened to land while
the doctor's metadata was mid-tamper. Restored the metadata first (before
touching the server at all), then killed the process, force-killed
anything left on port 3000, `rm -rf .next`, restarted, and re-ran the full
tamper → test → restore cycle clean. Worth noting for whoever owns this
next: prioritizing the data-safety cleanup (metadata restore) over the
infra fix when both are needed at once is the right order — a stuck dev
server is fully recoverable, a stale tampered account is a live gap until
it's fixed.

**Merge gate: clear on my end for `00f4914`. Recommend this as the merge
commit**, superseding round 9. This is the last Copilot finding I'm aware
of as of this write-up; if it comes back clean, this PR should be ready to
merge.

## PR #7 round 11 (`3d1ee98`..`1daad5a`) — invite-linking rebuild, 🟡 GREEN for what's testable

Real architecture change, not a patch: mob dev's PR #5 review cycle revoked
the RPCs this PR's invite-linking depended on
(`patient_by_invite_code`, `professional_by_invite_code`) and introduced a
confirmation-based linking model instead — `link_patient_by_invite_code`
(a patient invite code: immediate full link) and
`link_by_professional_public_code` (a doctor's public code: sets a
*pending* state via `invited_by_professional_id`, doctor must call
`confirm_and_link_patient` before the patient is fully connected via
`linked_patient_id`). Every role-branching route now handles 3 states
instead of 2: no role / pending-confirmation / fully-linked. New page:
`/auth/pending-confirmation`, with a manual "check again" button
(`get_linked_professional_id()`).

**Reviewed in three parts:**
1. `3d1ee98` (checkpoint before the rebuild) — added the same
   non-patient-role guard `dashboard/layout.tsx` already had, to
   `my-appointments/page.tsx`, in reverse. Fully subsumed by `0104398`'s
   final version of the same file — reviewed as part of the rebuild, not
   separately.
2. `0104398` (the rebuild itself) — diffed against `00f4914` (last commit I
   tested) across all 6 role-branching entry points
   (`page.tsx`/root, `auth/login`, `dashboard/layout.tsx`,
   `subscribe/page.tsx`, `my-appointments/page.tsx`,
   `api/auth/callback/route.ts` + `auth/confirm/page.tsx` in lockstep as
   always). Every one applies the identical 3-check pattern in the same
   order (`linked_patient_id` → fully linked; `invited_by_professional_id`
   alone → pending; anything else falls through to the prior 2-state
   logic) — consistent, no route missed. Confirmed `linked_patient_id`
   is checked *before* `invited_by_professional_id` everywhere, which is
   the right priority even in a hypothetical future where both end up set
   simultaneously post-confirmation. Also checked: `AuthCard`'s `centered`
   prop (used by the new page) already exists; all 15 locale files got the
   same 6 new `pendingConfirmation.*` keys with real (not copy-pasted)
   translations — spot-checked `pt-BR` and `ja` against the keys actually
   referenced in the new page.
3. `1daad5a` — two fixes: (a) both invite-code RPC calls in
   `confirm/page.tsx` and `api/auth/callback/route.ts` were destructuring
   only `data`, silently discarding `error` — a transient RPC failure
   would have looked identical to "code doesn't match anything" and
   cascaded into calling the *second* RPC too. Now checks `error` after
   each call and redirects to `/auth/invite-required` without the
   cascade. (b) `invite-required/page.tsx`'s eligibility gate reordered to
   check the persisted role (`existingRole?.role === "professional" |
   "secretary"`) before the client-writable `user_metadata.role` check —
   not a security fix (the old order still rejected such accounts, just
   with a less accurate error message: "already has a role" instead of
   "not a pending patient"), but the right call given this PR's round-8/10
   lesson about not trusting metadata first. Comment in the diff notes the
   *actual* authorization boundary is server-side now (migrations 070/071,
   mob dev's), which reject non-eligible callers inside the RPCs
   themselves regardless of what this client-side check shows.

**Live-tested — the one guard reachable without the new RPCs:** the
`my-appointments` professional/secretary guard doesn't depend on any new
RPC, only the existing `user_roles.role` column, so I could test it for
real: logged in as the doctor account and navigated directly to
`/my-appointments` — redirected to `/dashboard` as expected.

**Not independently live-testable, same limitation stated explicitly by
web dev up front:** the new linking RPCs themselves
(`link_patient_by_invite_code`, `link_by_professional_public_code`,
`confirm_and_link_patient`) and therefore the `pending-confirmation` page's
actual content and the 3-state routing's `pending` branch specifically —
mob dev's migrations for these aren't deployed to the shared DB yet
(expect `PGRST202` same as every prior "successful invite-link" gap in
this PR). Once they land, this needs a real end-to-end pass: signup with
each code type, doctor confirmation, the pending page's "check again"
button, and the 3-state routing exercised for real rather than by
inspection.

**Also live-tested:** `npm run typecheck` clean (run twice — once after
`0104398`, once after `1daad5a`); `e2e/01-03` clean 3/3 on a fresh server
(none of these routes are on the reschedule flows' path, so this is a
regression check, not direct coverage).

**Infra note — worth flagging explicitly:** hit the `.next` corruption
pattern repeatedly this round, more than any prior round (at least 4
times), closely correlated with `git pull`ing web dev's pushes while my
dev server was live and watching the working directory — a pull mid-run
seems to reliably trigger it now. One retry of `e2e/03` even failed with a
*different*, unrelated-looking error ("no available slots for the
selected day") that turned out to just be collateral damage from the
server already being in a half-corrupted state at the time — a full
kill+`rm -rf .next`+restart made it disappear on the very next run, and
working-hours/appointment-density data checked out fine via direct REST,
ruling out a real slot-availability bug. Documenting this correlation in
case it helps whoever's chasing `.next` corruption next: **kill and
restart the dev server after every pull, don't just trust
`reuseExistingServer`.**

**Merge gate: not applicable yet — this round doesn't stand alone.**
Everything reviewable right now is sound; the round isn't closeable until
mob dev's migrations deploy and I can run the actual linking flows. Not
recommending a merge commit for PR #7 as a whole until that pass happens.

## PR #7 round 12 (`f713a70`) — migrations live, self-heal gap closed, 🟡 GREEN for what's testable

Mob dev's migrations 060-071 are now live in prod. Verified this directly
rather than trusting it secondhand: called `link_patient_by_invite_code`
and `link_by_professional_public_code` via REST with deliberately invalid
codes — both responded correctly (`false` / `invalid_public_code`
respectively) instead of the `PGRST202` I'd gotten every time before this
round. Real deployment, not a schema-cache fluke.

**`f713a70`'s two fixes, both code-reviewed, high confidence:**
- **Locale-prefix fix** in `auth/confirm/page.tsx`: the patient-flow
  redirects (`/my-appointments`, `/auth/pending-confirmation`,
  `/dashboard`, `/auth/invite-required`, `/auth/patient-welcome`) were all
  missing the `${prefix}` every other redirect in this PR already uses for
  non-English locales — a non-English patient completing signup would've
  landed on the English-URL version of the page instead of their own
  locale. Straightforward, mechanical, matches the existing pattern
  exactly.
- **Removed `dashboard/layout.tsx`'s professional self-heal entirely** (the
  one I verified as sound back in round 3/4). Reason: the
  professionals-table check it relied on turned out to be an unsound
  signal — legacy pre-071 accounts can have a `professionals` row
  regardless of their actual role, so a patient with client-writable
  `user_metadata.role` set to `"professional"` could in principle satisfy
  that check too, if they also happened to have a stray professionals row,
  and self-provision a persisted professional role via the upsert. There's
  no way to distinguish "a real professional whose `user_roles` row is
  missing" from that case with the current data model, so a role-less
  account now always falls through to `/auth/login`, full stop — a
  legitimate professional in that state needs a real data fix, not an
  app-layer guess. `invite-required/page.tsx` got the same hardening in
  parallel (added a `professionals`-table cross-check alongside the
  existing `user_roles.role` check, rejecting role-less-but-has-a-
  professionals-row accounts too) — this one really is defense-in-depth,
  since the doc comment is explicit that the actual boundary lives
  server-side in the linking RPCs now.
- This doesn't create a regression for the existing doctor test account: it
  already has a persisted `user_roles` row (written back in round 3, before
  `DELETE` on `user_roles` was confirmed blocked), so it never re-enters
  the removed code path at all — confirmed with a live login regression
  test, clean.

**What I could and couldn't test given migrations are live:**

The good news — the two linking RPCs respond correctly and the routing
logic around them is sound by inspection. The bad news — I still can't
exercise the actual "patient enters a code and gets linked" flow
end-to-end, for two separate reasons, neither of which is new this round:

1. **No fresh, role-less test account.** Creating one needs either a real
   signup completed through email confirmation (I have no inbox to read
   a confirmation link from) or an admin-created pre-confirmed account
   (needs `SUPABASE_SERVICE_ROLE_KEY`, which has been malformed all PR —
   checked again this round, still not a valid JWT). This is the same
   long-standing gap, independent of mob dev's migrations — migrations
   deploying doesn't unblock it.
2. **No web UI to get or use a doctor's side of either code type**, as far
   as I can find. Grepped the whole `dashboard/` tree: `patients/[id]` has
   an `invite_code` field in its type definition but it's never rendered
   anywhere in the JSX — a doctor has no way to see or share a patient
   record's invite code from the web app. There's also no "public code"
   display anywhere, and `confirm_and_link_patient` (the doctor-confirms-a-
   pending-patient RPC) has zero call sites in this repo — only mentioned
   in comments. Probed it directly too: it exists, but with a different
   parameter (`p_appointment_id`, per the RPC's own error hint) than what
   the comments describe (`p_patient_auth_id`) — worth double-checking
   with mob dev, since if the web app were ever meant to call this
   directly, the assumed signature is wrong. **Asked web dev directly:
   is the doctor-side of this (generating/sharing a code, confirming a
   pending patient) mobile-only / out of scope for this web PR, or a
   missing piece?** That answer determines whether "full end-to-end from
   the web app alone" is even a coherent goal for this PR.

**Also live-tested:** `npm run typecheck` clean; `e2e/01-03` + doctor login
regression, all clean 4/4 on a fresh server (restarted after the pull,
per the round 11 lesson — no `.next` corruption this time).

**Merge gate: code review clear for `f713a70`'s own changes, but PR #7 as
a whole still isn't closeable** — same reason as round 11, now with a
sharper picture of exactly what's missing for a true end-to-end pass.
Waiting on web dev's answer to the scope question above before deciding
what "full" testing even means here.

## PR #7 round 13 (`d941823`) — remaining locale-prefix misses, 🟢 GREEN

Copilot's fresh review (triggered on `f713a70`, which touched
`dashboard/layout.tsx` and `invite-required/page.tsx`) surfaced 3 more
instances of the same locale-prefix bug class in code that hadn't changed
in that round, so it hadn't been re-flagged until this pass: root
`page.tsx`, `my-appointments/page.tsx`, and `api/auth/callback/route.ts`.
Mechanical fix, same pattern as everywhere else in this PR — except the
callback route needed a different mechanism, since it's a Route Handler
with no `[locale]` URL segment to read from. It derives locale from the
`NEXT_LOCALE` cookie instead, falling back to the default locale if unset
or invalid.

**Didn't just take the cookie approach on faith — traced it through
`middleware.ts`:** the custom geo-redirect logic only sets `NEXT_LOCALE`
on a narrow first-visit path (unprefixed URL, cookie not already set, geo
locale ≠ en), which on its own would NOT keep the cookie in sync with a
user who navigates straight to a prefixed URL like `/pt-BR/auth/signup`
without ever hitting `/`. But `routing.ts` has no `localeCookie: false`
override, so next-intl's own `createMiddleware(routing)` call (which runs
on every request that isn't caught by an earlier branch) applies its
default behavior of writing `NEXT_LOCALE` to match whatever locale segment
the current request resolved to — so the cookie does stay in sync with
the last locale-prefixed page visited, confirming the fix's assumption is
sound rather than just plausible-sounding.

**Live-tested, not just code-reviewed:** logged in as the linked patient,
visited `/pt-BR` (no session cookie needed to establish `NEXT_LOCALE` —
just visiting the prefixed URL itself is enough per the mechanism above),
and confirmed the redirect landed on `/pt-BR/my-appointments`, not the
bare `/my-appointments`. Separately, cleared cookies and visited
`/pt-BR/my-appointments` unauthenticated — redirected to
`/pt-BR/auth/login`, confirming the unauthenticated branch's fix too.
Both real reproductions of the bug class, not just diff inspection.

**Also live-tested:** `npm run typecheck` clean; `e2e/01-03` clean 3/3.

**Merge gate: clear on my end for `d941823`.** This closes out every
locale-prefix instance Copilot has found across this PR's history.
Recommending it as the merge commit for whatever's currently mergeable.

**Addendum — scope question from round 12 resolved:** mob dev confirmed
the doctor-side UI (invite code display, `confirm_and_link_patient`) is
mobile-only by design for this PR cycle, not a web-repo gap — nothing
missing on this side. Also confirmed `confirm_and_link_patient`'s real
parameter is `p_appointment_id` (looks up the patient internally), not
`p_patient_auth_id` as the stale comments said; no web call sites, so
nothing to fix here either way. This narrows what "full end-to-end from
the web app" even means: the web side's job is patient enters a code →
immediate link or `/auth/pending-confirmation` → (confirmation happens on
mobile, outside my scope) → patient returns, clicks "check again" → sees
linked. That's still not independently live-testable by me — same
`SUPABASE_SERVICE_ROLE_KEY` blocker as ever, now explicitly confirmed by
mob dev as a known, unresolved infra gap on both repos (needs the user to
either provide a valid key or temporarily disable confirm-email), not
something fixable from inside either PR.

## PR #7 round 14 (`615a3c2`) — last locale-prefix miss, 🟢 GREEN

One more Copilot catch on the re-review of `d941823`: the doctor's direct
join-link redirect (`/join/[professionalId]`, the `joinProfId` branch in
`api/auth/callback/route.ts`) was still missing `localePrefix` — it's a
separate code path from the patient invite-code flow (signup via a
doctor's join link goes straight to `/join/{id}` to complete role/link
setup there, same as the mobile-facing confirm flow), so it wasn't
touched by round 13's fix to the other branches in that same function.
One-line change, same `localePrefix` variable round 13 already traced
through `middleware.ts` and live-verified.

**Not separately live-tested:** exercising the `joinProfId` branch needs a
signup that actually went through a doctor's join link
(`user_metadata.join_professional_id` set at signup time) — not something
reachable from my existing accounts without a fresh signup, same
service-role-key limitation as everything else requiring a new account.
Given it's a mechanical one-line application of a mechanism already
proven sound in round 13 (same variable, same redirect pattern, no new
logic), code review is high-confidence here without forcing a live
reproduction that isn't cheaply reachable.

**Live-tested:** `npm run typecheck` clean; `e2e/01-03` clean 3/3.

**Merge gate: clear on my end for `615a3c2`.** This is the last
locale-prefix instance found across the whole PR, as far as either of us
is aware. Recommending it as the merge commit for what's currently
testable — same caveat as rounds 11-14 throughout: the patient
invite-code linking flow itself still isn't independently live-tested,
blocked on the service-role-key infra gap, not on anything in the code.

## Opus review — Phase 1, master audit (2026-09-25)

User-driven team task: a full review and test pass across both repos ahead
of `refactor/opus-review` (web dev's PR #8, broad code-review pass). My
job: test `master` as it stands, thoroughly, across every role/flow, plus
direct REST/RLS authorization probing. Bugs go to web dev for PR #8;
DB/RPC/RLS issues also go to mob dev.

**Unblocked this session's biggest limitation:** the real
`SUPABASE_SERVICE_ROLE_KEY` (mob dev's mobile worktree `.env`, confirmed a
genuinely valid `service_role` JWT — the old one in this repo's `.env.local`
was a placeholder) means fresh, pre-confirmed test accounts are finally
possible. Built a real end-to-end mechanism rather than a shortcut: submit
the actual signup form via Playwright (exercises real client validation +
the real `supabase.auth.signUp()` call), then use the admin API to
`generate_link` a magic-link `hashed_token` for that just-created
(unconfirmed) account and feed it straight to
`/api/auth/callback?token_hash=...&type=magiclink` — this drives the real
confirmation route logic exactly as a clicked email link would, just
skipping the need to read an actual inbox. Tested in an isolated worktree
(`solvymed-master-test`, port 3001) so I didn't disturb web dev's live
`refactor/opus-review` checkout.

**Verified end-to-end for the first time this PR cycle (all 🟢, real
accounts, real confirmation, real DB-state checks via REST):**
- Patient signup with a valid **patient invite code**
  (`link_patient_by_invite_code`) → immediately fully linked
  (`patient-welcome` → `my-appointments`, `linked_patient_id` correct).
- Patient signup with a valid **doctor's public code**
  (`link_by_professional_public_code`) → lands on `pending-confirmation`,
  correct DB state (`invited_by_professional_id` set, no
  `linked_patient_id`). "Check again" correctly no-ops while still
  pending, and correctly proceeds to `patient-welcome` once linked
  (doctor-side confirmation itself is mobile-only per mob dev, so this
  tests the web reaction to that state change, not the confirm RPC).
- Patient signup with an **invalid/non-resolving code** → `invite-required`,
  correct error path.
- **Professional signup** → `professional-welcome` → `dashboard`, correct
  role persisted.
- **Secretary signup** → straight to `dashboard` (no dedicated welcome
  page — confirmed intentional, not a missing page), correct role
  persisted, no crash on `/dashboard/patients` with no attached
  professional yet.

**Finding — reported to web dev + mob dev, not yet fixed:** neither
`patients.invite_code` nor `professionals.public_invite_code` (migrations
010, 013) has a default, trigger, or any generation mechanism anywhere in
either repo — confirmed by creating a patient through the real dashboard
"New Patient" form and checking `invite_code` via REST: `null`. Mob dev
confirmed mobile generates both client-side (`Math.random`, not
server-side) but **web has no equivalent UI at all** — a web-only doctor
currently has no way to ever obtain a code to hand a patient. Mob dev is
adding shared server-side generator RPCs
(`generate_patient_invite_code`, `generate_public_invite_code`) for both
apps to call. Bypassed via the service key to keep testing the linking
mechanics above; this doesn't block them, but blocks the feature being
usable by a real web-only doctor until the UI exists.

**RLS/authorization probing (direct REST, bypassing the UI entirely):**
- 🟢 Patient reading `patients`/`professionals`/`appointments`/`user_roles`
  tables without ID filters: RLS correctly scopes every table to the
  caller's own rows (empty or self-only results, no cross-user leakage
  found).
- 🟢 Professional reading `patients` without a `professional_id` filter:
  correctly scoped to their own patients only, no cross-professional
  leakage.
- 🟢 Anon (apikey only, no user JWT) reading `patients`/`appointments`:
  empty results, correctly blocked.
- 🟢 Patient PATCHing their own appointment `status` directly (bypassing
  the reschedule-request flow): blocked by RLS (403).
- 🟢 Patient PATCHing their own `user_roles.role` to `"professional"`:
  blocked with an explicit, well-designed error — "direct role change
  from patient is not permitted" (a real server-side check, not just
  RLS).
- 🟢 Patient POSTing an appointment with a different `patient_auth_id`
  (booking as someone else): blocked by RLS (403).
- 🔴 **Confirmed independently (mob dev found this first): a
  professional can self-grant an active subscription via a direct PATCH**
  to `/rest/v1/professionals` — `subscription_status: "active"` +
  `current_period_end` set to any future date, no RLS restriction, no
  billing provider check, 200 success. Full premium access forever,
  bypassing Stripe/Asaas entirely. Reproduced live on the shared doctor
  test account, then immediately restored it to `subscription_status:
  "trial"` / `current_period_end: null`. Not re-reporting as new — mob
  dev already has this on their list — documenting here since it's now
  independently confirmed reachable from the web side too.

**Cleaned up:** all `e2e-test-opus-*` auth accounts and `Opus`-labelled
patient records deleted; shared doctor test account's
`public_invite_code`/`subscription_status` reset to their pre-test values.

**Not yet covered (large remaining surface, flagged transparently rather
than claimed done):** deep CRUD coverage per role (schedule, patients,
records, prescriptions, payments, settings), secretary permission
boundaries in depth, cross-cutting concerns (double-submit, back-button
after redirect, expired session, very long inputs) beyond what's already
spot-checked incidentally, and re-probing mob dev's other RLS findings
(reschedule self-accept, broad anon RPC access) once their migration
lands. Continuing in a follow-up pass; this section will grow rather than
restart.

## Opus review — PR #8 (`refactor/opus-review`), commits through `0ac2786`

Web dev's broad code-review pass across the whole repo (correctness,
security, data integrity, swallowed errors, performance, duplication).
Tested in a second isolated worktree (also `solvymed-master-test`,
switched between branches via detached checkout) to avoid the `.next`
corruption that hit repeatedly when running a dev server against the
shared checkout while web dev was actively pushing to it — confirmed the
correlation again this round, worth remembering as standing practice.

**`416b4ad` — Asaas webhook fail-closed fix, 🟢 live-verified:** the
previous code skipped token verification entirely when
`ASAAS_WEBHOOK_TOKEN` wasn't configured, meaning any unauthenticated POST
could activate or expire an arbitrary user's subscription
(`externalReference` is caller-supplied JSON, not cryptographically tied
to Asaas). Tested all three reachable states directly against the running
server: correct token → 200 `{"ok":true}`; wrong token → 401
`Unauthorized`; missing token header → 401. The one path not
independently live-tested is the token-*unconfigured* case (would need a
server restart with the env var unset) — relying on code review there,
which is a trivial, unambiguous one-line fail-closed check, not worth the
restart given the token-comparison logic itself is already proven correct
in both directions.

**`9c7ca73` — UTC→local date fix, 🟢 live-verified:** `.toISOString().split("T")[0]`
is always UTC; used for "now"/"today" it silently returned the wrong
calendar date for most of the world for part of every day (booking
strip's "Today" label, past-slot filtering, doctor schedule's "Today"
button, booking-requests obsolete-cutoff). New `toLocalDateString()`
helper applied consistently everywhere that pattern was used for "now",
while correctly *not* touching the noon-anchored
`new Date(dateStr + "T12:00:00")` pattern used for date arithmetic on an
already-known string (different, legitimate use). `npx vitest run
src/__tests__/slots.test.ts`: 18/18 passed.

**`4195523` — booking-actions dedupe, 🟢 verified both by diff comparison
and live regression:** two independent extractions in the same commit.
`ensurePatientLinked()` consolidates an identical ~50-line block that was
duplicated 3x (confirm/reject/propose) — diffed the extracted function
against all three original blocks line-by-line, confirmed faithful (the
only per-call difference, `fallbackName`, is correctly parameterized).
`getAvailableSlotsForDate()` now calls the shared `computeSlots()` instead
of reimplementing the same loop inline — compared both implementations
directly, confirmed byte-for-byte identical algorithm (same day-key
lookup, same enabled check, same cursor loop, same busy-range overlap
condition). Ran the full `e2e/01-03` suite against this commit since it's
core, everyday scheduling logic: clean 3/3.

**`f374580` — push-notification consolidation, 🟢 GREEN (code review):**
three near-identical Expo push senders (two in booking-actions.ts, one in
notify-action.ts) each had a bare `.catch(() => {})` that silently
swallowed failures — a broken push pipeline would have been completely
invisible. Extracted to `lib/push.ts`'s `sendExpoPush()`, which now logs
non-2xx responses and thrown errors via `console.error` while still not
throwing (push staying best-effort, not blocking the action it's attached
to, is unchanged). Straightforward, low-risk dedup. Full live verification
(a real push actually reaching a real device) needs registered push
tokens and is more mob dev's/mobile testing's territory — flagged as a
migration-live-pass item per their list (`get_clinic_push_tokens`).

**`752dd8a` — parallelized patient list/count queries, 🟢 GREEN (code
review):** two independent queries (same filter, different projection)
converted from sequential `await`s to `Promise.all` — genuinely
independent, no shared state, safe.

**`086aef7` — pending patient can request an appointment, 🟢
live-verified end-to-end, real bug fix (not just polish):** per mob dev's
DB review, a public-code pending patient already gets a
`patient_connections` row and *can* call `create_public_booking` today —
but `/auth/pending-confirmation` only offered a status poll with no way
to reach the booking page, and its own copy said outright that booking
wasn't possible yet. Added a "Request an appointment" CTA to
`/book/<invited_by_professional_id>` (already access-controlled only by
requiring a session, not by link-state — pre-existing, previously-noted
design, not new) plus a list of the patient's existing tentative/proposal
requests. Tested for real: signed up a fresh patient with a doctor's
public code, landed on pending-confirmation, clicked through the new CTA,
filled out and submitted a real booking request (reason, date, slot,
phone, DOB — all client-required fields), then confirmed server-side via
REST that a real `appointments` row now exists for that patient. Genuinely
works.

**`0ac2786` — locale-format pending-request dates/times, 🟢 GREEN (code
review):** the new request list from `086aef7` rendered raw
`YYYY-MM-DD`/24h `HH:MM` regardless of locale; now uses
`toLocaleDateString`/`toLocaleTimeString`, matching the pattern already
used in `MyAppointmentsClient`. Small, low-risk, consistent with existing
conventions.

**`bbabeb1` — renamed `get_known_patients` RPC, restores "open patient"
link:** not yet independently testable — the renamed RPC
(`get_known_patient_auth_ids` → `get_known_patients`, now returning
`(patient_auth_id, patient_id)` pairs instead of a bare id set) is part of
mob dev's migrations 073-081, not live yet. Reviewed the diff: the new
`Map`-based lookup and `patient_id` field addition look correct by
inspection, matches the stated RPC contract. On the list for the
migration-live pass (mob dev's own item: "'Open patient' link on a
returning patient's booking request").

**`542d1f3` — removed superseded `subscription.sql`:** DB/migration
housekeeping per mob dev, not web application code — nothing to test on
this side.

**Cleaned up:** all `e2e-test-opus-*` accounts, the orphaned test
appointment left behind after deleting one of those accounts, and the
doctor test account's `public_invite_code` reset to null.

**Still pending the migration-live ping (mob dev's list):** invite-code
generation UI (not built yet either — see Phase 1 section above), doctor
confirming a pending patient via `confirm_and_link_patient` (no duplicate
records), the "open patient" link (`bbabeb1`, above), friendly errors for
`too_many_attempts`/`already_invited_by_another_professional`,
logged-out RPC probes + subscription self-grant now denied, and
new-booking pushes actually reaching a doctor device.

## Opus review — PR #8, migration-live pass (2026-09-25)

Mob dev's migrations 073-081 landed on prod (behavioral suite passing,
security advisors 0 anon-callable functions, was 29). This is the real
end-to-end pass on everything that was blocked all PR — genuine fresh
accounts, real invite codes, real linking. Tested in the same isolated
worktree, PR #8 tip through `a25a15a` at the time, then re-checked three
more small fixes that landed during this pass (`db2eac5`, `8253481`,
`3616e04` — all reviewed by code inspection only, straightforward and
low-risk: a perf short-circuit for closed schedule days, hiding the
invite-code card from secretaries since `generatePublicInviteCode` has no
delegated-professional concept, and a locale-prefix fix on the restored
"View full profile" link).

**🟢 Subscription self-grant — now denied.** Re-ran the exact PATCH that
succeeded earlier this PR (`subscription_status: "active"` + far-future
`current_period_end` as the doctor's own JWT): now `400`, `"subscription
fields can only be changed by the billing system"`. Real fix, real
server-side enforcement, not just an RLS tweak — confirmed with a clean,
intentional error message rather than a generic RLS denial.

**🟢 Anon RPC probes — all denied.** Called
`link_patient_by_invite_code`, `link_by_professional_public_code`,
`confirm_and_link_patient`, `get_known_patients`, `get_clinic_push_tokens`,
and `get_professional_public_info` with the anon key only (no user JWT):
every one now `401 permission denied for function ...`. Matches mob dev's
"0 anon-callable functions" claim, confirmed directly rather than taken
on faith.

**🟢 Invite-code generation UI — both places work.** Live-tested via real
Playwright interaction, not the service-key bypass this PR relied on
until now: doctor's Settings page generates their own
`public_invite_code`, verified the displayed code matches what's actually
persisted via REST; separately, a patient detail page generates that
patient's `invite_code`, same verification. This closes the gap flagged
in the Phase 1 section above — codes can now genuinely be created by a
web-only doctor.

**🟢 Direct-confirm linking loop — real, no duplicates.** Full live
sequence: patient signs up with the doctor's real (UI-generated) public
code → lands pending → requests an appointment via the CTA → doctor opens
the request on `/dashboard/schedule` and clicks Confirm directly →
verified via REST that `linked_patient_id` is now set on the patient's
`user_roles` row and that exactly one `patients` table record exists for
them (not zero, not two) — confirms `confirm_and_link_patient` (the
`9c388a0` rewrite) does what it claims, including the duplicate-record
fix that rewrite specifically called out.

**🔴 Found: a pending patient has no way to accept a doctor's proposed
time.** This is the "propose → accept" branch mob dev specifically asked
about, and it doesn't work. Reproduced live: same setup as the confirm
loop above, but the doctor clicks "Propose new time" instead of
"Confirm" — that part works fine, the request correctly flips to
`proposal` status and `pending-confirmation`'s request list correctly
shows the new date/time. But there is no way forward from there:
`acceptProposal` (the actual accept action) only exists in
`MyAppointmentsClient.tsx`, and `/my-appointments` redirects a
still-pending patient straight back to `/auth/pending-confirmation` —
correct behavior for the general case, but it makes the one page with an
accept button unreachable for exactly the patient who'd need it here.
`pending-confirmation`'s own request list is read-only, no action
attached. Reported to web dev with two possible fixes (give
pending-confirmation its own accept/decline actions, or carve out an
exception in the my-appointments redirect for an actionable proposal) —
their call which fits the architecture better. Not tested further pending
a fix; the direct-confirm branch above is unaffected by this and remains
solid.

**Not yet covered from mob dev's full checklist:** friendly error
messages for `too_many_attempts`/`already_invited_by_another_professional`
(would need to actually trigger rate-limiting or a conflicting invite,
not yet attempted), the "open patient" link on a returning patient's
request (code-reviewed only via `bbabeb1`/`3616e04`, not live-clicked),
the deletion-request form's public-only-accepts-`pending` restriction,
and new-booking pushes actually reaching a doctor device (needs
registered push tokens, more mobile-testing territory).

**Cleaned up:** all `e2e-test-opus-*` accounts and patient records,
including several stale booking-request appointments that accumulated
from failed test-iteration attempts (bad selectors, not app bugs) before
the confirm-loop test was made robust — doctor account's
`public_invite_code` reset to null, `subscription_status` untouched this
round (never mutated, only probed and correctly rejected).

## Opus review — deletion-request form, real submit confirmed

Per mob dev's request (`deletion_requests` now only accepts
`status='pending'` from the public, and the form already sends that
explicitly — worth proving with a real submit, not just a code read).
Filled and submitted the actual form at `/account/delete` (email +
optional reason, no auth required by design), confirmed the "Request
received" success screen shows the submitted email, then verified via
REST that a real row landed with `status: "pending"` and the correct
`email`/`reason`. Cleaned up the test row after. 🟢 Works as described.

## Opus review — propose→accept fix (`e841bd3`), 🟢 both branches confirmed

Web dev's fix for the gap found earlier this pass: accept/decline actions
added directly to `pending-confirmation`'s request list for proposal-status
rows, reusing `acceptProposal`/`declineProposal` unchanged. Ran the exact
walkthrough live, both directions:

- **Accept:** pending patient requests → doctor proposes a new time →
  patient logs in, sees "New time proposed" with Accept/Decline buttons on
  `pending-confirmation` → clicks Accept → redirected to
  `/auth/patient-welcome` → verified via REST that `linked_patient_id` is
  now set. Matches the described behavior exactly (accepting links the
  patient the same way a doctor's direct confirm does).
- **Decline:** same setup, patient clicks Decline instead → stays on
  `pending-confirmation`, confirmed via REST `linked_patient_id` is still
  null (correctly *not* linked).

One transient failure on the first attempt at the accept test (timed out
clicking "Propose new time" on a freshly-restarted server) — the decline
test's identical code path passed cleanly in the same run, and a solo
retry of the accept test passed too, so this was the familiar cold-start
compile latency on this route's first hit, not a real issue.

This closes out the propose→accept gap — the one item I'd called a
blocker. No remaining known bugs; the "not yet covered" items from the
migration-live section above (friendly error messages, the open-patient
link beyond a code review, and push notifications) are still genuinely
untested, not confirmed-fine — flagging that distinction rather than
calling this fully green across the board.

## Opus review — PR #9 (`review/phase1-service-routes`), 🟢 at `6b58a1e`

**Scope: this entry covers exactly `6b58a1e`,** the PR's current HEAD at
the time of testing. That's 37 commits over `origin/master`: 36 non-merge,
including one earlier tester docs commit. It replaces my earlier entry,
which was scoped to `3791e50` and tested the since-removed
`/join/[professionalId]` route.

PR #9 is phase 1 of the whole-app review: every web API route and server
action that does privileged writes, checked for auth, validation and
idempotency. Tested in an isolated worktree on `6b58a1e`, against the live
DB with migrations through 084.

**🟢 `/join/[code]`: live-tested against a real public code, all branches.**
The route was rebuilt in `274f7e0`/`0ea7629`/`bd2d644` to take the
doctor's public invite code instead of a professional id.
- **Signed out:** visiting `/join/<code>` redirects to signup with the code
  pre-filled and the role locked to patient ("Joining as patient via
  invite link"). After signup and a real confirmation through
  `/api/auth/callback`, the user lands on `/auth/pending-confirmation`.
  REST confirms `role=patient`, `invited_by_professional_id` = that
  doctor, and no `linked_patient_id`.
- **Signed in, no role yet:** a confirmed patient-metadata account with no
  role visits `/join/<code>`, gets linked through
  `link_by_professional_public_code`, and lands on pending-confirmation.
  REST shows the right doctor.
- **Already-linked patient:** redirected to `/my-appointments`. Role and
  `linked_patient_id` unchanged.
- **Doctor:** redirected to `/dashboard`. Role still `professional`, and no
  `linked_patient_id` or `invited_by_professional_id` written.
- **Bogus code, and an old `/join/<professional uuid>` link:** both show
  "Invite link not found". An unknown code returns NULL now that
  migration 083 is live. REST confirms no `user_roles` row was created.

**🟢 Settings "Copy link": live-tested.**
- On a throwaway professional in pt-BR: **Gerar código** persists a code,
  and **Copiar link** copies `…/pt-BR/join/<that code>`. The locale prefix
  comes from `0ea7629`.
- On the shared doctor in `en`, after migration 084 went live: Settings
  shows the real code (`M2WBHY`), and **Copy link** copies
  `…/join/M2WBHY`. This check was read-only; no form was saved on the
  shared account.

**🟢 Checkout guards: live-tested.**
- A patient calling `POST /api/checkout/stripe` or `/api/checkout/asaas`
  gets `403 wrong_role` on both, before any provider call.
- A professional with `subscription_status: active` and a future
  `current_period_end` gets `409 already_subscribed`. The doctor's
  subscription fields were restored straight after.

**🟢 Tentative requests vs the plain status dropdown: live-tested.** I
seeded a tentative appointment for today and opened the doctor's
`/dashboard/schedule` list view. The row renders, and no status `<select>`
on the page holds `tentative`, so the row gets the static badge rather
than the dropdown. On the server side, `updateAppointmentStatus`'s
exclusion is an atomic `.not("status","in",'("tentative","proposal")')`
in the update's own WHERE clause (`79daffd`/`0259e95`), confirmed by
reading the code.

**Code-reviewed only, not live-tested: Stripe/Asaas webhook internals**
(`6b73d8e`, `a6c4d23`, `532b64b`, `5147cf9`, `d0b36eb`). These can't be
exercised from here: `STRIPE_SECRET_KEY` in this environment is a
placeholder (a read-only `/v1/account` call returns 401), and the Stripe
CLI isn't installed. On reading, the logic is sound:
- `subscription.created`/`updated` now own `subscription_status` and
  `current_period_end` together, and `checkout.session.completed` no
  longer writes status, so "active" can never be written without a real
  period end.
- `subscription_data.metadata` fixes the real Stripe gotcha where Session
  metadata isn't copied to the Subscription.
- The Asaas routes now fail closed on non-2xx responses and treat
  PENDING the same as ACTIVE.

These need a real test-mode key before they can be verified, and that key
has to come from the user.

**Also code-reviewed, low-risk:**
- Localized error codes for schedule create/block-time (`1a63d55`),
  clinics (`6b58a1e`) and payments (`3d2d2bc`).
- The clinic-insert compensating delete (`1096fa1`/`44e803d`).
- The role-lookup-error fail-closed guards (`68a3f3b`/`96cee1f`).

**Found during this pass, not part of #9:**
- `professionals.pix_key` didn't exist on prod, so the web Settings query
  errored for every doctor and rendered blank, editable forms. Saving
  Profile or Hours from that state would overwrite real data. Mob dev
  fixed the DB in migration 084, which is live and confirmed above. Web
  dev fixed the page in PR #10, which gets its own entry.
- The shared doctor's password was reset by the mobile tester, which
  caused some mid-session login failures. My local `.env.e2e` has been
  updated.

**Test environment note:** Supabase auth latency from this machine spiked
to 4–16s, with some connection timeouts, partway through this pass. The
failures in that window were all login waits; each check passed on
re-run with longer waits. None of them were app issues.

**Cleaned up:** all `e2e-test-opus-*` accounts and seeded appointments are
deleted. The shared doctor is at baseline: `subscription_status` is
`trial`, `current_period_end` is null, and it keeps its real
`public_invite_code`.

**Merge gate: 🟢 for `6b58a1e`.** The only caveat is the webhook
internals above, which are reviewed but not live-verified.

## PR #10 (`fix/settings-load-failure`) — Settings load-failure hotfix, 🟢 at `cb6e257`

**Background.** `professionals.pix_key` was missing on prod, so web
Settings' professionals query errored for every doctor. `.single()` then
fell through to blank, editable defaults, and saving Profile or Hours from
that state would overwrite real data. Mob dev's migration 084 adds the
column. This PR makes a failed load show an error with no forms, and
switches to `.maybeSingle()` so a genuinely missing row still gets the
blank forms. Tested on `cb6e257`, against the live DB with 084 applied.

**🟢 Normal load, shared doctor, read-only.** Settings shows the real
`full_name` ("E2E Test Doctor") in the name input and the real invite code
(`M2WBHY`), with no error banner. Nothing was saved on the shared account.

**🟢 Forced load error.** I edited my local copy of `page.tsx` to also
select a nonexistent column, then loaded Settings. It showed "Couldn't load
your settings…", with zero `<form>` elements and no `full_name` input, so
there is nothing to save over. The edit was reverted straight after
(`git checkout`, clean diff) and never committed.

**🟢 Professional with no `professionals` row.** On a throwaway
professional, I deleted its `professionals` row via the service key
first. Settings rendered blank forms with no error banner. Saving the
Profile form with a name created the row (`updateProfile` upserts), and
REST shows the saved `full_name`.

**🟢 Pix QR on a pending payment (084 unblocks this).** On a throwaway
professional, I set `pix_key`, `clinic_name` and `clinic_city`, then
seeded a confirmed appointment for today with `payment_status: pending`
and `payment_amount: 150`. In the schedule list view the row shows the
"Pix QR Code" button, and clicking it opens the QR image.

**Test environment note.** The first normal-load attempt bounced to
`/auth/login` right after a successful login. That's consistent with the
Supabase latency spikes seen all day, where the page's server-side
`getUser()` times out and is treated as signed-out. The doctor's
credentials were valid, and it passed on re-run.

**Cleaned up.** No `e2e-test-opus-*` accounts are left, and throwaway
appointments were deleted. The shared doctor is unchanged: same
`full_name`, `trial`, code `M2WBHY`.

**Merge gate: 🟢 for `cb6e257`.**

**Addendum: 🟢 re-confirmed at `6ef6334`**, the merge with master after #9
landed, which combines #9's copy-link `SettingsClient.tsx` with #10's
`page.tsx`. The diff against master is only `page.tsx` plus one
`settings.loadError` key per locale, and all 15 locales still have
`copy`, `copyLink` and `loadError`. The shared doctor's Settings loads
the real name and code `M2WBHY`, with both **Copy** and **Copy link**
present (read-only, nothing saved). A forced select error (local edit,
reverted) still shows the error banner with no forms.

## PR #11 (`feat/stripe-brl-billing`) — Stripe BRL billing, Asaas removed, 🟢 at `b2c24bb`

**Scope: this entry covers exactly `b2c24bb`,** the PR's HEAD at the time
of testing. The full suite (11 tests) ran green on `b2c24bb`, and also on
`dace24d` just before it. Earlier HEADs (`c6f1b69`, `e8b219f`) were tested
as they came in; the one bug found there is fixed (see below).

**How this was tested.** Everything used Stripe **test mode** with the
real test keys, against the live DB, in an isolated worktree on port 3001.
- **Checkout is real.** The app's own `/api/checkout/stripe` creates the
  session, and Playwright pays on Stripe's hosted page.
- **Webhooks are real events.** I fetch each Stripe event with
  `events.list` and sign it with `STRIPE_WEBHOOK_SECRET` via
  `generateTestHeaderString`, exactly as Stripe does. Then I POST it to the
  local `/api/webhooks/stripe` in Stripe's own order.
- **Tools.** No Stripe CLI was needed. All test accounts were throwaway
  professionals and patients.

**🟢 Pricing and checkout (UX/PM plan 1, 3, 5).**
- **pt-BR:** `/pt-BR/subscribe` shows **R$ 89** and **"Cartão de
  crédito"**, with no Pix anywhere. The session is `brl`, 8900, and
  `payment_method_types: ["card"]`.
  - Paying with `4242…` gives a paid session, and the subscription and
    invoice are both BRL 8900.
  - After the webhooks, the row is `active`, provider `stripe`, with the
    right `subscription_id`. `current_period_end` equals Stripe's
    `items[0].current_period_end` to the second.
  - `/pt-BR/dashboard` opens.
- **Brazilian test card** (`4000 0007 6000 0002`, card country `BR`):
  charged BRL 8900 on the Thai account, and the flow succeeds end to end
  the same way.
- **en:** shows **$19** and "Visa, Mastercard, American Express". The
  session is `usd`, 1900, card only, and the flow succeeds end to end.
- **Redirects:** `success_url` and `cancel_url` use the locale prefix
  (`/pt-BR/subscribe?success=1`, `/subscribe?success=1`).
- **Junk locale:** a locale like `"../../evil"` falls back to `en`, so the
  session is USD and the URLs have no prefix.
- **Email:** it's pinned. `customer_email` equals the account email, and
  the hosted page shows it as plain text, not an editable field.

**🟢 Cancellation (plan 2).**
- **Cancel at period end:** with `cancel_at_period_end: true`, the real
  `customer.subscription.updated` leaves the row `active` with the same
  `current_period_end`, and the dashboard still opens.
- **Period end:** simulated by an immediate cancel. The real
  `customer.subscription.deleted` sets `expired`, and `/pt-BR/dashboard`
  redirects to `/pt-BR/subscribe`.

**🟢 Abandoned or unpaid checkout doesn't activate (plan 4).**
- A session that was opened and then expired
  (`checkout.session.expired` delivered) leaves the row untouched at
  trial, with no ids written.
- A `checkout.session.completed` with `payment_status: "unpaid"` (the
  async-method shape) writes nothing.

**🟢 Webhook ordering, replay and concurrency (live-state sync, `6f654dd` +
`3859ab8`).**
- **Replays:** the real `checkout.session.completed` replayed while
  active changes nothing. Replayed after expiry, it stays `expired`.
- **Stale `customer.subscription.created` after deletion stays
  `expired`.** This was the free-access gap I reproduced on master during
  the #9 retro-check, and it's now closed.
- **Resubscribe:** after resubscribing as sub B, late events for the old
  sub A (deleted, created, completed) leave B `active`, with B's id and
  period end unchanged.
- **Concurrency:** a stale `updated` (payload says active), `deleted` and
  `created` for a just-cancelled sub, delivered at the same time with
  `Promise.all`, all return 200 and the row ends `expired`.
- **Unknown subscription:** an event for a nonexistent sub id returns
  **500**, so Stripe retries, and nothing is written.
- **Failed renewal** (Stripe test clock; the renewal charge fails and
  Stripe marks it `past_due`): the real `invoice.payment_failed` sets
  `expired` immediately, as designed.

**🟢 Checkout guards.**
- **Wrong role:** a patient gets `403 wrong_role`.
- **Already subscribed:** an active professional gets
  `409 already_subscribed`.
- **Paid, webhook not yet delivered (`dace24d`/`b2c24bb`):** after a real
  paid checkout, with no webhook delivered and the row still `trial`, a
  second checkout returns **409 already_subscribed** and no new session is
  opened. This is the live proof the email-scoped completed-session
  lookup works. After that sub is cancelled, a new checkout is allowed
  (200).
- **At most one payable session (`e8b219f`):**
  - The same locale twice returns the same URL, sequentially and
    concurrently.
  - en, then pt-BR: the en session is `expired` and only pt-BR is open.
- **Language switch (bug found on `e8b219f`, fixed in `8fd4de2`):**
  en → pt-BR → en inside one 10-min window used to replay the cached, and
  already expired, en session, and the sweep also expired pt-BR, leaving 0
  payable sessions. Now it returns a fresh open session, with exactly 1
  open at every step.

**🟢 Asaas removed, legal pages.**
- `/api/checkout/asaas` and `/api/webhooks/asaas` return 404 on both GET
  and POST.
- `/privacy`, `/terms`, `/pt-BR/privacy` and `/pt-BR/terms` mention Stripe
  and never Asaas.

**Also closes out PR #9's webhook internals.** Those were code-reviewed
only in the #9 entry, for lack of a key. They were retro-verified on master
(`170da19`) with the same signed-event method, 6/6:
- a bad signature is rejected;
- `created` sets active with the real period end;
- a replayed `completed` keeps status and period end;
- an active `updated` with no period end is ignored;
- `deleted` sets expired;
- a replay after cancel doesn't reactivate.

A real hosted checkout confirmed `subscription_data.metadata.user_id` on
the Subscription.

**Minor findings, not blocking:**
- **Toggle limit.** After 11 language switches within one 10-min window,
  the 12th returns 500 `checkout_failed` with 0 open sessions: the
  `key-r1…r4` family is used up, and the sweep has already expired the
  last one. It self-heals when the window rolls over. The first 11 steps
  each held exactly 1 open session.
- **Trial cut short.** A trial user whose *first* subscription dies before
  any active state was stored goes `trial` → `expired` and loses the rest
  of the trial, because the dead-sub write matches `subscription_id IS
  NULL`. That's hard to hit with card-only Checkout, since subs are
  created active. Product question: should a dead sub on a never-paid row
  leave the trial alone?
- **Known issues in the PR:**
  - The open-session sweep is account-wide (only in-progress sessions,
    ~70 min).
  - `past_due` isn't blocked from starting a second checkout; that's
    covered by the upcoming failed-payment PR's 409 while past_due.

**Not verifiable from here; needs the user:**
- **Stripe → deployed endpoint delivery:** the dashboard endpoint's URL,
  subscribed event types and signing secret on the deployed app. Locally
  I sign with the same `whsec_`, but that doesn't prove Stripe reaches
  prod.
- **Customer Portal:** isn't enabled yet.
- **Account activation:** the Stripe account isn't activated yet
  (`charges_enabled: false`). That's fine for test mode, but required
  before live.

**Cleaned up.**
- All `e2e-test-opus-*` accounts are deleted: 0 left.
- 0 leftover test customers; 0 active subscriptions in the test account.
- The test clock is deleted.
- The shared doctor wasn't used, and is still `trial` with no
  subscription fields.

**Merge gate: 🟢 for `b2c24bb`.**

## PR #12 (`feat/failed-payment-portal`) — failed payment, Customer Portal, trial rule, 🟢 at `d72ecd4`

**Scope: this entry covers exactly `d72ecd4`.** The full suite (8 tests)
ran green on it. Earlier HEADs also ran the full suite green: `b2d9d9b`
7/7 and `926387f` 6/6, before (8)–(11) were added. An earlier run on `e562b33` found one bug, now fixed (see
below). The method is the same as #11: Stripe test mode with real test
keys, real objects, and real events fetched with `events.list`, signed
with `STRIPE_WEBHOOK_SECRET` and delivered to a local server on `d72ecd4`.
Failed renewals and expiries use Stripe **test clocks**. All test
accounts were throwaways.

**🟢 (1) Failed-payment UI.** A professional's subscription goes to
`past_due` for real: a test-clock renewal against a card whose charges
fail, then the real `invoice.payment_failed` sets the row to `expired`.
- **`/subscribe`:** shows "Your last payment failed. Update your card to
  continue." and an **Update card** button. There's no "Subscribe with
  Card" and no "Your free trial has ended".
- **`/pt-BR/subscribe`:** shows "Seu último pagamento falhou…" and
  **Atualizar cartão**, with no "Assinar com Cartão".

**🟢 (2) Customer Portal and recovery.**
- **Portal:** clicking **Update card** lands on `billing.stripe.com`.
  The portal shows this professional's subscription and email.
- **Recovery:** after the card fix (new default card, open invoice paid),
  the real `invoice.paid` and subscription events set the row back to
  `active`, with the *new* period end (+1 month).
- **(9) Webhook lag after the fix** (`b2d9d9b`): Stripe is already
  `active`, but the row still says `expired`. `/subscribe` shows "Payment
  received. Your access is being restored…" with no payment buttons, no
  trial-ended text and no payment-failed text.
- **Access:** once the webhook lands, `/subscribe` redirects to the
  dashboard.
- **Not automated:** the card entry itself was done through the API, the
  same state change the portal makes. I didn't script Stripe's portal
  form.

**🟢 (3) Checkout refuses a second subscription.**
- **Past due:** `payment_failed`, 409.
- **Paid but webhook pending (3b):** Stripe says `active` while the row
  still says `expired`, and checkout returns
  **`409 already_subscribed`**.
- **Cancelled (3c, terminal):** checkout is allowed again, 200.

**🟢 (4) Portal guards on `/api/billing/portal`.**

| Caller | Result |
|---|---|
| Signed out | 401 |
| Patient | 403 `wrong_role` |
| Secretary (role set on a throwaway) | 403 `wrong_role` |
| Professional with no subscription | 404 `no_subscription` |
| Professional whose stored id is *another user's* live subscription | 404 `no_subscription` |

The last row means the portal is never opened for someone else's
customer.

**🟢 (5) UX trial rule, never-active first subscription.**
- **Pending:** a trial professional's first subscription is `incomplete`
  (the first charge failed). The row stays `trial` with the same
  `trial_ends_at`, and the pending sub's id is recorded (`926387f`). A new
  checkout returns `409 payment_failed` while it's pending.
- **Expired:** after 25 h on a test clock it's `incomplete_expired`, all
  real events are delivered, and the row is still `trial` with the same
  `trial_ends_at`. Checkout is then allowed, 200.
- **Contrast:** a subscription that *was* active and is then cancelled
  mid-trial sets `expired`, per UX's rule.

**🟢 (6) Regression.** A plain ended trial still shows "Your free trial
has ended" plus Subscribe. There's no payment-failed banner and no Update
card, and checkout returns 200.

**🟢 (7) Ended trial with a pending `incomplete` sub** (`c77744b`, shared
classifier).
- **Page:** shows the payment-failed banner and Update card, with no
  Subscribe.
- **Checkout:** `409 payment_failed`.
- **Portal:** 200 (`billing.stripe.com`).

**🟢 (8) A new pending sub takes over only from a dead one** (`7074ad4`).
- **(8a) Stored sub cancelled:** a new `incomplete` sub takes over the
  row. Checkout then returns `409 payment_failed` and the page shows the
  payment-failed UI, so a third subscription can't be started.
- **(8b) Stored id unknown to Stripe:** a new `incomplete` sub takes
  over.
- **(8c) Stored sub live and `active`:** a new `incomplete` sub does
  **not** take over. The row is unchanged: still `active` on the old sub.
- **(8d) Terminal events never take over:** a late `deleted` event for
  another, cancelled sub leaves the row tracking the pending one.

**🟢 (10) Stale DB "active" with an unknown stored id** (`f33bb34`). The
row says `active` with a future period end, but the stored id isn't known
to Stripe. Checkout returns **200**, so Stripe decides when an id is
stored, not the stale DB status.

**🟢 (11) Lifetime is never touched** (`f33bb34`, `d72ecd4`).
- **Checkout:** a `lifetime` professional gets `409 already_subscribed`.
- **Webhooks:** real events for a new *active* sub (created and paid),
  then its *deleted* event, then a pending *incomplete* sub's events, all
  carrying this user's id. After each, the row is byte-identical:
  `lifetime`, no `subscription_id` or provider written, and no takeover.
- **Access:** the dashboard stays reachable.

**🟢 Bug found on `e562b33`, fixed in `c77744b`: an unknown stored
subscription id locked the professional out for good.**
- **Before:** with `subscription_id` set to an id Stripe doesn't know,
  checkout and the portal both returned 503 `check_failed` on every
  attempt. `/subscribe` still showed Subscribe, so the doctor could never
  pay.
- **Why it matters:** that's the state every row written with test keys
  will be in once prod switches to live keys.
- **Now:** Stripe's `resource_missing` means "no usable subscription".
  Subscribe shows, checkout returns 200, and the portal returns 404
  `no_subscription`. Other Stripe errors still fail closed (reviewed in
  code).

**Known issues, listed in the PR, not blocking:**
- **Pending sub during a live trial.** A professional *still in trial*
  with a pending `incomplete` sub gets `409 payment_failed` on checkout,
  but `/subscribe` doesn't show the Update card UI while access is
  allowed. They wait until the sub expires (~23 h). It's close to
  unreachable with card-only Checkout, which doesn't leave incomplete
  subs.
- **Checkout-scan scope.** Carried from #11: the open-session sweep in the
  checkout route is account-wide.

**Needs the user, unverified from here:** Stripe delivery to the deployed
webhook endpoint (URL, events, secret), and live-mode Customer Portal
configuration. The test-mode portal is enabled and works, as above.

**Cleaned up.**
- All `e2e-test-opus-*` accounts are deleted: 0 left.
- 0 active subscriptions and 0 test clocks in the Stripe test account.
  That includes 3 leftover #11 clocks, deleted now.
- The shared doctor wasn't used and is still `trial` with no
  subscription.

**Merge gate: 🟢 for `d72ecd4`.**

## PR #13 (`feat/secretary-accounts`) — secretary accounts + server-only roles, 🟢 at `f58dc76`

**Scope: this entry covers exactly `f58dc76`.** Both suites ran green on
it: 13/13, the 9 secretary tests plus the 4 signup-regression tests. The
signup suite was also green on `c7c763c`. The run was against the live DB
with migration 088 live, in an isolated worktree on port 3001.
- **Accounts:** all throwaways.
- **Confirming signups:** the signup form hardcodes the production
  callback URL. So each UI signup was confirmed through this app's own
  `/api/auth/callback`, with a real `token_hash` from the admin
  `generate_link` API. The real callback code runs.
- **Doctor-only actions:** called directly by replaying real server
  actions. The action ids come from the dev bundle, with the same
  multipart encoding the client uses. Positive control: the doctor's
  replay of `updateProfile` works.

**🟢 (1) Invite → signup → linked.**
- **Invite:** the doctor invites an email from Settings → Team. The code
  (`S-XXXXXXXX`) is shown once, with **Copy code**, **Copy link** and
  **WhatsApp**. The WhatsApp text carries
  `/join/secretary/<code>?email=<invitee>`.
- **Signed out:** the link shows "You've been invited as a secretary" →
  **Create account** → signup. The page says "Joining as a secretary via
  invite link.", the email is pre-filled and `readonly`, and there's no
  role picker.
- **After confirming:** the user lands on `/dashboard`. `user_roles` is
  `secretary` with `invited_by_professional_id` = the doctor, and no
  `professionals` row is created for them.

**🟢 (2) A linked secretary sees the doctor's real data.**
- **Home:** "Good evening, Opus 👋" (their own name, no "Dr."). No
  **Monthly Revenue** card. The doctor's appointment is listed.
- **Sidebar:** no **Clinics** link. Opening `/dashboard/clinics` directly
  redirects to Settings.
- **Schedule and Patients:** show the doctor's appointment and patients.
- **Patient detail:** tabs are **Info | Appointments** only. No Records
  or Prescriptions, and the seeded clinical note isn't on the page.
- **Payments:** only the **Pending** card; no Received or Total card.
  **Mark Paid** sets `payment_status: paid` in the DB.
- **Create, edit:** a secretary-created patient belongs to the doctor
  (`professional_id`), with `created_by` = the secretary. Its detail shows
  "Opus Secone Tester (secretary)" to both the secretary and the doctor;
  a doctor-created patient shows none. Edit saves.

**🟢 (3) Secretary settings are read-only, and every doctor-only write is
refused, even when called directly.**
- **Settings:** "You work for Opus Maindoc at Opus Clinic Test.", "Only
  the doctor can change these.", no profile inputs, no Team card, and
  **Leave Opus Maindoc's clinic** is shown.
- **Regenerate:** the secretary's **Regenerate** changes the *doctor's*
  `public_invite_code` and doesn't create a professionals row for the
  secretary.
- **Direct server actions, with the secretary's session:**
  - `updateClinic`, `updateWorkingHours` and `createProcedure` return
    "Only the doctor can change these settings".
  - `addClinic` returns "Only the doctor can manage clinics".
  - `createRecord` and `createPrescription` return "Only the doctor can
    manage clinical records".
  - `updateProfile` showed no refusal text in the part of the response I
    logged, but the DB proves it was refused: afterwards the doctor's
    name, clinic and hours are unchanged, there's no professionals row for
    the secretary, and no hack procedure, clinic, record or prescription
    exists.
- **Straight at PostgREST with the secretary's JWT:**
  - Reading `medical_records` or `prescriptions` for the doctor's patient
    returns `[]`.
  - Inserting a `medical_record` returns 403.
  - A PATCH to the doctor's `professionals` row changes 0 rows.
  - `patients` is readable, as intended.

**🟢 (4) `/join/secretary/<code>` while signed in.**
- **Patient:** "This is a patient account…". The test patient was linked
  to a doctor first, so it has a real role row.
- **Doctor:** "This is a doctor account…".
- **Linked secretary:** "You already work for Opus Maindoc's clinic.
  Leave it in Settings…".
- **Unlinked secretary with a different email:** "Invite not valid". The
  invite is bound to its email.
- **Garbled URLs never return 5xx.** `S-%21%21%21` shows "Invite not
  valid". Malformed %-encodings (`%E0%A4%A`, `%ZZ`) get Next's own 404,
  and double-encoded ones get a 400, before the page runs. So the page's
  `decodeURIComponent` guard is unreachable in practice, and those users
  see a plain 404 or 400 rather than the friendly message. Minor, not
  blocking.

**🟢 (5) Team management.**
- **Limit:** with 1 member and 2 pending, the invite input is disabled and
  "Your team is full (3)…" is shown.
- **Resend:** asks "Send a new invite to <email>? The code you shared
  before will stop working." (`8ddf5fb`) and issues a new code. The old
  code shows "Invite not valid" to the invitee.
- **Decline:** the invitee's **Decline** shows "You declined this invite."
  and the account stays unlinked.
- **Revoke:** frees the slot, and the input is enabled again.
- **Remove:** the removed secretary's `/dashboard` goes to
  `/auth/not-connected`.
- **Typed codes:** on Not connected, a typed code works without "S-" and
  in lowercase, and also as `s-…`. Both go to Accept, and then the
  secretary is relinked.
- **Leave clinic:** goes to `/auth/not-connected`, with the link cleared.

**🟢 (6) Lapsed doctor subscription.**
- **Secretary:** `/dashboard`, and even `/subscribe`, go to
  `/auth/clinic-inactive` ("Opus Maindoc's SolvyMed subscription is
  inactive…"). They never see the paywall.
- **Doctor:** gets `/subscribe` as before.
- **Restored:** once the subscription is restored, the secretary is back
  on the dashboard.

**🟢 (7) Duplicate patients.**
- **Same name and phone:** "Possible match…" with **Open existing** and
  **Create anyway**. **Create anyway** creates the second record.
- **Same CPF:** first shows the possible-match prompt. **Create anyway**
  then gives "Opus Seed Patient is already registered." and **Open
  patient**, and nothing is created. The link points at the patient who
  actually holds that CPF, not the same-name duplicate (`f58dc76`).

**🟢 (8) Signup regression, now that `user_roles` is server-only (088).**
- **New doctor** (UI signup, confirmed): `/dashboard` with "Dr. …";
  `user_roles` is `professional`; `professionals` is `trial` with a
  future `trial_ends_at`.
- **New patient via `/join/<doctor's public code>`:** "Joining as patient
  via invite link." → `/auth/pending-confirmation`; role `patient` and
  `invited_by_professional_id` = that doctor.
- **New patient with a typed patient invite code:**
  `/auth/patient-welcome`; role `patient` and `linked_patient_id` = that
  patient record.
- **The user's own session can't write `user_roles`:** PATCH, POST and
  DELETE all return **403** (42501), and the role is unchanged.
- **Existing doctor login:** still reaches the dashboard.

**🟢 Locale and sidebar** (`bc9e2f6`, `2cae89f`).
- **Sign-out:** from `/pt-BR/auth/not-connected` lands on `/pt-BR`, and so
  does the sidebar sign-out from `/pt-BR/dashboard`.
- **Sidebar label:** the secretary is shown by name with no "Dr.", in
  pt-BR too.

**Copy note (pt-BR and es), for UX, not blocking.** The secretary-facing
wording is gender-neutral: "equipe de secretaria" / "equipo de
secretaría", "Essa pessoa…", "E-mail de quem vai entrar na equipe". The
*doctor*, though, is masculine throughout:
- pt-BR: "Peça ao seu médico", "Um médico convidou você", "Peça que ele
  libere", "Somente o médico pode…", "conta de médico".
- es: "Pide a tu médico", "Solo el médico…".
- Both: "convidar a si mesmo" / "invitarte a ti mismo".

Whether "neutral" was meant to cover the doctor too is UX's call.

**Found along the way, not part of #13.**
- **Unreadable auth rows:** Supabase Auth's admin "list users" returns 500
  for 8 `auth.users` rows, around the ones created Aug 29–30 ("Database
  error finding users"). Any page that includes them fails, so every
  page size of 50 or more fails. I sent this to mob dev with a query to
  find NULL token columns, and changed nothing.
- **Correction to the #11 entry:** because of this, my earlier leftover
  sweeps for #11 and #12 silently listed 0 users. There were 2 leftover
  `e2e-test-opus-pr11-*` accounts after all, from a run killed by a
  timeout. They're deleted now. The in-run cleanups, which delete by id,
  were unaffected.

**Cleaned up.**
- 0 `e2e-test-opus-*` accounts left: swept in pages of 10, which skips the
  broken page. That includes 8 from killed #13 runs and the 2 #11 ones.
- 0 `Opus*` patients or professionals left.
- The shared doctor wasn't used: still `trial`, code `M2WBHY`, and no
  secretaries.

**Merge gate: 🟢 for `f58dc76`.**

**Addendum: 🟢 re-confirmed at `33f73d4`.** The two commits on top,
`a35776f` (the doctor is gender-neutral in all locales) and `33f73d4`
(three French strings), change only `src/messages/*.json`; I checked the
diff. No code changed, so the 13/13 run above carries over.

**Spot-check, rendered live in pt-BR and es:**
- **Signup note:** "Trabalha na secretaria? Peça um link de convite à
  clínica onde você trabalha." / "¿Trabajas en secretaría? Pide un enlace
  de invitación a la clínica donde trabajas."
- **Signed-out `/join/secretary/<code>`:** "Você recebeu um convite para a
  equipe da secretaria" / "Tienes una invitación al equipo de secretaría".
- **Doctor account on an invite:** "Esta é uma conta profissional…" /
  "Esta es una cuenta profesional…".
- **Not connected:** the title renders, and the body asks "à clínica onde
  você trabalha" / "a la clínica donde trabajas".
- **Team, invite your own email:** "Você não pode usar seu próprio
  e-mail." / "No puedes usar tu propio correo."
- **Secretary's Settings:** "Somente a conta principal da clínica pode
  alterar isto." / "Solo la cuenta principal de la clínica puede cambiar
  esto.", plus **Sair da clínica** / **Salir de la clínica**, and "Deixar
  esta clínica…" / "Dejar esta clínica…".

**String review.** I scanned pt-BR and es for masculine references to the
doctor in the secretary, signup, settings and patient strings. None are
left in the #13 copy. Two pre-existing patient-signup strings are still
masculine, "Médico" (the role label) and "código do médico" / "código del
médico" (the invite-code hint), but #13 didn't touch them. **French**
(`33f73d4`, checked in the JSON, not rendered): "mon secrétariat",
"Cette personne…", "E-mail de la personne invitée".

Clean-up: the 3 throwaway accounts are deleted.

**Merge gate: 🟢 for `33f73d4`.**

## PR #14 (`fix/secretary-pix-qr`) — Pix QR for a linked secretary, 🟢 at `efb7817`

**Scope: this entry covers exactly `efb7817`.** It's one file: the schedule
page reads `pix_key`, `clinic_name` and `clinic_city` via `get_my_clinic()`
for a secretary. Tested live, with migration 089 live on prod, using
throwaway accounts.

**Setup.** A doctor has a Pix key, "Clinica Pix" and "Sao Paulo". There's
a confirmed appointment for today with a pending R$150 payment. A
secretary is linked through the real invite RPCs. As that secretary,
`get_my_clinic()` returns `pix_key` and `clinic_city`.

**🟢 Secretary.** On the schedule list view, the appointment row shows the
**Pix QR Code** button, and it opens the QR. The "Copia e Cola" payload
contains the doctor's key, `150.00` and the city. The image `src` is
exactly the qrserver URL encoding that payload.

**🟢 Regression: doctor.** The same button and QR, and the payload is
**byte-identical** to the secretary's.

**Negative control.** The same test on `master` (`db5372f`) fails as
expected: the secretary sees the row but **0** Pix QR buttons. So the test
really catches the bug.

**Cleaned up.** The throwaway doctor, secretary and patient are deleted
(0 `Opus*` professionals left).

**Merge gate: 🟢 for `efb7817`.**

## PR #15 (`fix/neutral-copy-sweep`) — gender-neutral copy + Team input label, 🟢 at `74f599b`

**Scope: this entry covers exactly `74f599b`.** The diff against master is
`src/messages/*.json` plus one `aria-label` in `TeamPanel.tsx`; I checked
it. The rendering checks ran on `5f279fb`. `74f599b` only changes `ar.json`,
which I checked parses and has the same 26 namespaces as `en`. Pages were
rendered live in **pt-BR and es** with throwaway accounts.

**🟢 Rendered, and neutral in both locales:**
- **Login title:** "Que bom ter você de volta" / "Qué bueno verte de
  nuevo".
- **Signup:** the role label "Profissional de saúde" / "Profesional de la
  salud". With Patient selected, the hint is "Digite o código de convite" /
  "Introduce el código de invitación".
- **`/auth/invite-required`:** "…precisam de um código de convite da
  clínica… Peça o código à sua clínica…" / "…código de invitación de su
  clínica… Pide el código a tu clínica…".
- **`/auth/pending-confirmation`:** "Aguardando a confirmação da clínica" /
  "Esperando la confirmación de la clínica". With the name known: "Você
  está vinculado(a) a {name}…" / "Estás vinculado/a con {name}…".
- **`/book/<id>`:** the notes placeholder is "Motivo da visita, sintomas,
  perguntas para a consulta…" / "Motivo de la visita, síntomas, preguntas
  para la consulta…". The details hint is "Estas informações ajudam a
  preparar a sua consulta." / "Esta información ayuda a preparar tu cita.".
- **Bogus `/join/<code>`, signed in:** "Este link pode ser inválido ou ter
  expirado. Peça à sua clínica…" / "Este enlace puede ser inválido o haber
  caducado. Pide a tu clínica…". Signed out, it redirects to signup, as
  designed.
- **`/subscribe?success=1`:** "Assinatura ativada! Boas-vindas ao SolvyMed
  Pro." / "¡Suscripción activada! Te damos la bienvenida a SolvyMed Pro.".
- **Team email input:** has an accessible name. `getByRole('textbox',
  { name })` finds it by "E-mail de quem vai entrar na equipe" / "Correo
  de la persona invitada".

**Checked in the JSON only:** the `/book` "A clínica confirmará…" hint and
the success hint. They only show once a slot is picked, and the test doctor
had no working hours.

**Found along the way, both pre-existing on master and not from #15:**
- **`/auth/pending-confirmation` sign-out label.** It renders the raw key
  **`auth.myAppointments.signOut`** in every locale, English included.
  The page calls `t("myAppointments.signOut")` inside the `auth`
  namespace, but the string lives at the top level
  (`myAppointments.signOut`). It's been there since `e841bd3`.
- **`/book/<id>` header.** It shows **"D Doctor"** for a pending patient:
  `page.tsx` falls back to a hard-coded English `name ?? "Doctor"` when
  the name lookup returns nothing.

**Cleaned up.** All throwaway doctors and patients are deleted.

**Merge gate: 🟢 for `74f599b`.** The two findings above are follow-ups,
not blockers for this copy PR.

**Addendum: 🟢 at `e97f381`.** This commit only changes the Arabic signup
role label in `ar.json`, to "مختص(ة) رعاية صحية" (healthcare professional);
I checked the diff. `ar.json` still parses, with 26 namespaces. Rendered
live, `/ar/auth/signup` is RTL and shows the new label, not the old
standalone "الرعاية الصحية".

**Addendum: 🟢 at `104ddf1`.** This commit changes `src/messages` only; I
checked the diff.
- **All 15 message files parse**, each with the same 26 namespaces as
  `en`. Every file starts with a UTF-8 BOM, as on master, so this isn't
  new and the app loads them fine.
- **`inviteCodeHint`** is now "Enter your invite code" in en, id, ja, ko,
  ru, th, vi, zh and zh-TW. Rendered live on `/auth/signup` with Patient
  selected: "Enter your invite code", with no "doctor's code" wording
  left.
- **German secretary strings** no longer mention "Arzt" or "Ärztin", for
  example "Nur das Hauptkonto der Praxis kann das ändern.".

**Addendum: 🟢 at `05771c0`.** This commit changes 7 strings in it, fr, ru
and ar, and nothing else in `src/messages`; I checked the diff.
- **Duplicate-patient messages are now neutral:** "questa persona", "Cette
  personne…", "enregistré(e)", "Эта запись…", "зарегистрирован(а)", and
  Arabic "هذا السجل".
- **Parsing:** all 15 files parse with 26 namespaces, and es and pt-BR are
  unchanged.

## PR #16 (`fix/pending-signout-and-book-name`) — two pre-existing display bugs, 🟢 at `63201e2`

**Scope: this entry covers exactly `63201e2`.** These are the two bugs I
reported in the #15 entry. Tested live with throwaway doctors and pending
patients (linked through `link_by_professional_public_code`), in en, pt-BR
and es.

**🟢 1. `/auth/pending-confirmation`.**
- **Sign-out label:** the button reads **"Sign out"** in en and **"Sair"**
  in pt-BR, found by role and name. The raw key
  `auth.myAppointments.signOut` is gone.
- **With a known professional:** the body names them ("…vinculado(a) a
  Opus Bookdoc…").
- **With a nameless professional** (`full_name` = ""): the generic "Sua
  conta está vinculada, mas a clínica ainda precisa confirmá-la…". There's
  no "Doctor", and no dangling "vinculado(a) a ,".

**🟢 2. `/book/<id>`.**
- **No `?name=`, as a pending patient:** the header shows the real "Opus
  Bookdoc · Psicologia" from `get_professional_public_info`, in en, pt-BR
  and es.
- **From the pending page's "Solicitar uma consulta" link:** it carries
  `?name=`, and shows the same correct name and specialty.
- **No info available:** for a random UUID, for a real but *unrelated*
  professional, and for a nameless one, the header shows the translated
  fallback. That's **"Professional"** in a fresh en session and
  **"Profissional"** in pt-BR, never "Doctor".

**Not covered:** the "from My appointments" entry point (step 3's first
half). It needs a fully linked patient with appointments. It uses the same
page and header code, and the pending-link entry point passed.

**Test note:** unprefixed (en) URLs follow the `NEXT_LOCALE` cookie. After
visiting a pt-BR page the "en" page renders in pt-BR, so I checked the en
fallback in a fresh browser context.

**Cleaned up.** All throwaway accounts are deleted.

**Merge gate: 🟢 for `63201e2`.**

**Addendum: 🟢 at `8369aa1`.** `42b89f7` stops My appointments injecting
`?name=Doctor`. `8369aa1` changes the German fallback to
"Gesundheitsfachkraft". This closes the entry point I couldn't cover
above. The patients were **fully linked** through
`generate_patient_invite_code` and `link_patient_by_invite_code`, so role
`patient` with a `linked_patient_id`.
- **Nameless doctor** (`full_name` = ""): the Book link on
  `/my-appointments` has **no `name=`** (`/book/<id>?`). The header shows
  the translated fallback: "Professional" (en), "Profissional" (pt-BR),
  "Gesundheitsfachkraft" (de). Never "Doctor".
- **Named doctor:** the link carries `?name=Opus+Named+Doc`, and the header
  shows it in en, pt-BR and de.
- **Nit, not blocking:** when there's no name, the link ends in a bare `?`
  (empty query string). It's harmless.

Cleaned up: the 4 throwaway accounts are deleted. **Merge gate: 🟢 for
`8369aa1`.**

**Addendum: 🟢 at `017d02a`.** Two small commits; I reviewed the diffs.
- **Repeated query params (`4dd0510`):**
  `/book/<id>?name=Alpha&name=Beta&specialty=S1&specialty=S2` returns HTTP
  200. The header shows the first values, "Alpha · S1", and there are 0
  page errors.
- **No dangling "?" (`017d02a`):** for a nameless doctor, the My
  appointments Book link is now exactly `/book/<id>`.

Cleaned up: the 2 throwaway accounts are deleted. **Merge gate: 🟢 for
`017d02a`.**

## PR #19 (`fix/unit-suite-green`) — unit suite green, 🟢 at `d054422`

**Scope: exactly `d054422`.** The diff is two files, +10 lines:
- a `next/navigation` mock (`useParams` and `useRouter`) in
  `BookingRequestsPanel.test.tsx`;
- `include: ['src/**/*.test.{ts,tsx}']` in `vitest.config.ts`, so vitest
  no longer collects the Playwright `e2e/` specs.

I checked the diff for `.skip`, `.only`, `xit`, `xdescribe` or `todo`, and
for any removed `it`, `test` or `describe`: **there are none**.

| | Test files | Tests |
|---|---|---|
| master `1bc3f56` (control) | 4 failed, 4 passed (8) | **18 failed**, 60 passed (78) |
| PR #19 `d054422` | 5 passed (5) | **78 passed (78)** |

It's the same 78 unit tests, all passing now, with nothing skipped. Once
this merges, checklist F-6 can go green.

**Merge gate: 🟢 for `d054422`.**

## PR #20 (`ci/github-actions`) — CI: typecheck, unit tests and advisory lint

> **Current status, at `b5b5dc4`: 🟢, and the review is clean.** The design
> **at this SHA**:
> - **"Typecheck and unit tests" job:** `npm ci`, then
>   `npm run typecheck` (= `next typegen && tsc --noEmit`), then
>   `npm test`.
> - **Separate "Lint" job:** `scripts/ci-lint.mjs` exits **0 on
>   findings**. It exits **2 on a crash or on any fatal parse error**,
>   listing the files and a "runner failed" summary. There's no
>   `continue-on-error`. It reports 35 errors and 17 warnings.
> - **Setup:** actions v7 (checkout 7.0.1, setup-node 7.0.0), pinned by
>   SHA, with `persist-credentials: false`. Master pushes are grouped per
>   SHA.
>
> CI run `36219009258` is green on both jobs: "✓ Route types generated
> successfully", 78/78 tests, and Lint at 35 errors and 17 warnings.
> **Review: Claude `/code-review high`, clean at `b5b5dc4`** (Copilot
> quota exhausted). Round 6 found no merge-blocking issues. See the round-6
> addendum at the end of this entry. Everything below is the history,
> oldest first; the earlier 🟢 lines apply only to their own SHAs.

**Scope of the first section below: exactly `48f81c9`.** The earlier entry
was for `2fdba55`; `48f81c9` moves the lint `continue-on-error` from the
job to the step. That design has since been replaced (see the status box
above).
- **Changes:** adds `.github/workflows/ci.yml`, triggered on `pull_request`
  and `push` with Node 24.
  - **"Typecheck and unit tests":** `npm ci`, `npm run typecheck`, `npm test`.
  - **"Lint (advisory)":** `npm ci`, then `npm run lint` with a
    **step-level** `continue-on-error: true` (`ci.yml:46`).
- **ESLint:** it's installed now (`eslint`, `eslint-config-next`,
  `@eslint/eslintrc`), and `lint` is `eslint .`.
- **Build:** `next.config.ts` sets `eslint.ignoreDuringBuilds`, with the
  comment "type errors still fail the build".

**🟢 (1) Checks at `48f81c9`** (CI run `36209706986`, workflow **success**):
- **Typecheck and unit tests: ✅.** `tsc --noEmit` is clean, and the tests
  are 5 files, **78/78** passed.
- **Lint (advisory): ✅, green.** Its findings are still reported: **54
  problems (35 errors, 19 warnings)** in the log, plus 22 check-run
  annotations.
- **PR state:** `mergeStateStatus` is `CLEAN`. (At `2fdba55`, the job-level
  setting showed lint as a red ✗ and the PR as `UNSTABLE`.)

**(2) Vercel preview: the build is ✅, but pages were not checked.**
Correction to my earlier note: the preview is behind **Vercel SSO
deployment protection**. `curl -L` followed the redirect to Vercel's login
page, and it was *that* page that returned 200, not the app. What's proven
is that the Vercel build and deploy check passed with ESLint installed.
Loading real pages on a preview needs a protection-bypass token.

**(3) Local run: skipped on purpose.** In this worktree `node_modules` is a
**junction into the main checkout**, so `npm ci` here would wipe the
dependencies other sessions' servers run on. CI's clean `npm ci` covers it.

**Merge gate: 🟢 for `48f81c9`.**

**Addendum: 🟢 at `380932f`.** Two commits on top of `48f81c9`:
- **`eb47acb` merges master (#21) in.** I checked it: the #19, #20 and #21
  entries are intact and in order, with no conflict markers.
- **`380932f` fixes a test that only passed before 9 a.m.**
  `booking-client.test.tsx` clicks today's 9:00 slot, which the page
  hides once 9:00 local time has passed. The fix pins `Date` only
  (`toFake: ["Date"]`, 2030-01-14 06:00), so the real timers `waitFor`
  uses keep running. They're restored after each test.

| | Local time | Tests |
|---|---|---|
| master `81101fe` (control) | 09:59 | **6 failed**, all in `booking-client` |
| #20 `380932f` | 10:00 | **78/78 passed** |

CI run `36213290674` at `380932f` is green on both jobs (Typecheck and
unit tests, and advisory Lint).

**Review: Claude `/code-review high` at `380932f`** (Copilot quota
exhausted). 9 findings were posted as inline PR comments. None is a
correctness bug; the notable ones:
- `cancel-in-progress: true` also cancels `master` push runs, so
  back-to-back merges leave a merge commit with no CI result.
- Lint is fully non-gating in two places.

The rest are small: annotation caps, ESLint ignores for generated dirs, the
two lint switches not linked, a duplicate `npm ci`, split `beforeEach`
hooks, and actions pinned to tags. The first finding, the gate being scoped
to an old SHA, is resolved by this addendum. **Review status: not yet
clean.** It's waiting on web dev's fixes or answers; I'll re-run it on the
new HEAD.

**Addendum: CI 🟢 at `4d1f66d`; review not clean.**
- **What changed:** `4d1f66d` answered all 9 round-1 threads. CI is now a
  single "Typecheck and unit tests" job, with lint as an advisory
  **step** inside it that reports totals in the job summary. Actions are
  pinned to SHAs, and concurrency cancels only PR runs.
- **CI:** run `36214247909` is green. `npm ci`, typecheck, the tests
  (78/78) and the Lint (advisory) step all pass, and lint still reports
  54 problems (35 errors, 19 warnings). There's no separate "Lint
  (advisory)" check any more.
- **Review round 2: Claude `/code-review high` at `4d1f66d`** (Copilot
  quota exhausted). **6 new findings** were posted inline, three of them
  real:
  - The concurrency group still loses a *queued* master run when a third
    merge lands (GitHub keeps one pending run per group), so group pushes
    by SHA.
  - `|| true` masks an ESLint crash (exit 2) as a green step with no
    findings.
  - `if: always()` runs lint after a failed `npm ci`, where `npx eslint`
    would fetch ESLint 10.
  - Also: ESLint runs twice; the synced `packages/shared` copy gets
    linted; and this entry described the old two-check layout, which this
    addendum fixes.
- **Review status: not clean.** I'll re-run it on the next HEAD.

**Addendum: CI 🟢 at `7ffedcf`; review round 3 not clean.**
- **What changed:** `cebdc88` and `7ffedcf` answer round 2.
  - Master pushes are grouped per commit SHA.
  - Lint runs once, through `scripts/ci-lint.mjs` (the ESLint API),
    which exits 2 on a crash and adds a summary line.
  - The lint step runs only when `npm ci` succeeded and the run wasn't
    cancelled.
  - `packages/**` is ignored.
  - A new gating step, `node --check scripts/ci-lint.mjs`, runs first.
    The runner at `cebdc88` had a syntax error that looked exactly like
    "findings", and it's fixed in `7ffedcf`.
- **CI:** run `36215208355` is green: checkout and setup (pinned SHAs),
  `npm ci`, typecheck, the tests (78/78), `node --check`, and Lint
  (advisory) reporting **35 errors, 17 warnings**.
- **Review round 3: Claude `/code-review high` at `7ffedcf`.** 7 findings
  were posted inline.
  - **Worth fixing:**
    - A *runtime* crash in the runner (e.g. the top-level `import` failing
      to resolve, outside the try) still exits 1 and looks like findings,
      since `node --check` only catches syntax. The suggested root fix:
      exit 0 on findings, non-zero only on a crash, and drop
      `continue-on-error`.
    - Findings past GitHub's annotation cap print in the log with **no
      file or line**.
  - **Trivial:** workflow-command escaping, and a stray blank line in
    `.gitignore`.
  - **Already decided by UX:** two findings (lint should gate; don't use
    `::error` on untouched files) re-raise the "lint advisory until
    post-launch" decision. They should be answered and resolved, not
    reopened.
  - The gate-SHA finding is resolved by this addendum.
- **Review status: not clean** (2 real, 2 trivial).

**Addendum: CI 🟢 at `80fee99`; review round 4 not clean.**
- **What changed:** `80fee99` answers round 3.
  - The runner now **exits 0 on findings and non-zero on any crash**:
    ESLint is imported inside the try, and there's no
    `continue-on-error`.
  - The `node --check` step is removed as redundant.
  - Findings print as `::warning` with `path:line:col` in the text, and
    the escaping is fixed.
  - The stray `.gitignore` line is gone.
- **CI:** run `36215570827` is green (checkout and setup, `npm ci`,
  typecheck, tests 78/78, and Lint (advisory) reporting 35 errors and 17
  warnings). The steps now differ from what the header of this entry
  describes.
- **Review round 4: Claude `/code-review high` at `80fee99`.** 8 findings
  were posted inline.
  - **Real:**
    - The typecheck runs `tsc` without `next typegen`, so Next's route
      and page types aren't checked: a bad `params` type passes CI and
      only fails `next build`.
    - `actions/checkout` and `setup-node` v4.4.0 run on GitHub's
      deprecated Node 20 action runtime.
  - **By design, with a cheap improvement:** a lint crash now fails the
    single job, under the "Typecheck and unit tests" name. A separate
    "Lint" job would attribute it correctly.
  - **Nits:** the annotation cap, where the ~10 shown are arbitrary; the
    test-clock design (pass `now` into the helpers); the catch block
    mislabelling a failed summary write; and a path recomputed per
    message.
  - The gate-SHA finding is resolved by this addendum.
- **Review status: not clean** (2 real).

**Addendum: CI 🟢 at `8bd4f9b`; review round 5 not clean.**
- **What changed:** `8bd4f9b` answers round 4. It adds `next typegen` before
  typecheck, moves the actions to v7 (Node 24, pinned SHAs), and makes
  Lint its own job again. Web dev notes that Next types page props as
  `{ params: Promise<…> } & any`, so a wrong page `params` isn’t caught
  by `next build` either; CI now matches the build exactly.
- **CI:** run `36216041689` is green on both jobs.
- **Review round 5: Claude `/code-review high` at `8bd4f9b`.** 8 findings
  were posted inline.
  - **Real:** `ci-lint.mjs` counts **fatal parse errors** as ordinary
    findings and exits 0. A broken parser or config gives a green Lint
    check, because `fatalErrorCount` is never checked.
  - **Worth a one-liner:** `npm run typecheck` doesn’t run `next typegen`,
    so local and CI typechecks differ.
  - **Low:** ESLint 9.39.5 is deprecated; the ignore list drifts from
    `.gitignore`; `persist-credentials` isn’t disabled; `@types/node` is
    22 while CI runs 24; and the Lint job costs a second `npm ci`
    (accepted).
  - The stale-header finding is resolved by the status box at the top of
    this entry.
- **Review status: not clean** (1 real).

**Addendum: 🟢 at `b5b5dc4`; review round 6 clean.**
- **What changed:** `b5b5dc4` fixes the round-5 bug. Fatal parse errors
  now make the runner list the files and **exit 2** with the "runner
  failed" summary. Web dev verified it with an unparseable probe file.
- **Also in this commit:**
  - `typecheck` is `next typegen && tsc --noEmit`, and CI calls the
    script.
  - `persist-credentials: false` on both checkouts.
- **CI:** run `36219009258` is green on both jobs.
- **Review round 6: Claude `/code-review high`, clean at `b5b5dc4`**
  (Copilot quota exhausted). **No merge-blocking findings.** 8
  low-severity or design notes were posted inline; none is a correctness
  bug. The two worth a **follow-up PR** rather than more commits here:
  - **CI runs tests in UTC**, so the timezone regression tests can't fail
    there. Set `TZ=America/Sao_Paulo` (the users are in Brazil) on the
    test step.
  - The `next` range `^15.1.0` allows versions without `next typegen`.
    Raise it to `^15.5.0`; today only the lockfile's 15.5.19 makes it
    work.
  - The rest are design notes: stale local `.next/types`, local
    `npm run lint` exiting 1, linking the two lint switches, the
    clock-injection refactor, Windows path normalisation in the fatal
    list, and duplicated setup steps across the jobs.

**Merge gate: 🟢 for `b5b5dc4`, review clean.**

## PR #21 (`hotfix/auth-links-locale`) — password reset 404 on prod; auth emails keep the language, 🟢 at `ce40aef`

**Scope: exactly `ce40aef`.** This is the hotfix for the prod reset 404
logged under "Production auth-link check" (master's
`/en/auth/reset-password` gets geo-rewritten to `/<cc>/en/…`, a 404). It
also fixes the PKCE problem found while testing it: web reset requests
used PKCE, so real email links returned `?code=`, which the hash-only
reset page can't read.

**How it was tested.** Vercel previews are behind SSO, so I ran the build
locally at `ce40aef` (and the earlier HEADs as they came in).
- **Geo:** simulated by injecting `x-vercel-ip-country` (TH, BR, US) on
  requests to the app only.
- **Fresh browsers:** each link was opened in a brand-new context (no
  cookies), as if from a phone's mail app.
- **Real links:** real recovery links, built with admin `generate_link`
  and followed through GoTrue `/verify`, with the host swapped to the
  local app.

**🟢 Reset.**
- **The request is implicit-flow:** the real `/auth/v1/recover` request
  from the forgot page sends **`code_challenge: null`**. The `redirect_to`
  is `https://www.solvymed.com/pt-BR/auth/reset-password`, or `…/en/…` for
  en.
- **The real email link has the right shape:** mob dev checked it
  **server-side** on prod for a reset triggered from the page. The stored
  token is plain, not `pkce_`, and verify returns **303 to
  `/pt-BR/auth/reset-password#access_token=…&type=recovery`**. No token
  left mob dev's session.
- **pt-BR link, fresh browser from TH and from BR:** the pt-BR form, and
  the new password logs in. No 404.
- **en link, fresh browser from TH and from BR:** it lands on
  **`/auth/reset-password` with `html lang="en"`**, shows the form, and
  the new password works.
  - On `76476e9` this landed in the geo locale instead (`/th/…`,
    `/pt-BR/…`). **`0c03600` fixed it** by pinning `NEXT_LOCALE=en` on
    explicit `/en/` requests.
- **Stale link, then a new one, in the same browser:** open a tokenless
  `/pt-BR/auth/reset-password` first (it shows the error state), then a
  real link, either in a **new tab** or the **same tab with a full load**.
  In both cases the form opens and "Senha atualizada" shows.
  - One edge case, not a bug: a same-path, hash-only change in the same
    tab doesn't re-validate. Real links always arrive through Supabase's
    `/verify`, which gives a full page load.
- **Invalid link:** a bogus or legacy `?code=` shows the error state ("…O
  link pode ter expirado"), with no page errors.

**🟢 Signup.**
- **The link carries the locale:** the confirmation email's redirect is
  `/api/auth/callback?locale=pt-BR`.
- **Fresh browser, `token_hash`:** it lands on `/pt-BR/dashboard`, with
  `NEXT_LOCALE=pt-BR` pinned.
- **Fresh browser, PKCE `?code=`:** it can't be exchanged there, so it
  lands on **`/pt-BR/auth/login`**, per the revised plan. The email is
  already confirmed by GoTrue. Proper cross-browser signup comes with
  S-01; see checklist A-15.

**🟢 `/en/auth/login`**, fresh browser from TH and from BR: the English
`/auth/login` (`lang="en"`), no longer a 404.

**🟢 No regressions in routing.**
- Unprefixed paths still geo-redirect (`/auth/login` goes to
  `/pt-BR/…` for BR and `/th/…` for TH).
- `/es/…` is left alone.
- `/identity-x` is no longer mistaken for the `id` locale.

**Cleaned up.** All throwaway accounts are deleted; prod has 0
`e2e-test-opus-*` accounts left.

**Merge gate: 🟢 for `ce40aef`.**

## PR #22 (`fix/play-store-link`) — store buttons, 🟢 at `11ecf2f`, review clean

**Scope: exactly `11ecf2f`.**
- **What it does:** the Play button opens the Play listing with an
  attribution referrer, and the old expo.dev build link is gone.
- **iOS:** the button is driven by `NEXT_PUBLIC_IOS_APP_URL`. The
  variable is unset, so it shows "soon"; beta and store modes are
  unit-tested.
- **Invite page:** `/invite/<code>` is rewritten to the app's real flow
  and translated.
- **TZ:** the tests are pinned to `America/Sao_Paulo` in
  `vitest.config.ts`.

**Tested live on the Vercel preview**, using the automation bypass
header (the secret is never logged). The preview served the real app,
so checklist F-8 passes.

**🟢 Landing (`/pt-BR`, `/es`, `/en`).**
- **Play:** both buttons link to
  `play.google.com/store/apps/details?id=com.burrowsoft.solvymed&referrer=utm_source=solvymed_web&utm_medium=web&utm_campaign=landing`
  (UX's option A).
- **Removed:** no `expo.dev` anywhere, no iOS store link, and no
  `a[href="#"]`.
- **iOS placeholder:** a non-focusable `div` ("Em breve" / "Pronto" /
  "Soon"), shown after Play.

**🟢 Invite (`/pt-BR/invite/<code>`, `/es/…`, unprefixed).**
- **Play button:** it comes first, as the primary button, with
  `utm_campaign=invite` and a translated label ("Disponível no Google
  Play" / "Obtener en Google Play").
- **Step 2:** it matches the mobile app's real login label, which I
  checked in mobile master `lib/i18n.ts`: "toque em **Cadastre-se**,
  escolha Paciente…" / "toca **Regístrate**…".
- **Metadata:** `robots: noindex, nofollow`, no canonical link, and a
  neutral OG title ("Seu convite para o SolvyMed").
- **Contrast:** the primary Play button, **measured live**, is white on
  `#0f766e` = **5.47:1**, which passes WCAG AA for the 18px bold label. At
  `7deefc7` it was 2.49:1 (`teal-500`), which I flagged as BLOCKING.

**Review: Claude `/code-review high`, clean at `11ecf2f`** (Copilot quota
exhausted). This follows UX's convergence rule: BLOCKING means
correctness, security, data-loss, crash or a real UX break.
- **Round 1, `5142906`:**
  - The invite label was hard-coded English and ignored the iOS config.
  - The unit test read the real env.
  - TZ was set only in CI.
  - The iOS placeholder was a fake `href="#"` link.
- **Round 2, `cbd3447`:** 3 BLOCKING:
  - The steps said "Create account", but the app's login shows "Sign
    up" / "Cadastre-se".
  - `/invite` was indexable.
  - The disabled iOS button was primary, with Play secondary.
- **Round 3, `7deefc7`:** the contrast regression.
- **`11ecf2f`:** a one-class fix, checked live.

**FOLLOW-UP (listed in the PR body):**
- twitter:title still comes from the homepage.
- **`/join/secretary/<code>?email=` is still indexable.** This is
  pre-existing and carries an invitee email, so web dev is raising a
  privacy PR.
- The invite code isn't validated.
- The page's openGraph drops site_name and locale.
- The step text doesn't mention the onboarding slides.
- The faded "Soon" badge.
- The beta button duplicates the shared button classes.
- `<Analytics/>` records `/invite/<CODE>`.
- `apps.apple.com` accepts any path, and a TestFlight trailing slash is
  rejected.
- The TZ pin drops UTC coverage.

**CI at `11ecf2f`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `11ecf2f`, review clean.**

## PR #23 (`fix/invite-join-privacy`) — privacy part A, 🟢 at `e39ccf3`, review clean

**Scope: exactly `e39ccf3`.**
- **Indexing:** invite and join links are never indexed, and neither
  are the signup and login URLs they hand off to.
- **Validation:** invite codes are validated.
- **Share previews:** the invite page gets its own twitter and OG tags.
- **Analytics:** Vercel Analytics URLs are redacted before sending.
- **Sessions:** the middleware now saves refreshed Supabase session
  cookies.

**Tested live on the Vercel preview**, using the automation bypass
header (the secret is never logged), with a throwaway
`e2e-test-opus-pr13-*` doctor that has since been deleted.

**🟢 X-Robots-Tag.** It is `noindex, nofollow` on:
- `/invite/<code>` and `/join/<code>`, both prefixed and on the
  unprefixed 302 geo-redirects;
- `/pt-BR/join/<code>` (307 → `signup?join=`);
- `/join/secretary/<code>?email=`;
- `/auth/signup?secretary=…&email=…`, `/auth/signup?join=…` and
  `/auth/login?next=…`.

Plain `/auth/login`, `/auth/signup` and `/pt-BR` keep plain `noindex`.

**🟢 Invite code validation.** `/pt-BR/invite/AB12CD-` and
`/pt-BR/invite/A` return 404.

**🟢 Share previews.** On `/pt-BR/invite/<code>`, og:title and
twitter:title are both "Seu convite para o SolvyMed". og:site_name,
og:locale `pt_BR` and twitter:card `summary` are present.

**🟢 Analytics redaction.** The preview sends no `/_vercel/insights`
beacons, so I checked redaction by running the branch's
`redactAnalyticsUrl` on real URLs rather than by catching the payload.
- **Paths:** invite, join and join/secretary codes become `[code]`.
- **Fragment:** `#access_token` on reset links is dropped.
- **Query strings:** now an allowlist. Only utm_*, date, week, view, tab,
  archived, locale and country keep their values; every other value
  becomes `[redacted]`.
- **My round 1 BLOCKING cases now pass**, all covered by unit tests:
  - `?next=/pt-BR/join/secretary/S-…`;
  - `?q=Maria Silva`;
  - `?q=123.456.789-00`.
- **Bad input:** a URL that can't be parsed drops the event.

**🟢 Session refresh cookies.** I sent requests with a real session
whose access token had expired 120 s earlier.
- **Pages:** `/pt-BR/dashboard`, `/pt-BR/dashboard/settings`,
  `/pt-BR/invite/<code>` and `/pt-BR` (307 → dashboard).
- **Result:** every response now carries `Set-Cookie: sb-<ref>-auth-token`
  with a **new refresh token and a new access token**. Each new access
  token is valid (`/auth/v1/user` returns 200).
- **Cookie attributes:** Path=/, Max-Age 400 days, SameSite=lax.
- **At `a23ce60`** the same requests returned no Set-Cookie at all.
- **Bogus refresh token:** a request to `/pt-BR/dashboard` gets 307 →
  `/pt-BR/auth/login`, and the auth cookie is cleared.
- **Harmless:** on `/pt-BR`, the page's own redirect for logged-in users
  sends the auth and `NEXT_LOCALE` cookies twice, carrying the same
  valid session.

**Review: Claude `/code-review high`, clean at `e39ccf3`** (Copilot quota
exhausted).
- **Round 1, `a23ce60`:** 7 inline comments.
  - 2 BLOCKING: `next` and `q` reached Analytics unredacted.
  - FOLLOW-UP: the middleware dropped the refreshed cookies; the 404 is
    bare English; login and signup URLs had plain noindex; beforeSend
    was re-created on each render; OG fields are duplicated.
- **Round 2, `9ac1944`..`e39ccf3`, changed code only:**
  - Both BLOCKING items are fixed with the allowlist.
  - The cookie fix covers every return path: the dashboard-guard
    redirect, the geo-redirect, `?country=`, and the next-intl
    response.
  - Login and signup now get noindex, and beforeSend is a stable
    module-level function.
  - No new findings.

**FOLLOW-UP (reasons in the resolved threads):**
- **404:** `notFound()` shows the bare English page.
- **OG:** the invite page's OG fields duplicate the layout's.

**CI at `e39ccf3`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `e39ccf3`, review clean.**

## PR #24 (`fix/secretary-link-no-email`) — privacy part B, 🟢 at `fd02c10`, review clean

**Scope: exactly `fd02c10`.**
- Secretary invite links no longer carry the invitee's email.
- The join page shows a masked hint from `get_secretary_invite_hint`
  (migration 093, live).
- Signup checks the email with `secretary_invite_email_matches` before
  the account is created.
- Stale and malformed codes say the invite isn't valid.

**Tested live on the Vercel preview.**
- **Bypass header:** only on preview requests, never on Supabase ones;
  the secret is never logged.
- **Test data:** throwaway `e2e-test-opus-pr13-*` doctors and
  `e2e-test-opus-pr24-*` invitees. All deleted afterwards, with their
  invites.

**🟢 Share link (tested at `50a19dc`, where this code last changed).**
- **Copied link:** Settings → Team → Invite gives
  `/pt-BR/join/secretary/<code>`, with no `?email=`.
- **WhatsApp:** the `wa.me` text doesn't contain the email either.

**🟢 Open invite (signed out).**
- **Hint:** "Convite de Clinica Opus Pr24", "Este convite é para
  e2\*\*\*@burrowsoft.com", and "Criar conta".
- **Where the lookup runs:** the only `get_secretary_invite_hint` call
  comes from the browser. The SSR HTML contains neither the masked nor
  the full email.
- **Old links:** a link with `?email=other@example.com` ignores the
  parameter. The CTA is `/pt-BR/auth/signup?secretary=<code>`.

**🟢 Signup, end to end.**
- **Email field:** empty and editable.
- **Wrong email:** shows "…não corresponde ao convite, ou o convite não é
  mais válido…". Only the matches RPC runs: no `/auth/v1/signup` and no
  account.
- **Right email:** matches, then signUp. After confirmation it lands on
  `/pt-BR/dashboard`, with `role=secretary`, `invited_by` set to the
  doctor, and the invite's `accepted_at` set.

**🟢 Stale link.** This was round 1's BLOCKING, and my resend repro now
passes.
- **Setup:** invite X, then resend to X.
- **Old code, join page:** "Convite inválido / Este convite não é mais
  válido", with no signup link.
- **Old code straight on `/auth/signup?secretary=`, CORRECT email:** the
  widened message, with no signup call and no account. At `50a19dc` this
  showed the misleading "doesn't match".
- **Resent code:** its page shows the hint and signup.

**🟢 Malformed codes (`S-ABC`, `S-ABCDEFGHI`, `X-ABCDEFGH`).**
- **Join page:** "Convite inválido", server-rendered (it's in the SSR
  HTML), with no signup.
- **RPC calls:** none, on the join pages or on
  `/auth/signup?secretary=S-ABC`.

**🟢 Error handling, forced with a Playwright route.**
- **Hint RPC error:** a 400 `too_many_attempts` or a network abort still
  offers "Criar conta", without the hint. It does not show the invalid
  state.
- **`email_matches` error:** a 400 `too_many_attempts` lets signUp go
  ahead. The accept-time check is the boundary.

**Review: Claude `/code-review`, clean at `fd02c10`.**
- **Round 1, `50a19dc`:** I ran it before code review moved to the
  dedicated code reviewer agent. It found 1 BLOCKING (the stale link
  shown as a mismatch), confirmed live.
- **Round 2, `fd02c10`:** by the code reviewer, clean, with no
  BLOCKING.

**FOLLOW-UP:**
- **InviteHint:** it spends the per-code budget on every mount; cache it
  in sessionStorage.
- **Tests:** the pre-check branches have no tests, and the signup guard
  is redundant.
- **Mobile links:** mobile 1.2.0 still builds links with `?email=`. It's
  fixed in the mobile 1.3.0 cleanup; web keeps ignoring the parameter.

**CI at `fd02c10`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `fd02c10`, review clean.**

## PR #18 (`feat/patient-archive`) — patient archive + 8-char passwords, 🟢 at `047f7a6`, review clean

**Scope: exactly `047f7a6`.** This is the rebase onto master after #24.
Migrations 094 (archive) and 096 (the detach fix) are live on prod.

**Tested live on the Vercel preview (pt-BR).**
- **Bypass header:** only on preview requests; the secret is never
  logged.
- **Test data:** throwaway `e2e-test-opus-*` doctors, patients, patient
  accounts and a secretary, all deleted afterwards. Seeded clinical rows
  are removed first, since 094 intentionally refuses to delete a doctor
  whose patients have history.

**🟢 1. Delete vs Archive.**
- **Patient with a record:** "Arquivar cadastro" is shown, with no Delete.
- **Patient with no history:** both are shown. Delete asks "Excluir …?
  Esta ação não pode ser desfeita." and the row is gone.

**🟢 2. Archive confirm and effects.**
- **Confirm text:** "Nenhuma consulta futura será cancelada." for a
  patient with none. "2 consultas futuras serão canceladas." for one with
  a confirmed appointment plus a pending request from their linked app
  account.
- **Cancellation:** after archiving, both are cancelled. Past requests are
  left alone, by design.
- **Banner:** "Arquivado em 26 de set. de 2026 por Dra Opus Pr18" appears
  without a reload, in about 3.5 s via `router.refresh`.
- **Hidden actions:** Archive, Delete, New record and New prescription.
- **Push:** the linked account had no push token, so the cancellation
  notification wasn't observable. It's code-reviewed only.

**🟢 3. Lists and pickers.**
- **Lists:** Patients and search hide both archived patients. The chips
  read "Ativos (1)" and "Arquivados (2)". `?archived=1` lists them, with
  the "Arquivado em … por …" label.
- **Dashboard:** the patient count is 1, the active patient only.
- **New appointment:** the datalist offers only the active patient.

**🟢 4. Restore.**
- **From the banner:** the banner clears without a reload and
  `archived_at` is NULL.
- **From the duplicate warning:** the new-patient form with an archived
  person's name and phone shows the match with the "Arquivado" badge,
  Restaurar and "Criar mesmo assim". Restaurar restores it and lands on
  the patient page, with no second record created.

**🟢 5. No raw codes.** No
`patient_archived`/`patient_has_clinical_history` was found on any page
visited.
- **Schedule, by name:** creating an appointment for a name matching only
  an archived patient shows "Este cadastro está arquivado. Restaure-o em
  Pacientes para agendar uma consulta." No row is created.
- **Schedule, re-activation:** re-activating a cancelled appointment of an
  archived patient shows the same copy. The select reverts, and the DB
  stays `cancelled`.
- **Patient app account booking:** booking at the clinic that archived
  them shows "Esta clínica não está aceitando novos agendamentos para a
  sua conta…". The RPC returns `patient_archived`.
- **Booking requests:** only the propose path could be exercised live, and
  it doesn't raise `patient_archived`; see FOLLOW-UP.
  - Archiving cancels every upcoming request, so no future pending
    request can exist for an archived patient.
  - A past one shows no Confirm button, so the Confirm → alert path is
    code-verified only.

**🟢 6. Secretary.** A secretary can archive and restore. The banner reads
"Arquivado em … por Sec Opus Ana".

**🟢 7. Passwords.**
- **Signup, 7 characters:** "A senha deve ter pelo menos 8 caracteres.",
  with no `/auth/v1/signup` call.
- **Signup, 8 characters:** the account is created ("Verifique seu
  e-mail").
- **Reset via a real recovery token:** 7 characters gives the same
  message, with no update call. 8 characters works (password grant OK).
- **Existing 6-character password:** still logs in, to `/pt-BR/dashboard`.
  The Supabase minimum stays 6 until mobile 1.3.0 is on Play, per UX.

**🟢 #24 + #18 together (secretary signup).** The join page shows the
masked hint.
- **7 characters:** the length error, with no RPC and no signup.
- **8 characters, wrong email:** the mismatch copy, from the matches RPC
  only, with no account.
- **8 characters, right email:** matches, then signup, and the account is
  created.

**DB findings from this run** (mob dev):
- **094 blocked patient-account deletion.** It failed when a past active
  appointment pointed at an archived record: the `ON DELETE SET NULL`
  tripped the trigger. Fixed by 096, and re-verified live: the delete
  now succeeds and `patient_auth_id` becomes NULL.
- **Doctor accounts with clinical history can't be deleted.** This is
  intended (records are retained for 20 years); close-account will
  handle it.

**Review: Claude `/code-review` (code reviewer), clean at `047f7a6`.**

**FOLLOW-UP:**
- **Propose to an archived patient:** a doctor can still send "Propor novo
  horário" on an archived patient's past request. It succeeded live and
  set `proposed_date`. 094 lets it through because `date` doesn't change,
  but the patient's accept would then be refused.
- **Accept on `my-appointments`:** it ignores `acceptProposal` errors, so
  a refused accept is silent. This is pre-existing; a past-dated proposal
  shows no Accept button, so it wasn't reachable live.
- **Push on archive:** not observable without a device token.

**CI at `047f7a6`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `047f7a6`, review clean.**

## PR #25 (`fix/account-delete-page`) — delete-account page, 🟢 at `15b358a`, review clean

**Scope: exactly `15b358a`.** This covers the public `/account/delete`
request form:
- **The note:** the false "records will be erased" warning is replaced
  by a note that separates professionals and patients.
- **Support address:** the support mailto moves to `support@solvymed.com`.
- **Translation:** the page is translated into 15 locales.

Tested live on the Vercel preview, using the bypass header on preview
requests only.

**🟢 All 15 locales render.**
- **Locales:** pt-BR, en (unprefixed), es, de, fr, it, ja, ko, zh, zh-TW,
  ru, ar, th, vi and id each return 200 with a translated title, e.g.
  "Excluir sua conta", "Konto löschen" or "حذف حسابك".
- **Content:** there are no missing keys, no `burrowsoft.com`, and no
  "erased and cannot be recovered".
- **Note:** it reads, for example, "Profissionais de saúde: por lei, os
  prontuários … 20 anos…" or "Healthcare professionals: by law … 20
  years".
- **Mailto:** `support@solvymed.com` with a localized subject in every
  locale, e.g. "Encerrar minha conta", "Close my account", "Cerrar mi
  cuenta" or "Mein Konto schließen".
- **RTL:** ar renders `dir=rtl`.
- **Labels:** in pt-BR and ar, clicking a label focuses its field
  (`delete-email`, `delete-reason`).

**🟢 Submit (pt-BR and de).**
- **Confirmation:** "Solicitação recebida — Recebemos sua solicitação
  para **<email>**." and "Anfrage erhalten — Wir haben Ihre Anfrage für
  **<email>** erhalten." The email is in bold.
- **Database:** each submit creates one `deletion_requests` row with
  status `pending`, the reason stored and `processed_at` null. Both test
  rows were deleted afterwards.
- **Blank email:** a whitespace-only email with the client `required`
  removed returns the server's `email_required`, shown as "Informe seu
  e-mail.". The `generic` error copy is code-verified only.

**Review: Claude `/code-review` (code reviewer), clean at `15b358a`.**

**FOLLOW-UP:** nothing alerts support when a request lands. Mob dev owns
this: a webhook, edge function and email, probably with S-01. The 20-year
wording is to be re-aligned with the privacy-policy rewrite.

**CI at `15b358a`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `15b358a`, review clean.**

## PR #26 (`perf/vercel-region-gru1`) — Vercel functions in São Paulo, 🟢 at `1caa406`, review clean

**Scope: exactly `1caa406`.**
- **Region:** `vercel.json` sets `"regions": ["gru1"]`.
- **Gate paragraph:** the PR adds the "Current gate" paragraph at the top
  of the Merge gate section. I've read it and it's accurate.

Tested on the Vercel preview against prod, with a throwaway doctor
(12 patients, 1 record) using a real SSR session cookie. The bypass
header was sent on preview requests only.

**🟢 1. Region.** `x-vercel-id` on the preview is `sin1::gru1::…` for all
of these:
- **Pages:** `/pt-BR` (307 → dashboard), `/pt-BR/dashboard/patients` and
  a patient page.
- **Route handlers:** `/api/billing/portal` (405 on GET) and
  `/api/webhooks/stripe`.
- **A server action:** the record save on the patient page.

Prod is still `sin1::iad1::…`. My edge is Singapore; the second segment
is the function region.

**🟡 2. TTFB, median of 9 each, measured from Thailand (edge `sin1`).**

| Page | Preview (gru1) | Prod (iad1) |
|---|---|---|
| Patients list | 1402 ms | 1677 ms (−16% on gru1) |
| Patient page | 1627 ms | 1585 ms (+3%, noise) |

From here the edge→function hop is longer to gru1 than to iad1, so this
understates the gain for Brazilian users. There, both the edge and the
database are in São Paulo. What it does show: no regression, and an
improvement on the multi-query list page. A Brazil-side measurement
would be the real before and after.

**🟢 3. Stripe webhook on the preview (test mode).** I sent a synthetic
test event signed with the test webhook secret. The type was
`customer.created`, which the handler just acknowledges, so no
subscription is touched.
- **Signed:** 200 `{"ok":true}`, in `gru1`.
- **Bad signature:** 400 "Invalid signature".
- **Checkout:** none run, per the standing no-checkout-on-preview rule.

**🟢 4. Smoke.**
- **Login:** lands on `/pt-BR/dashboard`, which shows a patient count of
  12.
- **Patient page:** it renders.
- **New record:** saved via a server action, visible on the page, and
  present in the DB.

**Review: Claude `/code-review` (code reviewer), clean at `1caa406`.**

**CI at `1caa406`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `1caa406`, review clean.** After the merge, confirm
prod shows `::gru1::`.

**Prod addendum (`67df2c9`):**
- **Region:** `sin1::gru1` on pages, `/api/billing/portal` and a server
  action.
- **Stripe webhook:** a signed TEST `customer.created` to
  `https://www.solvymed.com/api/webhooks/stripe` returns 200
  `{"ok":true}`, and a bad signature returns 400.
- **Smoke:** login, the dashboard, a patient page and a record save all
  pass.

## PR #28 (`fix/privacy-facts`) — /privacy factual fixes, 🟢 at `aa4251d`, review clean

**Scope: exactly `aa4251d`.** This is English-only text in
`privacy/page.tsx`. The diff against master touches only the lines
below.

Checked live on the preview at `/privacy` and `/pt-BR/privacy`, with prod
alongside as the "before":
- **Last updated:** "September 26, 2026" (prod: June 18, 2026).
- **Section 5, Data Sharing:**
  - Supabase: "servers in Brazil, São Paulo region" (prod: "US/EU").
  - New line, Vercel: "server processing in Brazil, São Paulo region".
  - New line, Resend: "transactional email … (USA)".
  - No "US/EU" remains.
- **Section 7, Retention:** UX's final text.
  - Medical records (clinical notes, prescriptions and exam files) are
    kept for at least 20 years.
  - A patient with records can only be archived.
  - An account holding records is closed by support rather than deleted.
  - Other account data is kept while the account is active.
  - This matches what 094 and 096 enforce.
- **Section 8:** the "right to be forgotten" bullet adds "except medical
  records, which are kept as described in section 7."

**Review: Claude `/code-review` (code reviewer), clean at `aa4251d`.**

**FOLLOW-UP, for the privacy-policy rewrite:**
- **Section 6:** it says only professionals access their patients'
  records, but linked secretaries now do too.
- **Transfers:** Stripe and Expo (US) aren't marked as international
  transfers.
- **Language:** the policy and the terms are English-only in every
  locale.

**CI at `aa4251d`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `aa4251d`, review clean.**

## PR #29 (`feat/record-corrections`) — 24-hour correction rule, 🟢 at `63379ac`, review clean

**Scope: exactly `63379ac`.** This ships in lockstep with mobile #19.
- **097:** the corrections migration.
- **098:** a hotfix. 097's `_clinical_row_editable` returned NULL
  whenever `app.retention_purge` was unset, so the lock never fired.
  I found this live on prod on the first run: a doctor PATCHed and
  DELETEd a 30-hour-old record, and the service role updated any
  clinical row. Mob dev fixed it in 098.

**Tested live on the preview, after 098 was live.**
- **Test data:** a throwaway doctor with patients, records and
  prescriptions seeded through the doctor's JWT. The ">24h" rows were
  inserted with a backdated `created_at`. Old prescriptions were created
  fresh, given their items, then backdated by the author.
- **Cleanup:** 097 intentionally makes clinical rows undeletable except
  by a retention purge, so mob dev purges the throwaways on request.

**🟢 1. New record, as the author.**
- **Buttons:** it shows "Editar" and "Excluir".
- **Edit:** the "Editar registro" dialog saves the new content.
- **Delete:** it asks "Excluir este registro? Esta ação não pode ser
  desfeita." and removes the row.

**🟢 2. Record older than 24h.**
- **Buttons:** only "Adicionar correção".
- **Dialog:** "Corrigir registro", prefilled with the original text.
- **Blank reason:** "Informe um motivo." (with the client `required`
  removed), and no raw code.
- **With a reason:** the original is struck through, followed by
  "Corrigido em 26 de set. de 2026 por Dra Opus Pr29: erro de digitação",
  then the correction with its "Correção" badge.
- **Database:** the correction row has `corrects_id`, the reason and
  `created_by_name`.
- **Nesting:** a fresh correction offers Editar/Excluir, since it's under
  24h old. Correcting a correction needs it to be over 24h old, so that
  case is code-verified only.

**🟢 3. Prescriptions.**
- **New prescription, 3 medications:** Edit with the middle row removed
  leaves the form as Med Um 1mg and Med Tres 3mg, with no value shifting.
  The DB holds exactly those 2 items, with no duplicates.
- **Prescription older than 24h:** only "Adicionar correção".
  - **Prefilled:** Amoxicilina and Dipirona.
  - **Saved correction:** Amoxicilina 875mg and Dipirona 1g, with the
    reason "dose errada".
  - **Trail:** the original's items are struck through, with "Corrigido
    em … por …: dose errada".

**🟢 4. Stale page.**
- **Setup:** the edit dialog was opened on a record 23h54m old (Editar is
  still offered before 23h55m). I waited until it was past 24h, then
  saved.
- **Result:** "Este registro não pode mais ser alterado. Adicione uma
  correção." shows, with no raw code, and the DB content is unchanged.

**🟢 Lock at the DB, with 098.** Every direct REST write to a row older
than 24h returns 400 `clinical_record_locked`:
- doctor-JWT PATCH;
- service-role PATCH;
- doctor-JWT DELETE;
- DELETE of an old prescription's items.

**🟢 5. Archived patient, copy and privacy.**
- **Archived patient:** their record shows no Editar, Excluir or
  Adicionar correção.
- **es:** "Editar", "Eliminar", "Añadir corrección", "Corregido el 26 sept
  2026 por …" and "Corrección".
- **Privacy §7:** `/privacy` has the new paragraph ("After 24 hours, a
  clinical note or prescription can no longer be edited or deleted…").

**Review: Claude `/code-review` (code reviewer), clean at `63379ac`.**

**FOLLOW-UP:** none web-side. The prod lock bug was DB-side and is fixed
by 098 (mob dev added a flag-never-set test).

**CI at `63379ac`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `63379ac`, review clean. 097 and 098 are live.**

## iOS — open question

Same answer as the mobile repo's `TESTING.md`: not applicable to this repo
directly, but worth noting here since browser E2E doesn't have the native
Xcode constraint mobile does — Playwright's WebKit engine *can* run on
Windows/Linux without a Mac, so if Safari-specific web bugs ever matter,
add a `webkit` project to `playwright.config.ts`. Not done yet since
Chromium coverage is the priority while the E2E layer is brand new.
