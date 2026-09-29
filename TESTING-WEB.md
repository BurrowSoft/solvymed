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

## Release regression checklist (web) — 1.3.0 launch

This is a re-runnable checklist of every main web flow, for the release
candidate (RC) before 1.3.0, the Brazil paid-marketing launch. Run it
top to bottom on the RC's exact SHA, then log the run in the table at the
end. **Any ❌ blocks the release** unless UX/PM and the user explicitly
accept it.

### How to run it

- **Target:** the RC build on the environment it will ship to. That's the
  local `next build && next start` on the RC SHA, plus the deployed
  preview if there is one. Record the SHA in the run log.
- **Two locales for every item: pt-BR (`/pt-BR/...`) and en (unprefixed).**
  pt-BR is the launch market and gets the full pass. en gets the same
  items but only needs to be spot-checked for layout and copy.
  - **Locale gotcha:** unprefixed URLs follow the `NEXT_LOCALE` cookie.
    Test en in a fresh browser context, or after switching with the
    language picker.
- **Viewports: desktop Chrome, 1280×720, for everything.** Mobile gets the
  items marked 📱, on Chromium with Pixel 7 emulation and WebKit with
  iPhone 14 emulation. On mobile, check:
  - nothing overflows horizontally;
  - dialogs fit the screen and can be closed;
  - the sidebar or menu can be reached;
  - tap targets are usable.
- **Accounts:**
  - Throwaway `e2e-test-opus-*` accounts, created through the admin API
    or the real signup. Doctors get a trial automatically.
  - Signups are confirmed through this app's own `/api/auth/callback`,
    using a `token_hash` from the admin `generate_link` API. The signup
    form hardcodes the prod redirect.
  - The shared doctor (`ca44892c…`) is **read-only**. Never save forms on
    it.
- **Stripe:** test mode for this checklist. The live-mode charge is
  separate; see L-1 at the end.
- **Harnesses:** the specs I used for #11–#16 are kept outside the repo.
  Items marked 🤖 were already automated there and can be re-run; the
  rest are manual or semi-manual.
- **Clean-up after every run:** delete throwaway users, Stripe
  customers, test clocks and open sessions. When sweeping users, list
  them with `per_page=10`. Larger pages 500 because of the 8 broken
  `auth.users` rows, until they're fixed. Also restore the shared doctor
  if it was touched.

### A. Public pages and auth (signed out)

| ID | Flow | Expected result |
|---|---|---|
| A-1 📱 | Landing `/`, `/pt-BR` | It renders with no console errors. The CTAs lead to signup and login, and the language picker switches locale and keeps the page. |
| A-2 | `/privacy`, `/terms` in pt-BR and en | Both render. Payments are described as **Stripe only**, with no Asaas. |
| A-3 🤖📱 | Doctor signup (`/auth/signup`, default role) | The role label is "Profissional de saúde". Submitting shows "Verifique seu e-mail". After confirming, you land on `/dashboard` with "Dr. <first name>"; `user_roles` is `professional`, and `professionals` is `trial` with a future `trial_ends_at`. |
| A-4 🤖 | Patient signup via `/join/<doctor's public code>` | It redirects to signup with "Entrando como … via link de convite" and the role locked. After confirming you land on `/auth/pending-confirmation`, which names the doctor; `invited_by_professional_id` is set. |
| A-5 🤖 | Patient signup with a typed patient invite code | The Patient role shows the code field, with the hint "Digite o código de convite". After confirming you land on `/auth/patient-welcome`, with `linked_patient_id` set. |
| A-6 | Patient signup with an invalid or no code | `/auth/invite-required` shows clinic wording. Retrying with a valid code links the account. A bogus code shows the "doesn't match" message. |
| A-7 | Signup validation | Mismatched passwords, a weak password and an email that's already registered each show a clear error, not a crash. |
| A-7b | Password minimum is **8** (#18) | **Web form:** on signup, reset-password and a secretary invite signup, **7 characters is rejected** with "A senha deve ter pelo menos 8 caracteres." (pt-BR) / the en equivalent. There's no `/auth/v1/signup` or password-update call, and no account or change. 8 characters works. An existing account with a 6-character password still logs in. **Server part, still ⏳:** Supabase Auth's minimum stays **6** until mobile 1.3.0 is on Play (UX decision, 2026-09-26). Once mob dev raises it to 8, a 7-character password sent straight to the Auth API must be refused too. Until then, this half is ❌ at RC per the G rule, unless UX waives it for the web launch. |
| A-8 📱 | Login and logout | Wrong credentials show an error. The right ones route by role: doctor → `/dashboard`, patient → `/my-appointments` or `pending-confirmation`, secretary → `/dashboard`, or `not-connected` / `clinic-inactive`. Sign-out lands on the current locale's home. |
| A-9 | Forgot password → reset | Requesting a reset shows a neutral "if the account exists" message. The email link goes to `/auth/reset-password` with `access_token` and `refresh_token` **in the URL hash**; the page calls `setSession`, then `updateUser`. It does **not** go through `/api/auth/callback`. The new password saves, the old one stops working, and the new one logs in. Check the page and its messages in pt-BR and en. **Local test recipe:** get a recovery `hashed_token` from the admin `generate_link` API (`type: recovery`), exchange it with `verifyOtp` (`type: recovery`) for a session, then open `/<locale>/auth/reset-password#access_token=…&refresh_token=…&type=recovery`. **Open issue to confirm at RC:** `forgot-password` hard-codes `redirectTo` to `https://www.solvymed.com/en/auth/reset-password`, so pt-BR users land on the English page. |
| A-10 | `/join/<bogus>`, signed in and signed out | Signed out, it redirects to signup. Signed in, it shows "Este link pode ser inválido…". There's no 5xx. |
| A-11 | Session expiry | With cookies cleared, a protected page redirects to login and there's no blank page. |
| A-12 | Auth links keep the language (#21) | A reset requested in pt-BR emails `/pt-BR/auth/reset-password`; opened in a **fresh** browser, even from another country, it shows the pt-BR form and the new password works. A signup confirmation carries `?locale=` and lands on the pt-BR page with `NEXT_LOCALE` pinned. `/en/…` links never 404. **Check that en links end in English**: at `76476e9`, `/en/…` landed in the geo locale. |
| A-13 | Reset link shape | The reset request sends **no `code_challenge`** (implicit flow), so the email link returns `#access_token…&type=recovery` and works in any browser, such as a phone's mail app. A legacy `?code=` link works in the requesting browser; in any other browser it fails gracefully with "O link pode ter expirado". |
| A-14 | Mobile-origin links, `/auth/confirm` | Unprefixed `/auth/confirm#access_token…&type=recovery` geo-redirects (302) to `/<cc>/auth/confirm` **with the fragment kept**, and the set-password form completes the reset. `/pt-BR/auth/confirm` does the same in pt-BR. Both verified on prod on 2026-09-26. |
| A-15 ⏳ | S-01: `token_hash` links (send-email hook, 1.3.0) | **Web-origin links:** callback → 307 to `/[locale]/auth/verify` (no verify on GET); Continue / set-password verifies on click. Then it lands on the right locale page. For reset, the set-password form is on `/[locale]/auth/verify?type=recovery` itself. **Mobile-origin links on desktop:** `/<locale>/auth/confirm?token_hash&type` shows "Open in the app" / "Continue in the browser", and the browser path completes the confirm or reset. **Scanner safety:** a plain GET of either confirm URL does **not** consume the token (no verify on page load), and a real click afterwards still works. **Fallbacks:** old `#access_token` and `?code=` links still work. **Password reset, a pre-A-15 BLOCKER** (the code reviewer, 2026-09-26): a recovery email link → the set-password form (on `/[locale]/auth/verify` since #41), a new password works, and the old one no longer does. Found live in the #35 run: a `type=recovery` `token_hash` through `/api/auth/callback` logged the user in on `/dashboard`. Also check the recovery link never lands on `/auth/professional-welcome`. **Both blockers are fixed and verified on the web side by #41 (`75c91a8`):** callback `token_hash` links redirect to `/[locale]/auth/verify`, which never verifies on load. HEAD and GET scans leave the token valid. Recovery shows the set-password form, the new password works and the old one fails, and the recovery link never reaches the welcome page. **Still ⏳ for A-15 itself:** repeat this with the live send-email hook's real emails, including app-origin links. **Web-origin real emails ✅ on prod (2026-09-27),** after the switch to the fixed `/api/auth/callback?token_hash&type&locale` templates (#52): a pt-BR signup (`pkce_` token) and an en reset both pass, each with a scanner GET first. Details are in "Prod addendum — B-7c, A-15, #50" at the end of this file. **Still ⏳:** app-origin links (the mobile tester) and the user's retroactive inbox check, which isn't a gate. |

### B. Doctor

| ID | Flow | Expected result |
|---|---|---|
| B-1 📱 | Dashboard home | The greeting reads "Dr. <name>". Today's and upcoming appointments are listed, and the pending-payments and patient counts are right. The Monthly Revenue card matches the paid appointments. |
| B-2 📱 | Schedule: create an appointment | The new appointment appears in the list, day and week views. Overlapping a blocked slot is refused with a localized error. |
| B-3 | Schedule: block time | The block shows as blocked and patients can't book over it. |
| B-4 | Schedule: status changes | confirmed → completed or cancelled persists after reload. Tentative and proposal rows show a badge, with no status dropdown. |
| B-5 | Schedule: propose a new time to a patient | The appointment becomes a proposal. The patient sees it in My appointments and can accept or decline (see D-4). |
| B-6 🤖 | Schedule: Pix QR on a confirmed, unpaid appointment | The Pix QR button opens the QR. "Copia e Cola" contains the key, the amount and the city, and the image encodes the same payload. |
| B-7 📱 | Patients: list, search, create, edit, delete or archive (#18, migration 094) | CRUD persists. Patient detail shows Info, Records, Prescriptions and Appointments. **Delete** is offered only to a patient with **no clinical history** and asks for confirmation. A patient with a record or prescription shows only **"Arquivar cadastro"**. The archive confirm states the number of upcoming appointments that will be cancelled ("Nenhuma consulta futura…" / "N consultas futuras…"), and they are cancelled. Archived patients disappear from the list, search, the dashboard count and the New-appointment picker, and appear under **"Arquivados (n)"**. The banner reads "Arquivado em … por …", with Restaurar; restore also works from the duplicate warning. No raw `patient_archived`/`patient_has_clinical_history` codes appear anywhere (schedule create by name, re-activation, patient booking). |
| B-7b 📱 | Clinical records: the 24-hour rule (#29, migrations 097 and 098) | **Under 24h, by the author:** Editar/Excluir on records and prescriptions; Edit saves; removing a middle medication row keeps the other rows' values. **Over 24h:** only "Adicionar correção", and a reason is required ("Informe um motivo."). The original is struck through, with "Corrigido em … por …: <reason>", and the correction is badged. **DB enforced:** a direct REST PATCH/DELETE of an older-than-24h row returns `clinical_record_locked`, for the doctor's JWT **and** the service role, and so does deleting an old prescription's items. **Stale page:** saving after the cutoff shows "Este registro não pode mais ser alterado. Adicione uma correção." An archived patient has no clinical actions. |
| B-7c ✅ (web, prod 2026-09-26/27; exports/PDF ⏳) | Clinical dates follow the practice's time zone. **Launch-blocking** (UX, 2026-09-26: the code reviewer's finding and design) | **Design under test:** every record, prescription and correction gets its `date`/`time` **stamped server-side** by a DB trigger, in the practice's time zone (`professionals.time_zone`, default `America/Sao_Paulo`). The client's value is ignored; neither app has a date picker. `date`/`time` are **immutable on UPDATE**. **When:** after that fix is on prod. The bug is already confirmed by code analysis, so it isn't reproduced first. ❌ blocks the launch. **1. Any hour, fixture practices.** Use one throwaway practice with `time_zone = Pacific/Kiritimati` (UTC+14) and one with `Pacific/Pago_Pago` (UTC−11), and the browser deliberately in another zone (e.g. `Asia/Bangkok`). Create a **record**, a **prescription** and a **correction** in each, through the UI **and** through REST sending a deliberately wrong `date`/`time`. Each stored `date` must equal `(now() AT TIME ZONE tz)::date`, and `time` the local time, whatever the client sent. The chart and any export or PDF show that date. **2. Immutable.** A REST PATCH of `date`/`time` on the author's own entry **within 24h** is ignored: the row is unchanged, and editing the content still works. **3. Real spot check, default zone.** A practice on the default `America/Sao_Paulo`, at about **23:30 BRT** (02:30 UTC the next day): a record, prescription and correction show **today's Brazil date**, not tomorrow's, in the chart, the export and the stored columns. Clock-mocked unit tests in the fix PR are the backup, and this run is the final proof. **Result:** ✅ on www.solvymed.com in all three parts (details in "Prod addendum — B-7c, A-15, #50" at the end of this file). **Still ⏳:** the export and PDF weren't opened in these runs; the chart and the stored columns were. |
| B-8 🤖 | Patients: duplicate warnings | A same name and phone shows "Possível duplicidade…" with Open existing / Create anyway. A same CPF, after Create anyway, shows "já está cadastrado(a)" plus Open patient, which points at the CPF owner. |
| B-9 | Records and prescriptions | Adding and deleting a record works. A prescription with at least 1 medication saves, and the PDF or print view renders. With no medication it's refused. |
| B-10 | Patient invite code, from the patient detail | Generating a code shows it. A patient who signs up with it gets linked (A-5). |
| B-11 | Booking block | Blocking a patient stops them booking. They appear in Settings → Blocked patients, and unblocking works. |
| B-12 📱 | Payments | This week, this month, last month and all time each filter correctly. Mark Paid moves an appointment to Received and updates the totals; Mark Unpaid reverses it; setting an amount persists. |
| B-13 | Settings: profile, clinic, hours, procedures, scheduling rules, Pix key | Each form saves, and the change shows after reload. An error loading Settings shows the banner and no forms. |
| B-14 | Settings: public invite code | Generate; Regenerate asks to confirm; Copy code and Copy link (`…/pt-BR/join/<code>`) work. |
| B-15 | Clinics | Adding a clinic geocodes it or saves without coordinates. Deleting asks for confirmation. |
| B-16 | Feedback, `/feedback` | Submitting stores it and shows a thank-you. |

### C. Subscription and billing (Stripe test mode)

| ID | Flow | Expected result |
|---|---|---|
| C-1 🤖📱 | pt-BR subscribe | The page shows **R$ 89/mês** and "Cartão de crédito", with no Pix. Checkout is BRL 8900, card only. A 4242 card and the BR card `4000 0007 6000 0002` both succeed. After the webhook, the row is `active` with a real `current_period_end`, and the dashboard opens. |
| C-2 🤖 | en subscribe | $19 USD, card only, and it succeeds. |
| C-3 🤖 | Abandoned or unpaid checkout | It never activates the subscription. |
| C-4 🤖 | Second checkout | It's refused: `409 already_subscribed`, both while active and before the webhook lands. Switching language within the 10-min window still hands back a payable session. |
| C-5 🤖 | Cancel at period end | Access continues. When the subscription is deleted or expires, the row is `expired` and `/dashboard` goes to `/subscribe`. |
| C-6 🤖 | Failed renewal (test clock) | The row is `expired`. `/subscribe` shows "Seu último pagamento falhou" and **Atualizar cartão**, not Subscribe. Checkout returns `409 payment_failed`. |
| C-7 🤖 | Customer Portal | Update card opens `billing.stripe.com` for this customer. After the card is fixed, "Pagamento recebido…" shows until the webhook lands, then access comes back. |
| C-8 🤖 | Trial rule | A first sub that never goes active (incomplete → incomplete_expired) leaves the trial and `trial_ends_at` unchanged. |
| C-9 | Trial banner and expiry | In the last 7 days of the trial the banner shows. When it expires, `/subscribe` shows "Seu período de teste encerrou…" plus Subscribe. |

### D. Patient

| ID | Flow | Expected result |
|---|---|---|
| D-1 📱 | Pending patient | `/auth/pending-confirmation` shows the clinic wording and the doctor's name, "Solicitar uma consulta" and "Sair". Once the doctor confirms, the patient reaches `/my-appointments`. |
| D-2 🤖📱 | Book, `/book/<professionalId>` (the route My appointments and the pending page link to, optionally with `?name=`, `specialty=` and `clinicName=`) | The header shows the real doctor name, from `get_professional_public_info` (merged in #16), or the translated "Profissional", never "Doctor". Slots come from the doctor's hours. The request becomes tentative in the doctor's schedule. |
| D-3 📱 | My appointments | Upcoming and past appointments are listed correctly. The Book link opens `/book/<professionalId>` for their doctor, and there's no `?name=Doctor` in it. |
| D-4 | Reschedule | A patient's request shows for the doctor, who can approve or decline it. When the doctor proposes a new time, the patient can accept or decline it. Both sides see the final state. |
| D-5 | Account deletion request (`/account/delete`, #25) | In all 15 locales, the page shows the "what happens to your data" note: professionals' records are kept for 20 years, and patients' accounts are deleted while the clinic keeps its records. There's no "erased and cannot be recovered" wording. The mailto goes to `support@solvymed.com` with a localized subject. A submit records a `new` row (the form sends `pending`; intake stores `new`) and shows the translated confirmation with the email in bold. **Enforced today:** a doctor with clinical history can't be deleted. The gate is 095's `delete_my_account` refusal (`patient_has_clinical_history`), backed by 094's delete trigger; support closes the account. A patient can delete their account even when a clinic archived their record (096). **Since migration 100 (#36):** rows are stored as `new` and each accepted request emails the **real support inbox**. There's a limit of 3 per email and 10 per IP per day, and `too_many_attempts`/`invalid_email` show translated messages. **Since 101 (#38):** the row stores the page's `locale`. **Test-submit rule (user, via UX, 2026-09-26):** every test submit uses an obviously-test email (`e2e-…@burrowsoft.com` or `…@example.invalid`) **and** a reason starting with `[TEST]`, so the owner can ignore it at a glance. Keep submits to the minimum, and have mob dev delete the rows. **Still ⏳:** close-account (#32, migration 102). |

### E. Secretary (all 🤖 from #13 unless noted)

| ID | Flow | Expected result |
|---|---|---|
| E-1 | Invite, then signup | Team → Invite shows the code once, with Copy code, Copy link and WhatsApp. The signed-out link leads to signup, with the role and email locked. After confirming, the secretary lands on `/dashboard`, linked to the doctor. |
| E-2 📱 | What a secretary sees | The doctor's real schedule, patients and pending payments; Mark Paid works; patients can be created, edited and deleted. The greeting has no "Dr.". Not shown: revenue, Received/Total, Records/Prescriptions tabs, Clinics. |
| E-3 | Read-only Settings | "Somente a conta principal da clínica…". Regenerate changes the doctor's code; Leave clinic works. |
| E-4 | Server-side refusal | Doctor-only actions called directly are refused. Through REST, records and prescriptions read `[]` and inserts return 403. |
| E-5 | Team management | The limit is 3, counting pending invites. Resend asks to confirm and invalidates the old code; Decline, Revoke and Remove each lead to `not-connected`. Typed codes work with or without "S-"; Leave clinic works. |
| E-6 | `/join/secretary/<code>` edge cases | A patient or doctor account, an already-linked secretary and an invite for a different email each show a clear message. A garbled code never gives a 5xx. |
| E-7 | Doctor's subscription lapsed | The secretary sees `/auth/clinic-inactive` and never `/subscribe`. |
| E-8 | Secretary Pix QR (#14) | Same result as B-6, as the secretary. |

### F. Cross-cutting

| ID | Check | Expected result |
|---|---|---|
| F-1 | Roles are server-only | The user's own session gets 403 on any write to `user_roles`. |
| F-2 | Copy | pt-BR is gender-neutral for the doctor and the patient ("a clínica", "profissional"). No raw i18n keys are visible on any page; grep the body for `\w+\.\w+\.\w+` patterns. |
| F-3 📱 | Accessibility spot-check | Form inputs have labels or accessible names, dialogs trap focus and close with Esc, and tab order is sane on login, signup, book and subscribe. |
| F-4 | Errors | Console: no uncaught errors on the main pages. Server log: no 5xx during the run. |
| F-5 | Version gate (`app_config`) | Doctors and secretaries below the minimum version see the gate; others don't. |
| F-6 | Unit tests (`npx vitest run`) on the RC SHA | **All green.** As of 2026-09-26, master has 18 pre-existing failures: `BookingRequestsPanel.test.tsx` doesn't mock `useParams`, and vitest also picks up the Playwright `e2e/` specs. That makes this ❌ until the follow-up fix lands, because "all green" means nothing until then. **Update: fixed by #19, merged at `07c7452`, which runs 78/78; CI (#20) enforces it on every PR.** |
| F-7 | Vercel env scoping, a **launch gate** | **Previews never have live Stripe keys.** Once prod has the live `sk_live_`/`whsec_` keys, every Preview-scoped Stripe var must still be a **test** key. Check by names and scopes only (`vercel env ls`); never print values. On a preview, a checkout must show Stripe's **test-mode** banner. **Until this is confirmed, don't run any checkout on a preview.** The Supabase `NEXT_PUBLIC_*` vars and `SENTRY_AUTH_TOKEN` are Preview-scoped: on 2026-09-26 they were Production-only, so every preview's middleware crashed (`MIDDLEWARE_INVOCATION_FAILED`). |
| F-8 | Preview is really reachable | Using the bypass header `x-vercel-protection-bypass` from the git-ignored `VERCEL_AUTOMATION_BYPASS_SECRET` (never printed), the preview serves **the app**, not Vercel's login page and not a 500. Check the page content, not just the HTTP status: an SSO redirect also ends in a 200. |
| F-S1 | Sentry: the server event arrives scrubbed. **HARD pre-launch** (UX, 2026-09-26). The user runs it with UX, since it needs Sentry UI access. | On a preview built from master, `GET /api/sentry-check` (preview-only; 404 on prod). In Sentry (org `burrowsoft`, project `solvymed-web`, environment `preview`), the event must show: the message `sentry-check: test error for [email], CPF [cpf], phone [phone]`; a request with the **path only** plus the method (no query, headers, cookies or body); no `nextjs` context and no spans; and a user that is absent or holds only an id. The same envelope was captured locally at #31 `279ea4f` and passed; this check confirms it in Sentry itself. The stack's source-context lines show the test route's literal fake email, CPF and phone. That's the route's code, not a scrubber leak, unless the #31 follow-up has removed it. ❌ blocks the launch. |
| F-S2 | Sentry: the stack resolves. **HARD pre-launch.** The user runs it with UX. | The same event's stack trace points to `src/app/api/sentry-check/route.ts` (readable source, not minified). This needs the replaced `SENTRY_AUTH_TOKEN`: the build log must show the source-map upload succeeding, with no `Invalid token (401)`. `*.js.map` must still not be served publicly (403/404), with no `sourceMappingURL` in the chunks. ❌ blocks the launch. |

### G. Launch features (⏳ placeholders, filled in as each one ships)

Each ⏳ item becomes a normal row, with a PR number and exact expected
text, once that feature is merged. **An item still marked ⏳ at RC time
counts as ❌** unless UX/PM has dropped the feature from 1.3.0.

| ID | Flow | Expected result (draft) |
|---|---|---|
| G-1 ⏳📱 | First run: welcome page | A new doctor's first login shows the translated welcome page in pt-BR and en. It's shown once; returning later doesn't show it again. |
| G-2 ⏳📱 | First run: setup checklist | Every step deep-links to the right screen: profile, hours, procedures, Pix key, invite a patient, and so on. A step ticks off once it's actually done (check this from the DB state, not just the click). It's shown to **doctors only**; a secretary or patient never sees it, even via its URL. |
| G-3 ⏳ | First run: empty states | Each empty list (schedule, patients, payments, team, My appointments) shows a helpful translated empty state with a next-step link. None are blank. |
| G-4 ⏳📱 | Trial chip | It shows the days left. At **≤3 days it turns amber**, and on the last day it's still correct, with no off-by-one in UTC. It's hidden for active, lifetime and secretary accounts. |
| G-5 ⏳ | One-time cards | Each one-time card shows until it's dismissed. Once dismissed, it stays dismissed after reload, sign-out and sign-in, and on another browser if that's stored per account. |
| G-6 ⏳📱 | LGPD consent banner | It shows on first visit, signed out and signed in. **Declining really blocks marketing tracking:** in the Network tab, no analytics or ads pixels or requests fire and no tracking cookies are set, before consent and after declining. Accepting enables them. The choice persists, and can be changed later from a link (footer or privacy page). Only the necessary cookies are set before a choice is made. |
| G-7 | Sentry (#31): errors only, PII scrubbed | **Payload** (checked locally, re-runnable without Sentry access): intercept the browser SDK's envelopes in Playwright, and for the server run `NEXT_PUBLIC_SENTRY_DSN=http://public@127.0.0.1:9999/1 VERCEL_ENV=preview` against a local sink. Messages mask emails, CPFs and phones. `request` is URL and method only, with **no query string** anywhere (including every breadcrumb URL). There's no user beyond an id; no extra, spans, replay or `nextjs` context; no console breadcrumbs; and stack-frame context lines are masked, with no frame vars. `*.js.map` is not served publicly: 403 on prod, 404 on previews, and chunks carry no `sourceMappingURL`. Re-check after `SENTRY_AUTH_TOKEN` is replaced (uploads on). `/api/sentry-check` returns 500 on a preview and 404 on prod. **Live in Sentry:** see F-S1/F-S2 (the user with UX). |
| G-8 ⏳ | Privacy and terms: data retention | **Facts corrected in #28** (prod since `d2565c3`), matching what's enforced: records are kept 20 years; a patient with records can only be archived; an account with records is closed by support; the right-to-be-forgotten exception; Supabase and Vercel in São Paulo; Resend, Stripe, Expo and Sentry listed. #29 added the 24h correction paragraph to §7. **Still ⏳:** the lawyer-reviewed rewrite. It adds §6a "who can see data inside a clinic" (secretaries), international transfers (LGPD art. 33), pt-BR and en as the authoritative versions, and translated pages. Until then `/privacy` and `/terms` are English-only in every locale. |
| G-9 | Legal links and consent (#27) | Every auth page (login, signup, forgot/reset, join, join/secretary, invite, account/delete) and the landing footer show a `nav[aria-label]` with Privacy and Terms links in the page's locale. At 375px, and in ar RTL, nothing overflows. Signup shows "Ao criar uma conta, você concorda com os Termos de Uso e a Política de Privacidade." above the submit button, with both links opening in a new tab. |
| G-10 | Language detection and switcher (#30) | **First visit, no cookie, unprefixed URL:** the browser's language wins, and the country is the fallback, then en. A pt-BR browser from a TH IP → `/pt-BR`; th from BR → `/th`; `pl` → the country's language, then en. The auto pick is stored for **30 days**; a switcher pick for 365. An existing `NEXT_LOCALE` cookie always wins. `/en/…` pins en. `/pt/…` and case variants 308 to `/pt-BR/…`, keeping the query. Bots get no redirect. **Switcher:** on the auth pages it keeps `?secretary`, `?email` and `?next`. There's **no switcher** on `/auth/confirm` or `/auth/reset-password`. **Test note:** on Vercel the real IP country always applies, and `?country=` doesn't affect detection, so test other countries on a local server with `x-vercel-ip-country`. |
| G-11 | Server region (#26) | `x-vercel-id` on prod shows `::gru1::` for pages, route handlers (`/api/billing/portal`, `/api/webhooks/stripe`) and server actions. A signed TEST Stripe event to the prod webhook returns 200 `{"ok":true}`, and a bad signature returns 400. |
| G-12 | Invite and join privacy (#23, #24) | `X-Robots-Tag: noindex, nofollow` is sent on `/invite/*`, `/join/*`, and signup/login URLs carrying `secretary`, `join`, `email` or `next`. Invalid codes return 404, or "Convite inválido" for secretary codes. Share links have no `?email=`, and old `?email=` links ignore it. The masked hint ("Este convite é para e2***@…") is fetched in the browser only. A stale or resent code shows "Convite inválido" with no signup, and the mismatch copy covers "or the invitation is no longer valid". Vercel Analytics URLs are redacted: an allowlist of params, and the fragment dropped. |

### H. The ad visitor path (paid-traffic simulation, pt-BR, phone)

This is the exact path a paid-marketing visitor takes. Run it on
**Pixel 7 and iPhone 14 emulation**, in pt-BR, in a **fresh browser
context**, with no cookies and no `NEXT_LOCALE`.

| ID | Step | Expected result |
|---|---|---|
| H-1 📱⏳ | Open `/pt-BR/?utm_source=facebook&utm_medium=paid&utm_campaign=launch_br&utm_content=test` | The landing page renders in pt-BR, the LGPD banner shows (G-6), and nothing overflows. **With marketing consent accepted:** the `utm_*` values and `document.referrer` are captured into **first-party client storage** (a cookie or localStorage; note which one web dev chose). **With consent declined or not yet given:** nothing is captured. |
| H-2 📱 | CTA → signup | The signup opens in pt-BR with the doctor role by default ("Profissional de saúde") and the form usable on a phone keyboard. The UTM attribution is still there. |
| H-3 📱 | Sign up → "Verifique seu e-mail" → confirm, via the callback `token_hash` | The visitor lands on the dashboard in **pt-BR**, not en. |
| H-4 📱 | First run | The welcome page (G-1) and the setup checklist (G-2) show. The first step's deep link works on the phone. The trial chip (G-4) shows about 15 days. |
| H-5 ⏳ | Attribution check (**pending**: `signup_attribution` and the UTM capture don't exist yet, so this can't run until measurement ships; an item still ⏳ at RC counts as ❌ per the G rule) | **Consent accepted:** after signup, the server-owned table **`signup_attribution`**, keyed on `user_id`, has the `utm_*` values and referrer from H-1, checked through REST with the service role. It must **not** be in auth `user_metadata`, which the client can write. **Consent declined:** no `signup_attribution` row (or an empty one, per the design), no marketing event fires, and the signup still works. **Tamper checks:** the user's own session can't insert, update or read another user's `signup_attribution` row through REST, which should return 403 or `[]`. Forged `utm_*` values can't be written for someone else's `user_id`. |

### L-1. Live-mode Stripe check on production (at release time, with the user)

Only with the user present, and only after the live keys, the webhook
endpoint and the Customer Portal are configured in live mode:
1. A throwaway professional subscribes on prod in pt-BR with a **real
   card**. The charge is **R$ 89,00**.
2. Stripe's **real** webhook delivery to the prod endpoint makes the row
   `active`, and the dashboard opens.
3. Cancel the subscription in the Customer Portal, then **refund** the
   charge in the Stripe dashboard. Access ends as designed.
4. Record the Stripe object ids, delete the throwaway account, and
   confirm the refund landed.

### Run log

| Date | RC SHA | Env | Locales / viewports | Result | Notes / ❌ items |
|---|---|---|---|---|---|
| 2026-09-27/28 (overnight) | `release` `cc34e97` (rc1 code), then the fixes through `647a232` | **prod** www.solvymed.com | pt-BR full + en spot; desktop 1280, Pixel 7 (Chromium), iPhone 14 (**WebKit**), 360/390/412 | ✅ after fixes; the Pix bank-app scan is ⏳ (the user) | See "RC regression run — prod, 2026-09-27/28" at the end of this file. Found and fixed: the landing overflowed on phones (#64/#65, blocking); no web signup CTA (#65); clinics save/refresh/delete (#67); "patient" in pt-BR (#66, master); React #418 (#69, #74 master); raw "Requested:" (#71); the **Pix BR Code field 26 was malformed** (#70, blocking); Pix QR via api.qrserver.com (#70). Open: the Pix real bank-app scan (the user); F-7 Stripe env split before the live keys; L-1. |

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

## Production auth-link check (2026-09-26, www.solvymed.com)

Run against **production** with real Supabase email links, built with the
admin `generate_link` API and followed through GoTrue's real `/verify`
endpoint, on throwaway `e2e-test-opus-prodredir-*` accounts.

**Fixed tonight: the Supabase redirect allow-list.** Before, it only
allowed `https://www.solvymed.com/*/auth/confirm`, so Supabase dropped any
other `redirect_to` and fell back to the Site URL. Mob dev added
`https://www.solvymed.com/**`. Checked after the change:

| `redirect_to` | `/verify` now redirects to |
|---|---|
| `/api/auth/callback` (signup) | `/api/auth/callback#…` ✅ |
| `/en/auth/reset-password` | `/en/auth/reset-password#…` ✅ (but see the 404 below) |
| `/pt-BR/auth/reset-password` | `/pt-BR/auth/reset-password#…` ✅ |
| `/auth/reset-password` | `/auth/reset-password#…` ✅ |
| `https://example.com/…` (control, not allowed) | `https://www.solvymed.com#…`, the home page |

The control shows the fallback that affected the callback and reset links
before the fix. Email verification itself succeeded, but the user landed on
the home page, so **`/api/auth/callback` never ran on prod**. That's where
patient invite-code linking and secretary invite acceptance happen, so
those never completed from an email link. The affected real accounts can't
be counted now: prod was cleaned to test fixtures tonight, with the user's
approval.

**❌ Still broken on master: password reset returns a 404.**
- `forgot-password` hard-codes
  `redirectTo: https://www.solvymed.com/en/auth/reset-password`.
- Prod's locale middleware picks the locale from the **visitor's
  location**, not the browser, and rewrites `/en/auth/reset-password` to
  `/<country>/en/auth/reset-password`, which is a **404**. It did this for
  browser locales en-US, pt-BR and th-TH (`/th/en/…` from this machine).
- `/pt-BR/auth/reset-password` works **end to end on prod**: the form
  loads, the hash tokens survive, "Senha atualizada", the new password
  logs in and the old one is refused.
- Unprefixed `/auth/reset-password` works, but opens in the location's
  language.
- The fix is in #18 (pt-BR goes to `/pt-BR/…`, en goes unprefixed). I've
  suggested shipping it as a hotfix ahead of #18, which is waiting on the
  archive migration.

**Not verified end to end: signup confirmation.** The real signup email
uses PKCE (`?code=`), which is tied to the signing-up browser. An
admin-generated link uses the implicit flow (a hash), which the callback
doesn't read. So only the allow-list side is proven here. Re-check A-3 at
RC with a real inbox.

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

## PR #27 (`feat/legal-links`) — Privacy/Terms links + signup consent, 🟢 at `9271345`, review clean

**Scope: exactly `9271345`.** That's `1142ea0`, plus the master merge
(`cabee51`, bringing in #28), plus `LegalLinks` on `/invite/<code>`.

Tested live on the preview in pt-BR (at a 375 px mobile width), en
(unprefixed), es and ar. The bypass header was sent on preview requests
only.

**🟢 Legal links.** A `<nav>` with a translated label ("Informações
legais", "Legal", "Información legal", "معلومات قانونية") carries both
links, prefixed with the page's locale. It appears on:
- the landing page;
- login, signup and forgot-password;
- `/join/<code>` (which redirects to signup);
- `/join/secretary/<code>`;
- `/account/delete`;
- **`/invite/<code>`**. It was missing at `1142ea0` and is fixed in
  `9271345`.

Other checks:
- **Links:** clicking through lands on `/pt-BR/privacy`, `/pt-BR/terms`,
  `/privacy` and `/terms`.
- **Layout:** no horizontal overflow at 375 px, and ar is `dir=rtl`.

**🟢 Signup consent, in 4 locales.** For example, "Ao criar uma conta,
você concorda com os Termos de Uso e a Política de Privacidade." and
"By creating an account, you agree to the Terms of Service and the
Privacy Policy."
- **Position:** above the submit button.
- **Links:** both go to the locale's `/terms` and `/privacy`, with
  `target=_blank`. Clicking Terms opens a new tab on the right page.

**Review: Claude `/code-review` (code reviewer), clean at `9271345`.**

**FOLLOW-UP:** the `/privacy` and `/terms` pages themselves are
English-only in every locale. That's covered by the lawyer-reviewed
rewrite, where pt-BR and en are authoritative.

**CI at `9271345`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `9271345`, review clean.**

**Prod addendum (`9a458c4`):** the invite page, the auth pages and the
signup consent line all show the legal links in pt-BR, en, es and ar.

## PR #30 (`feat/locale-detection`) — browser-language detection + auth-page switcher, 🟢 at `beb83e0`, review clean

**Scope: exactly `beb83e0`.** That's `b4a5083` plus the code reviewer's
fix: no switcher on `/auth/confirm` or `/auth/reset-password`, and the
switcher no longer carries the `#fragment`.

**How it was tested.** The preview can only test country TH.
- **Preview:** raw requests with manual redirects, under the bypass
  header. My real country (TH, from Thailand) always applies there.
  Vercel overwrites an injected `x-vercel-ip-country`, and `?country=`
  doesn't feed first-visit detection (it runs after that block).
- **Local:** for BR/US/no-country cases, `next dev` on `beb83e0`, where
  the country header is honoured.
- **Browser:** Playwright for the switcher and the layout.

**🟢 1. Browser vs country.**
- **pt-BR browser in TH** (preview): 302 → `/pt-BR`, including a deep
  link that keeps `?next=`.
- **th browser in BR** (local): → `/th`.
- **Other tags:** pt-PT → pt-BR; zh-Hant and zh-HK → zh-TW; zh-CN → zh.
  `en-US` first with pt-BR second stays en (200, no redirect). `pt;q=0,
  es` → es.

**🟢 2. Fallbacks.**
- **No Accept-Language:** → the country's language (th on the preview,
  pt-BR in BR locally).
- **Unsupported `pl`:** → th in TH and pt-BR in BR; en in US or with no
  country. `pl,es;q=0.5` → es. `*` → the country.

**🟢 3. Cookie and `/en`.**
- **Existing cookie wins over a pt-BR browser:** `NEXT_LOCALE=es` → es,
  and `NEXT_LOCALE=en` → stays en.
- **`/en/auth/login` with a pt-BR browser:** 307 → `/auth/login`, pinning
  `NEXT_LOCALE=en`.
- **Cookie lifetime:** an auto pick sets `Max-Age=2592000` (30 days); a
  manual pick in the switcher lasts 365 days.

**🟢 4. Aliases.**
- `/pt` → 308 `/pt-BR`.
- `/pt/auth/login?x=1` → 308 `/pt-BR/auth/login?x=1`.
- `/PT-br/auth/login` → 308 `/pt-BR/auth/login`.
- `/zh-tw` → 308 `/zh-TW`.
- `/identity` isn't treated as an alias (404, as before).

**🟢 5. Bots (Googlebot, no Accept-Language).** Prefixed URLs (`/pt-BR/…`,
`/es`) return 200 with no redirect. Unprefixed `/` returns 200 in en and
doesn't redirect, even from BR. That's the same as before: bots skip
detection entirely, so the PR body's "the country decides as before" is
inaccurate, but the behaviour is unchanged.

**🟢 6. Switcher.**
- **Signup:** `/pt-BR/auth/signup?secretary=S-…&email=…` → es keeps both
  params; → en also keeps them.
- **Login:** `?next=` survives a switch to fr.
- **One-time-link pages:** `/auth/confirm` and `/auth/reset-password` show
  no switcher. A real recovery link sets the new password successfully.

**🟢 7. 375 px layout (pt-BR, ar, de).** Checked on login, signup and
join/secretary.
- **Overflow:** none.
- **Wrapping:** the switcher sits on its own row under the legal links in
  pt-BR and de. In ar (RTL) they share a row, and the screenshot looks
  right.

**Review: Claude `/code-review` (code reviewer), clean at `beb83e0`.**

**FOLLOW-UP:**
- **Test instructions:** the PR body says to use `?country=XX` to simulate
  a country, but it doesn't affect first-visit detection (the preview
  sends TH regardless, and locally `/?country=BR` stays en). Use a local
  server with `x-vercel-ip-country`, or unit tests.
- **Accessibility:** the switcher's `aria-label` is a hard-coded "Select
  language" in every locale.

**CI at `beb83e0`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `beb83e0`, review clean.**
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
## PR #31 (`feat/sentry`) — Sentry, errors only, PII scrubbed, 🟢 at `279ea4f`, review clean

**Scope: exactly `279ea4f`.** Settings: errors only (`tracesSampleRate:
0`), no Session Replay, `sendDefaultPii: false`, and `sentryScrub` on
every event and breadcrumb.

**How it was tested without Sentry UI access.** I didn't use another
agent's Sentry token.
- **Browser:** Playwright intercepted every envelope the browser SDK
  sends on the preview and answered it locally, so nothing reached
  Sentry.
- **Server:** I ran `279ea4f` locally, in an isolated scratch clone with
  its own `npm ci`, with `NEXT_PUBLIC_SENTRY_DSN` pointing at a local
  listener and `VERCEL_ENV=preview`. The server SDK runs `beforeSend`
  in-process, so the captured envelope is exactly what Sentry would
  receive.

**🟢 Server event** (`GET /api/sentry-check?email=x@y.com&q=Maria` with a
cookie and a custom user-agent; the route returns 500).
- **Message:** "sentry-check: test error for [email], CPF [cpf], phone
  [phone]".
- **Request:** `{"url":"http://localhost:3000/api/sentry-check","method":"GET"}`,
  with no "?", no cookie and no user-agent.
- **Other fields:** no user, tags, extra or spans. The contexts are os,
  runtime, device, app, culture, cloud_resource and trace, with **no
  `nextjs`**.
- **Planted values:** "x@y.com", "Maria", the cookie and the UA appear
  nowhere in the capture.

**🟢 Client events** (preview, logged in as a throwaway doctor). I
triggered a thrown error, an unhandled rejection, and an error on a page
loaded with `?email=x%40y.com&q=Maria`, after planting PII in a console
log, a fetch query and a `pushState` URL.
- **Messages:** masked, e.g. "client-check [email] CPF [cpf] phone
  [phone]".
- **URLs:** `request.url` and every breadcrumb URL have no query string.
  "x@y.com" and "Maria" appear nowhere, and neither does any planted
  value.
- **Breadcrumbs:** console breadcrumbs are dropped.
- **Other fields:** the contexts are `culture` and `trace` only; no
  spans, user or extra; no replay. Session envelopes carry no PII.

**🟢 No public source maps.** Six chunks each return 200 with no
`sourceMappingURL`, and `*.js.map` returns 404.

**🟢 Other checks.**
- **Test route:** preview `/api/sentry-check` returns 500 with an empty
  body; prod returns 404 (before the merge).
- **Privacy:** `/privacy` shows the Sentry (USA) row.

**Not verifiable here, so it moves to the launch checklist:** that the
event actually arrives in Sentry (F-S1), and that stacks resolve once
`SENTRY_AUTH_TOKEN` is replaced (F-S2). Both need Sentry UI access; the
user runs them with UX.

**Review: Claude `/code-review` (code reviewer), clean at `279ea4f`.**

**FOLLOW-UP:**
- **Fake PII in the source context.** The server event's stack frames
  carry source context lines, and one of them is the test route's own
  `throw`, containing the literal fake email, CPF and phone. That's code,
  not runtime data. But whoever runs F-S1 in the Sentry UI will see them
  unmasked and may read it as a scrubber failure. Build the test string
  at runtime, or mask `context_line`/`pre_context`/`post_context` in
  `scrubEvent`.
- **11-digit phone.** A phone written as 11 plain digits is masked as
  `[cpf]`, not `[phone]`. It's still masked.

**CI at `279ea4f`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `279ea4f`, review clean.**

**Re-check at `81a0584`** (a master merge, plus the source-context
FOLLOW-UP fixed). `/api/sentry-check` now builds its fake data at runtime,
and `scrubEvent` masks stack-frame context lines and drops frame vars.

**🟢 Server event,** captured with the same local-DSN sink, in the scratch
clone updated to `81a0584`:
- **Message:** "sentry-check: test error for [email], CPF [cpf], phone
  [phone]".
- **Source context:** the route's frame shows only the runtime-built
  code (`["123", "456", "789"].join(".")`, …), and no frame anywhere
  carries a literal email, CPF or phone.
- **Planted values:** none of "maria.teste", "example.com",
  "123.456.789", "91234-5678", "x@y.com", "Maria" or the cookie appears
  anywhere in the capture.
- **Other fields:** no frame `vars`. `request` is URL+method with no
  "?"; no user; the contexts have no `nextjs`.

**🟢 Routes:** the preview `/api/sentry-check` returns 500, and prod
returns 404.

The client side is unaffected by this delta (the code reviewer agreed),
so the `279ea4f` results stand. The `#29`/`#30` entries from master sit
before this one, as expected.

**CI at `81a0584`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `81a0584`, review clean.**

**Prod addendum (`5712d37`):** client events (`env=production`) are
masked, and a `?email=…&q=…` page leaks nothing. There are no query
strings, user, spans or replay. `/api/sentry-check` returns 404, and
`.map` files aren't served.

## PR #34 (`fix/local-record-dates`) — "today" is the practice's day, 🟢 at `29cf23c`, review clean

**Scope: exactly `29cf23c`.** Server-side "today" is computed in the
practice's time zone (`professionals.time_zone`, or `get_my_clinic()` for
a secretary; São Paulo fallback). The calendar's today/Today button and
the month grid are fixed, and record time shows as HH:MM. Migration 099
went live during testing.

**How it was tested.** The fix is JS-side, so I ran `29cf23c` locally with
the **Node clock shifted** by a `--require` preload, and the browser clock
pinned to the same instant (`page.clock.install`). Supabase keeps real
time.
- **Why backward:** shifting forward makes fresh auth tokens look
  expired, so the instants are in the recent past.
- **The instants:** Friday 25 Sept 23:30 BRT (02:30Z on the 26th),
  Saturday 26 at 00:30 BRT, and Sunday 20 at 23:30 BRT.
- **Where:** an isolated clone. The worktree's shared `node_modules`
  lacks `@sentry/nextjs` since #31.
- **Test data:** a throwaway doctor with appointments on 14, 20, 21, 25
  and 26 Sept, a secretary, and a linked patient account.

**🟢 Friday 23:30 BRT** (UTC is already the 26th). Same result for the
doctor and the secretary:
- **Dashboard:** "Boa noite", "sexta-feira, 25 de setembro de 2026", and
  the Today list is the 25th.
- **Schedule:** opens on the 25th, "1 consulta hoje".
- **Calendar:** the week and month views highlight **25**. "Today" clicked
  from 1 Sept goes to `?date=2026-09-25`.
- **Payments "this week":** Mon 21 to Sun 27, R$ 750.
- **Patient My appointments:** the 25th is still under **Próximas**.

**🟢 Saturday 00:30 BRT:** the date is "sábado, 26", with "Boa noite", and
the Today list is the 26th. The month view highlights 26. For the
patient, the 25th moves to Histórico.

**🟢 Sunday 20 at 23:30 BRT** (the old bug): payments "this week" is **Mon
14 to Sun 20** (R$ 250), not the next week. The dashboard shows "domingo,
20", and the month view highlights 20.

**🟢 Practice time zone (099).** I set my throwaway practice to
`Asia/Bangkok` via the service role, then reset it. At the same instant
the doctor **and** the secretary both get "Bom dia", "sábado, 26 de
setembro", and a schedule defaulting to the 26th.

**🟢 Month grid east of UTC.** With the browser in `Asia/Bangkok`,
September 2026 starts on **31 Aug** (Mon), then 1, 2, 3…, with 35 cells
and no shift.

**🟢 HH:MM.** A new record shows `2026-09-26 11:44` in the chart, with no
seconds. It's stored by 099's trigger at the real server time, so the
record-date-after-21:00 proof is B-7c's real-time run.

**Review: Claude `/code-review` (code reviewer), clean at `29cf23c`.**

**FOLLOW-UP:** in CalendarView, the month title ("September 2026"), the
weekday headers (MON, TUE…) and the "Today" button are hard-coded
English on pt-BR pages. That's pre-existing, not from #34.

**CI at `29cf23c`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `29cf23c`, review clean.**

**Prod addendum (`33ea7f5`, real time ~12:04 BRT):**
- **Doctor and secretary:** "Boa tarde, sábado 26". The schedule defaults
  to the 26th, and the week and month views highlight 26.
- **Payments:** "this week" is Mon 21 to Sun 27.
- **Record time:** shows HH:MM (`12:04`).
- **Practice set to `Asia/Bangkok`:** "Boa noite" (22:04 there), then
  reset.
- **Bangkok browser:** the month grid starts on 31 Aug.
- **Patient:** today's appointment is under Próximas.

## PR #36 (`fix/account-delete-intake`) — /account/delete inserts from the browser, 🟢 (pre-100 scope) at `9f28b3c`, review clean

**Scope: exactly `9f28b3c`.** The form inserts into `deletion_requests`
directly from the browser, so migration 100's per-IP rate limit sees the
visitor. The old `requestAccountDeletion` server action is removed.
Migration 100's errors are translated. It merges **before** 100, per the
code reviewer, because current RLS already allows the browser insert.

Tested live on the preview, pt-BR, with `@example.invalid` emails. The
test rows were deleted afterwards.

**🟢 Anonymous submit:**
- **Confirmation:** "Solicitação recebida — Recebemos sua solicitação
  para <email>."
- **Network:** exactly one **direct Supabase REST** `POST
  /rest/v1/deletion_requests` (201, no `select`) and **no server-action
  POST**.
- **Row:** status `pending`, with the reason.

**🟢 Signed in** (a throwaway doctor): the same confirmation, a direct REST
201, and the row stored.

**🟢 Blank email** (whitespace, with the client `required` removed):
"Informe seu e-mail.", and no REST POST is made.

**⏳ After migration 100 goes live, to check on prod:**
- the row gets status `new`;
- support receives the alert email;
- the 4th request for the same email within a day shows the new
  "several requests" line;
- an invalid email shows "invalid email";
- two different browsers or IPs each get their own limit.

**Review: Claude `/code-review` (code reviewer), clean at `9f28b3c`.**

**CI at `9f28b3c`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `9f28b3c` (pre-100 behaviour), review clean.** The
post-100 checks are recorded here as a prod addendum once 100 is live.

**Prod addendum, after migration 100** (`335a118` live, pt-BR,
`@example.invalid`):
- **🟢 Status `new`:** three submits of the same email, each from a fresh
  browser context, each get 201 and "Solicitação recebida". The rows are
  stored with status **`new`** (it was `pending` before 100).
- **🟢 Rate limit:** the **4th** submit of that email the same day gets
  REST 400 `too_many_attempts`. The page shows "Já recebemos várias
  solicitações. Tente de novo amanhã ou escreva para
  support@solvymed.com." and stays on the form.
- **🟢 Invalid email:** `a@b` passes the browser's own `type=email` check,
  gets REST 400 `invalid_email`, and shows "Informe um endereço de e-mail
  válido."
- **Not verifiable here:**
  - **Support alert email:** sent (Resend accepted, `alert_sent_at` set);
    inbox delivery pending the user's check. Mob dev saw status `new` and
    `alert_sent_at` set on all 4 test rows (1 from an aborted first run)
    when deleting them.
  - **"Two IPs each get their own limit":** I only have one IP. Two
    browser contexts from the same IP share the per-email limit, as
    shown above.
- **Cleanup:** the 4 test rows went to mob dev for deletion.

## PR #38 (`feat/deletion-request-locale`) — deletion requests carry the page locale, 🟢 at `77ade20`, review clean

**Scope: exactly `77ade20`.** `/account/delete` sends the page's locale
with the insert; migration 101 (`deletion_requests.locale`) is live.

Tested live on the preview with **2 submits only**, per the `[TEST]` rule:
`@example.invalid` emails and reasons starting with `[TEST]`.

**🟢 pt-BR:** from `/pt-BR/account/delete`, the browser's REST POST body
includes `"locale":"pt-BR"`, and the page shows "Solicitação recebida".
The row is stored with `locale='pt-BR'`, status `new` and the `[TEST]`
reason.

**🟢 en (unprefixed):** from `/account/delete` with `NEXT_LOCALE=en`, the
POST includes `"locale":"en"`, and the page shows "Request received". The
row is stored with `locale='en'`.

**Not run:** the code reviewer suggested `/ja/account/delete` →
`'ja'`. I kept to the two-request limit, and `en` also covers the
unprefixed default locale. The mechanism is the same for every locale.
- **Alert subject:** that it starts with "[TEST] " is pending the user's
  inbox check.
- **Cleanup:** the 2 test rows went to mob dev for deletion.

**Also in this commit:** checklist row D-5 now records the `[TEST]`
test-submit rule, plus what migrations 100 and 101 enforce.

**Review: Claude `/code-review` (code reviewer), clean at `77ade20`.**

**CI at `77ade20`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `77ade20`, review clean.**
## PR #35 (`feat/first-run`) — first-run part 1, 🟢 at `e38114d`, review clean

**Scope: exactly `e38114d`.** It covers:
- the welcome page, plus a new professional's first confirmation now
  routing to it (my finding at `bc215ba`, fixed here);
- the Schedule and Payments empty states;
- the trial chip replacing the TrialBanner;
- copied share links without a locale segment (UX rule).

Tested live on the preview, pt-BR, with throwaway accounts, all deleted
afterwards.

**🟢 1. Welcome page and routing.**
- **Real flow:** a UI signup as Profissional, then the confirmation link
  via `/api/auth/callback`, lands on **`/pt-BR/auth/professional-welcome`**.
  It shows "Boas-vindas ao SolvyMed, Joana!", the body copy, "Começar
  configuração" and "Agora não", with no countdown.
- **Buttons:** Start setup → `/pt-BR/dashboard?setup=1`; Skip →
  `/pt-BR/dashboard`.
- **Later logins:** a second login (password) goes to `/pt-BR/dashboard`.
- **Callback matrix** (`redirect: manual`, reading `Location`):
  - a doctor's link within 10 min of confirmation → welcome;
  - the same doctor **after 11 min** → `/dashboard`;
  - recovery links → `/dashboard`, never the welcome page, before or
    after;
  - secretary → `/dashboard`;
  - linked patient → `/my-appointments`;
  - pending patient → `/auth/pending-confirmation`.
- **Not covered:** the PKCE `?code=` confirmation (it needs a real inbox
  in the signing-up browser); that path is code-reviewed.

**🟢 2. Schedule empty state (List view).**
- **Copy:** "Nenhuma consulta ainda." with its body, plus "Marcar
  consulta" (which opens the new-appointment dialog) and "Compartilhar
  link de convite".
- **Share, before an invite code exists:** it's a link to Settings.
- **Share, with a code:** it copies `…/join/<code>` with **no locale**,
  and shows "Link copiado!".
- **Settings → Copiar link:** also `…/join/<code>`, with no locale.

**🟢 Team invite links.**
- **Secretary link:** Copiar link gives `…/join/secretary/<code>`, and the
  WhatsApp text "Convite para a equipe da minha secretaria no SolvyMed:
  …/join/secretary/<code>", both with no locale.
- **In an en browser:** the secretary link shows "You've been invited as a
  secretary", and the patient link lands on `/auth/signup?join=…` with
  `lang=en`.

**🟢 3. Payments empty state.**
- **Doctor:** "Nenhum pagamento ainda." with its body; "Definir seus
  preços" goes to `/pt-BR/dashboard/settings`.
- **Secretary:** the empty states show, with no "Definir seus preços", no
  Share button and no chip.

**🟢 4. Trial chip**, the same on Home, Schedule and Patients, linking to
`/pt-BR/subscribe`:
- **+10 days:** neutral (slate), "Teste grátis: faltam 10 dias · Ver
  plano".
- **+3 days:** **amber**, "faltam 3 dias · Assinar".
- **+12 hours:** **red**, "Teste grátis: último dia · Assinar".
- **Active subscription:** no chip.
- **The old TrialBanner:** gone.

**🟢 #34 in the merged tree:** the schedule still defaults to today in
Brazil ("sábado, 26 de setembro de 2026").

**Review: Claude `/code-review` (code reviewer), clean at `e38114d`.**

**Observation (not #35):** a `type=recovery` token_hash sent through
`/api/auth/callback` logs the user in and lands on `/dashboard`, not
`/auth/reset-password`. Real reset emails don't use this route today;
re-check with A-15 (S-01 `token_hash` links).

**CI at `e38114d`:** Vercel ✅. **"Typecheck and unit tests" has not run on
this head** (only the Vercel checks are listed). It's required, so it must
go green before merge.

**Merge gate: 🟢 for `e38114d`, review clean, pending the required CI
check.** Merged as `b51c1ff`, after master was merged in (`f87053a`, the
code reviewer's clean head), with CI green.

**Prod addendum (`b51c1ff`, www.solvymed.com):**
- **Welcome:** a real UI signup plus confirmation lands on
  `/pt-BR/auth/professional-welcome` ("Boas-vindas ao SolvyMed, Joana!",
  no countdown). Start setup → `/dashboard?setup=1`; Skip → `/dashboard`.
- **Other routes:** a second login → `/dashboard`, and a recovery link via
  the callback → `/dashboard`, not the welcome page. The recovery fix is
  tracked under A-15.
- **Schedule empty state:** "Share" goes to Settings when there's no code;
  with a code it copies `…/join/<code>` with **no locale** ("Link
  copiado!"). Settings "Copiar link" is the same.
- **Team links:** the secretary link and WhatsApp text are
  `…/join/secretary/<code>`, with no locale. Opened in an en browser, they
  show English, and the patient link goes to `/auth/signup?join=…` with
  `lang=en`.
- **Payments empty state:** "Definir seus preços" → Settings. A secretary
  gets no Set-prices or Share button and no chip.
- **Chip:** +12h is **red**, "Teste grátis: último dia · Assinar". An active
  subscription shows **no chip**. A brand-new doctor shows the neutral
  "faltam 15 dias · Ver plano" on Home, Schedule and Patients, and the
  old banner is gone.
- **#34:** the schedule still defaults to the Brazil date.
- **Harness note:** in one of the two specs, the lookup of the new user
  ran before prod finished the signup, so its chip PATCHes didn't apply
  and it kept the default 15-day trial. The second spec used a pre-made
  doctor, and its chip results are the ones above. The orphaned account
  was deleted.

## PR #41 (`fix/auth-links-verify-on-click`) — scanner-safe links, reset opens the password form, 🟢 at `75c91a8`, review clean

**Scope: exactly `75c91a8`.** This fixes both pre-A-15 blockers.
- **Callback:** `/api/auth/callback?token_hash` no longer verifies. It
  redirects to `/[locale]/auth/verify`.
- **Verify page:** verifies only on submit or "Continuar", then routes
  through `POST /api/auth/after-verify` (`lib/authRouting.ts`).

Tested live on the preview with real `token_hash` values from admin
`generate_link`, using throwaway accounts that were deleted afterwards.

**🟢 Scanner safety.**
- **Before every browser click:** I sent a cookieless, JS-less GET that
  follows redirects, like `curl -L`. The page renders the
  form or Continue screen, with no Supabase call.
- **HEAD (`curl -I`):** on the callback and on both verify URLs, no token
  is consumed.
- **After all those scans:** the token still verifies (200), and every
  real click afterwards worked.
- **Callback redirect:** it sends `Referrer-Policy: no-referrer` and pins
  `NEXT_LOCALE` (e.g. `en`).
- **Verify page:** `<meta name="referrer" content="no-referrer">` and
  `robots noindex, nofollow`. The response header itself is the default
  `strict-origin-when-cross-origin`; the meta tag is what applies.
- **`GET /api/auth/after-verify`:** 405.

**🟢 Recovery, pt-BR and en.**
- **Landing:** `/pt-BR/auth/verify?…&type=recovery` shows "Definir nova
  senha" (en: `/auth/verify`, "Set new password"), with 2 password fields
  and **no language switcher**. **No auth call** is made on load.
- **Submit:** `POST /auth/v1/verify` then `PUT /auth/v1/user` → "Senha
  atualizada" / "Password updated".
- **Passwords:** the **new password logs in, and the old one is refused**
  (`invalid_credentials`).
- **Reusing the link:** "Este link expirou" / "This link has expired". The
  password stays the new one.

**🟢 Signup confirmation.**
- **New professional:** "Confirme seu e-mail" / "Toque em Continuar para
  concluir a criação…" → **Continuar** → `/pt-BR/auth/professional-welcome`
  ("Boas-vindas ao SolvyMed, Joana!").
- **Reused signup link:** "Este link expirou", "Solicite um novo na página
  de login." and "Ir para o login".
- **Secretary with an invite:** Continuar → `/pt-BR/dashboard`, and the
  invite's `accepted_at` is set.
- **Patient with the doctor's public code:** Continuar →
  `/pt-BR/auth/pending-confirmation` (`invited_by_professional_id` set).
- **Magiclink (other types):** "Quase lá" → Continuar → routed as usual.
  The just-confirmed doctor went to the welcome page, as designed for a
  confirmation under 10 min old.
- **App-origin `/pt-BR/auth/confirm?token_hash&type=signup`:** a plain GET
  (200) doesn't consume the token; the later click through the callback
  still worked.

**Review: Claude `/code-review` (code reviewer), clean at `75c91a8`.**

**Also in this commit:** checklist row A-15 now records both blockers as
fixed on the web side. It stays ⏳ until the live send-email hook's real
emails are re-run.

**CI at `75c91a8`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `75c91a8`, review clean.**

## PR #42 (`fix/confirm-verify-on-click`) — /auth/confirm token links verify on click, 🟢 at `d87ee62`, review clean

**Scope: exactly `d87ee62`.** That's `bd7b360` plus one moved import line.
`/[locale]/auth/confirm?token_hash&type`, the app's `redirect_to`, now
renders the same click-to-verify page as `/auth/verify` (`appHandoff`).
After the click, an account created in the app goes back to the app
through the `solvymed://` deep link carrying its session; a web account
follows the web routing. The page has `robots noindex, nofollow` and a
`no-referrer` meta. The PKCE `?code=` path is unchanged.

Tested live on the preview. The links were built the same way as mob dev's
`gen_auth_link.js` (admin `generate_link` with `redirect_to` set to the
preview's `/auth/confirm`), with app accounts (`platform: mobile`) and web
accounts. The throwaways were deleted.

**🟢 Scanner safety.** Before every click: HEAD, GET, HEAD, GET, all
returning 200. The signup account **stays unconfirmed**
(`email_not_confirmed`), and the page makes **0** `/auth/v1/verify` calls
on load. Every later click still worked.

**🟢 App signup (`platform: mobile`), pt-BR and en.**
- **Page:** "Confirme seu e-mail" / "Confirm your email", with no language
  switcher.
- **On a phone** (Playwright Pixel 7), Continue → "Email confirmado!" /
  "Email confirmed!" and "Abrindo o SolvyMed…", with the "Abrir SolvyMed"
  button. The page navigates to
  **`solvymed://?access_token=…&refresh_token=…&type=signup`**, and the
  access token in the deep link is **valid** (`/auth/v1/user` returns 200).
- **On a desktop browser**, the same flow ends on `/dashboard`.
  `ConfirmClient`'s existing desktop fallback redirects there instead of
  to the app, the same as the PKCE path.
- **Reused link:** "Este link expirou" / "This link has expired".

**🟢 Web signup (`platform: web`).** Continue →
`/pt-BR/auth/professional-welcome` ("Boas-vindas ao SolvyMed, Opus!").
Reusing the link shows expired.

**🟢 Recovery via `/auth/confirm`, pt-BR and en** (app accounts). After the
scans, the page shows "Definir nova senha" / "Set new password" with 2
fields; submitting shows "Senha atualizada" / "Password updated". The
**new password logs in, and the old one is refused**.

**🟢 Page tags:** `<meta name="robots" content="noindex, nofollow">` and
`<meta name="referrer" content="no-referrer">`.

**Review: Claude `/code-review` (code reviewer), clean at `d87ee62`.**

**CI at `d87ee62`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `d87ee62`, review clean.**
## PR #32 (`feat/close-account`) — close or delete your own account, 🟢 at `f0ce14a`, review clean

**Scope: exactly `f0ce14a`.** This is the web half of close-account, in
lockstep with migration 102 and `notify-clinic-closed` (live).
- **Settings → Encerrar / Excluir conta:** the panel's copy comes from
  `get_account_closure_preview()`.
- **`POST /api/account/close`:** works with the cookie session or a mobile
  `Bearer` token. It cancels Stripe first, fail-closed, then runs
  `close_my_account()`, then sends notices after the response.

Tested live on the preview.
- **Accounts:** throwaways only. The linked patient used `@example.invalid`
  with a fake Expo token, so no real email or push went out.
- **Stripe:** a **TEST** subscription was created through the API (no
  checkout).
- **Cleanup:** closed doctors can't be deleted by me (their records are
  retained), so they went to mob dev to purge. Everything else is
  deleted.

**🟢 1. Doctor with records, an active TEST subscription, a secretary and a
linked patient.**
- **Preview RPC:** `has_clinical_history:true, subscription_active:true,
  patients:2, upcoming_appointments:1, secretaries:1`.
- **Panel ("Encerrar conta"):** "Seus 2 pacientes são arquivados e 1
  consulta futura é cancelada…", "1 pessoa da equipe perde o acesso", and
  "Sua assinatura termina agora. O período atual não é reembolsado."
  Submitting requires the "Entendo…" checkbox.
- **Close:** 200 `{"outcome":"closed"}`, then signed out to `/pt-BR`.
- **After the close:**
  - **Stripe:** the subscription is `canceled`.
  - **Login:** refused.
  - **Data:** the record is kept, both patients are archived, and the
    upcoming appointment is `cancelled`.
  - **Storage:** `profile-photos/<uid>/` and `document-logos/<uid>/` are
    empty (they had a file each before).
  - **The secretary:** detached (`invited_by_professional_id` null) and
    sees no patients.
  - **The linked patient:** unlinked (`linked_patient_id` null).
- **Notices:** confirmed server-side by mob dev. `notify-clinic-closed`
  was called 1.3 s after the close and returned POST 202, logging
  `sent=0 failed=0 skipped=1`. The skip is the `@example.invalid` linked
  patient, correctly not emailed. Push delivery to the fake Expo token
  isn't observable.

**🟢 2. Doctor without records, on trial.** "Excluir conta" (no no-refund
line) → `deleted`. The auth user returns 404, and the professional row and
patients are gone.

**🟢 3. Secretary.** "Excluir conta", with "Isto exclui definitivamente sua
conta da equipe. Os dados da clínica não são afetados." → `deleted`. The
secretary can't log in; the doctor's patients and login are untouched.

**🟢 4. Stripe guard.**
- **Unknown or deleted subscription ID** (the row still says active): 409
  `subscription_active`, shown as "Sua assinatura ainda está ativa. Tente
  de novo em um minuto." The account stays open.
- **A subscription whose `metadata.user_id` isn't the caller:** 409
  `check_failed`, shown as "Sua conta não foi encerrada. Tente de novo."
  The Stripe subscription is **untouched (`active`)**, and the account
  stays open.
- **`cancelled_not_closed`:** couldn't be forced on the preview; it's
  code-reviewed.

**🟢 5. Mobile `Bearer` path.**
- **No token, or a bad token:** 401 `unauthorized`.
- **Doctor without records:** 200 `deleted`.
- **Patient:** 200 `deleted` (the auth user returns 404).
- **Doctor with records:** 200 `closed`.
  - **The pre-close token reads nothing afterwards:** records `[]`,
    patients `[]`, the professional row `[]`.
  - **What's kept:** the record.
  - **Login:** refused, and the email is now
    `closed+<id>@solvymed.invalid`.

**🟢 6. Text.**
- **`/privacy` §7:** "…an account that holds medical records is closed
  rather than deleted…" and "You can close or delete your account yourself
  in Settings, or ask us by email", plus the per-role facts.
- **`/pt-BR/account/delete`:** "Profissionais de saúde: você também pode
  encerrar ou excluir sua conta em Configurações. Se seus pacientes têm
  prontuários… encerramos sua conta… Sem prontuários, sua conta é
  excluída."

**Review: Claude `/code-review` (code reviewer), clean at `f0ce14a`.**

**Harness note:** the first run hit my 15-minute test timeout during step
4 (the Settings page was fine), so steps 4–6 were re-run in a second spec
with the extra checks above.

**CI at `f0ce14a`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `f0ce14a`, review clean.** The linked-patient notice
call is confirmed server-side (202, skipped=1). The closed throwaways were
purged by mob dev.

**Prod addendum (`e2a049d`):**
- **Settings panel, doctor with a record and a secretary:** "Encerrar
  conta" with "Seu 1 paciente é arquivado e não há consultas futuras a
  cancelar" and "1 pessoa da equipe perde o acesso". Not submitted; that
  throwaway went to mob dev for purge.
- **Secretary:** the team-account copy, then deleted their own account
  (200 `deleted`, auth user 404). The doctor's patient is untouched.
- **Doctor without records:** "Excluir conta", then deleted their own
  account (200 `deleted`).
- **Text:** the `/privacy` §7 self-service line and the
  `/pt-BR/account/delete` professionals line are live.

## Prod addendum — #41 + #42 auth links (the S-01 enable gate), www.solvymed.com at `0f2eff2`

Mob dev named this run the gate for enabling S-01's `token_hash` emails.
The links were built as `gen_auth_link.js` does (admin `generate_link`
with `redirect_to` set to prod's `/auth/confirm`, `/pt-BR/auth/confirm`,
or the `/api/auth/callback` path). The throwaways were deleted.

**🟢 Callback path (#41).**
- **Scanning:** cookieless GET-follow scans leave every token valid, and
  there's no auth call on load.
- **Recovery, pt-BR and en:** the set-password form, then "Senha
  atualizada" / "Password updated". The new password logs in and the old
  one is refused. A reused link says "expirou" / "expired".
- **Signup:** Continuar → the welcome page, and reuse says expired.
- **Secretary with an invite:** → `/pt-BR/dashboard`, with the invite
  accepted.
- **Patient with the doctor's code:** → `/pt-BR/auth/pending-confirmation`.
- **Magiclink:** "Quase lá".
- **`GET /api/auth/after-verify`:** 405.
- **Page tags:** robots `noindex` and meta `no-referrer`.

**🟢 `/auth/confirm` (#42).**
- **Page tags:** `robots noindex, nofollow` and `referrer no-referrer`.
- **Before each click:** HEAD/GET ×4. Signup accounts stay unconfirmed,
  with 0 verify calls on load.
- **App signup (`platform: mobile`), on a phone UA, pt-BR and en:**
  Continue → "Email confirmado!" / "Email confirmed!" with the "Abrir /
  Open SolvyMed" button, navigating to
  `solvymed://?access_token=…&refresh_token=…&type=signup`. The deep-link
  access token is valid (200).
- **On a desktop UA:** the existing fallback goes to `/dashboard`.
- **Web signup:** → the welcome page.
- **Recovery via `/auth/confirm`, pt-BR and en:** the set-password form;
  the new password works and the old one is refused.
- **Reused links:** "Este link expirou" / "This link has expired". The en
  reuse and en recovery text were re-checked after a timing miss in the
  first run.

**Gate: 🟢 for enabling S-01 on the web side.** A-15 itself stays ⏳ until
real hook emails are exercised once S-01 is on.

## PR #43 (`copy/close-panel-lines`) — close/delete panel copy, 🟢 at `083d593`, review clean

**Scope: exactly `083d593`.** This is copy only, 15 locales: the Settings
delete panel lines for a doctor without records and for a secretary.

Checked on the preview with a trial doctor without records and their
secretary (throwaways, deleted afterwards; nothing submitted):
- **pt-BR:**
  - **Doctor:** "Excluir conta" with **"Sua conta, seus pacientes e suas
    consultas serão excluídos definitivamente."**
  - **Secretary:** **"Seu acesso e seu perfil serão excluídos. Os
    pacientes e as consultas do consultório continuam com o consultório."**
- **en:**
  - **Doctor:** "Delete account" with **"Your account, patients and
    appointments will be permanently deleted."**
  - **Secretary:** **"Your login and profile will be deleted. The
    practice's patients and appointments stay with the practice."**
- **Old wording:** gone in both locales.

**Review: Claude `/code-review` (code reviewer), clean at `083d593`.**

**CI at `083d593`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `083d593`, review clean.** This commit also carries
the #32 prod addendum and the #41/#42 S-01 gate addendum above.

## PR #45 (`fix/sentry-scrub-urls-in-text`) — URLs in error text cut to path, storage file names masked, 🟢 at `e843b09`, review clean

**Scope: exactly `e843b09`.** `sentryScrub` now also rewrites absolute
URLs inside free text (error and breadcrumb messages).
- **URLs:** each is reduced to its path, with invite codes redacted and
  the query and fragment dropped.
- **Storage objects:** the last segment of a `/storage/v1/object/…` or
  `/storage/v1/render/image/…` path, the file name, becomes `[file]`.

The unit tests cover it. I also checked it live, the same way as #31:
Playwright intercepted the browser SDK's envelope on the preview and
answered it locally, so nothing reached Sentry. The thrown error contained
a signed storage URL, an image-render URL and a secretary join link with
`?email=` and `#frag`. The message sent was:

> `b45 check: fetch failed https://…supabase.co/storage/v1/object/sign/patient-files/doc-uuid/pat-uuid/[file] then https://…supabase.co/storage/v1/render/image/public/profile-photos/doc-uuid/[file] and https://www.solvymed.com/pt-BR/join/secretary/[code]`

**🟢 Nothing leaked** anywhere in the envelope: not the signing token, the
patient-looking file names (`exame-maria-silva.pdf`,
`foto-joao-souza.jpg`), `width=200`, the invite code, the email or the
fragment.

**Review: Claude `/code-review` (code reviewer), clean at `e843b09`.**

**CI at `e843b09`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `e843b09`, review clean.**
## PR #44 (`i18n/calendar-labels`) — localized calendar, switcher label, BRL format, 🟢 at `63e0192`, review clean

**Scope: exactly `63e0192`.** This localizes CalendarView (titles, the
Monday-first weekday row, "Today", "+N more", the popup date and the
Paid/Pending/Blocked labels) and the language switcher's `aria-label`.
The last commit formats money as BRL (`R$ 150,00`) in the popup, the list
line and the procedure picker. It fixes my #34 FOLLOW-UP.

Tested on the preview in pt-BR, en and ar with a throwaway doctor who has
5 entries on 15 Oct 2026 (paid, pending and a blocked slot), deleted
afterwards.

**🟢 Switcher `aria-label`:** "Idioma", "Language", "اللغة".

**🟢 Week view (`?date=2026-10-15&view=week`).**
- **Title:** "12 – 18 de out. de 2026", "Oct 12 – 18, 2026" and "12–18
  أكتوبر 2026".
- **Weekdays:** seg.…dom., Mon…Sun and الاثنين…الأحد (Monday first).
- **Today button:** Hoje, Today and اليوم.

**🟢 Month view.**
- **Title:** "outubro de 2026", "October 2026" and "أكتوبر 2026".
- **Weekday row:** localized, Monday first.
- **Overflow line:** "+2 mais", "+2 more" and "+2 أخرى".
- **Popup:** the date is "qui., 15 de out." / "Thu, Oct 15" / "الخميس، 15
  أكتوبر". Payment shows as "✓ Pago · R$ 150,00" / "⏳ Pendente", with the
  en/ar equivalents. The blocked slot shows "Bloqueado", "Blocked" or
  "محجوب", and the status options are translated.

**🟢 BRL format** (`63e0192`) in all three locales: the popup, the list
lines and the procedure picker show `R$ 150,00`, not the `R$ 150.00`
seen at `da5820a`.

**🟢 Bangkok browser:** October 2026 still starts on Mon 28 Sep (28, 29,
30, 1…), 35 cells, with the title "outubro de 2026". No shift.

**Review: Claude `/code-review` (code reviewer), clean at `63e0192`.**

**CI at `63e0192`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `63e0192`, review clean.**
## PR #46 (`feat/turnstile-dormant`) — Cloudflare Turnstile shipped dormant, 🟢 at `d1461c3`, review clean

**Scope: exactly `d1461c3`.** Turnstile on sign-up, sign-in and password
reset. It stays dormant unless `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set.
Supabase's own CAPTCHA stays off; this PR doesn't touch it.

**1. Dormant: the preview has no site key.** Checked in a pt-BR browser
with one new signup and a confirmed throwaway doctor, both deleted
afterwards:
- **Signup:** no widget; the account is created and the page shows
  "Verifique seu e-mail", with no error.
- **Login:** no widget; lands on `/pt-BR/dashboard`.
- **Forgot password:** no widget; shows "Se existir uma conta com esse
  e-mail, você receberá um link em breve.", with no error.
- **Requests:** none to `challenges.cloudflare.com`, and no `captcha` field
  in any `/auth/v1/signup|token|recover` POST.
- **Page errors:** none.

**2. Live, with Cloudflare's TEST site keys.** Run on local `next dev` of
`d1461c3` against the prod Supabase, since a preview can't take a
per-branch key without the Vercel env:
- **Always-block key (`2x…AB`):** the script and challenge load from
  `challenges.cloudflare.com`. Submitting login, forgot or signup shows
  **"Conclua a verificação e tente novamente."** and sends **no** auth POST,
  so no account is created.
- **Always-pass key (`1x…AA`):** the widget renders in pt-BR ("Sucesso!",
  with Cloudflare's test-only banner). Login reaches the dashboard and
  forgot shows the sent line. Both POSTs carry a `captcha_token`, which
  Supabase accepts and ignores because its CAPTCHA is off.
- **Page errors:** none.

**Review: Claude `/code-review` (code reviewer), clean at `d1461c3`.**

**CI at `d1461c3`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `d1461c3`, review clean.**

## iOS — open question

Same answer as the mobile repo's `TESTING.md`: not applicable to this repo
directly, but worth noting here since browser E2E doesn't have the native
Xcode constraint mobile does — Playwright's WebKit engine *can* run on
Windows/Linux without a Mac, so if Safari-specific web bugs ever matter,
add a `webkit` project to `playwright.config.ts`. Not done yet since
Chromium coverage is the priority while the E2E layer is brand new.

## PR #47 (`fix/auth-error-codes`) — auth errors from Supabase's error code, 🟢 at `4558c8e`, review clean

**Scope: exactly `4558c8e`**, retargeted to master after #46 merged, with the
head unchanged. This entry sits at the end of the file so it doesn't clash
with master's #44–#46 entries.

**Setup.** Checked on the preview in pt-BR and en with four throwaways,
all deleted afterwards:
- a confirmed doctor;
- an unconfirmed account (admin-created with `email_confirm: false`);
- a banned account (admin `ban_duration`), standing in for a closed one,
  since both give `user_banned`;
- a fresh doctor for the /auth/confirm check.

**Results.** The Supabase code behind each line was read from the network,
and pt-BR / en shows the text that appeared:

| Step | Supabase | pt-BR / en |
| --- | --- | --- |
| 1. Wrong password | 400 `invalid_credentials` | "E-mail ou senha incorretos." / "Wrong email or password." |
| 1. Unknown email | 400 `invalid_credentials` | **the same line**, so no enumeration |
| 2. Unconfirmed | 400 `email_not_confirmed` | "Confirme seu e-mail primeiro: toque no link…" / "Confirm your email first: tap the link…" |
| 5. Closed / banned | 400 `user_banned` | "Esta conta foi encerrada ou suspensa… support@solvymed.com." / "This account has been closed or suspended…" |
| Offline login | fetch fails | "Sem conexão. Verifique sua internet e tente novamente." / "No connection. Check your internet and try again." |
| 3. Signup, 7 chars | client check | "A senha deve ter pelo menos 8 caracteres." / "Password must be at least 8 characters." (nothing created) |
| 3. Forgot, 2nd request inside a minute | 429 `over_email_send_rate_limit` | "Muitas tentativas. Aguarde alguns minutos…" / "Too many attempts. Wait a few minutes…" (the 1st shows the usual sent line) |
| 4. Recovery form (/auth/verify), 7 chars | client check | the 8-character line above |
| 4. Recovery form, same password | 422 `same_password` | "A nova senha deve ser diferente da senha atual." / "New password must differ from your current password." |
| 6. Recovery link reused | verify fails | "Este link expirou…" / "This link has expired…" |
| /auth/confirm set-password form, same password | 422 `same_password` | the same "must differ" line, no raw English (it used to show `error.message`) |

**Notes:**
- **/auth/confirm with 7 characters:** the input's `minlength=8` stops the
  submit with the browser's own bubble, before any app code runs. So the
  text follows the browser's language, not the page's. This is pre-existing,
  #47 doesn't change it, and it's not a blocker.
- **/auth/reset-password:** a plain logged-in session shows the page's
  "link may have expired" state and no form. Recovery links now land on
  /auth/verify (#41), so the form above is the one users see; the page's
  error path goes through the same `useAuthErrorText`.

**Review: Claude `/code-review` (code reviewer), clean at `4558c8e`.**

**CI at `4558c8e`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `4558c8e`, review clean.**

## PR #52 (`fix/verify-app-handoff`) — fixed callback link for every auth email, 🟢 at `7424eb7`, review clean

**Scope: exactly `7424eb7`.** This is the web side of the email-template
switch: the fixed link `/api/auth/callback?token_hash&type[&locale]`, app/web
routing after the click, and the app-account recovery screen.

**Setup.** Links were built by hand with admin `generate_link` (the same
as mob dev's generator), in the fixed-template shape, on the preview. Seven
throwaways were used and all deleted.

**Results:**
- **Scanner first:**
  - A plain `GET` of the link, following redirects with no JS, ends at
    `200 /pt-BR/auth/verify?…`.
  - Nothing is verified: the click afterwards still works, for both web
    signup and app recovery.
  - The callback answers `307` with `Referrer-Policy: no-referrer`.
- **Address bar:** after load it's `/pt-BR/auth/verify`, with no
  `token_hash` or `type`. There are no verify calls on load; the only
  `POST /auth/v1/verify` is on the click or submit.
- **Web signup** (platform `web`, locale `pt-BR`): "Confirme seu e-mail" →
  Continuar → `/pt-BR/auth/professional-welcome` ("Boas-vindas ao SolvyMed,
  Dra!").
- **App signup on a phone** (Pixel 7 UA, platform `mobile`) → Continuar →
  the handoff screen, then a `solvymed://?access_token&refresh_token&type=signup`
  hand-off:
  - `locale=pt-BR` → `/pt-BR/auth/verify`: "Email confirmado! … Abrindo o
    SolvyMed… / Abrir SolvyMed".
  - `locale=de-DE` → `/de/auth/verify`: "Bestätigen Sie Ihre
    E-Mail-Adresse / Weiter" → "E-Mail bestätigt! … SolvyMed öffnen".
  - no `locale`, en browser → `/auth/verify`: "Confirm your email /
    Continue" → "Email confirmed! … Open SolvyMed".
- **App-account recovery** (phone, pt-BR):
  - The form verifies on submit and shows **"Senha atualizada"** / "Sua
    senha foi alterada. Você já pode entrar com sua nova senha.", with
    **"Abrir SolvyMed" → `href="solvymed://"` (no tokens)** and "Ir para o
    login" as the secondary link.
  - **Browser signed out:** `/pt-BR/dashboard` afterwards → `/pt-BR/auth/login`.
  - **Global sign-out, observed:** a session opened for the same account
    before the reset (standing in for the app) is refused on refresh with
    `refresh_token_not_found`. The new password signs in.
- **Web-account recovery:** the existing success screen, "Senha atualizada"
  / "Sua senha foi atualizada. Você já pode fazer login.", with "Ir para o
  login" and no app button.
- **Hostile or odd `?locale=`** (callback `Location` only):

  | `locale=` | Lands on |
  | --- | --- |
  | `pt-BR&type=signup` (encoded) | `/pt-BR/auth/verify` |
  | `<no value>` | `/auth/verify` (en) |
  | `<no value>` with Accept-Language pt-BR | `/pt-BR/…` |
  | `<script>…` | `/auth/verify`, not reflected |
  | `//evil.com` | `/auth/verify`, same origin |
  | empty | `/auth/verify` |
  | `de-DE` | `/de/…` |
  | `fr-FR` | `/fr/…` |

- **Types:** missing, `reauthentication` and `junk` all show **"Este link
  expirou"**, with no Continuar button and **no verify call**. The same
  magiclink token then still works with its real type (→ welcome), so
  nothing was consumed.
- **`email_change_new`:** the page shows "Quase lá" and the click verifies
  with **`type: email_change`** (the alias works).
  - Supabase answers `403 otp_expired` for the admin-generated
    *new-address* token and keeps the change pending, so the page shows
    "Este link expirou".
  - The *current-address* token (`email_change_current` → `email_change`) is
    accepted: 200, "proceed to confirm link sent to the other email". The
    page then lands on login with no message.
  - That's Supabase-side, not this PR. The real-email E2E after the
    template switch settles it, if any client offers an email change.

**Review: Claude `/code-review` (code reviewer), clean at `7424eb7`.**

**CI at `7424eb7`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `7424eb7`, review clean.** After merge, mob dev
switches the templates and the hook; then the web and mobile testers run
the real-email E2E (pt-BR and en, web- and app-origin, signup and recovery,
with a scanner GET first).

## PR #51 (`fix/confirm-novalidate`) — /auth/confirm set-password form shows the app's own lines, 🟢 at `9871e73`, review clean

**Scope: exactly `9871e73`.** This is the follow-up to the #47 note: the
app's set-password form on `/auth/confirm` (a desktop recovery session via
the hash) now has `noValidate`.

Checked on the preview in pt-BR and en with one throwaway doctor, deleted
afterwards. The form reports `noValidate=true`, so the browser bubble no
longer blocks the submit. Results (pt-BR / en):

| Input | Line shown |
| --- | --- |
| 7 characters | "A senha deve ter pelo menos 8 caracteres." / "Password must be at least 8 characters." |
| Mismatched | "As senhas não coincidem." / "Passwords do not match." |
| Both empty | the 8-character line |
| Same password (server) | 422 → "A nova senha deve ser diferente da senha atual." / "New password must differ from your current password." |

Only the last case calls the server (`PUT /auth/v1/user`); the first three
are caught client-side.

**Review: Claude `/code-review` (code reviewer), clean at `9871e73`.**

**CI at `9871e73`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `9871e73`, review clean.**

## PR #49 (`i18n/clinical-fallbacks`) — patient page errors never English or raw database text, 🟢 at `5146a69`, review clean

**Scope: exactly `5146a69`.** The patient page's server actions return
codes, and the tabs translate them, with anything unknown →
`patientDetail.genericError`. Master was merged in (`5207232`) before this
entry so it appends without a conflict; the code under test is unchanged.

**Setup.** Checked on the preview in pt-BR with a throwaway doctor, one
patient and a secretary linked to the doctor. All were deleted afterwards,
and no clinical rows were created.

**Doctor, through the UI:**
- **Prescription with no medication:** "Adicione pelo menos um
  medicamento." The server deletes the empty prescription, leaving 0 rows.
- **Record with only spaces:** passes the browser's `required`, is trimmed
  on the server, and shows "Informe o conteúdo." (0 rows).
- **Patient edit with a blank name (spaces):** "Informe o nome completo do
  paciente." The name is unchanged.
- **Tab sweep:** Informações, Registros, Receitas and Consultas show no
  raw English (the old `Unauthorized`, `Only the doctor…`, `Add at least
  one medication`, …) and no database text.

**Secretary:**
- Only the Informações and Consultas tabs are visible.
- The doctor-only `createRecord` and `createPrescription` actions, called
  directly, return **`{"error":"not_doctor"}`**, a code rather than English;
  the tabs map it to "Somente o profissional pode gerenciar registros
  clínicos.". Nothing is created.

**Review: Claude `/code-review` (code reviewer), clean at `5146a69`.**

**CI at `5146a69`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `5146a69`, review clean.**

## PR #53 (`fix/reset-ends-other-sessions`) — a password reset ends every other session, 🟢 at `75ebecf`, review clean

**Scope: exactly `75ebecf`.** After a reset, `signOut({ scope: "others" })`
runs on all three set-password paths, and this browser stays signed in.
This replaces #52's full sign-out after an app-account reset. Master was
merged in (`e36e852`) before this entry; the code under test is unchanged.

**Setup.** Checked on the preview in pt-BR with four throwaway doctors,
all deleted afterwards. "Other client" means a session opened before the
reset: a password grant, standing in for the app or another device, plus
for path 1 a second signed-in browser.

**Results:**
- **1. `/auth/verify` recovery form (web account):** "Senha atualizada".
  - This browser: `/pt-BR/dashboard` loads.
  - Other session: refresh refused with `refresh_token_not_found`.
  - Other browser: its next request to `/pt-BR/dashboard` → `/pt-BR/auth/login`.
- **2. `/auth/reset-password`** (recovery tokens in the hash): the form
  shows, "Senha atualizada", and the new password works.
  - This browser: `/pt-BR/dashboard` loads.
  - Other session: refused with `refresh_token_not_found`.
- **3. `/auth/confirm` set-password form** (desktop, hash session): "Senha
  atualizada / Sua senha foi alterada…", and the new password works.
  - Other session: refused with `refresh_token_not_found`.
  - This browser's own refresh token: still OK.
- **4. App-account recovery (phone):** the screen is unchanged: "Senha
  atualizada", **"Abrir SolvyMed" → `solvymed://`**, and "Ir para o login".
  - The browser is **no longer signed out**: `/pt-BR/dashboard` loads.
  - The app's pre-reset session: refused with `refresh_token_not_found`.

**Review: Claude `/code-review` (code reviewer), clean at `75ebecf`.**

**CI at `75ebecf`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `75ebecf`, review clean.**

## PR #48 (`i18n/booking-brl`) — booking page prices in BRL format, 🟢 at `da6211e`, review clean

**Scope: exactly `da6211e`.** On `/book/<professionalId>`, procedure prices
now use `formatBRL`. Master was merged in (`e03feba`) before this entry; the
code under test is unchanged.

**Setup.** Checked on the preview with a throwaway doctor and three active
procedures (R$ 150, R$ 1234.5 and R$ 0). The patient was put in the
doctor's orbit (a `user_roles` patient row with
`invited_by_professional_id`), since `get_professional_procedures` only
returns procedures to a caller allowed to see that doctor's schedule. Both
were deleted afterwards.

**Results** (the same in pt-BR and en):
- The procedure list reads **"30 min · R$ 150,00"** and **"30 min · R$ 1.234,50"**.
- The free procedure shows "30 min", with no price (unchanged).
- No dot-decimal `R$ 150.00` remains.

**Review: Claude `/code-review` (code reviewer), clean at `da6211e`.**

**CI at `da6211e`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `da6211e`, review clean.**

## PR #50 (`feat/first-run-part2`) — setup checklist, "show setup" row, registration field, one-time cards, 🟢 at `185a0b3`, review clean

**Scope: exactly `185a0b3`,** on migration 103, which is live. Master was
merged in (`f5b3640`) before this entry; the code under test is unchanged.

**Setup.** Checked on the preview with seven throwaways, all deleted by the
test's cleanup; the doctors' patients and appointments went with them, and
no clinical rows were made:
- doctor D1: a real web signup link, pt-BR;
- doctor D2, in en;
- a secretary linked to D1;
- a doctor with two patients linked through a `patients` row.

**1–3. D1 (pt-BR), checklist 0 → 6 through each CTA:**
- **Start:** welcome → **Começar configuração** → `/pt-BR/dashboard?setup=1`,
  with the card **expanded**: "Configure sua clínica · 0 de 6", progress
  bar 0, and the six items in the spec's order.
- **Profile:** "Completar perfil" → `settings#profile`. The new
  **Registro profissional** field (placeholder "ex.: CRM 12345/SP") saves
  `"  CRM 12345/SP  "` trimmed as `CRM 12345/SP`. With a specialty, that
  makes **1 de 6** ✓.
- **Hours:** "Definir horário" → `#hours`; one day enabled → **2 de 6** ✓.
- **Procedure:** "Adicionar procedimento" → `#procedures`; one procedure
  added → **3 de 6** ✓.
- **Patient:** "Adicionar paciente" → `/dashboard/patients` with the
  **new-patient dialog open** and `?new=1` gone from the URL. A reload
  doesn't reopen it. Patient saved → **4 de 6** ✓.
- **Appointment:** "Marcar consulta" → `/dashboard/schedule` with the
  **new-appointment dialog open** and `?new=1` gone; a reload doesn't
  reopen it. Appointment saved (scheduled, tomorrow) → **5 de 6** ✓.
- **Invite, without a code yet:** "Compartilhar link de convite" is a link
  to Settings. "Gerar código" there doesn't complete the item on its own
  (still 5 de 6). Back on Home, the same CTA is now a button: it copies
  `…/join/<code>` (unprefixed) → **6 de 6**.
- **Finish:** **"Sua clínica está pronta 🎉" [Entendi]** → the card is gone,
  and stays gone after a reload, with `?setup=1` and in Settings (no "show"
  row).

**4. D2 (en):**
- The card shows collapsed by default: "Set up your clinic · 0 of 6".
- **Hide** → gone, including after a reload.
- Settings shows **"Show setup checklist"** → back to `/dashboard` with the
  card, and the row is gone.
- Settings "Generate code" → **"Copy link"** also completes **Invite your
  patients** ✓ (1 of 6).

**5. Secretary linked to D1 (clinic "Clínica Opus Setup"):**
- Home shows **"Agora você faz parte da equipe de Clínica Opus Setup. Você
  pode gerenciar a agenda, os pacientes e os pagamentos. Os prontuários
  continuam privados do profissional."** [Entendi].
- After Entendi and a reload → gone. There's no checklist for the secretary.

**6. Patients connected to a doctor:**
- My appointments shows **"Sua conta está conectada a Clínica Opus
  Conexão." [Marcar consulta] [Fechar]**, with no checklist.
- **Marcar consulta** → `/pt-BR/book/<doctor>`. **Fechar** → the card goes
  away at once. Both stay gone after a reload.
- **Pending patients:** a patient still pending the doctor's confirmation
  goes to `/auth/pending-confirmation` as before, so the card only appears
  once they're linked.

**Nothing extra where it doesn't apply:** the doctor's Home has no one-time
card, and neither the secretary nor the patient sees a checklist.

**Review: Claude `/code-review` (code reviewer), clean at `185a0b3`.**

**CI at `185a0b3`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `185a0b3`, review clean.**

## PR #54 (`fix/sentry-env-trim`) — Sentry env values trimmed so source maps upload, 🟢 at `f1c68af`, review clean

**Scope: exactly `f1c68af`.** This is config only: `SENTRY_ORG`,
`SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` are `.trim()`med in
`next.config.ts`, because the Vercel project value had a leading space. If
master had to be merged in before this entry, the code under test is
unchanged.

**Evidence: the preview build `dpl_EKcoxyo41CasyDFE1R7zNnbXv5L7`**
(`solvymed-1bsocozhr-burrowsoft.vercel.app`, cloned at
`fix/sentry-env-trim` / `f1c68af`, via `vercel inspect … --logs`):
- `[@sentry/nextjs - Node.js] Info: Successfully uploaded source maps to Sentry`
- `[@sentry/nextjs - Edge] Info: Successfully uploaded source maps to Sentry`
- `[@sentry/nextjs - Client] Info: Successfully uploaded source maps to Sentry`
- **Build warning:** only the known Supabase "Node.js API in the Edge
  Runtime" notice; the build completed and the preview is Ready.
- **Maps not public:** three client chunks from `/pt-BR/auth/login` return
  200, and their `.map` files 404.

**Review: Claude `/code-review` (code reviewer), clean at `f1c68af`.**

**CI at `f1c68af`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `f1c68af`, review clean.**

## Prod addendum — B-7c, A-15, #50 (www.solvymed.com, 2026-09-26/27)

### B-7c: clinical dates follow the practice's time zone ✅

**Method.** Each run used a throwaway practice with the browser in
`Asia/Bangkok`, and did all of the following:
- inserted a record, a prescription and a correction (`add_record_correction`)
  over REST, deliberately sending `date = 2001-01-01` and `time = 03:03`;
- tried a PATCH of the record's `date`/`time`;
- created a record through the UI;
- read the chart, the dashboard and (in the real-clock runs) the Schedule's
  default day. Those runs also seeded an appointment for today and one for
  tomorrow.

**Results:**

| Run (UTC) | Practice zone and local time | Stored date (REST record, prescription, correction; UI record) | Screens |
| --- | --- | --- | --- |
| 18:44, 26/09 (fixtures) | `Pacific/Kiritimati`, 27/09 08:44 | **2026-09-27** for all | chart "2026-09-27 08:44"; dashboard "Bom dia, domingo, 27 de setembro" |
| 18:44, 26/09 (fixtures) | `Pacific/Pago_Pago`, 26/09 07:44 | **2026-09-26** for all | chart "2026-09-26 07:4x"; dashboard "sábado, 26 de setembro" |
| 00:02, 27/09 | São Paulo (default), 26/09 21:02 | **2026-09-26** for all (UTC date was already 27/09) | chart "2026-09-26 21:02"; dashboard "Boa noite, sábado, 26 de setembro" with today's appointment and R$ 111,00; Schedule defaults to 26/09, "1 consulta hoje" |
| 02:30, 27/09 | São Paulo, 26/09 23:30 | **2026-09-26** for all | the same screens as 21:02, at 23:30 |
| 03:30, 27/09 | São Paulo, 27/09 00:30 | **2026-09-27** for all | chart "2026-09-27 00:30/00:31"; dashboard and Schedule show "domingo, 27 de setembro", "1 consulta hoje" |

- **The client's date is ignored:** the wrong client `date`/`time` never
  reached a stored row.
- **Immutable:** the PATCH of `date`/`time` answered 200 and left the row
  unchanged, while the content edit still applied, in every run.
- **Not covered:** the export and PDF weren't opened, so they stay ⏳ on the
  row.
- **Cleanup:** the practices' clinical rows went to mob dev for purge.

### A-15: web-origin real emails after the template switch ✅

The templates now link to
`https://www.solvymed.com/api/auth/callback?token_hash={{ .TokenHash }}&type=…[&locale=…]`.
Each email was triggered once, for real, from the prod UI. mob dev read the
exact link the email contains from `auth.users` (`confirmation_token` /
`recovery_token`). The same browser then made the clicks:
- **Web signup, pt-BR (UI, `pkce_` token, `&locale=pt-BR`):**
  - A scanner GET → `200 /pt-BR/auth/verify`, with nothing verified.
  - The click → `/pt-BR/auth/verify`, with **no token in the address bar**
    and no verify on load.
  - **Continuar** → `/pt-BR/auth/professional-welcome`. The account is
    confirmed, with metadata locale `pt-BR`.
- **Forgot password, en (`&locale=en`):**
  - A scanner GET verified nothing.
  - The click → `/auth/verify` "Set new password" → **"Password updated"**.
    The new password works and the old one is refused.
- **Note:** a cookie-less scanner GET with `Accept-Language: *` ends on the
  IP-country locale (here `/th/`). That's harmless: real browsers keep the
  locale cookie the callback pins.
- This proves the link and the flow, not how the email looks. The user's
  inbox check is retroactive and not a gate, and app-origin links are the
  mobile tester's.

### #50 (first-run part 2) prod spot-check ✅

With a throwaway doctor, deleted afterwards:
- `/pt-BR/dashboard?setup=1` shows "Configure sua clínica · 0 de 6",
  expanded, with 6 items.
- "Completar perfil" → `settings#profile`, with the registration field.
- **Ocultar** → Settings shows "Mostrar lista de configuração" → back on
  `/pt-BR/dashboard` with the card.

## PR #55 (`chore/lint-cleanup`) — lint cleanup, CI fails on lint errors, locale-safe links, 🟢 at `9256248`, review clean

**Scope: exactly `9256248`.** Any master merge above this entry is a sync;
the code under test is unchanged.

**Setup.** Checked on the preview in pt-BR and en with one throwaway
doctor (no procedures), deleted afterwards.

**Results:**
- **`/auth/confirm` links:**
  - Without tokens: "Voltar para Solvymed.com" and "BurrowSoft" → `/pt-BR`,
    and in en → `/`. Privacy and Terms are locale-prefixed.
  - Clicking BurrowSoft lands on `/pt-BR` or `/`.
  - After a set-password reset on the same page, "Voltar para Solvymed.com"
    / "Back to Solvymed.com" → `/pt-BR` or `/`, and the click lands there.
- **New-appointment dialog with no procedures:** the link "Adicione
  procedimentos nas Configurações" → **`/pt-BR/dashboard/settings#procedures`**
  (en: "Add procedures in Settings" → `/dashboard/settings#procedures`). The
  click lands there with the Procedures card in view; it used to drop the
  locale.

**Review: Claude `/code-review` (code reviewer), clean at `9256248`.**

**CI at `9256248`:** Typecheck and unit tests ✅, Lint ✅ (now blocking on
errors), Vercel ✅.

**Merge gate: 🟢 for `9256248`, review clean.**

## PR #57 (`feat/consent-attribution`) — LGPD cookie banner, first-touch signup attribution, 🟢 at `916e1d5`, review clean

**Scope: exactly `916e1d5`.** Master was merged in before this entry; the
code under test is unchanged.

**Setup.** Checked on the preview, with fresh browsers per scenario. Two
throwaway signups were confirmed through the preview's own
`/api/auth/callback`, so `after-verify` ran on the same origin as the
cookies. mob dev read `signup_attribution` on prod and deleted the accounts.

**Banner:**
- On a first visit it shows **"Aceitar tudo" / "Somente necessários" /
  "Escolher…"**, all three with the same style (no nudge). The "Política de
  privacidade" link → `/pt-BR/privacy`.
- en: "Accept all / Necessary only / Choose…", with the link → `/privacy`.
- **Before an answer:** no `sm_consent` and no `sm_attr` cookie, and no
  analytics request.
- **No banner** on a first visit to `/pt-BR/auth/verify`, `/pt-BR/auth/confirm`,
  `/pt-BR/auth/reset-password` or `/auth/verify`.
- **Reopening:** "Configurações de cookies" in the footer and "Cookie
  settings" in the dashboard Settings reopen it with the current state
  (Necessários ☑ fixed, Análise and Marketing as saved).

**Consent and cookies:**
- **"Aceitar tudo"** after client-side navigation from a landing of
  `/pt-BR/invite/QA7CODE?utm_source=test&utm_medium=cpc&utm_campaign=qa`
  gives `sm_consent=1.11.<ts>` and `sm_attr` =
  `{utm_source: test, utm_medium: cpc, utm_campaign: qa, landing_path: "/pt-BR/invite/:code"}`,
  with the code redacted.
- **Withdraw marketing** (Salvar escolhas): `1.10.<ts>`, and **`sm_attr`
  is deleted**.
- **Withdraw analytics:** `1.00.<ts>`, the **page reloads**, `sm_anon_id` is
  removed, and no analytics requests are made afterwards.
- **"Somente necessários":** `1.00.<ts>`, with no `sm_attr` and no analytics
  requests.

**Attribution rows** (mob dev, read on prod with the service role):
- **Marketing accepted** (landing `/pt-BR/invite/QA7CODE?…utm_campaign=qa-accept`):
  exactly **one** row, with `utm_source=test`, `utm_medium=cpc`,
  `utm_campaign=qa-accept`, `landing_path=/pt-BR/invite/:code`,
  `platform=web`, and `referrer_host`, `utm_term` and `utm_content` all null.
- **"Somente necessários":** **no row**.
- Both were confirmed seconds after signup. The later-confirmation path
  (migration 104) is covered by the SQL tests, not by this live run.

**Findings, non-blocking (sent to web dev, open):**
- **F1:** `/pt-BR/join/<code>?utm_…` redirects (307) to
  `/pt-BR/auth/signup?join=<code>` **without the UTM parameters**, so traffic
  through the patient join link is recorded with
  `landing_path=/pt-BR/auth/signup` and no UTMs.
- **F2:** after a signup confirms, `after-verify` clears `sm_attr`. The next
  page (`/pt-BR/auth/professional-welcome`) then writes a **new** `sm_attr`
  with that internal path and no UTMs. The account keeps its first row, but
  a later signup in the same browser would get this bogus first touch.
- **Not #57:** Vercel Analytics makes no request even after "Aceitar tudo"
  (`window.va` is set, but no script is fetched). Today's prod doesn't load
  it either, which looks like Analytics isn't enabled on the Vercel project.
  PostHog `track()` stays dormant with no key.

**Review: Claude `/code-review` (code reviewer), clean at `916e1d5`.**

**CI at `916e1d5`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `916e1d5`, review clean,** with F1/F2 left to web
dev/UX as follow-ups.

### PR #57 re-test at `717032c` (F1/F2 fixed, Vercel Analytics removed) — 🟢

Re-run on the preview at head `717032c` (base `release`):
- **F1 fixed:** `/pt-BR/join/QA7CODE?utm_source=x&utm_campaign=y&gclid=z` →
  `/pt-BR/auth/signup?join=QA7CODE&utm_source=x&utm_campaign=y`. The UTMs
  are forwarded and gclid is dropped.
  - After "Aceitar tudo", `sm_attr` = `{utm_source: x, utm_campaign: y, landing_path: "/pt-BR/auth/signup"}`,
    with the code nowhere in it.
  - mob dev on prod: exactly **one** `signup_attribution` row for that
    signup (`utm_source=x`, `utm_campaign=y`,
    `landing_path=/pt-BR/auth/signup`, `platform=web`), with no code and no
    gclid.
- **F2 fixed:** after the signup's Continuar, `sm_attr="sent"` on
  `/pt-BR/auth/professional-welcome` and still on later pages (dashboard,
  settings). No new first touch is captured.
- **Vercel Analytics removed:** after "Aceitar tudo" there's no `window.va`,
  no insights script and no `_vercel/insights` or `va.vercel-scripts`
  request. PostHog `track()` stays dormant with no key.
- **The first run's checks still pass:** a single `sm_attr` with
  `/pt-BR/invite/:code`; the same-style buttons; nothing before an answer;
  withdrawing marketing deletes `sm_attr`; withdrawing analytics reloads;
  necessary-only → no row (mob dev); no banner on the auth link pages; and it
  reopens from the footer and from Settings, in pt-BR and en.
- **Cleanup:** all throwaways deleted.

**CI at `717032c`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.
**Review: clean at `717032c`.** **Merge gate: 🟢 for `717032c`.**

## Prod addendum — #57 on www.solvymed.com (`release` @ `b880c69`)

- **Deployment:** `dpl_JzAVR6aM…`, production, Ready, cloned from **`Branch: release, Commit: b880c69`**,
  so prod now builds from `release`. The deployment before it, at `c8e94c8`, was
  still cloned from `master`.
- **Banner:** "Aceitar tudo / Somente necessários / Escolher…", with no cookies before an answer.
- **Join link:** `/pt-BR/join/<code>?utm_source&utm_campaign&gclid` → `/pt-BR/auth/signup?join=…&utm_source&utm_campaign`,
  with gclid dropped.
- **Aceitar tudo:** `sm_attr` holds the UTMs with `landing_path=/pt-BR/auth/signup` and
  no code. There's no Vercel Analytics: no `window.va` and no requests.
- **Footer "Configurações de cookies":** reopens the banner with the current
  state. "Somente necessários" then deletes `sm_attr`.
- **Email-link pages:** no banner on `/pt-BR/auth/verify`, `/pt-BR/auth/confirm`
  or `/auth/reset-password`.

## PR #58 (`docs/privacy-terms-1.3.0`) — privacy + terms rewrite for 1.3.0, 🟢 at `aa650a8`, review clean

**Scope: exactly `aa650a8`,** base `release`. Any merge of `release` above
this entry is a sync; the code under test is unchanged.

Checked on the preview in pt-BR, en, de and th, at a phone width of 390px:
- **Languages:**
  - `/pt-BR/privacy` "Política de Privacidade" and `/pt-BR/terms` "Termos
    de Uso" are in Portuguese.
  - `/privacy` "Privacy Policy" and `/terms` "Terms of Service" are in
    English.
  - `/de/…` and `/th/…` show the English text under a one-line note in the
    page's language ("Dieses Dokument ist nur auf Englisch und Portugiesisch
    (Brasilien) verfügbar…" / "เอกสารนี้มีเฉพาะภาษาอังกฤษและภาษาโปรตุเกส (บราซิล)…").
  - pt-BR and en have no note.
- **390px:** the document width equals the viewport (390/390) on every page,
  so there's no horizontal scroll. The provider table sits in an
  `overflow-x: auto` wrapper (342/342, it fits).
- **§11 "Configurações de cookies" / "Cookie settings" button:** it opens
  the banner with the 3 categories.
- **Provider table (pt-BR and en):** Supabase, Vercel, Stripe, Resend, Expo,
  Sentry, **PostHog "Website usage statistics, only with your consent" /
  "Estatísticas de uso do site, somente com o seu consentimento"**, and
  Google Workspace. There's **no Turnstile/Cloudflare row** (it's dormant)
  and no WhatsApp.
- **Privacy text** (pt-BR and en) mentions `sm_consent`, `sm_attr` (90
  days), `sm_anon_id`, 12 months and 20 years. These match what #57 and
  migration 102 do, as tested.
- **Terms §5:**
  - "…cancelar a qualquer momento pelo support@solvymed.com ou, quando
    disponível, no portal de cobrança. Encerrar sua conta também cancela sua
    assinatura." In en: "…by contacting support@solvymed.com or, where
    available, in the billing portal. Closing your account also cancels your
    subscription."
  - The emails are `mailto:` links (4 on the page).
  - R$ 89 and US$ 19, a 15-day trial, card; no annual plan.
- **Terms §10 Privacy Policy link:** locale-aware (`/pt-BR/privacy`,
  `/privacy`, `/de/privacy`, `/th/privacy`). Landing and login footers link
  to the locale's privacy and terms pages.
- **Analytics:** no PostHog or other analytics requests on any page (no key
  set).

**Review: Claude `/code-review` (code reviewer), clean at `aa650a8`.**

**CI at `aa650a8`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `aa650a8`, review clean.**

## Prod addendum — 1.3.0 rc1 (`release` @ `93f4d0b`, tag `v1.3.0-rc1`), 2026-09-27

**Deployment.** www.solvymed.com → `dpl_GSF7b1JE…`, production, Ready,
cloned from **`Branch: release, Commit: 93f4d0b`**. This is web dev's
redeploy of the same commit with `NEXT_PUBLIC_POSTHOG_KEY` set.

**#58 (privacy + terms), live** at 390px width:
- `/pt-BR/privacy` "Política de Privacidade" and `/pt-BR/terms` "Termos de
  Uso": no horizontal scroll (390/390).
- Privacy has the PostHog row and no Turnstile/Cloudflare row.
- Terms §5 has the billing-portal/cancel sentence.
- `/de/privacy` shows "Privacy Policy" under the German English-only note.
- Unprefixed `/privacy` and `/terms` in a browser whose locale cookie is
  `pt-BR` serve the pt-BR text, as locale detection intends. The en text
  was covered in the #58 entry.

**PostHog, now keyed** (fresh browsers per scenario; two throwaways, deleted):
- **Before an answer:** 0 PostHog requests, no `sm_anon_id`.
- **"Aceitar tudo":** a `$pageview` goes to `eu.i.posthog.com/i/v0/e/` →
  **200**, with `$geoip_disable: true`, `$process_person_profile: false`
  and a random `distinct_id` (`sm_anon_id`). Each later page sends its own
  `$pageview`.
- **Signup submit** with analytics accepted: **`signup_submitted`
  `{role: "professional"}`** → 200. No email appears in any event.
- **URL redaction** (`$current_url`):
  - `/pt-BR/dashboard/patients/[id]`, with no patient, doctor or email id
    anywhere;
  - `/pt-BR/invite/[code]` and `/pt-BR/join/secretary/[code]`;
  - `/pt-BR/auth/signup?join=[redacted]&utm_source=x&utm_campaign=y` (after
    the `/join` redirect);
  - `?email=[redacted]`.
  - Only the UTM keys (and a short safe list) keep their values.
- **Withdrawing analytics** (dashboard Settings → Configurações de cookies):
  `sm_consent=1.01.…`, the page reloads, **`sm_anon_id` is removed**, and
  there are **no events** on the pages after.
- **"Somente necessários":** **0 PostHog requests** across 5 pages, and no
  `sm_anon_id`.

**Auth access tokens at 15 minutes** (mob dev's ops change, `jwt_exp=900`),
with a throwaway doctor, deleted afterwards:
- After login the session cookie shows `expires_in=900`.
- The patient page tab sat **idle for 17 minutes**.
- Then, in the same tab, **Editar Paciente → Salvar** (a server action)
  saved (confirmed in the DB), with no error and no sign-out.
- A full navigation to the server-rendered `/pt-BR/dashboard/schedule`
  loaded it, with **no bounce to login**.
- The browser made no refresh call of its own, so the session was refreshed
  server-side (middleware / `@supabase/ssr`).

## PR #68 (`feat/blocked-slot-confirm`, base master) — doctor booking over their own block asks first, 🟢 at `ec6e28e`, review clean

This follows the RC finding (d). UX decided a doctor or secretary may book
over their own block, with a warning. Checked on the preview with a
throwaway doctor and a block from 14:00 to 15:00 tomorrow (deleted
afterwards):
- **Overlap (14:30):** the prompt reads **"Este horário está bloqueado
  (14:00–15:00). Agendar mesmo assim?"**.
  - Cancel books nothing, and the new-appointment dialog stays open.
  - OK books it.
- **A free time (10:00):** books with no prompt.
- **Edge case, 13:30–14:00** (ending exactly as the block starts): no
  prompt, and it's booked.
- The same four cases passed on the earlier head `157abff`, whose prompt
  had no times.
- **Separately verified on prod:** a **patient** can't book over a block.
  `create_public_booking` returns `slot_taken` for full and partial
  overlaps, and a direct insert gets RLS 403.

**CI at `ec6e28e`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `ec6e28e`.**
## PR #66 (`chore/i18n-cleanup`, base master) — join notice names the role in the page's language, 🟢 at `ac8ee77`, review clean

This fixes the RC finding (b). Checked on the preview with a throwaway
doctor's public code (deleted afterwards):
- `/pt-BR/join/<code>` → `/pt-BR/auth/signup?join=…` shows **"Entrando
  como Paciente via link de convite."** It used to show "Entrando como
  patient…".
- `/join/<code>` (en) shows "Joining as Patient via invite link."

**CI at `ac8ee77`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `ac8ee77`.**

## PR #72 (`fix/signup-code-validation`, base master) — patient signup without a code shows the app's line, 🟢 at `e47f341`, review clean

This follows RC finding (4): the empty invite-code field used to trigger the
browser's own `required` bubble. Checked on the preview in pt-BR and en: Paciente, every field filled
except the invite code, then submit:
- The red banner reads **"É necessário um código de convite"** / "An invite
  code is required".
- There's **no browser bubble**: the input isn't `required`, and its
  `validationMessage` is empty.
- **No `/auth/v1/signup` call** is made, and no account is created.

**CI at `e47f341`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `e47f341`.**
## PR #64 + #65 (`fix/landing-header-mobile` + `feat/landing-signup-cta`, base `release`) — landing fits phones, free-trial CTA, 🟢 at `d963bd0` (includes #64's `b7405d7`), review clean

**Why.** In the RC run on prod (`cc34e97`), the landing overflowed on
phones:
- **Header:** its row ended at x=497 on a 412px Pixel 7 and at x=503 on a
  390px iPhone 14 (WebKit).
- **Banner:** on Android the layout viewport stretched to 498px, which put
  the cookie banner partly off-screen, and a tap on "Aceitar tudo" was
  intercepted.
- **No web signup CTA:** the landing had none, while ads must reach web
  signup (UX).

**Checked on the #65 preview at `d963bd0`** (it contains #64):
- **No sideways scroll:** 15 locales × 360/390/1280, 45 pages, **0
  overflow** (innerWidth = viewport, scrollWidth ≤ viewport, no element past
  the right edge). A signup CTA is present on every page.
- **CTA:** "Comece seu teste grátis" / "Start your free trial" in the
  header, the hero and the bottom section. From
  `/pt-BR?utm_source=x&utm_campaign=y&gclid=z`, each links to
  `/pt-BR/auth/signup?utm_source=x&utm_campaign=y`, so **only the UTMs** are
  carried and gclid is dropped (en: `/auth/signup?…`). The CTA opens signup
  with "Profissional de saúde" preselected and no invite-code field.
- **Phones (390):** "Já tem conta? Entrar" / "Already have an account? Log
  in" sits under the hero at y≈570, **inside the first screen**. The header
  shows the CTA. **Desktop (1280):** the header shows "Entrar | Comece seu
  teste grátis" / "Log in | Start your free trial".
- **Bottom copy:** "Comece seu teste grátis pelo site ou pelo app. Sua
  clínica pronta em minutos." / "Start your free trial on the web or in the
  app. Your practice, set up in minutes." There's no "website on the way".
- **Store buttons** are still present (4), after "Prefere o app? Baixe
  aqui:" / "Prefer the app? Download it:".
- **Attribution:** after a hard reload of the signup page and "Aceitar tudo",
  `sm_attr` = `{utm_source: x, utm_campaign: y, landing_path: "/pt-BR/auth/signup"}`
  (en: `/auth/signup`).
- **Real devices, fresh visit to
  `/pt-BR?utm_source=facebook&utm_campaign=launch_br`:**
  - Pixel 7 (Chromium): innerWidth **412**, banner 12→400.
  - iPhone 14 (WebKit): innerWidth **390**, banner 12→378.
  - On both, a **real tap** on "Aceitar tudo" sets `sm_consent=1.11.…` and
    `sm_attr` with the UTMs, and the login link is within the first screen.
- **Auth page footer (`/pt-BR/auth/login`):** the legal links are centred
  (equal side gaps: 72/72 on the Pixel, 61/61 on the iPhone) and wrap to 2
  rows, with no overflow.

**Review: Claude `/code-review` (code reviewer), clean at `b7405d7` (#64) and `d963bd0` (#65).**

**CI at `d963bd0`:** Typecheck and unit tests ✅, Lint ✅, Vercel ✅.

**Merge gate: 🟢 for `d963bd0`, and so for #64 at `b7405d7`, which it contains.**

## PR #67 (`fix/clinics-form`, base `release`) — clinics: save without País, list refresh, delete confirm, 🟢 at `a229316`, review clean

This fixes the RC finding (a). Checked on the preview on master's
`cbb181d` and again on the release rebase `a229316` (same code), with a
throwaway doctor, deleted afterwards:
- **Save without País:** before, it failed on `null value in column
  "country"` behind a generic error. Now the clinic saves, with `country =
  BR`, geocoded, and **appears in the list immediately** (no reload).
- **Delete:** the icon is labelled **"Excluir clínica"** (title and
  `aria-label`), where it used to say "Cancelar". It asks **"Excluir
  “Unidade Opus 67”? Isso não pode ser desfeito."**: Cancel keeps the
  clinic, OK deletes it and removes it from the list.
- **Observation, not a blocker:** "Rua Augusta, 500, São Paulo" with no
  state geocoded to lat −22.85 (not São Paulo). With "SP" and "Brasil" it
  was right (−23.56).

**CI at `a229316`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `a229316`.**
## PR #62 (`chore/review-followups`, base `release`) — feedback page translated, generic error on pending-confirmation, 🟢 at `b6b3aa7`, review clean

**Checked on the preview** in pt-BR, th, ar and en, with 3 `[TEST]`
feedback rows stored (mob dev deletes them):
- **`/feedback` fully translated:** the title, subtitle, rating question,
  labels, "(opcional)" and placeholders ("Seu nome", "Conte o que você
  acha…" / th / ar / en), with no English left in non-en locales and no
  horizontal overflow. **ar** renders with `dir="rtl"`.
- **Rating buttons:** they announce as "1 de 5" … "5 de 5" (th "4 จาก 5",
  ar "4 من 5", en "4 out of 5"). A click sets `aria-pressed="true"` on
  that one only.
- **A whitespace-only message** is caught by the server action and shows
  "Escreva uma mensagem." / "กรุณาเขียนข้อความ" / "يرجى كتابة رسالة." /
  "Please write a message.", and no row is stored.
- **A real submit** (pt-BR, rating 4) stores a `feedback` row and shows
  "Obrigado! Sua opinião nos ajuda a melhorar o SolvyMed para todos." This
  covers checklist **B-16**.
- **Pending-confirmation, code level:** an accept/decline error other than
  `patient_archived` now shows `auth.errors.generic`, never the raw code.
  It's hard to force live.

**CI at `b6b3aa7`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `b6b3aa7`.**

## PR #69 (`fix/hydration-418`, base `release`) — React #418 hydration fixes, 🟢 at `cf99265` (merges as-is per UX; the off-zone leftover goes to master), review clean

This fixes the RC finding (c): React #418 on `/pt-BR/dashboard/schedule`
on prod. The server formatted dates with its default locale, and the
server's ICU puts thin spaces around the "–" in date ranges.

**Checked on the preview, logged in, a doctor with a patient and an
appointment, all combinations in parallel:**
- **Browser in `America/Sao_Paulo`, pt-BR and en:** `/dashboard/schedule`
  `?view=list`, `day`, `week` and `month`, `/my-appointments` and
  `/book/<id>` all show **no #418**. `/auth/pending-confirmation` is clean
  too (checked at `bc8f18c`).
- **Browser in `Asia/Bangkok`** (the browser date one day ahead of the
  clinic's):
  - list, month, my-appointments and book are clean;
  - **day and week still throw #418.**
  - The visible header is correct in both the server HTML and after
    hydration ("domingo, 27 de setembro de 2026" / "21 – 27 de set. de
    2026", the clinic's date), so the mismatching text is elsewhere in the
    grid.
  - UX decided this merges as-is. It only affects doctors whose browser is
    outside São Paulo; the follow-up goes to master.
- **pt-BR dates and 24h times:** "ter., 29 de set. de 2026", "9:00", with
  no English or AM/PM. en shows "Tue, Sep 29, 2026".
- **The week view highlights the clinic's date (27)** with a Bangkok browser
  too, and the Reschedule button shows on upcoming appointments.
- **A counter-proposal:** the doctor proposes a new time (inline form →
  Enviar) and the patient sees **"Originalmente: qua., 30 de set. de 2026 ·
  10:00"** with Aceitar / Recusar (en: "Originally: Wed, Sep 30, 2026 · 10:00
  AM").

**CI at `cf99265`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `cf99265`.**

## PR #71 (`fix/requests-panel-i18n`, base `release`, stacked on #69) — requests panel "Requested:" translated, 🟢 at `1217fb7`, review clean

This fixes an RC follow-up: the doctor's booking-requests panel rendered raw
English "Requested: {date} {time}" for a patient's reschedule request.
Checked on the preview with a throwaway doctor and a linked patient (both
deleted afterwards). The patient asked, through the My appointments UI, to
reschedule to 08:00:
- **pt-BR panel:** **"Solicitado: qui., 1 de out. · 8:00"**, with no English.
- **en panel:** "Reschedule Requested" / "Requested: Thu, Oct 1 · 8:00 AM".
- No React #418 or hydration warning on `/dashboard/schedule` in either
  locale (São Paulo browser).

**CI at `1217fb7`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `1217fb7`.**

## PR #70 (`fix/pix-qr-local`, base `release`) — Pix QR drawn in the page; BR Code field 26 fixed, 🟢 at `85d5672` for payload and rendering; ⏳ the real bank-app scan (a human)

**Why.** The QR image came from `api.qrserver.com`, a third party not in the
privacy policy. It received the doctor's Pix key, the clinic name and the
amount. Decoding the in-page QR on the first head (`5164b63`) exposed a
**pre-existing** payload bug, which was also on prod. `generatePixString`
built field 26 as `0014` + `14br.gov.bcb.pix` + `01…`, so the GUI sub-field
parsed as `"14br.gov.bcb.p"` and the key never parsed; bank apps should
reject that. The app's `lib/pix.ts` had the same bug (mobile #50). UX made
this BLOCKING.

**Checked on the preview at `85d5672`,** with a throwaway doctor, Pix key
`opus.pix@example.invalid`, a clinic "Clínica Opus Pix" in São Paulo, and a
confirmed unpaid appointment of R$ 187,50 (deleted afterwards):
- **No third-party request:** opening the Pix dialog makes no request to
  `qrserver`, googleapis charts or quickchart. The image is a
  `data:image/gif` generated in the page.
- **Size:** the natural size is 285×285. It's shown at 287 px on desktop and
  **280 px on a 360 px phone** (not shrunk below readable), with
  `image-rendering: pixelated`.
- **Decoded with jsQR in the browser**, the QR text **equals the "Copia e
  Cola" string**. Parsed as EMV TLV:
  - **26 → 00 = `br.gov.bcb.pix`, 01 = `opus.pix@example.invalid`**
  - 52 = `0000`, 53 = `986`, **54 = `187.50`**, 58 = `BR`
  - **59 = `CLINICA OPUS PIX`**, 60 = `SAO PAULO`, 62 → 05 = `***`
  - **63 CRC16 valid** (CCITT, 0x1021, init 0xFFFF), on desktop and phone
  - Web dev reports the builder reproduces the BCB manual's example exactly
    (CRC `1D3D`).
- **⏳ Still needed:** a real banking app scanning the dashboard QR (no
  payment) must show the payee **CLINICA OPUS PIX** (the clinic name, upper
  case) and the amount. That needs a human; UX is arranging it with the
  user.

**CI at `85d5672`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `85d5672`
on everything the tester can verify; the bank-app scan is the user's.**


## RC regression run — prod, 2026-09-27/28 (`release`, rc1 `cc34e97` → fixes → `647a232`)

**Setup.** The full release checklist ran on **prod** (www.solvymed.com =
`release`) overnight, with throwaway `e2e-test-opus-rc-*` accounts, all
deleted afterwards or purged by mob dev (clinical rows, test feedback, the
`[TEST]` deletion request). No Stripe checkout was run on prod (see F-7).
- **Browsers:** desktop Chromium 1280; Pixel 7 (Chromium); iPhone 14
  (**WebKit**); and 360/390/412 for layout.
- **Browser time zones:** America/Sao_Paulo, with Asia/Bangkok for off-zone
  checks.

**Found → fixed (every fix verified on its preview and again on prod after merge):**

| Finding | Severity | Fix | Prod |
|---|---|---|---|
| The landing overflowed on phones: the header was ~90–110 px wider than 390/412. On Android the layout viewport grew to 498 px, pushing the cookie banner off-screen, and the tap on "Aceitar tudo" was intercepted | **blocking** (paid-ad landing) | #64 + #65 | ✅ 15 locales × 360/390/1280, 0 overflow; **real taps** on Pixel 7 + iPhone WebKit set consent |
| No web signup CTA on the landing (ads must reach web signup) | **blocking** (UX) | #65 | ✅ "Comece seu teste grátis" in the header, hero and bottom → `/pt-BR/auth/signup?utm_*` |
| **Pix BR Code field 26 malformed** (`0014` + `14br.gov.bcb.pix`, so the key never parses) → bank apps reject. The app had the same bug (mobile #50) | **blocking** (UX) | #70 | ✅ it decodes to a valid EMV code (26→00 `br.gov.bcb.pix`, 01 key, 54 amount, 59 payee, CRC OK). ⏳ a real bank-app scan by the user |
| The Pix QR image came from `api.qrserver.com`, which received the key, clinic name and amount; it's not in the privacy policy | high (policy vs enforced) | #70 | ✅ a `data:` image, no third-party request |
| `/dashboard/clinics`: saving without País failed (country NOT NULL, behind a generic error); a new clinic didn't show until a reload; the delete icon was labelled "Cancelar" and deleted with no confirmation | medium | #67 | ✅ |
| React #418 hydration error on `/dashboard/schedule` (the server's locale and ICU spaces in date labels) | low (console) | #69 (release), #74 (master, off-zone day/week) | ✅ list/day/week/month clean in pt-BR and en (BRT browser) |
| Doctor's requests panel showed raw English "Requested: {date}" | low | #71 | ✅ "Solicitado: qui., 1 de out. · 8:00" |
| pt-BR join notice said "Entrando como **patient**…" | low | #66 (master) | preview ✅ |
| A patient signup without a code got the browser bubble, not a translated line | low | #72 (master) | preview ✅ |
| A doctor could book over their own block with no warning | UX: **intended**, with a confirm | #68 (master) | preview ✅ |

**✅ passing on prod, by section:**
- **A. Public pages and auth:**
  - **A-1:** landing pt-BR/en, the language switcher, and no console
    errors.
  - **A-2:** Stripe is named, and there's no Asaas.
  - **A-3:** UI signup "Profissional de saúde" → "Verifique seu e-mail" →
    confirm → welcome → "Boa noite, Dr. Joana" / `professional` / `trial` for
    15 days.
  - **A-4:** a join link → a locked patient → pending, naming the doctor,
    with `invited_by` set.
  - **A-5:** a typed patient code → patient-welcome, with
    `linked_patient_id` set.
  - **A-6:** a bogus code → `invite-required`.
  - **A-7:** mismatch, 7 characters and an existing email each show their
    line.
  - **A-7b:** 8 is the minimum; a 6-character legacy account still logs in.
  - **A-8:** role routing (secretary → not-connected), wrong password, and
    sign-out → `/pt-BR`.
  - **A-10:** `/join/<bogus>` signed out → signup.
  - **A-11:** cleared cookies → login.
  - **A-14:** unprefixed `/auth/confirm#…` → `/pt-BR/auth/confirm#…` with
    the fragment kept and the form shown.
  - **A-15:** see the addendum.
  - **G-9:** legal nav on 6 auth pages at 375 px.
  - **G-10:** pt-BR/th/de browsers → `/pt-BR` `/th` `/de`; `/pt/…` and
    `/PT-br/…` → 308 `/pt-BR/…`; `/en/…` → 307.
  - **G-11:** `x-vercel-id` `gru1` on pages and APIs; a bad-signature
    webhook → 400.
  - **G-12:** `noindex, nofollow` on invite, join, and signup/login with
    params. Well-formed unknown invite codes render generically (no lookup)
    and only malformed ones 404, by design.
- **B. Doctor:**
  - **B-1:** the dashboard greeting.
  - **B-2/B-3:** create, the list/day/week views, and block time. A
    **patient** over a block is refused **server-side**: `create_public_booking`
    returns `slot_taken` for full and partial overlaps, and a direct insert
    gets RLS 403.
  - **B-4:** confirmed → completed persists.
  - **B-5:** propose → the patient sees "Originalmente: …" and accepts.
  - **B-6:** the Pix payload, per #70.
  - **B-7:** CRUD, search, delete (no history, with a confirm), archive (a
    dialog, the banner "Arquivado em … por …", future appointments
    cancelled, "Arquivados (1)") and restore.
  - **B-7b:** under 24h, edit and delete; over 24h, a REST PATCH/DELETE →
    `clinical_record_locked`, and the UI offers only "Adicionar correção".
  - **B-8:** name+phone and CPF duplicates.
  - **B-9:** a record, and a prescription (none without a medication).
    There's no web PDF/print view; that's mobile.
  - **B-10:** the patient invite code.
  - **B-11:** a booking block, then Settings → unblock.
  - **B-12:** Mark Paid with an amount → paid; Reverter → pending; filters.
  - **B-13:** profile, registration, clinic, Pix, hours, procedures and
    rules persist.
  - **B-14:** Gerar/Gerar novo (confirm)/copy link.
  - **B-15:** per #67.
  - **B-16:** per #62.
  - **📱 Pixel 7:** 0 overflow on 6 doctor pages.
- **C. Billing (no checkout on prod):**
  - **C-2:** en `/subscribe` shows $19.
  - **C-9:** an expired trial → `/pt-BR/subscribe` "Seu período de teste
    encerrou…", R$ 89, card-only, no Pix.
  - **G-4 trial chip:** "faltam 10 dias · Ver plano" (slate); ≤3 days
    **amber** "· Assinar"; the last day **red**; none for an active
    account.
- **D. Patient:**
  - **D-1:** pending → a booking request → the doctor's "Solicitações de
    consulta" → Confirmar → linked.
  - **D-2:** the book page names the doctor, with slots and a tentative
    "Pendente" booking.
  - **D-3:** My appointments, the connected card, and a book link with no
    `name=Doctor`.
  - **D-4:** reschedule requested → approved → moved.
  - **D-5:** `/account/delete` in 15 locales (20-year note, mailto, no
    "erased" wording), plus one `[TEST]` submit → "Solicitação recebida".
  - **📱:** 0 overflow.
- **E. Secretary:**
  - **E-1:** invite → copy code/link, WhatsApp → signup via the link →
    linked. The email isn't locked, by #24's design.
  - **E-2:** sees schedule, patients and payments with no revenue, no
    Records/Prescriptions and no Clinics; Mark Paid works; the one-time
    welcome card.
  - **E-3:** settings read-only, with Leave.
  - **E-4 / F-1:** REST records/prescriptions `[]`, insert 403, and a
    `user_roles` PATCH → 403.
  - **E-5:** a limit of 3 counting pending, resend, revoke, and remove →
    not-connected.
  - **E-6:** a doctor on a secretary invite → "Esta é uma conta
    profissional…"; a garbled code → "Convite inválido".
  - **E-7:** the doctor lapsed → `/auth/clinic-inactive`, never
    `/subscribe`.
  - **E-8:** Pix, per #70.
  - **📱:** 0 overflow.
- **F / G:**
  - **G-6:** consent, per #57.
  - **G-7:** `/api/sentry-check` → 404 on prod, `.js.map` → 403, and no
    `sourceMappingURL`.
  - **PostHog:** per the rc1 addendum.
  - **15-minute access tokens:** a 17-minute idle tab still saves.
- **H. Ad path**, on Pixel 7 and iPhone WebKit after #65:
  - **H-1:** UTMs are captured on "Aceitar tudo".
  - **H-2:** the CTA → signup, with the professional role preselected.
  - **H-3:** pt-BR welcome.
  - **H-4:** the checklist at 0 de 6, and the first step's deep link.
  - **H-5 (mob dev on prod):** exactly one `signup_attribution` row each,
    with facebook/paid/launch_br/test, `/pt-BR` and `web`.

**Open:**
- **Pix:** a real banking-app scan of the dashboard QR, with no payment,
  showing the payee and amount (the user).
- **F-7 Stripe env scoping:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  and the publishable key are each **one value scoped Preview + Production**,
  so prod runs on test keys. When the live keys go in, they must be
  Production-only, with test keys kept for Preview. Checked by name and
  scope; no values printed.
- **L-1:** the live R$ 89 charge, with the user.
- **Minor:** #67's geocoding of an address without a state can land in the
  wrong city (a master follow-up).

## PR #74 (`fix/now-line-hydration`, base master) — no React #418 for off-zone browsers on schedule day/week, 🟢 at `44e7a48`, review clean

This is the follow-up to #69: a Bangkok browser still got #418 on
`?view=day` and `?view=week`. Checked on the preview, logged in as a
throwaway doctor (deleted afterwards), with two booking requests, one for
yesterday and one for the day after tomorrow:
- **No #418:** browsers in `America/Sao_Paulo`, `Asia/Bangkok` (the browser
  date one day ahead of the clinic's) and `Asia/Tokyo`, on
  `/pt-BR/dashboard/schedule` `?view=day`, `week`, `list` and `month`.
- **Now-line (`.calendar-now-line`), placed after mount:**
  - Bangkok (browser 08:58) → `--now-top: 125.9px`, on both day and week.
  - Tokyo (10:59) → about 254 px.
  - São Paulo at 22:58 → correctly hidden, since the grid runs 07:00–21:00.
  - Off-zone, the line uses the **browser's** clock on the clinic's "today"
    column. That's a nuance, not a regression.
- **Requests panel order is unchanged:** the future request is listed first
  and the past one last.

**CI at `44e7a48`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `44e7a48`.**

## PR #76 (`fix/booking-days-hydration`, base master) — the booking day strip starts at the browser's today, 🟢 at `355a44a`, review clean

**Why.** The public booking page built its day strip from the server's UTC
date, so from 21:00 BRT it shifted a day. Checked on the preview **at
23:01–23:03 BRT** (a real clock, inside the risky window), as a linked
patient of a throwaway doctor with hours 08:00–18:00. Both accounts and the
bookings were deleted afterwards.
- **No #418** on `/pt-BR/book/<id>`, with a browser in `America/Sao_Paulo`
  or `Asia/Bangkok`.
- **The strip starts at the browser's today, "Hoje":**
  - São Paulo → Sun 27, then "seg., 28 de set.", "ter., 29 de set.";
  - Bangkok → Mon 28, then Tue 29, Wed 30.
- **Loading:**
  - Bangkok (09:01, with slots today) went straight to the 16 slots
    (10:00, 10:30, …), with **no "Nenhum horário disponível" flash**.
  - São Paulo at 23:01 showed "Nenhum horário disponível" for today, which
    is correct, since the clinic's hours were over.
- **A normal booking** (patient details + the first free slot) → "Solicitação
  enviada!", with the rows `2026-09-28 10:00 tentative` (São Paulo) and
  `2026-09-29 10:00 tentative` (Bangkok).

**CI at `355a44a`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `355a44a`.**

## PR #63 (`i18n/thai-groundwork`, base master) — locale fonts really apply (Thai, CJK, Arabic); confirm strings translated, 🟢 at `aa95c78`, review clean

**How checked.** On the preview, with CDP `CSS.getPlatformFontsForNode`,
which reports the font that actually renders each glyph (the landing's
`h1` and `main p`):
- **th:** Sarabun (h1 31 glyphs, p 112) plus Inter for Latin.
- **ja:** Noto Sans JP. **zh:** Noto Sans SC. **zh-TW:** Noto Sans TC.
  **ko:** Noto Sans KR. Each also uses Inter for Latin.
- **ar: Noto Sans Arabic** (h1 30, p 129) plus Inter.
  - On the first head `3ab8929` Arabic rendered in **Arial**: the stack was
    `Inter, "Inter Fallback", "Noto Sans Arabic", …`, and next/font's
    `Inter Fallback` is a local Arial with a full unicode-range that has
    Arabic glyphs.
  - Fixed by interleaving: `Inter, <locale font>, "Inter Fallback", <locale
    fallback>, …`.
- **Latin locales** (pt-BR, en, ru, vi, id): **Inter only**, unchanged.
- **`/auth/confirm` strings are translated** in th, ja, zh, zh-TW, ko, ar,
  ru, vi and id, with no English left (e.g. th "เกิดข้อผิดพลาด", ar "حدث خطأ
  ما").

**CI at `aa95c78`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `aa95c78`.**
## PR #78 (`docs/privacy-nominatim`, base `release`) — privacy §5 lists OpenStreetMap Nominatim, 🟢 at `3b51b6f`, review clean

Checked on the preview at a phone width of 360 px:
- **`/pt-BR/privacy`:** a new provider row, "OpenStreetMap Nominatim |
  Converte o endereço da clínica em uma localização no mapa quando a
  clínica é salva, a partir dos nossos servidores ou do aplicativo (sem
  dados de pacientes) | UE / Reino Unido".
- **`/privacy` (en):** "OpenStreetMap Nominatim | Converts the clinic's
  address into a map location when the clinic is saved, from our servers
  or the app (no patient data) | EU / UK".
- **Layout:** the document width is 360/360, so there's no page overflow.
  The table sits in its `overflow-x: auto` wrapper, scrolling within itself
  in pt-BR (340 inside 312) and fitting exactly in en (312/312).
- This matches what's enforced: clinic geocoding calls Nominatim on save
  (#67, verified).

**CI at `3b51b6f`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `3b51b6f`.**

## PR #79 (`chore/nominatim-ua`, base `release`) — server-side User-Agent for Nominatim, 🟢 at `4bf6fa2`, review clean

This change is server-only: the User-Agent sent to Nominatim when a clinic
is saved. The first preview build failed with a transient `next/font`
Google-loader error; the redeploy was Ready.

Checked on the redeployed preview (`solvymed-849v9vodj`, branch at
`4bf6fa2`, which includes #67) with a throwaway doctor (deleted
afterwards). A clinic "Av. Paulista, 1000, São Paulo, SP" is **geocoded**
(lat −23.5649, lng −46.6519, country BR). It appears in the list **without
a reload**, with the "No mapa" pin, and there are no page errors. The
header itself isn't observable from the browser.

**CI at `4bf6fa2`:** ✅✅. **Review: clean.** **Merge gate: 🟢 for `4bf6fa2`.**


## PR #81 (`feat/patients-paging`, base master) — server-side patient paging and search, 🟢 at `aa56833`, review clean

**Setup.** Checked on the preview with throwaway doctors (deleted
afterwards). One had 57 active patients, "Paciente Opus 001…057", including
one with CPF `529.982.247-25` and one with phone `11 99999-8888`. Another
had 12 patients plus one archived **through the UI**. A direct insert or
PATCH of `archived_at` is cleared by a trigger, as designed. A secretary
was linked to each doctor.
- **Paging:** `/pt-BR/dashboard/patients` shows **50** rows, "**1–50 de 60**"
  and **Próxima**. Page 2 shows "51–60 de 60" and continues alphabetically
  (048…057). `?page=junk` and `?page=-3` → page 1.
- **Search runs server-side and resets to page 1:**
  - **Name fragment:** "Opus 01" → 010…019.
  - **CPF:** `52998224725` and `529.982.247-25` both → 007.
  - **Phone:** `99999-8888` and `999998888` both → 008.
  - **A 2-digit query** ("12") matches **names only**; phones containing
    "12" aren't returned.
- **Hostile input:** `a"),(b*%` and `"),id.eq.1,(` are treated as literal
  text. `?q=` carries them, the page shows "Nenhum paciente encontrado para
  …", and there's **no error and no 5xx**.
- **History:** typing a whole query adds **no** history entries, and Back
  leaves the page.
- **Archived view:** it lists only the archived patient. Search inside it
  finds "Arquivado Opus 1" and never an active patient; the active list
  excludes the archived one.
- **New-appointment picker:**
  - no suggestions for 1 letter;
  - "Pa" → the matching patients, capped at **20** with 57;
  - **archived patients are never offered** ("Arq" → none).
  - Booking by the picked name saves the appointment with `patient_id`
    linked.
- **Secretary:** the same list for the doctor's practice ("1–50 de 60",
  "12 total"), with phone and name search working.
- **Notes, not blockers:**
  - `?page=999` shows the "Nenhum paciente ainda / Novo Paciente" empty
    state instead of clamping to the last page.
  - React #418 on `/dashboard/schedule` in this run comes from the branch
    predating #74's fix.

**CI at `aa56833`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `aa56833`.**

### Web tester checkpoint — 2026-09-28 (internet going down)

- **Done and recorded:**
  - **1.3.0 RC regression on prod:** docs PR #75.
  - **On `release`:** #62, #64/#65, #67, #69, #70, #71, #78 and #79 🟢, each
    re-checked on prod after merge.
  - **On master:** #63, #66, #68, #72, #74, #76 and #81 🟢.
- **⏳ Pix real bank-app scan:** the user scans the dashboard Pix QR with a
  banking app, no payment. The payee (the clinic name in upper case) and
  the amount must show. The tester has already verified the payload at the
  TLV and CRC level on prod.
- **⏳ W3 / W12 (the user's test script):** the web tester checks two things
  in the DB when UX pings.
  - **W3:** the signup of `vitor.goathik+solvy1@gmail.com` via
    `/pt-BR?utm_source=teste&utm_campaign=vitor` → one `signup_attribution`
    row with teste/vitor.
  - **W12:** after that account is closed, its Stripe TEST subscription is
    cancelled.
- **⏳ F-7:** split the Stripe vars (Production = live, Preview = test)
  before the live keys go in. **⏳ L-1:** the live R$ 89 charge, with the
  user.
- **Test accounts:** none left to clean up. Every throwaway is deleted or
  purged by mob dev, and a final sweep of `e2e-test-opus-*` ran.

## PR #82 (`fix/patients-page-clamp`, base master) — a page past the end lands on the last page, 🟢 at `d0df091`, review clean

Follows #81's note. On the first head `3eece52`, `?page=999` landed on
**page 1**, because PostgREST answers an out-of-range page with 416 and no
count. Checked on the preview at `d0df091` with a throwaway doctor (deleted
afterwards): 55 active patients plus 53 archived through the
`archive_patient` RPC.

| URL | Lands on | Shows |
|---|---|---|
| `?page=999` | `?page=2` | "51–55 de 55", 5 rows |
| `?archived=1&page=999` | `?archived=1&page=2` | "51–53 de 53", 3 rows |
| `?q=Opus&page=999` | `?q=Opus&page=2` | "51–55 de 55" (the last page of the search) |
| `?q=zzzz&page=5` (0 matches) | `?q=zzzz` (page 1) | "Nenhum paciente encontrado para "zzzz"" |

Filters are always kept, and there are no 5xx. `?page=junk` → page 1 was
verified in #81.

**CI at `d0df091`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `d0df091`.**

## PR #83 (`feat/clinic-pin-adjust`, base master) — confirm or drag the clinic's map pin, 🟢 at `669f204`, review clean

**Setup.** Checked on the preview (Leaflet with OpenStreetMap tiles) with
throwaway doctors and clinics, deleted afterwards:
- **A:** pinned by the bad geocode of "Rua Augusta, 500, São Paulo", which
  lands in Campinas (−22.8507, −47.05);
- **C:** no pin, city Campinas/SP;
- **B:** no pin and no city.

**Results:**
- **Lazy tiles:** loading `/pt-BR/dashboard/clinics` makes **0** requests to
  `tile.openstreetmap.org`. Tiles load only once a dialog opens; they send a
  **Referer** (the site origin), and "© OpenStreetMap" is shown.
- **Pinned clinic (A):**
  - "Ajustar no mapa" opens "Local no mapa: …" at **zoom 17** on the pin,
    and **focus moves into the dialog**.
  - **Confirm as-is** ("Salvar local" without moving) saves the same spot
    and closes.
  - **Drag + Salvar local** persists (→ −22.8511, −47.0491).
  - **After a reload**, reopening shows the marker exactly at the map centre
    (offset 0,0), i.e. the saved spot.
- **Clinic without a pin:**
  - With a city (C), the dialog opens on **Campinas at zoom 12**; with no
    city (B), on **Brazil at zoom 4**.
  - "Salvar local" is **disabled**, with "Toque no mapa onde fica a clínica
    e depois salve.", until a tap or drag. The default centre is never
    saved: Esc before placing leaves `lat/lng` null.
  - After a tap, Save is enabled and the tapped spot is saved. The card
    drops "Sem localização no mapa" and shows "No mapa", immediately and
    after a reload.
- **Esc** and **a backdrop click** close the dialog **without saving**, even
  after tapping a new spot.
- **360 px:** the page is 360/360, the map sits at 36→324, and "Salvar
  local" is visible.
- **A secretary** opening `/pt-BR/dashboard/clinics` → redirected to
  `/pt-BR/dashboard/settings`.
- **Privacy §5, OpenStreetMap row:**
  - pt-BR: "Converte o endereço da clínica em uma localização no mapa **e
    exibe o mapa quando um profissional ajusta o marcador**, a partir dos
    nossos servidores, do aplicativo ou do navegador (sem dados de
    pacientes)".
  - en: "…and shows the map when a professional adjusts the pin…".

**CI at `669f204`:** ✅✅✅. **Review: clean.** **Merge gate: 🟢 for `669f204`.**

## PR #84 (`th/1-country-currency`, base master) — amounts by practice country, Thai hidden until its release, 🟢 at `765ec43`

Migration 110 is **not** applied: the prod DB (which the Previews use) has
no `professionals.country`. So every practice must behave exactly as today
(Brazil). The TH/Other paths need 110 and are **unit-tested only**; nothing
here exercises them end to end.

**❌ on the first head `1054429`, fixed at `765ec43`.** With the Thai flag
off (what Production runs), a browser that already had `NEXT_LOCALE=th`
looped forever: `/ → 307 /th → 307 / → …`, and Chromium showed
`ERR_TOO_MANY_REDIRECTS`. It happened on `/`, `/auth/login`, `/privacy` and
`/dashboard`. Anyone who picked ภาษาไทย in today's prod switcher, or was
auto-detected to Thai, has that cookie. The fix treats a hidden-locale
cookie as no cookie and deletes it on the `/th` redirect.

**Flag OFF** (local `next dev` of the head with no
`NEXT_PUBLIC_THAI_ENABLED`, i.e. Production):

| Check | Result at `765ec43` |
|---|---|
| Cookie `th` + `/`, `/auth/login`, `/privacy` | 200 at once, cookie rewritten to `en` |
| Cookie `th` + `/th/auth/login` | 307 `/auth/login` (cookie deleted) → 200, cookie `en` |
| Cookie `th` + `/dashboard` (logged out) | `/en/auth/login` → `/auth/login` (cookie `en`) → 200 |
| A real browser with cookie `th` opens `/` | 200, `lang=en`, cookie `en` |
| `/th`, `/th/privacy` | 307 → `/`, `/privacy` |
| `/th/auth/login?next=%2Fdashboard&locale=th` | 307 → `/auth/login?next=%2Fdashboard&locale=th` (query kept) |
| `/thx` | 404 (no false prefix match) |
| First visit, Accept-Language `th` + geo TH, or `th` only | English, cookie `en` |
| hreflang / language switchers (home, login) | no `th` (15 alternates incl. x-default; 14 languages) |

**Flag ON Preview (`765ec43`):** cookie `th` → `/th`, and a fresh Thai
browser → `/th` with cookie `th`. `pt-BR` behaves as before. `th` is in
hreflang (16) and in the switcher (15), and `/th` is indexable.

**Brazilian practice on the Preview** (throwaway doctor, secretary and
patient; checked at `1054429`, and the fix only touches the middleware):

- **DB:** `professionals.country` returns 42703, which the code treats as
  BR. `get_my_clinic` has no `country` key. No page broke.
- **Amounts in R$ everywhere:**
  - Dashboard: R$ 187,50 / R$ 250,00.
  - Payments, also with the **English UI**: R$.
  - Schedule list and calendar popup: R$ 187,50.
  - New-appointment procedure option: "Consulta Opus · R$ 150,00".
  - Settings procedures: R$ 150,00.
  - Secretary dashboard, payments, settings and schedule: R$.
  - Patient booking page (linked patient): "30 min · R$ 150,00".
- **Pix unchanged:**
  - The schedule Pix button is shown for the doctor and the secretary.
  - The decoded QR has key, amount 187.50, 5303 986, 5802 BR, and the CRC
    is valid.
  - The Settings Pix field is shown and prefilled.
- **Settings save:**
  - Changing only the city keeps `pix_key`.
  - A new key is saved.
  - Clearing it sets `null`.

**CI at `765ec43`:** ✅. **Review: clean.** **Merge gate: 🟢 for
`765ec43`** (this docs commit sits on top, after a master sync).

## PR #86 (`th/3-plan-price`, base `th/1-country-currency`) — plan price by practice country, Terms §5, 🟢 at `84156ce`

Pre-110, every practice is Brazilian, so the price must be **R$ 89
whatever the UI language**. Before this PR, a non-pt-BR UI showed $19.
฿690 / US$ 19 and the fail-closed path need 110 or a DB fault, so they're
**unit-tested only**. **No checkout was started:** Stripe stays untouched
on Previews. Checked on the Preview at `e69cb03`; the rebase to `84156ce`
changed no code.

| Doctor | pt-BR | en | es |
|---|---|---|---|
| In trial | R$ 89, "Assinar com Cartão" | R$ 89, "Subscribe with Card" | R$ 89, "Suscribirse con tarjeta" |
| Trial expired | R$ 89 | R$ 89 | R$ 89 |

- No "—" price and no check-failed message.
- Zero `/api/checkout` requests on page load.
- **Terms §5:** it reads "the price depends on your practice's country:
  R$ 89 … Brazil, ฿690 … Thailand and US$ 19 … elsewhere".
  - pt-BR: "O preço depende do país do seu consultório: R$ 89 por mês no
    Brasil, ฿690 por mês na Tailândia e US$ 19 por mês nos demais países".
  - `/th/terms` shows the English text, as before.

**CI at `84156ce`:** ✅. **Review: clean.** **Merge gate: 🟢 for
`84156ce`.**

## PR #87 (`th/5-patient-ids`, base `th/1-country-currency`) — patient identifiers by practice country, 🟢 at `ce258bd`

Pre-110, only the BR (CPF) path can run: the Thai ID and passport columns
don't exist yet, so those paths are **unit-tested only**. Checked on the
Preview at `ce258bd` with a throwaway doctor, secretary and patient
(deleted afterwards).

- **New patient** (doctor): the labels are unchanged, with CPF between
  Telefone and Data de nascimento and no Thai/passport field. The hidden
  `id_kind=BR` is present. The row is saved with `cpf 123.456.789-09`.
- **Same CPF again under another name:** the "Possível duplicidade…
  Opus Paciente Um / Abrir existente / Criar mesmo assim" warning appears,
  and no second row is created.
- **Search** `?q=45678` (CPF digits) finds the patient.
- **Detail:** it shows "CPF 123.456.789-09".
- **Edit:**
  - The only ID input is `cpf` (prefilled), with `id_kind=BR`.
  - Saving a phone change works, the CPF is kept, and the form closes.
  - Clearing the CPF saves `null`.
- **Server guard:** with the hidden `id_kind` tampered to `TH` and the CPF
  emptied, the save is **refused**. The row is unchanged (the CPF is
  kept), and "Algo deu errado. Tente novamente." is shown.
- **Secretary** (the `get_my_clinic` path): the same CPF form, and the
  patient is created with its CPF.
- **Patient booking form** (linked patient): the CPF is prefilled from
  `patient_profiles` (111.444.777-35), and no `patient_profiles` request
  fails, so no 110 column is selected.
- **Privacy** (en + pt-BR):
  - §3.1 adds "the practice's country and time zone, chosen at sign-up
    (for "Other country", the country detected from the connection…)".
  - §3.2 reads "CPF or, for clinics outside Brazil, a national ID or
    passport number".

**Follow-up (not from this PR, already on master):** the booking form's
label reads "CPF ((opcional))". The `book.notesOptional` string already
contains the parentheses, and the label wraps it in another pair.

**CI at `ce258bd`:** ✅. **Review: clean.** **Merge gate: 🟢 for
`ce258bd`.**

## PR #88 (`th/4-promptpay`, base `th/1-country-currency`) — PromptPay QR for Thai practices, 🟢 at `94748f8` (Thai path ⏳)

Pre-110, every practice is Brazilian and `promptpay_id` doesn't exist, so
nothing may change for Brazil. The Thai path can't run end to end yet: the
Settings field, saving the ID and the schedule QR are **unit-tested only**.
Checked on the Preview at `94748f8` with a throwaway doctor and secretary
(deleted afterwards).

**BR unchanged:**
- **Schedule** (doctor and secretary): the Pix button is shown, and there's
  **no "QR PromptPay" button**.
- **Pix payload after the `lib/emv` refactor:** the doctor's decoded QR is
  `…0014br.gov.bcb.pix0126<key>52040000 5303986 5406187.50 5802BR
  5915CLINICA OPUS 88 6009SAO PAULO 62070503*** 6304…`, with a valid CRC.
  That's the same layout #70 verified on prod. The secretary's is identical
  apart from the city, which the test had just changed to CAMPINAS (again
  with a valid CRC).
- **Settings:**
  - There's no PromptPay input or label, and the Pix field is shown.
  - Saving a city change shows "Salvo!". This is the new error handling,
    and a success shows no error.
  - The row has the new city with `pix_key` kept.
- **Privacy §3.3** (en + pt-BR): the new sentence reads "Clinics in
  Thailand may add a PromptPay ID (a mobile number or national / tax ID),
  used only to build the appointment payment QR" / "Clínicas na Tailândia
  podem incluir um ID PromptPay…".

**Independent payload cross-check** (the head's `lib/promptpay.ts` against
the MIT `promptpay-qr` npm library, outside the repo):
- **72/72 payloads identical**: 8 IDs × 9 amounts.
  - IDs: 08/09 mobiles, 13-digit IDs, `+66 81 234 5678`, `081-234-5678`.
  - Amounts: none, 0, 0.01, 1, 150, 187.5, 690, 1234.56, 99999.99.
- `normalizePromptPayId` rejects 9- and 11-digit mobiles, a 10-digit
  number not starting with 0, 12 digits, text, empty and null. It maps
  `+66 812345678` to `0812345678`.
- Sample: `00020101021229370016A000000677010111011300668123456785802TH53037645406187.506304166C`.

**⏳ Thai path:** a TH practice's Settings field and save, the schedule
QR, and a scan with a real Thai banking app. These need migration 110 on a
DB, and the final gate is the user's real Thai bank scan.

**CI at `94748f8`:** ✅. **Review: clean.** **Merge gate: 🟢 for `94748f8`**
for everything verifiable pre-110.

## PR #85 (`th/2-signup-country`, base `th/1-country-currency`) — practice country at doctor signup, read-only in Settings, 🟢 at `93972ad`

Pre-110 (no `country` column), `handle_new_user` ignores the new metadata,
so every account still becomes a Brazilian practice. The TH/Other storage
needs 110 and is **unit-tested only**. Checked against the head's code
(`9efbf8a`; the rebase to `93972ad` changed no code). The flag-OFF checks
ran on a local `next dev`, where `x-vercel-ip-country` can be sent by hand;
the flag-ON checks ran on the Preview.

**Picker (flag OFF = Production):**
- It offers **Brasil + Outro país** only; there's no Thailand option.
- Pre-selection by geo:
  - BR or unknown → Brasil;
  - **TH → Outro país** (Thailand is never pre-selected while hidden);
  - US → Outro país.
- The hint reads: "Define a moeda, o preço do plano, o documento do
  paciente e o QR de pagamento…"

**Picker (flag ON Preview):**
- It offers Brasil / ประเทศไทย / Outro país.
- It's shown only for the doctor role. It disappears on the Paciente card
  and comes back on the doctor card.
- It's absent on `?secretary=…` and `?join=…`.

**Signup** (2 throwaway doctors via the UI, deleted afterwards):
- The POST `/auth/v1/signup` returns 200 and then shows "Verifique seu
  e-mail".
- The metadata:
  - Brasil: `country: "BR", time_zone: "America/Sao_Paulo"`.
  - Outro país with geo US: `country: "US"` plus the browser zone.
- The `professionals` row is created (trial, `America/Sao_Paulo`).

**Settings card "País do consultório"** (doctor, pt-BR + en):
- It shows "Brasil" / "Brazil" with the support hint and has no controls,
  so it's read-only.
- An existing (pre-110) doctor also sees Brasil.
- The Pix field is still there.
- The secretary's Settings has no card, since that's a separate page.

**CI at `93972ad`:** ✅. **Review: clean.** **Merge gate: 🟢 for
`93972ad`**. It inherits #84's loop fix.

## PR #85 re-test (`th/2-signup-country`, base master) — no picker before the Thai release (UX decision b), 🟢 at `7caddf5`

UX changed the rule after my 🟢 at `93972ad`, to match the app: before the
Thai release there's **no** country picker, and signup sends no country, so
the DB default (BR) applies. The rule is in `c655a6c`; the head `7caddf5`
only adds master merges.

**Checks:** each signup below was captured and **aborted before it reached
Supabase**, so no account was created.

| Build | Location (`x-vercel-ip-country`) | Picker | `/api/geo` | Signup `user_metadata` |
|---|---|---|---|---|
| Flag OFF: local `next dev` of `7caddf5` (= Production) | none, TH, US | **none** ("Onde fica seu consultório?" absent) | **0 requests** | `full_name, role, platform, locale`, **no `country` / `time_zone`** |
| Flag ON: Preview `7caddf5` | real (Vercel says TH) | Brasil / ประเทศไทย / Outro país, pre-selected **ประเทศไทย** from location | 1 → `{"country":"TH"}` | `country: "TH"`, `time_zone: "America/Sao_Paulo"` (browser zone) |

**Settings card** (Preview `7caddf5`): unchanged. Doctor pt-BR: "País do
consultório / Brasil" plus the support hint. Doctor en: "Practice country /
Brazil". It has no controls, so it's read-only. The secretary's Settings
has no card, as before.

**CI at `7caddf5`:** ✅. **Review: clean at `c761d31`** (the picker code is the same). **Merge gate: 🟢 for `7caddf5`.** The earlier 🟢 at `93972ad` is
superseded.

## PR #89 (`th/2-buddhist-year`, base master) — tests: the Thai UI keeps the Buddhist year, 🟢 at `55c7f91`

This PR adds only `src/__tests__/thai-buddhist-year.test.ts`; there's no UI
change. It locks in that Thai dates show the Buddhist year (2026 → 2569)
while stored dates stay Gregorian.
- Checked: `formatDateLabel`, `calendarHeaderLabel`, `toLocaleDateString`,
  and the `th` default calendar being "buddhist". English keeps 2026.

**Runs:**
- **4/4 passing at `55c7f91`**, run locally with vitest (exit 0).
- **4/4 again on current master (`602ff00`) plus the file,** which is this
  branch's content after the master sync. So master's later changes don't
  break it.

**CI at `55c7f91`:** ✅. **Merge gate: 🟢 for `55c7f91`**, once the

## PR #90 (`fix/booking-optional-parens`, base master) — booking ID label says "(opcional)" once, 🟢 at `d61eeff`

This is the follow-up from #87's entry. The label wrapped `book.notesOptional`
in another pair of parentheses, even though the string already has them.

- **All 15 locales carry their own brackets** in `book.notesOptional`:
  "(opcional)", "(optional)", "（任意）", "（可选）", "（選填）",
  "(ไม่บังคับ)"… So dropping the extra pair leaves no locale without
  brackets.
- **Preview `d61eeff`,** as a linked throwaway patient on `/book/<doctor>`
  (deleted afterwards):
  - pt-BR: "CPF (opcional)" and "Observações (opcional)".
  - en: "CPF (optional)" and "Notes (optional)".
  - ja: "CPF （任意）" and "メモ （任意）".
  - No doubled brackets anywhere. The notes heading is unchanged; it
    already used the string alone.

**CI at `d61eeff`:** ✅. **Merge gate: 🟢 for `d61eeff`**, once the
reviewer is clean. This docs commit sits on top, after a master sync.

## PR #91 (`th/8-pricing`, base master) — /pricing page and Thai home section, 🟢 at `10c6b1b`

Tested at `45ddfff`. Then `608c19d` and `10c6b1b` changed messages only:
- the switcher now says "Other countries";
- the security line was reworded. At `45ddfff` it claimed "records are
  never deleted, only corrected". But the author can delete a record or
  prescription within 24 h (`deleteRecord` / `deletePrescription`), and an
  account deletion removes data. UX reworded it.

**Flag OFF** (local `next dev` of the head without the flag, i.e.
Production; location header sent as TH; 10 locales: en, pt-BR, es, fr, de,
it, ja, ar, zh, ru):
- **Price:** `/pricing`, `?c=TH` and `?c=OTHER` all show **R$ 89**. There's
  **no country switcher**, and `?c=` is ignored.
- **Payments line:** "Pix".
- **PDF line:** only in pt-BR, en, es, fr, de and it (absent in ja, ar, zh
  and ru).
- **No** "iPhone", "PromptPay", "SolvyAI" or "LINE" anywhere. The device
  line reads "Web and Android app".
- **CTA and links:** the CTA goes to `/<locale>/auth/signup`. Pricing is
  linked in the header (desktop) and the footer.
- **Metadata:** each page has its own canonical (`…/pricing`,
  `…/pt-BR/pricing`…), with 15 hreflang and no `th`. Titles: "Pricing |
  Solvymed" / "Preços | Solvymed".
- **Thai paths:** `/th` → `/`, and `/th/pricing` → `/pricing` (English,
  R$ 89).
- **Home (pt-BR, en):** no Thai section. The only "App Store" text is the
  existing "Coming soon" button.

**Flag ON:**
- **Preview:** geo TH → ฿690 with ประเทศไทย marked; `?c=OTHER` → US$ 19.
  hreflang has 16, including `th`.
- **Local, geo sent by hand:**

| Location / `?c=` | Price | Payments line |
|---|---|---|
| BR | R$ 89 | "Payment tracking and Pix QR codes" |
| TH | ฿690 | "Payment tracking" (no PromptPay) |
| US / PT / none | US$ 19 | "Payment tracking" |
| geo TH + `?c=BR` | R$ 89 | Pix |
| geo BR + `?c=TH` / `?c=OTHER` | ฿690 / US$ 19 | — |
| geo BR + `?c=xx` | R$ 89 (falls back to the location) | — |
| geo US + `?c=br` | R$ 89 (case-insensitive) | — |

- **Switcher:** its links keep the locale (`/pt-BR/pricing?c=…`).
- **`/th`:** shows the Thai section with 3 blocks (b1, b3, b4: no PromptPay,
  LINE or PDPA block), the "฿690/เดือน…" line linking to `/th/pricing`, and
  the CTA. `/th/pricing` works (฿690).
- **pt-BR and en homes:** no Thai section.

**Phones:** at 360 px (`/pt-BR`, `/pt-BR/pricing`) and 390 px
(`/pricing`), `scrollWidth - innerWidth = 0`, and the header Pricing link is
hidden. At 768 px it's shown. The results are the same with the flag on and
off.

**Rewording at `10c6b1b`:**
- The security line is new in all 15 locales, and all message files parse.
  en, pt-BR and th match UX's text word for word.
- As rendered on the Preview (en, pt-BR, th): "Private, encrypted data;
  after 24 hours, records and prescriptions can only be corrected, and the
  original is kept." The switcher says "Other countries" / "Outros países"
  / "ประเทศอื่นๆ". The old "never deleted" text is gone.

**CI at `10c6b1b`:** ✅. **Merge gate: 🟢 for `10c6b1b`**, once the
reviewer is clean. This docs commit sits on top, after a master sync.

## PR #92 (`th/3-consent-access-log`, base master) — signup consent checkbox and record access log, 🟢 at `c1c135e` (pre-111 scope)

Migration 111 is **not** applied. Its two functions answer 404 `PGRST202`
for a real doctor's token (`log_record_access`, `get_patient_access_log`).
So the stored consent row, the log entries and the access-log tab are
**unit-tested only**. Checked on the Preview at `c1c135e`.

**Signup checkbox** (pt-BR, en, ja, th; each signup was captured and
aborted, so no account was created):
- It's **unchecked** by default and **required**.
- Submitting without it sends **nothing** (0 signup requests); the browser
  shows its "check this box" message.
- Once it's checked, the doctor signup's `user_metadata` carries
  `privacy_version: "2026-09-28"`, `terms_version: "2026-09-28"` and
  `privacy_consent_platform: "web"`.
- **Labels:**
  - pt-BR: "Li e aceito os Termos de Uso e a Política de Privacidade".
  - en: "I have read and accept the Terms of Use and the Privacy Policy".
  - ja and th are translated.
- **Links:** they point to `/<locale>/terms` and `/<locale>/privacy` with
  `target=_blank`. Clicked in pt-BR, they open "Termos de Uso" and
  "Política de Privacidade" in a new tab.

**Patient page** (throwaway doctor and secretary, deleted afterwards):
- Both get a 200.
- The doctor's tabs are Informações / Receitas / Consultas, with **no
  "Registro de acessos"**. The secretary's are Informações / Consultas, as
  before.
- No error text and no page errors. The log call happens server-side and
  fails silently, since the function doesn't exist yet.

**Privacy and Terms** (en + pt-BR):
- **§3.1** adds "When someone creates an account, we record which version
  of the Terms of Use and Privacy Policy they accepted, and when" /
  "Quando alguém cria uma conta, registramos qual versão…".
- **§7** adds "An access log records who opened each patient record,
  prescription, exam or file, and when…" / "Um registro de acessos guarda
  quem abriu cada prontuário, receita, exame ou arquivo…". On the web,
  exams and records are shown only inside the chart, whose opening is
  logged, and there's no file viewer. So the web surface matches the text
  once 111 is applied.
- **"Last updated" lines unchanged:** "Last updated: September 28, 2026" /
  "Última atualização: 28 de setembro de 2026", on Privacy and on Terms.

**⚠ Release gate (not a blocker for master):** §3.1 and §7 describe what
111 enforces. Until 111 is on prod, nothing records the consent version
or the access log. So **111 must be applied before this master code
reaches `release`/prod**; otherwise the policy overclaims.

**⏳ Needs 111:** the `privacy_consents` row written by `handle_new_user`,
the log entries (doctor and secretary opens), and the tab's contents,
paging and names after an account deletion.

**CI at `c1c135e`:** ✅. **Merge gate: 🟢 for `c1c135e`** within the
pre-111 scope, once the reviewer is clean. This docs commit sits on top,
after a master sync.

## PR #93 (`fix/money-input`, base `release`) — hotfix: typed amounts read "150,50" as 150.50, not 15050, 🟢 at `962b880`

The money inputs were `type="number"`. Chrome read "150,50" as 15050, and
the procedure price refused cents. The inputs are now text with
`inputMode="decimal"`, read by `parseMoney`, with an "= R$ …" preview and
an error for invalid text (no fallback).

Checked on the Preview at `962b880` in **Chromium and WebKit** (Safari's
engine), pt-BR. I used a throwaway doctor per browser (deleted
afterwards), with past pending appointments that had no amount.

**Payments → "Marcar como Pago"** (identical in both browsers):

| Typed | Preview | After "Confirmar" | DB |
|---|---|---|---|
| `150,50` | "= R$ 150,50" | R$ 150,50 in the list | paid, 150.5 |
| `1.500,50` | "= R$ 1.500,50" | R$ 1.500,50 | paid, 1500.5 |
| `150.50` | "= R$ 150,50" | R$ 150,50 | paid, 150.5 |
| `abc` | none | "Informe um valor válido." | **pending, null** |
| `150,5050` | none | "Informe um valor válido." | **pending, null** |

The "received" total afterwards is R$ 1.801,50 (150.50 + 1500.50 +
150.50), so it's correct.

**Settings → Procedimentos → new procedure** (both browsers):
- `89,90`: preview "= R$ 89,90". Saved as **89.9**, and the list row reads
  "60 min · R$ 89,90 · private", also after a reload. Before, cents were
  refused.
- `1.234,5`: preview "= R$ 1.234,50", saved as 1234.5.
- `abc`: "Informe um valor válido.", and **nothing saved**.

**Input type:** both fields are `type=text` and `inputMode=decimal`, so
phones show a decimal keyboard. At 390 px (touch) there's no sideways
scroll. Other numeric inputs on `release` are whole numbers only
(duration, max bookings), so they're unaffected.

**CI at `962b880`:** ✅. **Merge gate: 🟢 for `962b880`**, once the reviewer
is clean. The branch was up to date with `release`; this docs commit sits
on top.

**Prod after merge** (`release` `d340805`, www.solvymed.com, throwaway
doctor; 0 leftover rows afterwards):
- "150,50" → "= R$ 150,50", saved as paid 150.5.
- "abc" → error, still pending.
- Procedure "89,90" → 89.9, shown as "R$ 89,90" after a reload.

## PR #96 (`fix/pending-rule`, base `release`) — "Pendente" counts only receivable appointments (the app's rule), 🟢 at `6b451fb`

Before this PR, "Pendente" counted every unpaid appointment that wasn't
blocked or cancelled, including patient requests, rejected ones and
no-shows. Now only `scheduled`, `confirmed`, `completed` and `late`
count (`lib/paymentRules`).

Checked on the Preview at `6b451fb` with a throwaway doctor (deleted
afterwards). Each status got one unpaid appointment today with its own
power-of-two amount, so a total shows exactly which statuses were counted:

| Status | Amount (R$) |
|---|---|
| scheduled / confirmed / completed / late | 1 / 2 / 4 / 8 |
| tentative / cancelled / rejected / absent | 16 / 32 / 64 / 128 |
| proposal / blocked | 256 / 512 |
| plus one paid appointment (completed) | 1 000 |

| View | Pendente | Decodes to | Recebido |
|---|---|---|---|
| Payments, "Todo o período" | **R$ 15,00 · 4 sessões** | scheduled + confirmed + completed + late | R$ 1.000,00 · 1 sessão |
| Payments, "Esta semana" | R$ 15,00 · 4 sessões | same | R$ 1.000,00 |
| Payments, "Este mês" | R$ 15,00 · 4 sessões | same | R$ 1.000,00 |
| Visão geral pending card (all time) | **R$ 15,00 · 4 sessões**; banner "4 sessões não pagas" | same | — |

- **The pending list** holds exactly those four: completed, late,
  scheduled and confirmed.
- **Excluded:** tentative, cancelled, rejected, absent, proposal and
  blocked appear nowhere.
- **Recebido** is unchanged.

**CI at `6b451fb`:** ✅. **Merge gate: 🟢 for `6b451fb`**, once the reviewer
is clean. The branch was up to date with `release`; this docs commit sits
on top.

## PR #95 (`ux/tour`, base master) — guided tour for doctors and secretaries, 🟢 at `96656d7`

Migration 113 is not applied, so the tour never auto-starts and nothing is
saved. It was tested via **Settings → "Rever o tour"** on the Preview, with
throwaway doctors and a secretary (deleted afterwards).

**Rounds:**
- **`8f1d2c1` → `adad321`** (copy only): the schedule step no longer claims
  "remarcar / marcar como paga" from an appointment. The web can't do
  those; it now reads "mude o status das consultas e responda aos
  pedidos".
- **❌ at `adad321`:** below lg (900 px) and on phones (390 px), the
  sidebar steps were still counted and "spotlighted" off-screen. The
  closed drawer's links are translated off the left edge, so the card
  described nothing visible ("8 de 8" / "7 de 7"). Fixed at `07c34b3`
  (targets must intersect the viewport).
- **`07c34b3` → `96656d7`:** a replay from Settings on a narrow screen
  started at "1 de 7" and then shrank. It's now right from step 1.

**Desktop 1280, doctor, pt-BR (`96656d7`):**
- **Order:** "Seu dia em um só lugar" (home) → "Marque consultas em
  segundos" (New appointment) → Agenda → Pacientes → Pagamentos ("Receba
  pelo Pix" for BR) → the trial chip → the invite card (navigates to
  Settings) → Configurações. That's **8 steps**; "n de 8" and the dots
  (active dot included) are correct at every step.
- **The card never overlaps the spotlight** (checked geometrically at
  every step).
- **Dim and Esc:** clicking the dimmed area does nothing. Esc → "Pular o
  tour? / Você pode revê-lo em Configurações." with "Continuar tour" and
  "Pular".
- **Keys:** → / ← / Enter work.
- **Concluir** (click or Enter, 3/3 runs) → `/pt-BR/dashboard?setup=1`
  with "Configure sua clínica" open. "Pular tour → Pular" closes the tour
  too.

**Narrow widths (`96656d7`):**
- **900 px:** "1 de 4" → home, New appointment, trial chip, invite (no
  sidebar steps).
- **390 px:** "1 de 3" → home, trial chip, invite (no sidebar and no New
  appointment).
- The card stays on screen, with no horizontal overflow.

**Other checks:**
- **Secretary:** 4 steps ("O dia da clínica", New appointment, Agenda,
  Pacientes); no Settings, invite or payments steps. Concluir stays on the
  dashboard.
- **Reduce motion:** no pulse on step 1 (it pulses otherwise).
- **Languages:** en, es, ja, th and ar are translated for the first steps,
  with no raw keys. ar is RTL: the sidebar is on the right, and there's no
  overlap.
- **Screenshots** for UX's copy review: UX approved the copy as rendered.

**⏳ Needs 113:** the auto-start on first sign-in, the resume offer, and
saved progress.

**CI at `96656d7`:** ✅. **Merge gate: 🟢 for `96656d7`**, once the
reviewer is clean. This docs commit sits on top, after a master sync.

## PR #99 (`fix/greeting-plurals`, base master) — the doctor's own title, never an added "Dr."; pt-BR zero is plural, 🟢 at `5ba1898`

These are UX's two tickets from #95's screenshots:
- "Bom dia, Dr. Dra" was a hard-coded `Dr. ${firstName}`.
- "0 sessão": pt-BR uses the plural for zero.

The new `lib/doctorName` mirrors the app's regex: a typed title (Dr, Dra,
Prof, Profa, Pr, Dott, Dott.ssa) is kept in the doctor's spelling, with
the case tidied and a dot only if one was typed. **No title is ever
added.**

Checked on the Preview with throwaway doctors, deleted afterwards. The
first run was at `91c0488`; the re-run at `5ba1898`, after b2's master
merge (the `layout.tsx` conflict with #95's tour), gave the same results.

| `full_name` saved | Greeting | Sidebar name | Avatar |
|---|---|---|---|
| `Dra Opus Tour` | "Bom dia, Dra Opus 👋" | Dra Opus | O |
| `dra. beatriz lima` | "Bom dia, Dra. beatriz 👋" | Dra. beatriz | B |
| `Ana Opus Souza` | "Bom dia, Ana 👋" (no "Dr.") | Ana | A |
| `Prof. Carlos Opus` | "Bom dia, Prof. Carlos 👋" | Prof. Carlos | C |

**Zero in pt-BR:**
- Visão geral pending card: "0 sessões".
- Payments with one paid appointment: Pendente "R$ 0,00 / 0 sessões",
  next to "1 sessão" (the singular is unchanged).
- Agenda: "0 consultas hoje".
- Patient tabs: "Registros (0) / Receitas (0) / Consultas (0)".
- No pt-BR `plural` message is left without a `=0` case, and no "Dr. "
  prefix is left in code or messages.

**Name field:**
- **Settings → Perfil:** the placeholder is "Seu nome completo", with the
  hint "Se quiser, inclua seu título (Dr., Dra., Prof.): ele aparece nas
  saudações."
- **Signup:** the same hint appears for the doctor role only (not
  Paciente).

**After the merge with #95:** the tour still works on this head. Replay →
Concluir (click or Enter, 3/3) → `/dashboard?setup=1` with the checklist.

**CI at `5ba1898`:** ✅. **Merge gate: 🟢 for `5ba1898`**, once the
reviewer is clean. The branch is up to date with master; this docs commit
sits on top.

## PR #100 (`fix/pix-dialog-i18n`, base master) — the Pix QR dialog title in the page's language, 🟢 at `cb2c26a`

This is UX's third item from the #97 help review. The dialog was titled
"Pix QR Code" (hard-coded) in every language. Its tooltip, title and image
alt now come from `schedule.pixQrTitle`: "QR Code Pix" in pt-BR, "Pix QR
code" in the other 14 locales. "Copia e Cola" / "Copiar" stay as they were,
since Pix is Brazilian.

Checked on the Preview at `cb2c26a` with a throwaway BR doctor (Pix key
set, deleted afterwards) and an R$ 120 pending appointment, in Agenda →
list:

| UI | Button tooltip | Dialog title | `img alt` | QR |
|---|---|---|---|---|
| pt-BR | "QR Code Pix" | "QR Code Pix" | "QR Code Pix" | decodes, CRC ok, amount 120.00 |
| en | "Pix QR code" | "Pix QR code" | "Pix QR code" | decodes, CRC ok, 120.00 |
| es | "Pix QR code" | "Pix QR code" | "Pix QR code" | decodes, CRC ok, 120.00 |

The old string "Pix QR Code" is no longer referenced anywhere in the repo
(apart from TESTING-WEB.md).

**CI at `cb2c26a`:** ✅. **Merge gate: 🟢 for `cb2c26a`**, once the
reviewer is clean. The branch is up to date with master; this docs commit
sits on top.

## PR #97 (`ux/help`, base master) — Help Center at /help (publish-gated), 🟢 at `ce28288`

38 articles (pt-BR + en), `noindex`, and not linked from anywhere until UX
flips `liveFeatures.helpCenter`.

**Round 1 (`961b45c`) and UX's fixes:**
- Round 1 worked apart from three small findings. UX decided them, and b2
  fixed them at `794dfb9` → `ce28288`:
  1. The `?app=1` search matched hidden subscribing text: "cartão" found K1
     through its web note.
  2. "Abrir no site" showed on features the web doesn't have.
  3. The pt note "QR Code Pix" didn't match the dialog's hard-coded title.
     That's fixed separately in #100.
- An automated check found every **bolded** label in the web notes (en +
  pt) as real web UI text. The only exceptions were K2's "Change password",
  which the note says doesn't exist, and G4, fixed by #100.

**Checked on the Preview at `ce28288`:**

| Page | Result |
|---|---|
| `/help` in pt-BR, en, ja, th | 200, `noindex, nofollow`, 38 article links. pt-BR → "Central de Ajuda"; en, ja, th → "Help Center". No overflow at 1280. |
| `/help?app=1` (all four) | No `/pricing` or `/auth/signup` link and no language switcher. Every help link keeps `?app=1`. |
| All 38 articles × {normal, `?app=1`} | 200 and `noindex`; no raw `**`. In `?app=1`: **no "No site" box and no "Abrir no site"** on any article. |
| "Abrir no site" (normal) | Present on 27 articles and **absent on A2, P7, P8, P10, G5, C6 and C7** (web-unavailable). A4 keeps it (cancelling works on the web). Targets: `/dashboard`, `/schedule`, `/patients` (`?new=1`), `/payments`, `/settings`, `#clinic`, `#procedures`. Logged out, each redirects to login, so none 404s. |
| K1 normal | "Teste grátis e assinatura" / "Free trial and subscription": the subscription text plus the web note. |
| K1 `?app=1` | "**Sua conta**" / "**Your account**" in the index, the h1 and the tab title. The body is only "Veja os detalhes da sua conta em Configurações." K1's subscribing text and title are **not in the HTML at all**. |
| `/help/zz9` | 404 |
| `/`, `/pricing`, `/auth/login` | 0 links to `/help` |
| 390 px, `/help/a4` and `?app=1` | No horizontal overflow |

**Search** (pt-BR, accents and case ignored):

| Query | Normal | App variant |
|---|---|---|
| "bloquear horario" | Bloquear horários | Bloquear horários |
| "PIX" | Configurar o Pix, Cobrar pelo Pix | same |
| "secretária" | 4 articles, incl. "Teste grátis e assinatura" | 3 (K1 gone) |
| "assinatura" | Fazer uma receita, Teste grátis e assinatura, Encerrar a conta | Fazer uma receita, Encerrar a conta |
| "cartao" | Meu perfil…, Teste grátis e assinatura | **nothing** |
| "visão geral" | Marcar uma consulta, Relatórios | **nothing** (that phrase appears only in web notes) |
| "xyzzy" | no-results message | no-results message |

**Note for UX (not a #97 issue):** every page, including `?app=1`, ships
next-intl's whole message bundle in a hidden script, so the page source
contains strings like `subscription.payCard` ("Assinar com Cartão"). It's
never displayed.

**CI at `ce28288`:** ✅. **Merge gate: 🟢 for `ce28288`**, once the
reviewer is clean. This docs commit sits on top, after a master sync.

## PR #101 (`chore/help-slim-messages`, base master) — every page moved into a `(site)` route group so /help ships only the messages it uses, 🟢 at `c89f9bc`

This was UX's gate item before the apps link the Help Center. It's almost
entirely file renames with no URL change. Who gets which messages is
decided by three layouts:
- `(site)/layout.tsx` gives all messages.
- `help/layout.tsx` gives only `footer`.
- the root layout gives `ConsentBanner` only `consent`.

The only client components outside `(site)` (the help chrome's cookie
button, and the banner) use exactly those namespaces.

**Broad smoke test,** run on #101's Preview **and on master's Preview
(`c7b657a`) as the baseline**, with the same spec
(`scratchpad/pr101/opus-pr101.spec.ts`):
- **Pages:** each checked for its HTTP status, page errors, console errors
  mentioning intl/messages, and raw message keys on screen. That covers:
  - **Logged out** in pt-BR and en: home, pricing, login, signup (including
    the Paciente role card), forgot/reset password, invite-required,
    pending-confirmation, not-connected, clinic-inactive, patient- and
    professional-welcome, confirm, verify, privacy, terms, account/delete,
    feedback, invite/join/join-secretary links, and help (normal, `?app=1`,
    an article, K1 `?app=1`).
  - **Logged out** in ja and ar: home, pricing, login, signup, privacy and
    help.
  - **Doctor** in pt-BR and en: dashboard; schedule (list/day/week/month
    and the New appointment dialog); patients (list and the New patient
    dialog); patient detail (all 4 tabs); payments; clinics; settings;
    subscribe; feedback.
  - **Secretary:** dashboard, schedule, patients (list and detail),
    payments, settings.
  - **Patient:** booking page (the procedure listed) and my-appointments.
- **Result: every page returns 200. There are no page errors, no
  missing-message console errors and no raw keys** on #101 or on master.

The few spots where the two runs differed were re-run 3 times on both
builds and behaved **identically**, so they were timing, not #101:
- pending-confirmation logged out: both redirect to login.
- The New appointment dialog in pt-BR: full text 3/3 on both.
- Where the patient-welcome countdown lands.

**Cookie banner** (`ConsentBanner`, now outside `(site)` with only
`consent`):
- A fresh visit shows it in pt-BR ("Usamos cookies necessários… Aceitar
  tudo | Somente necessários | Escolher…"), the same as on master.
- "Escolher…" shows the categories, and "Salvar escolhas" sets
  `sm_consent` and closes it.
- "Configurações de cookies" reopens it from home, **/help** and privacy.

**Page source (the goal):**

| Page | "Assinar com Cartão" | "Comece seu teste grátis" | "Assine para continuar" | Size (master → #101) |
|---|---|---|---|---|
| `/pt-BR/help?app=1` | **no** (was yes) | **no** (was yes) | **no** (was yes) | 94 KB → 42 KB |
| `/pt-BR/help/k1?app=1` | **no** | **no** | **no** | 76 KB → 25 KB |
| `/help?app=1` (en) | "Subscribe with Card" / "Start your free trial": **no** (were yes) | | | 92 KB → 41 KB |
| `/pt-BR/help` (normal) | no | yes (the visible header CTA) | no | 101 KB → 50 KB |
| `/pt-BR`, `/pt-BR/pricing` | yes | yes | yes | unchanged: `(site)` still gets everything |

**CI at `c89f9bc`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`c89f9bc`.** The branch is up to date with master; this docs commit sits
on top.

## PR #102 (`ux/news`, base master) — the Novidades popup + new-feature tour (behind `NEXT_PUBLIC_NEWS_ENABLED`), 🟢 at `59def69`

The flag is unset on Vercel, so the ON side ran on a **local `next dev`
with `NEXT_PUBLIC_NEWS_ENABLED=1`**, against the prod DB (throwaway
doctor and secretary, deleted afterwards). Migration 113 isn't applied,
so the popup is opened with `/dashboard?news=1`. Once-per-release saving
is unit-tested only.

**Rounds:**
- **`07444e2`:** below lg, "Ver as novidades" closed the popup and showed
  nothing. Its only step (the sidebar's Configurações) is inside the
  closed drawer. UX chose to spotlight the ☰ button instead, and never to
  mark a release seen if nothing could be shown.
- **❌ at `a75207c`:** the ☰ fallback was never found. The button is
  `position: fixed`, so `offsetParent === null` (measured at 390 px: 16,16
  40×40, visible), and `isOnScreen` rejected it.
- **`59def69`:** `isOnScreen` now uses size + viewport overlap +
  `visibility`. With the same change (`cb06103b`), the **main tour's**
  drawer steps also point at the ☰ below lg.

**At `59def69`:**
- **Without `?news=1` (pre-113):** no popup.
- **Doctor, 1280, pt-BR:**
  - The popup appears after ≈0.9 s: "Novidades no SolvyMed ✨", with
    "Tour guiado — Um passeio rápido…" only (SolvyAI stays hidden), and
    "Agora não" / "Ver as novidades". The card takes focus.
  - A click on the dim doesn't close it; **Esc** and **"Agora não"** close
    it with no spotlight.
  - **"Ver as novidades"** → "1 de 1", "Tour guiado — Em Configurações →
    Rever o tour.", spotlighting the sidebar's Configurações. **Concluir**
    closes it.
  - **Settings → "Novidades"** card: "1.4.0 · Tour guiado: …" → **Mostrar**
    navigates to the dashboard and shows the same spotlight.
  - The **main tour** replay still starts at "1 de 8". No page errors.
- **en:** "What's new in SolvyMed ✨", "Guided tour…", "Not now" / "See
  what's new".
- **900 px:**
  - "Ver as novidades" → "1 de 1" on **☰** with "Abra o menu →
    Configurações → Rever o tour." The card is on screen and doesn't cover
    the ☰.
  - Main tour: **8 steps**: home, New appointment, ☰ "No menu ☰, em
    Agenda: …", ☰ Pacientes, ☰ Pagamentos, trial chip, invite, ☰
    Configurações.
- **390 px (phone):**
  - The popup is a **bottom sheet** (full width, flush with the bottom),
    with no overflow.
  - "Ver as novidades" → ☰ with the menu text, and the card doesn't cover
    the ☰.
  - Main tour: **7 steps** (New appointment is dropped below sm): home, ☰
    Agenda, ☰ Pacientes, ☰ Pagamentos, trial, invite, ☰ Configurações.
- **Secretary:**
  - At 1280, the popup waits until the one-time welcome card is dismissed
    ("Entendi"), then shows the same item. "Ver as novidades" spotlights
    Configurações, and Settings has the Novidades card with "Mostrar".
  - At 390: the news spotlight is on ☰. The main tour has 3 steps: home, ☰
    "No menu ☰, em Agenda: Confirme os pedidos…", ☰ Pacientes.
- **Flag OFF (#102's Preview, where the variable is unset):** with
  `?news=1` there's no popup, and Settings has no Novidades card and no
  "Mostrar".

**CI at `59def69`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`59def69`.** This docs commit sits on top, after a master sync (2 behind;
message JSON valid).

## PR #104 (`fix/name-titles-parity`, base master) — the name rule matches the app (ordinal and stacked titles); no name → "Boa tarde!", email-only sidebar, neutral avatar, 🟢 at `0b2feab`

`0b2feab` is `e311118` (review-clean) plus a master merge. The rule is
the app's regex, extended to the Brazilian ordinal (Drª, Dr.ª, Drª.) and
up to 3 stacked titles. The avatar letter always skips titles, and a
title is still never added.

Checked on the Preview with a throwaway doctor per name
(`professionals.full_name` set as below; all deleted afterwards), pt-BR
dashboard, afternoon:

| Saved name | Greeting | Sidebar name | Avatar |
|---|---|---|---|
| `Drª Ana Souza` | "Boa tarde, Drª Ana 👋" | Drª Ana | A |
| `Dr.ª Beatriz Lima` | "Boa tarde, Dr.ª Beatriz 👋" | Dr.ª Beatriz | B |
| `drª. carla dias` | "Boa tarde, Drª. carla 👋" | Drª. carla | C |
| `Prof. Dr. Carlos Melo` | "Boa tarde, Prof. Dr. Carlos 👋" | Prof. Dr. Carlos | C |
| `Prof. Dr. Dra. Eva Neves` | "…, Prof. Dr. Dra. Eva 👋" | Prof. Dr. Dra. Eva | E |
| `DOTT.SSA giulia rossi` | "…, Dott.ssa giulia 👋" | Dott.ssa giulia | G |
| `Pr. João Alves` | "…, Pr. João 👋" | Pr. João | J |
| `Priscila Alves` / `Draco Malfoy` / `Profeta Gentileza` | Priscila / Draco / Profeta (**not** read as titles) | same | P / D / P |
| `Dra.` (title only) | "…, Dra. 👋" | Dra. | D |
| `Ana Opus Souza` | "Boa tarde, Ana 👋" (no "Dr.") | Ana | A |
| `""` and `"   "` | **"Boa tarde! 👋"** | **none**, only the email line | **neutral person icon** |

- **No name:** a secretary without a name gets the same result ("Boa
  tarde! 👋", email only, person icon). A named secretary gets "Boa
  tarde, Sec". The phone drawer at 390 px shows the email only and the
  icon, with no overflow.
- **Note:** `full_name = null` is refused by the DB (400), so an empty
  name reaches the web only as `""` or blanks. Both were covered.
- **Master merge:** the auto-merge of `dashboard/layout.tsx` and
  `DashboardSidebar.tsx` keeps both #102's news and ☰ `data-tour` markers
  and #104's name and avatar logic.

**CI at `0b2feab`:** ✅. **Review: clean at `e311118` (a9)**, and
`0b2feab` only adds a master merge. **Merge gate: 🟢 for `0b2feab`.**
This docs commit sits on top, after a master sync (7 behind; message JSON
valid).

## PR #106 (`fix/help-invite-copy`, base master) — Help C5 "Patient invite link" app steps corrected (content only; Help Center still gated), 🟢 at `05f1de0`

This only changes `content/help/04-configuracoes.md` and the regenerated
`helpArticles.json`: C5's app steps for pt-BR and en. The web note
("No site / On the website") is untouched, as the diff shows.

Checked on the Preview at `05f1de0` (server HTML, bold rendered):

| Page | Body | Web note | "Abrir no site" |
|---|---|---|---|
| `/pt-BR/help/c5` | "Em **Início**, na lista para configurar a clínica, toque em **Compartilhar link de convite**. Ou em **Configurações → Seu código de convite para pacientes**, toque em **Compartilhar** (sem código ainda? toque em **Gerar código de convite**). … **Novo** gera um código novo…" | unchanged ("Em **Agenda**, clique em **Compartilhar link de convite**, ou em **Configurações → Seu código de convite**…") | yes |
| `/pt-BR/help/c5?app=1` | same body | hidden (app variant) | no |
| `/help/c5` | "On **Home**, in the setup checklist, tap **Share invite link**. Or in **Settings → Your patient invite code**, tap **Share** (no code yet? tap **Generate invite code**). … **New** creates a new code…" | unchanged | yes |
| `/help/c5?app=1` | same body | hidden | no |

All four pages return 200, with no raw `**`. The JSON's C5 matches the
markdown.

**CI at `05f1de0`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`05f1de0`.** This docs commit sits on top, after a master sync (12
behind).

## PR #105 (`fix/thai-buddhist-explicit`, base master) — Thai dates request the Buddhist calendar explicitly (`th-TH-u-ca-buddhist`), 🟢 at `6eb3291`

Android's Intl doesn't default Thai to the Buddhist calendar. The web
engines do today, but this is insurance. A new `dateLocale()` is used by
every user-facing formatter: dashboard, calendar, patients, patient
detail, booking, Team panel, access log, `dateLabels`. A grep of the
branch finds only fixed technical locales left: clinicTime `en-US` /
`en-CA`, legal dates `en-US` / `pt-BR`, and the browser time zone.

**Before the PR** (master Preview, th): the three engines already showed
2569. Identified by feature: Blink `vendor=Google Inc.`, WebKit `Apple
Computer, Inc.`, Gecko via `-moz-appearance`. All three resolve `th` to
`calendar: "buddhist"`.

**At `6eb3291`** (Preview, Thai flag on, throwaway doctor + patient,
deleted afterwards), in **Chromium, WebKit and Firefox**:

| th page | Shown | "2026" |
|---|---|---|
| Visão geral date (server) | "วันจันทร์ที่ 28 กันยายน 2569" | 0 |
| Schedule month / week / day (client) | "กันยายน 2569" / "28 ก.ย. – 4 ต.ค. 2569" / "วันจันทร์ที่ 28 กันยายน 2569" | 0 |
| Patient detail | "28 กันยายน 2569" (patient since) | 0 |
| Booking day strip (patient) | "อังคาร 29 ก.ย.", "พุธ 30 ก.ย."… (WebKit: "อ. 29 ก.ย."), no year shown | 0 |

- **pt-BR and en are unchanged:** "…28 de setembro de 2026", "setembro de
  2026" / "Monday, September 28, 2026", "September 2026".
- **Not covered:** the Team-panel invite expiry, the access log (needs
  111), and record dates (my seeded record didn't insert). They use the
  same `dateLocale()` path.
- **Follow-up, pre-existing (on master too, not #105):** patient detail
  shows **Data de nascimento as the raw stored value, "1993-05-14 (33 …)",
  in every language**. It isn't formatted, so in th it's the one
  Gregorian date on screen. Sent to UX.

**CI at `6eb3291`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`6eb3291`.** This docs commit sits on top, after a master sync (16
behind). The `dashboard/page.tsx` auto-merge keeps both `dateLocale` and
#104's greeting.

## PR #108 (`docs/assistant-contract`, base master) — SolvyAI `/api/assistant` contract + no-guessing eval fixtures (no UI), 🟢 at `1b2b427`

- **Files:** only 3. `docs/assistant-api.md`,
  `src/__tests__/assistant-evals.test.ts` and
  `src/lib/assistant/evals/cases.json`.
- **Nothing user-facing:** the fixture is imported **only** by that test
  (`git grep "evals/cases"` finds no app import), so nothing reaches a
  page or the bundle. No route, component or message changed.

**CI at `1b2b427`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`1b2b427`.** This docs commit sits on top, after a master sync (8
behind).

## PR #107 (`fix/th-dob-guard`, base master) — a Buddhist-era year (≥ 2400) is never saved or converted; พ.ศ. hint on Thai birth dates, 🟢 at `ee3f014`

`ee3f014` is `2384a92` (review-clean) plus master merges (after #104 and
#105). How the guard works:
- A new `DateInput` sets `setCustomValidity` and shows the message.
- The patient booking button and the "propose new time" Send button are
  disabled.
- Server backstops: `createPatient`, `updatePatient`, `createAppointment`,
  `blockTime`, `proposeNewTime` and `requestReschedule`.

Checked on the Preview (Thai flag on) with a throwaway doctor, a patient
and a seeded booking request (all deleted afterwards). **"Server
backstop"** means: the form was submitted with browser validation off
(`noValidate` + `requestSubmit`), so only the server action could refuse.

| Field | th | pt-BR | en |
|---|---|---|---|
| New patient: birth date 1996-05-14 | hint **"พ.ศ. 2539"** | no hint | no hint |
| New patient: typed 2539 | "ดูเหมือนเป็นปี พ.ศ. กรุณาใช้ปี ค.ศ. (เช่น 1996)"; save blocked; server backstop shows the message; **no row** | "Esse ano parece do calendário budista. Use o ano cristão (ex.: 1996)."; same result | "That looks like a Buddhist-era year. Please use the Gregorian year (e.g. 1996)."; same result |
| Edit patient (stored 1993-05-14) | prefilled hint "พ.ศ. 2536"; typed 2536 → message; save blocked; server refuses; **DOB unchanged** | message; blocked; server refuses; unchanged | same |
| New appointment: date 2569-10-01 | message; blocked; server (`date_buddhist_era`) refuses; **no appointment** | same | same |
| Block time: 2569-10-01 | message; blocked; server refuses; nothing saved | same | same |
| Booking request → propose new time: 2569-10-02 | message; **Send disabled** | same | same |
| Patient booking page: birth date | "พ.ศ. 2539" for 1996; typed 2539 → message; **"ส่งคำขอนัดหมาย" disabled** | message; **"Enviar Solicitação" disabled** | — |

- **Thai dates still show 2569** next to the guard (the reviewer's check,
  since both touch the same imports): the patient page "28 กันยายน 2569",
  the dashboard "วันจันทร์ที่ 28 กันยายน 2569", and the booking day strip
  "อังคาร 29 ก.ย." (no year shown). There's no "2026" on the Thai pages.
- **End state:** the DB held only the seeded rows (1 patient, DOB still
  1993-05-14, only the seeded request), so **no Buddhist-era date was
  stored anywhere**.
- **Residual (not a blocker):** the patient booking page writes
  `patient_profiles.birth_date` straight from the browser (no server
  action), so its guard is client-side only (the button is disabled plus
  an early return). A DB-level check would need a migration.

**CI at `ee3f014`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`ee3f014`.** This docs commit sits on top, after a master sync (5 behind;
message JSON valid).

## PR #103 (`ux/solvyai`, base master) — SolvyAI panel UI with a mock backend (behind `NEXT_PUBLIC_SOLVYAI_ENABLED`), 🟢 at `268fa2d`

The flag is unset on Vercel, so this ran on a **local `next dev` of
`268fa2d` with `NEXT_PUBLIC_SOLVYAI_ENABLED=1`**, against the prod DB
(throwaway doctors and a secretary, deleted afterwards). The backend is
`mockBackend.ts`: it answers from the real Help articles, and
Confirmar/Desfazer are simulated.

**Button and panel** (doctor, pt-BR, 1280):
- **✦ button:** bottom-right (1204,724, 56×56), labelled "Abrir o
  SolvyAI".
- **First visit:** "Posso ajudar? Pergunte ou peça qualquer coisa." shows,
  then is **gone after 5 s**; it doesn't come back on the next visit.
- **Opening it:** a **400 px panel on the right that pushes the content**
  (main 1024 → 624 px). It shows "PRÉVIA", "Nova conversa", ✕, the usage
  bar "Uso de hoje 0% · Renova em 11 h", 3 chips, 🎤, Enviar and "Não
  inclua dados de pacientes…".
- **390 px:** the panel is a **full sheet** (0,0 390×844), with no
  overflow.
- **English:** "PREVIEW · New conversation · Today's usage · Renews in 11 h
  · Ask or tell SolvyAI something about SolvyMed. · What do I have
  tomorrow? / How do I invite my secretary? / Book an appointment · Send ·
  Don't include patient data…".

**Chips per screen:**

| Screen | Chips |
|---|---|
| Início | O que tenho amanhã? · Como convido minha secretária? · Marcar consulta |
| Agenda | O que tenho amanhã? · Bloquear sexta à tarde · Marcar consulta |
| Pacientes | Cadastrar paciente · Como arquivar um paciente? · Encontrar paciente |
| Pagamentos | Quanto tenho a receber esta semana? · Enviar Pix para um paciente · Marcar como pago |
| Configurações | Como convido minha secretária? · Configurar Pix · Mudar horário de atendimento |
| Clínicas (other) | the home set |

**Conversations:**
- **"Como convido minha secretária?"** → the C4 article steps plus the "No
  site" note. **"Abrir tela →"** goes to the screen and **minimises the
  panel to a "SolvyAI ✦" pill**; the pill reopens it with the conversation
  kept.
- **"Marca a Maria amanhã às 14h"** → **"Qual Maria?"**, offering Maria
  Silva / Maria Souza (DOB + last visit).
- **"Marca a Maria Silva amanhã"** → **"Para que horário?"**
- **"…às 14h"** → a card: Paciente, Quando "terça, 29/09/2026 ·
  14:00–14:30", and **Duração / Procedimento / Valor / Onde each marked
  "(padrão)"**.
  - **Confirmar ✓** → **"✓ Feito (simulação)"** with **"Desfazer (9 s)"**
    counting down (7 s after 2.5 s).
  - Desfazer → "Desfeito (simulação)".
- **"…às 12h"** → the same card with **"⚠ Horário bloqueado
  (12:00–13:00)"**. Confirmar gives **"Não foi possível salvar. O horário
  está bloqueado."**
- **"qual a dose de dipirona"** → "Não posso ajudar com questões
  clínicas." Off-topic ("quem ganhou o jogo ontem?") → "Só posso ajudar
  com o SolvyMed."
- **Masking:** "como cadastro o paciente 123.456.789-09 tel (11)
  98765-4321 email ana@example.com dia 29.09.2026 às 14:00 valor R$ 150"
  is shown and sent as "…paciente **[cpf]** tel **[phone]** email
  **[email]** dia **[phone]** às 14:00 valor R$ 150".

**Limits:**
- A second send within **3 s** → "Aguarde um instante antes de enviar de
  novo." and it isn't sent.
- The input stops at **500** characters ("500/500").
- A trial account reaches **10 messages** → the bar reads **100%**, and
  "Você usou as mensagens de hoje do SolvyAI. Renova em 11 h." **replaces
  the input**.

**Network:** during the whole chat (help, booking cards, Confirmar,
Desfazer, masking, limits), the only request besides Next internals was
the page GET from "Abrir tela". **Nothing is sent to any backend**, and
nothing is written to the DB.

**What the same flag turns on:**
- The main tour becomes **9 steps**, with "Conheça o SolvyAI" as step 2 on
  the ✦.
- /pricing lists "SolvyAI, seu assistente com IA: pergunte ou peça "marca a
  Maria amanhã às 14h"".
- **Secretary:** no ✦ and no panel.

**Flag OFF (checked on #103's Preview, where the variable is unset):** a
doctor's dashboard has **no ✦ button and no panel**. Production doesn't
set the variable.

**Mock-only follow-ups for b2** (not user-facing until the real backend,
and non-blocking):
1. The card's end time adds 30 min without carrying the hour: "14:45" →
   "**14:45–14:75**".
2. The phone mask also catches a dotted date: "29.09.2026" → "[phone]"
   (8 digits in one run). Slashed dates, "14:00" and "R$ 150" are kept.
3. The en clinical reply's text wasn't captured by my log (the same mock
   path as pt-BR).

**CI at `268fa2d`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`268fa2d`.** This docs commit sits on top, after a master sync (18
behind; message JSON valid). The `dashboard/layout.tsx` auto-merge keeps
SolvyAI, news and #104's name logic.

## PR #107 re-confirm at `d991329` (master merge after #103, conflict resolved by b2)

- **Code:** #107's 13 code files are **byte-identical** to `ee3f014`
  (`git diff ee3f014 d991329` on them is empty).
- **Conflicts resolved:** the message files keep both `dateInput.*` (#107)
  and `assistant.*` (#103), and all message JSON is valid. The #107
  section above is intact.
- **Thai re-run on the Preview at `d991329`:** the same results as the
  entry above:
  - พ.ศ. hints; the guard message on new/edit patient, new appointment,
    block time and propose (Send disabled);
  - blocked saves, and nothing saved even with browser validation off;
  - the booking page's th and pt-BR guard;
  - Thai dates still 2569.
- **CI at `d991329`:** ✅. **Merge gate: 🟢 for `d991329`.**

## PR #109 (`fix/dob-locale-format`, base master) — no raw ISO dates; birth date + age like the app, 🟢 at `496f038`

These were my findings from #105 (a raw "1993-05-14" on the patient
page). #109 adds `formatShortDate` (the locale's short numeric date,
Buddhist year in th, via `dateLocale`) and the translated age with plural
forms.

Checked on the Preview (Thai flag on) with a throwaway doctor and patient
(deleted afterwards; seeded records and prescriptions deleted first):
- **patients:** "Opus Adulta" born 1993-05-14, and "Opus Bebe" born
  2025-08-24 (1 year old);
- **clinical rows:** a record and a prescription;
- **appointments:** a pending and a paid one;
- **a booking request** from a patient whose profile DOB is 1988-11-07.

| Place | pt-BR | en | th |
|---|---|---|---|
| Patient detail DOB (adult) | **14/05/1993 (33 anos)** | **05/14/1993 (33 years)** | **14/05/2536 (33 ปี)** |
| Patient detail DOB (1 year) | 24/08/2025 (**1 ano**) | 08/24/2025 (**1 year**) | 24/08/2568 (1 ปี) |
| Patient header age | 33 anos | 33 years | 33 ปี |
| Patients list card | 33 anos · 1 ano | 33 years · 1 year | 33 ปี · 1 ปี |
| Records tab | 28/09/2026 14:06 | 09/28/2026 14:06 | 28/09/2569 14:06 |
| Prescriptions tab | 28/09/2026 | 09/28/2026 | 28/09/2569 |
| Payments list | "dom., 20 de set. · 09:00 · Consulta" | "Sun, Sep 20 · 09:00 · …" | "อาทิตย์ 20 ก.ย. · 09:00 · …" |
| Booking-request card: date / DOB / consultation line | "ter., 29 de set. · 15:00–15:30" / **07/11/1988** / "Consulta · ter., 29 de set. 15:00–15:30" | "Tue, Sep 29 …" / **11/07/1988** / … | "อังคาร 29 ก.ย. …" / **07/11/2531** / … |

- **No raw YYYY-MM-DD** on any of these pages in any of the three
  languages.
- **Sweep:** a grep of the branch for date fields printed raw in JSX finds
  none left. What remains is server-side English push text
  (`patients/actions.ts:247`, `booking-actions.ts:193`), passed to b2 as a
  follow-up.

**CI at `496f038`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`496f038`.** This docs commit sits on top, after a master sync (11
behind; message JSON valid).

## PR #110 (`docs/assistant-examples`, base master) — SolvyAI stream examples shared with the app + a contract test (no UI), 🟢 at `219aeaf`

- **Files:** only 3. `docs/assistant-api.md` (+17/−1),
  `docs/assistant-examples.ndjson` and
  `src/__tests__/assistant-examples.test.ts`.
- **Nothing user-facing:** no app code, route, component or message
  changed. The `.ndjson` lives under `docs/` and is read only by the test.

**CI at `219aeaf`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`219aeaf`.** This docs commit sits on top, after a master sync (10
behind).

## PR #112 (`feat/solvyai-after-save`, base master) — SolvyAI mock follow-up: contract shapes, second question, after-save navigation, app-parity mask, 🟢 at `3909d66`

Tested with Playwright on a local `next dev` with
`NEXT_PUBLIC_SOLVYAI_ENABLED=1` (the flag is unset on Vercel). Tested
first at `dd62a85`; the finding below was fixed at `3909d66` and
re-tested there.

- **Mask (shown question):** kept: `29.09.2026`, `29/09`,
  `2026-10-02`, `02.10.2026`, `14:00`, `R$ 150` and `1500 2000`. Masked:
  `123.456.789-09` → [cpf]; `(11) 98765-4321`, `11 91234-5678`,
  `+55 11 91234-5678` and `91234-5678` → [phone]; the email → [email].
- **End times:** 14:45–15:15, 09:45–10:15, 17:50–18:20 and 11:30–12:00.
  No "14:75".
- **slot_choice (10h taken):** no card. The text "…10:00 já tem Ana
  Souza (10:00–10:30). Qual destes horários?" comes with chips 09:30 /
  10:30 / 11:00 / Outro horário. A chip is sent as the next message
  ("terça-feira, 29/09/2026 às 10:30"). The stateless mock then answers
  off-topic, which is expected for the mock.
- **Blocked (12h):** the card shows "⚠ Horário bloqueado (12:00–13:00)".
  Confirmar opens the inline "Este horário está bloqueado (12:00–13:00).
  Agendar mesmo assim?" [Cancelar] [Agendar]. **Cancelar:** nothing
  runs, with no toast, no navigation and the card back to Confirmar.
- **Outside hours (19h):** the outside-hours question; Agendar saves.
  en: "This time is blocked (12:00–13:00). Book anyway?" [Cancel] [Book].
- **After save:** the panel minimises to the "SolvyAI ✦" pill. The page
  goes to `/schedule?date=2026-09-29&highlight=<id>` (the block goes to
  `date=2026-10-02`), with one navigation. The toast "✓ Feito
  (simulação)" + "Desfazer (10 s)" counts down to 1 s and goes.
  Desfazer → "Desfeito (simulação)", hidden after about 4 s.
- **Slot just taken (16h):** "Não foi possível salvar." plus "Esse
  horário acabou de ser ocupado. Nada foi salvo." with chips 16:30 /
  17:00 / Outro horário. No navigation.
- **Expiry** (clock +16 min): "Este cartão expirou. Peça de novo para ver
  os dados atualizados."; Confirmar disabled, nothing runs.
- **Ring** (`?highlight=` with a real appointment, calendar and list
  views): the row is ringed at about 2 s, the ring is off by about 5 s
  and the parameter is dropped. A reload doesn't ring. An unknown id →
  no crash, parameter dropped.
- **Hard stop and fail-closed:** the mock never sends either, so I
  tested them with a local-only patch to `mockBackend.ts` (reverted,
  never committed).
  - Hard stop: the reason ("Esse horário já passou.") shows in red;
    Confirmar is disabled and a forced click does nothing.
  - A card with a blocked warning but no `secondConfirm` is dropped. The
    panel shows "O SolvyAI está indisponível agora. Tente de novo em
    instantes." in its place.
- **Flag off:** no ✦ button, panel or pill.

**Finding at `dd62a85`, fixed at `3909d66`:**
- **At `dd62a85`:** after a save, reopening the pill brought the same
  card back with Confirmar enabled, and a second Confirmar ran
  `execute()` again. With the real backend, that is a double booking.
  a9 marked it BLOCKING.
- **At `3909d66`:** the reopened card shows "✓ Feito" and has no
  Confirmar. A rapid double-click on Confirmar, and on Agendar in the
  second question, gives one toast and one navigation.

**CI at `3909d66`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`3909d66`.** This docs commit sits on top; the branch was already up to

## PR #111 (`fix/booking-overlap-hours`, base master) — overlap is a hard stop that says with whom; blocked / outside hours / day off → one question, 🟢 at `f7d578f`

Tested with Playwright on the Preview at `f7d578f` (Thai flag on), in
pt-BR, en and th. Each language ran against its own throwaway doctor:
hours Mon–Sat 08:00–18:00, Sunday off, and blocks on Tuesday at
14:00–15:00 and 19:00–20:00. Each doctor already had an appointment,
"Opus Existente", on Tuesday at 10:00–10:30. Every case was also
checked in the DB.

| Case (Tuesday unless noted) | pt-BR | en | th | Saved? |
|---|---|---|---|---|
| BE year `2569-09-29` at 10:15 (#107 interplay) | message under the field; server backstop: "Esse ano parece do calendário budista…" | "That looks like a Buddhist-era year…" | "ดูเหมือนเป็นปี พ.ศ. …" | no; no hours or overlap question first |
| 10:15, overlaps Opus Existente | "Este horário conflita com Opus Existente às 10:00 (30 min). Escolha outro horário." | "This overlaps with Opus Existente at 10:00 (30 min). Choose another time." | "เวลานี้ซ้อนกับนัดของ Opus Existente เวลา 10:00 (30 min) กรุณาเลือกเวลาอื่น" | no; hard stop, no Agendar button |
| 14:15, blocked | "Confira o horário" / "Este horário está bloqueado (14:00–15:00). Agendar mesmo assim?" [Cancelar] [Agendar] | "Check the time" / "This time is blocked (14:00–15:00). Book anyway?" | "ตรวจสอบเวลา" / "ช่วงเวลานี้ถูกปิดไว้ (14:00–15:00) ยืนยันนัดหมายหรือไม่?" | Cancelar → no, form stays open; Agendar → yes |
| 18:30, outside hours | "…fora do seu horário de atendimento (08:00–18:00)…" | "…outside your working hours (08:00–18:00)…" | "…นอกเวลาทำการของคุณ (08:00–18:00)…" | Agendar → yes |
| 19:15, blocked **and** outside | both sentences in **one** question | same | same | Cancelar → no |
| Sunday 10:00, day off | "Você não atende aos domingos. Agendar mesmo assim?" | "You don't work on Sundays. Book anyway?" | "คุณไม่ได้ทำงานวันอาทิตย์ ยืนยันนัดหมายหรือไม่?" | Agendar → yes |
| 11:00–13:00, inside hours | no question | no question | no question | yes, directly |

- **Overlap beats the question:** the first run reused pt-BR's saved
  times in en and th. The blocked, outside and day-off slots were already
  taken there, and each gave the overlap hard stop (naming the pt-BR
  appointment), never the question.
- **Hours never set** (`working_hours` `{}`): Sunday 22:00 → no question,
  saved.
- **Secretary** (booking for the doctor): gets the same outside-hours
  question and the same overlap hard stop.

**Nit (not blocking, sent to b2):** the Thai overlap text keeps "(30
min)"; the duration is built as `` `${durationMin} min` `` in
`ScheduleClient.tsx:331` rather than coming from the messages.

**CI at `f7d578f`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`f7d578f`.** This docs commit sits on top; the branch was already up to
date with master.

## PR #113 (`fix/localized-web-pushes`, base master) — every web push in the recipient's language, dates in its format, 🟢 at `1c4fa89`

**Setup:**
- **Server:** a local `next dev` at `1c4fa89` against the prod DB, with a
  test-only Node preload. It intercepts every `exp.host` push request,
  and the `notify-clinic-closed` edge-function call that closing an
  account makes. It logs them to a file and answers locally. No push or
  email left the machine.
- **Data:** a throwaway doctor with no country; five throwaway patients
  with fake Expo tokens, invited by the doctor and not linked yet.
- **Saved languages:** `patient_profiles.locale` was seeded as `pt-BR`,
  `en`, `th`, `es-ES` and none. The doctor's session reads it under RLS
  (the path the PR relies on).
- Each push was triggered from the UI.

| Push (UI action) | Recipient (saved language) | Title \| body as sent |
|---|---|---|
| Doctor confirms, with a note | patient `pt-BR` | Consulta confirmada \| Sua consulta foi confirmada. Observação: Traga os exames |
| Doctor confirms | patient `es-ES` (normalised → es) | Cita confirmada \| Tu cita ha sido confirmada. |
| Doctor rejects | patient, none saved → the practice's (pt-BR) | Pedido não aceito \| Não foi possível aceitar o seu pedido de consulta. |
| Doctor proposes a new time | patient `en` | New time proposed \| A new time was proposed: **10/03/2026** 09:30. |
| Doctor proposes a new time | patient `th` | เสนอเวลาใหม่ \| มีการเสนอเวลาใหม่: **03/10/2569** 09:30 |
| Doctor accepts a reschedule request | patient `en` | Reschedule confirmed \| Your appointment has been moved to 10/03/2026 16:00. |
| Doctor declines a reschedule request | patient `th` | ไม่สามารถเลื่อนนัดได้ \| ไม่สามารถเลื่อนนัดได้ เวลาเดิมยังคงได้รับการยืนยัน |
| Patient (th) accepts the proposal, on /auth/pending-confirmation | clinic → practice pt-BR | Proposta aceita \| Opus Push th aceitou o novo horário: 03/10/2026 09:30. |
| Patient (en) declines the proposal | clinic → pt-BR | Proposta recusada \| Opus Push en recusou o horário proposto. O pedido foi cancelado. |
| Doctor archives the th patient (2 future appointments) | patient `th`, one push each | ยกเลิกนัดหมาย \| นัดหมายของคุณวันที่ 03/10/2569 09:30 ถูกยกเลิกโดยคลินิก (and 01/10/2569 16:00) |
| Account close by a second doctor: linked patient | patient `en` | Clinic closed \| Your clinic has closed its SolvyMed account. … |
| Account close: patient with only an appointment | patient `th` | นัดหมายถูกยกเลิก \| นัดหมายของคุณวันที่ 03/10/2569 เวลา 08:30 ถูกคลินิกยกเลิกแล้ว |
| Account close: patient with only an appointment | patient, none saved → the closing request's pt-BR | Consulta cancelada \| Sua consulta de 03/10/2026 às 09:00 foi cancelada pela clínica. |

- **Every push went to the right token:** no raw `YYYY-MM-DD` and no
  leftover `{placeholder}`. The patient's pages were in pt-BR, yet the
  clinic's pushes followed the practice and the patients' pushes
  followed each saved language (not the UI language of whoever acted).
- **Account close** called `notify-clinic-closed` once, with only the
  linked patient's id.
- **Not testable on prod data yet:**
  - A **Thai practice** (clinic pushes in th): `professionals.country`
    doesn't exist until migration 110 is applied. So the practice
    fallback is pt-BR for everyone today; the unit tests cover
    `country = TH`.
  - **"Reschedule requested"** (patient → clinic) needs the linked
    patient's slot picker, so I left it to the unit test. It uses the
    same `notifyProfessional` path as the two proposal pushes above.

**Notes for UX (not blocking):**
- **Prod has 0 rows in `patient_profiles`**, so no patient has a saved
  language yet. Until the mobile dev's saved-language work lands,
  every web push to a patient is pt-BR (the approved fallback).
- **The Thai "cancelled by the clinic" push has two wordings:**
  - archive: "ยกเลิกนัดหมาย / …ถูกยกเลิกโดยคลินิก", from `pushText.ts`;
  - account close: "นัดหมายถูกยกเลิก / …ถูกคลินิกยกเลิกแล้ว", from the
    `accountClose` messages.

  Both are fine; unifying them is optional.

**CI at `1c4fa89`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`1c4fa89`.** This docs commit sits on top of a master sync (10 behind,
clean merge, no conflicts).

## PR #114 (`fix/birth-date-range-client`, base master) — birth date between 1900-01-01 and today, 🟢 at `0cd70ed`

Tested on the Preview at `0cd70ed` (Thai flag on) in pt-BR, en and th.
The browser was on America/Sao_Paulo, so today = 2026-09-28. Every save
was checked in the DB.

| Birth date typed | New patient | Edit patient | Booking page (patient) |
|---|---|---|---|
| tomorrow (2026-09-29) | invalid: "Data de nascimento inválida: use uma data entre 1900 e hoje." / "Invalid date of birth: use a date between 1900 and today." / "วันเกิดไม่ถูกต้อง กรุณาใช้วันที่ระหว่างปี ค.ศ. 1900 ถึงวันนี้"; **Save blocked, nothing saved** | same message; Save blocked, DOB unchanged | same message (pt-BR, th) |
| 1899-12-31 | same range message; Save blocked | same; blocked | same |
| 2539-05-14 (≥ 2400) | still the **Buddhist-era** message, not the range one | same | same |
| 1900-01-01 | accepted, **saved** (th hint "พ.ศ. 2443") | — | accepted |
| today (2026-09-28) | accepted, **saved** (th "พ.ศ. 2569") | accepted, **saved** | accepted |
| 1996-05-14 | accepted | — | accepted |

- **Picker limits:** `min="1900-01-01"` everywhere. `max="2026-09-28"` on
  edit patient and the booking page (see the nit about new patient).
- **Schedule dates aren't limited:** the New appointment date has no
  min/max, and 2027-03-10 is accepted with no message.
- **Not tested: the DB refusal** (`invalid_birth_date`, migration 116). The
  migration isn't applied, so a forced submit past the browser's check
  would still save today. The mapping to the message is covered by the
  unit tests.

**Nit (not blocking, sent to b2):** the `max` on **New patient opened
through `?new=1`** (the setup checklist link) is the **server's UTC date**.
- **Cause:** that path renders the form on the server
  (`useState(autoOpen)`), and `localToday()` runs there; hydration keeps
  the server's attribute.
- **Seen here:** at 21:xx BRT it was `max="2026-09-29"` (tomorrow). The
  field's own message still catches tomorrow, so there it's only
  cosmetic.
- **Where it would bite:** a UTC+7 browser between 00:00 and 07:00 local
  would get yesterday as `max`. Today's date would then be refused by
  the browser's native range tooltip, with no message of ours.
- **Unaffected:** opening the form with the button, and the edit and
  booking forms, all render in the browser and are correct.

**CI at `0cd70ed`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`0cd70ed`.** This docs commit sits on top of a master sync (15 behind,
clean merge; message JSON valid).

## PR #115 (`fix/overlap-duration-i18n`, base master) — the overlap message's duration in the locale's words, 🟢 at `50cc51a`

This follows up my #111 nit. Tested on the Preview at `50cc51a`: a
throwaway doctor with an existing 45-min appointment (Opus Existente,
10:00). In each language I booked 10:15 through New appointment:

| Locale | Message | Saved? |
|---|---|---|
| th | เวลานี้ซ้อนกับนัดของ Opus Existente เวลา 10:00 (**45 นาที**) กรุณาเลือกเวลาอื่น | no |
| ja | この時間はOpus Existenteさんの予約（10:00、**45分**）と重なっています。別の時間を選んでください。 | no |
| pt-BR | Este horário conflita com Opus Existente às 10:00 (**45 min**). Escolha outro horário. | no |
| en | This overlaps with Opus Existente at 10:00 (**45 min**). Choose another time. | no |
| de | Dieser Termin überschneidet sich mit Opus Existente um 10:00 (**45 Min.**). Bitte wählen Sie eine andere Zeit. | no |

The duration is the real one (45, not the procedure's 30). pt-BR and en
are unchanged from #111.

**CI at `50cc51a`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`50cc51a`.** This docs commit sits on top of a master sync (11 behind;
the message files auto-merged; all 15 are valid JSON and each has
`durationMinutes` once).

## PR #118 (`fix/th-cancel-wording`, base master) — one Thai wording for an appointment cancelled by the clinic, 🟢 at `bef269f`

This follows up my #113 note. Copy only: `src/lib/pushText.ts` (1 line),
`src/messages/th.json` (1 line) and a unit test.

| Push | Before (seen live in #113) | Now |
|---|---|---|
| Archive (`pushText` th) | ยกเลิกนัดหมาย \| นัดหมายของคุณวันที่ {when} ถูกยกเลิกโดยคลินิก | **นัดหมายถูกยกเลิก** \| นัดหมายของคุณวันที่ {when} ถูกยกเลิกโดยคลินิก |
| Account close (`accountClose` th) | นัดหมายถูกยกเลิก \| …เวลา {time} ถูกคลินิกยกเลิกแล้ว | นัดหมายถูกยกเลิก \| …เวลา {time} **ถูกยกเลิกโดยคลินิก** |

- **Same title and ending on both paths.** The new test pins the archive
  title to `accountClose.pushCancelledTitle`.
- **Placeholders unchanged** (`{when}`, `{date}`, `{time}`); th.json is
  valid.
- **Not re-run live:** the #113 sink run exercised both paths, and this
  changes only the strings. First-pass Thai review is Vitor's, per the
  standing rule.

**CI at `bef269f`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`bef269f`.** This docs commit sits on top of a master sync (9 behind,

## PR #116 (`feat/solvyai-app-map`, base master) — the SolvyAI App Map (data) + its drift test, 🟢 at `6bded04`

- **Files:** only 2, `src/lib/solvyai/app-map.ts` (+280) and
  `src/__tests__/app-map.test.ts` (+93).
- **Nothing user-facing:** no runtime code imports `app-map.ts` (a grep
  finds only the test). No route, component or message changed.
- **Status glossary:** it already uses #117's single labels ("Solicitado"
  / "Requested", "Novo horário proposto" / "New time proposed",
  "Concluído" / "Completed"). No old label (Pendente, Proposta,
  Tentative, Done, No-show) is left.

**CI at `6bded04`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`6bded04`.** This docs commit sits on top of a master sync (14 behind,
clean merge). The drift test re-runs in CI on the merge.

## PR #117 (`fix/status-labels`, base master) — one set of status labels on web and app, 🟢 at `f6ec62e`

Tested on the Preview at `f6ec62e` in pt-BR, en and th. The throwaway
doctor had today's appointments in each status: tentative (from a
patient), a doctor's proposal, completed, confirmed and absent. There
was also a later tentative one, and the payment was pending on all of
them. A linked throwaway patient checked their own side.

| Status | pt-BR | en | th |
|---|---|---|---|
| tentative | **Solicitado** | **Requested** | ส่งคำขอแล้ว |
| proposal | **Novo horário proposto** | **New time proposed** | เสนอเวลาใหม่ |
| completed | Concluído | **Completed** | เสร็จสิ้น |
| confirmed / absent | Confirmado / Ausente | Confirmed / Absent | ยืนยันแล้ว / ขาดนัด |

- **Home (today's list):** every row carries the label in the table.
- **Schedule, list view:** the request rows say Solicitado / Novo
  horário proposto. The status selector holds the right value on each
  row (completed → Concluído / Completed / เสร็จสิ้น). Its options:
  Agendado, Confirmado, Concluído, Cancelado, Atrasado, Ausente (en:
  Scheduled … Completed … Absent).
- **Patient, My appointments:** the badges read Solicitado / Novo
  horário proposto / Solicitado (en Requested / New time proposed; th
  ส่งคำขอแล้ว / เสนอเวลาใหม่).
- **"Pendente/Pending" is now only the payment pill** ("⏳ Pendente · R$
  150,00" / "⏳ Pending · …"). No status says Pendente, Tentative,
  Proposta, Proposal or Done anywhere.
- **Help A5** (`content/help/01-agenda.md` and the rebuilt
  `helpArticles.json`): the list reads "Scheduled, Confirmed, Completed,
  Cancelled, Late, **Absent** and Rejected" (pt "… Atrasado, Ausente e
  Rejeitado"). The website note about "Done" / "No-show" is gone. The
  in-app Help and SolvyAI surfaces aren't live, so I checked the content
  files, not a screen.

**CI at `f6ec62e`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`f6ec62e`.** This docs commit sits on top of a master sync (14 behind,
clean merge; message JSON valid).

## PR #119 (`fix/dateinput-max-after-mount`, base master) — a birth date's `max` is the browser's today, set after mount, 🟢 at `99bd9d2`

This follows up my #114 nit, where `?new=1` rendered on the server with
a UTC `max`.
- **Setup:** Preview at `99bd9d2`. The browser clock was faked with
  Playwright (`clock.install`) to dates where the local day differs from
  the server's UTC day.
- **Paths:** New patient opened both via `?new=1` (server-rendered) and
  via the button. Each save was checked in the DB.

| Browser zone and time | Path | `max` | Today | Tomorrow | Saved |
|---|---|---|---|---|---|
| Asia/Bangkok, 2026-09-30 06:00 (a day ahead of UTC) | `?new=1` | **2026-09-30** | accepted (hint "พ.ศ. 2569") | "วันเกิดไม่ถูกต้อง…" | 2026-09-30 |
| same | button | 2026-09-30 | accepted | flagged | 2026-09-30 |
| America/Sao_Paulo, 2026-09-28 22:00 (a day behind UTC) | `?new=1` | **2026-09-28** | accepted | "Data de nascimento inválida…" | 2026-09-28 |
| same | button | 2026-09-28 | accepted | flagged | 2026-09-28 |

`max` now always matches the browser's local date, so today is accepted
in a Thai browser before 07:00. Before this PR, `?new=1` showed
`max="2026-09-29"` at 21:xx BRT.

**CI at `99bd9d2`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`99bd9d2`.** This docs commit sits on top of a master sync (4 behind,
clean merge).

## PR #121 (`feat/help-conditions`, base master) — Help "conditions": text that isn't true yet stays out of the build, 🟢 at `01a8f34`

This follows up my #120 finding: Help pages are public on master
(noindex only).
- **The mechanism:** `content/help/conditions.json` lists 6 unmet
  conditions (mobile#91, #95, #99, migration-115, migration-116,
  solvyai-live). A line marked `{pending:<condition>}` is left out of
  `helpArticles.json` until that condition is met.
- **Its first use:** A1's sentence about the app asking outside working
  hours or on a day off waits for mobile #91 in a released build.

**Checks:**
- **The build is reproducible:** `node scripts/help-build.mjs` at
  `01a8f34` regenerates `helpArticles.json` with no content change (only
  Windows line endings). No `{pending` marker is left in the output.
- **Every Help page, server-rendered, #121 Preview vs the master
  Preview:** 38 articles × (pt-BR, en) × (plain, `?app=1`) = 152 pages;
  **148 identical**. The 4 that differ are all A1, and each one differs
  only in that paragraph:
  - pt: "Fora do seu horário de atendimento (ou num dia em que você não
    atende), …" is gone. The blocked-time sentence and "Se já houver outra
    consulta no mesmo horário, não é possível salvar: o app diz com quem
    é…" stay.
  - en: the same ("Outside your working hours …" gone, the rest kept).
  - The "No site / On the website" part and the steps are unchanged.
- **Search (`/help` and `/help?app=1`, pt-BR and en), master → #121:**
  - "horário de atendimento": Marcar uma consulta + Horário de atendimento
    → **only Horário de atendimento**.
  - "working hours": Book an appointment + Working hours → **only Working
    hours**.
  - "dia em que você não atende", "Fora do seu horário" and "a day you
    don't work": A1 → **no results** (the component's noResults
    paragraph).

**Next:** #120 (Help C9) gets rebased onto this with C9 → `solvyai-live`.
I re-test it then: `/help/c9` must be a 404 and C9 absent from lists and
search.

**CI at `01a8f34`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`01a8f34`.** This docs commit sits directly on top; the branch was up to
date with master.

## PR #122 (`feat/solvyai-settings-web`, base master) — Configurações › SolvyAI on the website, 🟢 at `990a0ee`

Tested with Playwright in two places: a local `next dev` at `990a0ee`
with `NEXT_PUBLIC_SOLVYAI_ENABLED=1` (against the prod DB), and the
Vercel Preview, where the flag is unset.

**Doctor, the button switch ("Mostrar botão do assistente · Neste
navegador."):**
- On by default, and the ✦ shows.
- Off → the ✦ disappears at once (the same page, no reload).
  `localStorage.solvyai_button_hidden = "1"`.
- A reload keeps it off; Agenda has no ✦ either.
- **Another browser** (a fresh context, same doctor) still shows the ✦,
  so the setting is per browser.
- On again → the ✦ is back and the key is removed.

**Doctor, the actions switch ("Permitir que o SolvyAI faça ações"):**
- **Hidden against the prod DB:** migration 115 isn't there, so
  `assistant_usage_today` returns 404 and the card shows only the button
  switch.
- **Migration 115's RPCs stubbed in the browser** (`assistant_usage_today`
  → `{actions:false}`, `set_solvyai_actions` → 204); no local DB with
  115 was available. Results, in pt-BR and en:
  - The switch appears, off. The copy matches C9: Anthropic (EUA/USA),
    "nunca lê prontuários…", with a **"Política de Privacidade" /
    "Privacy Policy" link to `/pt-BR/privacy` / `/privacy`**.
  - **On → asks once:** "Ativar as ações do SolvyAI?" [Cancelar] [Ativar]
    (en "Turn on SolvyAI actions?" [Cancel] [Turn on]). **No RPC call**
    before the answer.
  - **Cancelar:** the question closes, no call, still off.
  - **Ativar:** one `set_solvyai_actions {"p_enabled":true}`, now on.
  - **Off:** no question; one `set_solvyai_actions {"p_enabled":false}`,
    now off.
  - **The save fails (500):** it stays off, with "Não foi possível
    salvar. Tente de novo."

**Others:**
- **Secretary:** no SolvyAI card on Configurações and no ✦.
- **Flag off (the Preview):** no card and no ✦.

**Note for release (no action here):** the Privacy link opens the
current policy, which doesn't name Anthropic yet. The actions switch
stays hidden until migration 115 is on prod, and 115 is part of the
`solvyai-live` gate (#121), which also requires the privacy update.

**CI at `990a0ee`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`990a0ee`.** This docs commit sits on top of a master sync (3 behind,
clean merge; message JSON valid).

## PR #120 (`docs/solvyai-settings-help`, base master) — App Map rules + Help C9 "SolvyAI", held until SolvyAI is live, 🟢 at `2f3514a`

**History:** at `ca4bd05` I held this PR. C9 was public on master
(`/pt-BR/help/c9` returned 200, noindex only). It described the pending
actions opt-in and named Anthropic (USA), which the privacy policy
doesn't. a9 ruled it BLOCKING; #121 added Help conditions. The rebase
marks C9 `requires:solvyai-live`, so `helpArticles.json` is unchanged
and C9 isn't built at all.

**Re-test on the Preview at `2f3514a`:**
- **C9 is gone:** `/pt-BR/help/c9`, `/pt-BR/help/c9?app=1`, `/help/c9`,
  `/help/c9?app=1` and `/pt-BR/help/C9` all return **404**. None of the
  responses contains "Anthropic" or "Permitir que o SolvyAI".
- **Nothing else in Help changed:** all 39 slugs (38 articles + c9) ×
  (pt-BR, en) × (plain, `?app=1`) = 156 pages are **identical** to the
  master Preview (`68dea5e`, which has #121). A1 stays held.
- **Search** (`/help` and `?app=1`, pt-BR and en) for "SolvyAI",
  "Anthropic" and "Permitir que o SolvyAI" / "Let SolvyAI take actions"
  → **no results** ("Nenhum artigo encontrado…" / "No articles found…"),
  the same as master.
- **Lists and chips:** C9 isn't in the built articles, so it can't show
  in a category list or the SolvyAI help chips (those also sit behind
  `liveFeatures.helpCenter`).
- **App Map:** C9's rules stay `pending` (the actions opt-in waits for
  migration 115 + mobile #99; the button switch for mobile #99).
  Unit-tested in CI.

**CI at `2f3514a`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`2f3514a`.** This docs commit sits on top of a master sync (4 behind,
clean merge).

## PR #124 (`fix/neutral-hours-copy`, base master) — neutral working-hours wording, 🟢 at `02d1f6d`

Tested on the Preview at `02d1f6d` with the #111 spec: a throwaway
doctor, hours Mon–Fri 08–18, Saturday and Sunday off, blocks at 14–15
and 19–20. pt-BR and en each ran against their own doctor.

**pt-BR, doctor: ✅.** Every question is "Confira o horário" with
[Cancelar] [Agendar]:
- 18:30 → "Este horário está **fora do horário de atendimento**
  (08:00–18:00). Agendar mesmo assim?" Agendar saves.
- Saturday 10:00 → "**Sábado não é dia de atendimento.** Agendar mesmo
  assim?" Agendar saves.
- 19:15 (blocked and outside) → **one** question with both sentences:
  "Este horário está bloqueado (19:00–20:00). Este horário está fora do
  horário de atendimento (08:00–18:00). Agendar mesmo assim?" Cancelar
  saves nothing.
- Blocked 14:15 and the overlap hard stop are unchanged from #111.

**pt-BR, secretary: ✅.** 07:00 → "Este horário está fora do horário de
atendimento (08:00–18:00). Agendar mesmo assim?" Agendar saves; the
overlap is still a hard stop.

**en, doctor: ✅.** Every question is "Check the time" with [Cancel]
[Book]:
- 18:30 → "This time is **outside the working hours** (08:00–18:00).
  Book anyway?" Book saves.
- Saturday 10:00 → "**Saturday isn't a working day.** Book anyway?" Book
  saves.
- 19:15 → one question: "This time is blocked (19:00–20:00). This time is
  outside the working hours (08:00–18:00). Book anyway?" Cancel saves
  nothing.
- Blocked 14:15 → "This time is blocked (14:00–15:00). Book anyway?"
  Cancel keeps the form open and saves nothing.
- The overlap hard stop and the in-hours booking (no question) are
  unchanged.

**Hours never set** (`working_hours` `{}`): no question in either
language, saved.

No copy says "your" working hours or "Você não atende" / "You don't work"
any more.

**Coverage note:** the secretary run is pt-BR only (the spec's secretary
case). The strings are the same keys for every role, so the en wording
above applies to secretaries too.

**CI at `02d1f6d`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`02d1f6d`.** This docs commit sits directly on top; the branch is up to
date with master.

## PR #123 (`feat/solvyai-route`, base master) — `/api/assistant` in help mode, 🟢 at `3b256cc`

- **Setup:** a local `next dev` against the prod DB, over HTTP with
  throwaway users' JWTs. Everything below was first run at `a0cb309`,
  then **re-run in full at `3b256cc`** with the same results.
- **Test-only preload** (scratchpad/pr123/sink.cjs):
  - answers `api.anthropic.com/v1/messages` with a scripted SSE stream
    and logs the exact request body;
  - answers or passes through the migration-115 RPCs.
- **Nothing reached Anthropic**; a fake key was used only so that a model
  object exists.

**Switch off** (`SOLVYAI_API_ENABLED` unset):
- POST `/api/assistant` (with a Bearer token and anonymous) → **404**
  `not_found`.
- GET `/api/assistant/usage` → **404**.

**Switch on, no key:**
- No / garbage JWT → **401**.
- Not JSON, no messages, the same role twice, or the last message from
  the assistant → **400 `bad_request`**.
- 501 chars → **400 `too_long`** (500 passes); turns = 12 → **400
  `too_many_turns`**.
- A valid request → **503 `model_unavailable`**.
- Usage: anonymous → 401; signed in (no 115) → 503.

**Key present, against the real DB (115 missing):**
- **503 `model_unavailable`.**
- The only RPC called is `assistant_consume_message`, and there's **no
  model call**: nothing is counted or sent.

**115 RPCs stubbed:**
- **Stream shape:** `application/x-ndjson` in this order: meta
  (`mode:"help"`) → deltas → text block → **open** (`[[open:C4]]` →
  "Abrir tela" `/pt-BR/dashboard/settings`, target settings) → feedback
  → usage → done.
- **Markers:** no `[[`/`]]` reaches the text, even when a marker is split
  across pieces. Unknown ids (`Z9`), junk (`[[nada]]`), an unfinished
  marker and **`[[open:A1]]` in en** give no open block and no raw
  marker. (A1 → no block is expected on web: its screen is the
  new-appointment dialog.)
- **After a successful answer:** exactly one `assistant_record_usage`,
  for the **caller's own id**, with the token counts; no release.
- **The model request:**
  - `claude-sonnet-5`, `max_tokens` 800, stream.
  - 2 system blocks, the first cached (`ephemeral`, 17.5k chars). The
    cached prefix has **no C9 / "Anthropic (EUA)" text and no held A1
    sentence** (conditions respected).
- **Masking:** 7 messages sent → the model gets the **last 6**. CPF, (11)
  phone, +55 phone, email, Thai ID and a Thai mobile → [cpf] / [phone] /
  [email] / [id]. `29.09.2026`, `14:00` and `R$ 150` are kept, and no raw
  digit string is anywhere in the request (history included).
- **The 115 answer drives the status:** not_doctor → 403; inactive →
  403; rate_limited → 429 with `retryAfterS`; quota_exhausted → 429 with
  usage; an unknown reason → 503. There's never a model call.
- **The model fails (500):** meta → `error model_failed`; exactly one
  `assistant_release_message` (the caller's id); no record_usage.
- **Over budget:**
  - meta `help`; "O SolvyAI está temporariamente indisponível. Tente
    novamente mais tarde."; used shown as used − 1.
  - **No model call**, one release, and no word "budget". With the Help
    Center unpublished there are no article links.
- **Usage endpoint:** `{used, limit, extra, resetsAt, mode:"help"}`;
  not_doctor → 403.

**Cancels at `3b256cc`** (the sink streams one SSE event every 400 ms):
- **Mid-stream** (the client aborts after 3 lines): **exactly one
  `assistant_release_message`**; no `record_usage`.
- **Before the first byte is read** (abort right after the response
  headers): **exactly one release**.
- **A slow answer read to the end:** exactly one `record_usage`, no
  release; the open block and done arrive as normal.

(My abort at `a0cb309` was inconclusive: an instant answer is fully sent
before the abort lands, so `record_usage` was correct there.)

**`SOLVYAI_FAKE_MODEL=1`, no key** (the keyless Help-echo model):
- "Como convido minha secretária?" (pt-BR) → "(resposta de teste)
  Convidar uma secretária …", open `/pt-BR/dashboard/settings`.
- "How do I block time in the schedule?" (en) → "(test answer) Block time
  …", open `/dashboard/schedule`.
- Off-topic → "Só posso ajudar com o SolvyMed.", with no open block.
- No raw marker, and **no call to Anthropic**.
- `record_usage` with **zeros** (the fix at `3b256cc`).
- Before 115 → still 503. (The production guard, `VERCEL_ENV !==
  "production"`, was checked by reading the code; it can't be run
  locally.)

**Question for the reviewer (not blocking):** after a client cancel, my
sink never saw the **upstream** model stream being cancelled. The
message is refunded correctly, but if the SDK request keeps running, the
provider still generates and bills that answer. Worth checking whether
`it.return()` reaches `stream.abort()` once the real key exists.

**CI at `3b256cc`:** ✅. **Review: clean (a9).** **Merge gate: 🟢 for
`3b256cc`.** This docs commit sits on top of a master sync (4 behind,
with #124; the TESTING-WEB.md conflict was resolved by keeping both
blocks).

## PR #126 (`feat/solvyai-actions`, base master) — SolvyAI actions mode, part 1 (read tools + book / cancel / block / mark-paid cards), 🟢 at `cd70175`

Server-only: nothing reaches the UI yet.
- **Unit tests:** `assistant-actions` + `assistant-route`, 33/33 (vitest
  exit 0).
- **End-to-end over HTTP:**
  - A local `next dev` at `cd70175` with `SOLVYAI_API_ENABLED=1` and a
    fake key.
  - A test-only preload (scratchpad/pr126/sink.cjs) answers
    `api.anthropic.com` with **real Anthropic SSE**, including `tool_use`
    blocks (`input_json_delta`) and `stop_reason: tool_use`, scripted per
    round. Ids in the scripted tool inputs are resolved from the tool
    results the route itself sent back, so they come from the real reads.
  - The **real tools ran against the prod DB** as a throwaway doctor: hours
    Mon–Fri 08–18, weekends off, patients Ana / Bruno / Carla (archived),
    Tuesday appointments, blocks at 12–13 and 18–19, a pending request.
  - The 115 RPCs were stubbed; nothing reached Anthropic.

| # | Scenario | Result |
|---|---|---|
| 1 | 115 says `actions:false` | `meta.mode = help`, **no tools offered** to the model, no card |
| 2 | a propose with a patient id not read in this request | tool error "Unknown patient: use a read tool first…", **no card**; the model asks |
| 2b | the id only in a (forged) earlier history message | still refused |
| 3 | find_patients → book Tuesday 11:00, no duration | card **Nova consulta**: Paciente "Opus Ana Costa (14/05/1990)", Quando "Terça-feira, 06/10/2026, 11:00–11:30", Duração 30 min **isDefault**; action args = the fields; `editHref` / `viewHref` internal (`/pt-BR/dashboard/schedule?date=…`); `after` schedule; expires in **15 min**; random id |
| 4 | book over Bruno 10:00–10:30 | **no card**; `slot_choice conflict`: "…10:00 já tem Opus Bruno Lima (10:00–10:30). Qual destes horários?", alternatives **09:30 / 10:30 / 11:00**, other |
| 5 | blocked 12:15 | ⚠ "Horário bloqueado (12:00–13:00)" + secondConfirm "Este horário está bloqueado (12:00–13:00). Agendar mesmo assim?" [Agendar] |
| 5 | 07:00 | ⚠ "Fora do horário de atendimento (08:00–18:00)" + secondConfirm |
| 5 | Sunday | ⚠ "Domingo não é dia de atendimento" + secondConfirm "Domingo não é dia de atendimento. Agendar mesmo assim?" |
| 5 | blocked **and** outside 18:15 | both warnings, **one** question with both sentences |
| 5 | the same patient already booked that day | warning "…já tem consulta nesse dia às 15:00" **only**, no second question |
| 5 | yesterday | **hard stop** `past_time` "Esse horário já passou. Escolha outro horário." |
| 5 | durationMin 45 | 11:00–11:45, "45 min" not marked default |
| 5b | en | "New appointment", "Tuesday, 10/06/2026", "⚠ Blocked time (12:00–13:00)", "This time is blocked (12:00–13:00). Book anyway?" [Book], hrefs without the prefix |
| 6 | archived patient (seen via list_appointments) | **hard stop** `patient_archived` "Este paciente está arquivado. Restaure o cadastro antes de agendar." |
| 7 | block 09–11 over Bruno | **refused** (tool error naming "10:00 Opus Bruno Lima"), no card |
| 7 | block 13–14 "Almoço" | card **Bloquear horário**, Período + Motivo |
| 7 | block yesterday | hard stop `past_time` |
| 8 | mark paid, no value | tool error "…no value: ask the user for the amount…", **no card** |
| 8 | mark paid with 200 | card **Marcar como pago**, Valor 200; `after` payments + highlight id |
| 9 | cancel a confirmed appointment | card **Cancelar consulta**; `after` highlights that id |
| 9 | cancel a pending request | **hard stop** `not_allowed` "Pedidos de consulta são aceitos ou recusados no próprio pedido." |
| 10 | unknown tool (`delete_record`) | "There's no tool…"; BE year 2569 → rejected; no time → "ask the user for the time" |
| 11 | the model keeps reading and never proposes | stops after **4 rounds** with "Não consegui concluir isso. Pode dizer de outro jeito…" |
| 12 | `confirm_failed` event (a slot taken) | **no model call**, `slot_choice confirm_failed` "Esse horário acabou de ser ocupado. Nada foi salvo…", fresh times 09:00 / 09:30 / 10:30, **one consume + one release** |
| 12 | the same in help mode / with junk args (2569, 25:00) | 400 `bad_request` |

- **Privacy:**
  - An appointment note ("SEGREDO-CLINICO-OPUS") seeded on Bruno's
    appointment **never appears** in any request to the model.
  - `list_appointments` sends id, date, times, status, patient name + birth
    date, paid, value; `find_patients` sends id, name, birth date.
  - All 7 tools are sent with `strict`.
- **Nothing is written:** a DB snapshot (appointments and patients,
  including `updated_at`) is identical before and after all of the above.

**Nits (not blocking; to UX / e7):**
- **Unformatted value:** the mark-paid card shows **"Valor 200"**, not
  "R$ 200,00" / "฿200" (the tool uses `String(value)`).
- **Book card fields:** only Paciente / Quando / Duração. The contract's
  example also shows Valor (and the mock had Procedimento / Onde). Worth
  a UX look, since the saved appointment gets the form's defaults for
  those.

**CI at `cd70175`:** ✅. **Review: clean (7f).** **Merge gate: 🟢 for
`cd70175`.** Not synced with master: the merge conflicts in
`content/help/conditions.json` (the dev's file), so I aborted it and
handed it to e7. This docs commit sits directly on `cd70175`.

## PR #125 (`docs/help-clinic-change-push`, base master) — Help + App Map: the patient is notified on app book/move/cancel (pending mobile#111), 🟢 at `143509b`

Docs/data only.
- **Content:** four `{pending:mobile#111}` sentences in A1/A4 (pt + en).
- **Condition:** `mobile#111` added to `content/help/conditions.json` with
  `met: false`.
- **App Map:** rules marked `pending: ["mobile#111"]`.

**My finding at `36eb1a4`, fixed at `143509b`:**
- **At `36eb1a4`:** the App Map's app-cancel rule said "…The website
  doesn't notify." But archiving a patient on the website **does**
  notify: `dashboard/patients/actions.ts:258` sends
  `apptCancelledByClinic` per upcoming appointment, which I saw live in
  #113.
- **At `143509b`:** a separate **live** rule says "Archiving a patient on
  the website cancels their upcoming appointments and notifies the patient
  if linked to a SolvyMed account. A cancel in the website's Schedule
  doesn't notify." Both halves match the code: the Schedule's status
  change sends no push. The app rule stays pending, without the false
  clause.

**Checks at `143509b` (the Preview):**
- **The built Help is unchanged:** `help-build` at the head reproduces the
  committed `helpArticles.json` (line endings only), with no `{pending` /
  mobile#111 text in it.
- **Every Help page:** 39 slugs × (pt-BR, en) × (plain, `?app=1`) = 156
  pages, **identical** to the master Preview. A1 (Marcar uma consulta) and
  A4 (Remarcar ou cancelar) show no new sentence.
- **Search** for "notificação quando você agenda", "recebe uma
  notificação", "ao arquivar o paciente" and the en equivalents, plain and
  `?app=1`:
  - **A1 or A4 never appears.**
  - The hits that do come up (Pedidos de pacientes / Patient booking
    requests, Arquivar e restaurar) are existing articles matching on
    shared words; the built articles are the same as master.

**CI at `143509b`:** ✅. **Review: clean (7f).** **Merge gate: 🟢 for
`143509b`.** This docs commit sits on top of a master sync (7 behind,
clean merge).

## PR #127 (`feat/solvyai-panel`, base master) — the web panel on the real `/api/assistant`; the book card shows every field it saves; the web form saves the procedure's price, 🟢 at `ac398a9`

**Setup:**
- **Tool:** Playwright on a local `next dev` with `SOLVYAI_API_ENABLED=1`
  + `NEXT_PUBLIC_SOLVYAI_ENABLED=1`, against the prod DB as a throwaway
  doctor (hours Mon–Fri 08–18; Bruno booked Tuesday 10:00, value 150; a
  block at 12–13; procedure "Consulta Opus" R$ 150).
- **The model:** my test-only sink (scratchpad/pr126/sink.cjs) stands in
  for Anthropic with scripted tool calls; the 115 RPCs are stubbed.
- **Saves are real:** they go through the screens' server actions, and
  every result below was checked in the DB.
- **Heads:** first run at `d5874d8`, then at `09be187` (the rebase + the
  full book card); the focused checks re-ran at `ac398a9`.

| Flow | Result |
|---|---|
| Panel on the route | no "Prévia" label |
| Book card (Ana, Tuesday 11:00) | Paciente "Opus Ana Costa (14/05/1990)", Quando "Terça-feira, 06/10/2026, 11:00–11:30", **Procedimento Consulta Opus (padrão), Valor R$ 150,00 (padrão), Tipo Presencial (padrão), Duração 30 min (padrão)** |
| Confirmar | row saved: `consultation_type` Consulta Opus, `payment_type` private, **`payment_amount` 150**, type in-person, 30 min, scheduled. The panel minimises; the page goes to **`/dashboard/schedule?date=2026-10-06&highlight=<new id>`** and **that row gets the ring**; the toast "✓ Feito · Desfazer (10 s)" |
| Desfazer (book) | the row is **deleted** (~2.8 s), and the toast reads "Desfeito" |
| Blocked 12:15 | inline "Este horário está bloqueado (12:00–13:00). Agendar mesmo assim?" → Agendar → **saved** (the warnings accepted) |
| Slot taken between the card and the tap (14:00 booked via REST before Confirmar) | "Não foi possível salvar." then "Esse horário acabou de ser ocupado. Nada foi salvo. Qual destes horários?" with chips **13:00 / 13:30 / 14:30 / Outro horário**; **no model call**, one consume + one release; nothing of ours saved at 14:00 |
| Cancel Bruno | status **cancelled** → Desfazer → **confirmed** again |
| Block 15–16 "Almoço" | a **blocked** row → Desfazer → **gone** |
| Mark Bruno paid | card Valor **R$ 150,00** (formatted, the 7f fix) → **paid** → Desfazer → **pending** |
| 115 says `inactive` | "O SolvyAI não está disponível para esta conta."; the input stays |
| **Next request after that failure** | the model received only `[user: "Como convido minha secretária?"]`: **no dangling user turn** |
| `rate_limited` | "Aguarde um instante antes de enviar de novo." |
| `quota_exhausted` | "Você usou as mensagens de hoje do SolvyAI. Renova em 5 h."; the bar at 100%; the input is replaced |
| The server switch off (`SOLVYAI_API_ENABLED` unset, the panel flag on) | the **mock panel with "Prévia"**; no route or model calls |
| The panel flag off (the Vercel Preview) | no ✦, no Settings card: as before |

**The plain form** (Agenda › Nova Consulta, the live fix):
- Procedure "Consulta Opus · R$ 150,00" → the appointment is saved with
  **`payment_amount` 150**.
- "Retorno Opus" (no price) → saved with **no value**.
- The same fix on release is #129, tested separately on the release
  Preview.

**Dev-server note:** the first navigations, undos and event replies take
3–10 s on `next dev` (first compiles). My first run read them too early.
Every check above passed once the waits covered that. On a Preview they're
fast.

**Not testable yet:** ฿ on the cards needs a TH practice
(`professionals.country` doesn't exist until migration 110); covered by
7f's unit tests.

**CI at `ac398a9`:** ✅. **Review: clean (7f).** **Merge gate: 🟢 for
`ac398a9`.** This docs commit sits directly on top; the branch is up to
date with master.

## PR #129 (`fix/booking-saves-procedure-price`, base **release**) — RELEASE hotfix: a web booking saves the procedure's price as its value, 🟢 at `7a505c1`

**The live bug:** Agenda › Nova Consulta on the website never saved the
procedure's price, so web-booked appointments had no value in Pagamentos
or in the Pix code.

**Tested on the release Preview at `7a505c1`:**
- **Setup:** a throwaway doctor with a Pix key and two procedures:
  "Consulta Opus" R$ 150 and "Retorno Opus" with no price.
- **Bookings:** both were made through the real form (Agenda › Nova
  Consulta), and each save was checked in the DB.

| Check | Result |
|---|---|
| Book with "Consulta Opus · R$ 150,00" | saved with **`payment_amount` 150**, `consultation_type` Consulta Opus, pending |
| Book with "Retorno Opus" (no price) | saved with **`payment_amount` null** (as before) |
| Bloquear Horário 13:00 | the block row has `payment_amount` null: **block time unaffected** |
| Pagamentos (the two rows moved to yesterday via REST, since Pagamentos lists up to today; the values are the form's) | Pendente: "Opus Preco Com · Consulta Opus · **R$ 150,00** · Marcar como Pago"; "Opus Preco Sem · Retorno Opus · **Sem valor definido**" |
| Pix QR (Agenda, the priced appointment) | the Copia e Cola code parsed as EMV: **tag 54 = `150.00`**, so the amount is in the Pix |

- **Note (unchanged by this PR, release only):** on release the Pix dialog
  title reads "Pix QR Code" even in pt-BR. Master has the translated
  title since #100, and the dialog's hardcoded "Copia e Cola" / "Copiar"
  are the #128 item.
- **Post-merge:** the prod spot-check (one booking with a priced
  procedure, then delete it) follows when this lands on
  www.solvymed.com.

**CI at `7a505c1`:** ✅. **Review: clean (7f).** **Merge gate: 🟢 for
`7a505c1`.** The branch was up to date with `release`; this docs commit
sits on top.

**#129 post-merge prod check ✅** (www.solvymed.com; Vercel prod = release
`b7a4c08`, checked with `vercel inspect`). Same spec, with no bypass
header sent to prod:
- "Consulta Opus · R$ 150,00" → **`payment_amount` 150**; "Retorno Opus"
  → null; a block → null.
- Pagamentos: "Consulta Opus · **R$ 150,00**" / "Sem valor definido".
- The Pix Copia e Cola **tag 54 = `150.00`**.
- The throwaway doctor was deleted.

## PR #133 (`chore/merge-back-release-129`, base master) — merge-back release → master after #129, 🟢 at `84972ec`

- **CI:** green.
- **Diff vs master:** `TESTING-WEB.md` only (+32 lines: the #129 block);
  no code. Master's own price block (from #127) is kept, and the branch
  contains master.
- **Docs:** no docs commit was pushed to it, at the dev's request (to
  keep the reviewed head), so the entry is recorded here.

## PR #130 (`feat/clinic-pins`, base master) — My Clinics: "Sem pin no mapa" for a clinic with an address but no pin, 🟢 at `c74f9ad`

Tested on the Preview at `c74f9ad` (Thai flag on). The throwaway doctor
had three clinics:
- **A:** an address, `lat`/`lng` null;
- **B:** no address, no pin;
- **C:** an address and a pin.

| Clinic | pt-BR | en | th |
|---|---|---|---|
| A (address, no pin) | "**Sem pin no mapa**" + "Ajustar no mapa" | "**No map pin**" + "Adjust on map" | "**ไม่มีหมุดแผนที่**" + "ปรับบนแผนที่" |
| B (no address) | old text: "Sem localização no mapa — adicione um endereço para aparecer no mapa" | "No map pin — add an address to appear on the map" | "ไม่มีหมุดแผนที่ — เพิ่มที่อยู่เพื่อปรากฏบนแผนที่" |
| C (pinned) | "No mapa" | "On map" | "บนแผนที่" |

**Setting A's pin** (`lat`/`lng` via REST, then a reload) → A shows "No
mapa": the label clears.

**CI at `c74f9ad`:** ✅. **Review: clean (7f).** **Merge gate: 🟢 for
`c74f9ad`.** This docs commit sits on top of a master sync (16 behind,
clean merge; message JSON valid).

## PR #131 (`feat/clinic-change-pushes`, base master) — the website tells the patient when the clinic books or cancels, 🟢 at `6a01fbc` (+ docs/parser-only commits to `2ccdf5a`), with one ⏳ post-110 row

**Setup:**
- **Server:** a local `next dev` with my test-only Expo sink (pushes are
  logged, never sent; the clinic-closed email call is sunk too), against
  the prod DB.
- **Practice:** a throwaway one with `clinic_name` "Clínica Opus Push"
  plus two locations ("Aaa Opus Local Norte", "Zzz Opus Local Sul").
- **Patients:** "Opus Push pt" (`pt-BR`) and "Opus Push th" (`th`), both
  linked app accounts with device tokens, plus an unlinked "Opus Push Sem
  Conta".
- Every action was done through the UI (the Nova Consulta form, the
  status select, Arquivar, Settings › close account).

| Action | Push (title \| body) |
|---|---|
| Doctor books pt (Tuesday 10:00) | Nova consulta \| **Clínica Opus Push marcou uma consulta para você em 06/10/2026 às 10:00.** |
| Status → Cancelado (pt) | Consulta cancelada \| **Clínica Opus Push cancelou sua consulta de 06/10/2026 às 10:00. Para marcar outra, abra o app.** |
| Cancelado → Confirmado | none (only a change *to* cancelled notifies) |
| Booking or cancelling in the past; Bloquear Horário; an unlinked patient | none |
| Archive th (2 future appointments) | one each: นัดหมายถูกยกเลิก \| **นัดหมายของคุณวันที่ 07/10/2569 เวลา 15:00 ถูกยกเลิกโดย Clínica Opus Push หากต้องการนัดใหม่ กรุณาเปิดแอป** (and 16:00): UX's exact wording |
| Account close by a second doctor (no `clinic_name`, location "Consultório Opus Sul") | th: **…เวลา 08:00 ถูกยกเลิกโดย Consultório Opus Sul** (no "open the app" suffix; the first-location fallback); pt: the unchanged close text |

**My two findings:**
1. **A linked patient whose appointments were all made on the website
   gets no book/cancel push.**
   - The web form stores `patient_id` but not `patient_auth_id`.
   - `get_patient_push_tokens` (088) only returns tokens when an
     appointment with `patient_auth_id` exists for the practice, so it
     returns 0 tokens silently. The th patient got nothing; the pt
     patient, with one app booking, got both pushes.
   - **Handled:** the fix is mobile #117 / migration 119 (unapplied). Web
     gates the Help/App Map claims on `linked-bookings`, and the built
     A1/A4 show no website-notification sentence.
2. **A secretary's action names a location, not the clinic:** "Aaa Opus
   Local Norte marcou…" / "…cancelou…", while the doctor's own push says
   "Clínica Opus Push".
   - **Cause:** the secretary path reads `clinic_name` from
     `get_professional_public_info`, which returns the profile name only
     after migration 110. Prod is on 105.
   - The reviewer ruled it expected before 110 and not a gate, since
     master reaches prod only with the Thai release, which applies 110–119
     first.
   - **⏳ post-110:** re-run the secretary push on a profile-named practice
     with 2 locations → it must say the profile name. The same row
     applies to mobile #111.

**CI:** ✅. **Review: clean (7f).** **Merge gate: 🟢** (with the ⏳
post-110 row above). This docs commit sits on top of a master sync (9
behind, clean merge).

## PR #128 (`fix/label-audit`, base master) — Pix dialog labels translated; Help G1/G4/K4 match the real labels (from my label audit), 🟢 at `4e420ef`

**The Pix dialog** (Agenda, an appointment with a value, the Preview at
`4e420ef`):

| Locale | Button title | Dialog |
|---|---|---|
| pt-BR | QR Code Pix | QR Code Pix · **Pix Copia e Cola** · **Copiar** |
| en | Pix QR code | Pix QR code · **Pix Copia e Cola** · **Copy** |
| th | Pix QR code | Pix QR code · **Pix Copia e Cola** · **คัดลอก** |

Before, the dialog hardcoded "Copia e Cola" / "Copiar" in every locale.
In th the title stays "Pix QR code": Pix is Brazil-only, so not a
problem.

**Help:** all 156 pages were compared with the master Preview.
- **148 are identical.** Only these changed:
  - **G1** (pt, en; the website line): "clique em **Marcar como Pago** na
    consulta: salva na hora. Se ela não tiver valor, digite o valor e
    clique em **Confirmar**." This matches the one-click save when there
    is a value.
  - **G4** (pt, en; the website line): "**Pix Copia e Cola**"; en "(with
    **Copy**)".
  - **K4** (pt, en; plain and `?app=1`): "**Encerrar conta** (ou
    **Excluir conta**, se ainda não houver prontuários)". The website shows
    "Excluir conta" for an account with no clinical history.
- **The G1/G4 app variants are unchanged**, as intended: the website line
  isn't shown there.

**K4 app label, resolved at `72aa7f7`:**
- **What the app shows** (8d, from the app code): every doctor sees one
  button, **"Excluir Conta" / "Delete Account"**. The dialog then says
  "Excluir Conta" (no records) or "Encerrar sua conta" (with records).
- **The fix:** the K4 body now reads "**Configurações → Excluir conta**.
  Se ainda não houver prontuários, a conta é excluída. Se houver, ela é
  encerrada: …" (en "**Settings → Delete account**. If there are no
  records yet, the account is deleted. If there are, it's closed: …").
- **Checked on the Preview at `72aa7f7`:** `/pt-BR/help/k4`, `/help/k4`
  and their `?app=1` variants all show the new text; `helpArticles.json`
  was rebuilt with the same content.

**CI at `72aa7f7`:** ✅. **Review: clean (7f).** **Merge gate: 🟢 for
`72aa7f7`.** This docs commit sits directly on top; the branch is up to
date with master.

## PR #137 (`fix/my-appointments-no-notes`, base **release**) — RELEASE privacy hotfix: patients never get the clinic's appointment notes (with migration 106, live), 🟢 at `1028239`

**Why it's urgent:** migration 106 is live on prod and drops the
patient's whole-row read. Until this ships, prod /my-appointments and
pending-confirmation show nothing (I saw it: pending-confirmation listed
no requests on master during #132).

**Tested on the release Preview at `1028239`**, against the prod DB (106
applied):
- **Patient A:** linked, with a confirmed future appointment (clinic
  note "OBS-CLINICA-SECRETA-FUTURA", patient_note "Mensagem futura do
  paciente A"), a past completed one (with a clinic note) and a doctor's
  proposal (with a clinic note).
- **Patient B:** invited, not linked, with a proposal (a clinic note plus
  a patient_note) and a tentative request (a patient_note).

| Check | Result |
|---|---|
| REST as patient A: `appointments?select=notes`, `select=*`, `select=id,date,patient_note` | **200, 0 rows** each: no direct read of the table |
| `rpc/get_my_appointments` as A | 3 rows (theirs); columns include `patient_note`, **no `notes` key**; the secret appears nowhere in the payload |
| A: /my-appointments | Próximas (Confirmado; Proposta with Aceitar/Recusar and "Originalmente: …"), Histórico (Concluído). The patient's own message "Mensagem futura do paciente A" is shown. **The clinic's notes appear nowhere**, in the text or the page HTML |
| A accepts the proposal | saved: **confirmed** at the proposed 05/10 11:00 |
| B: pending-confirmation | "SUAS SOLICITAÇÕES" lists both requests (Novo horário proposto with Aceitar/Recusar; Aguardando confirmação); no clinic note |
| B accepts | saved: **confirmed** 05/10 14:00 |
| Clinic: schedule list (both days) | "**Mensagem do paciente:** Mensagem futura do paciente A", "…: Pedido do B com mensagem", "…: Mensagem do B"; the clinic still sees its own notes |
| Privacy §8, pt-BR and en | the new line: "…the clinic's notes on an appointment are private and never shown to the patient (a patient sees only their own…" (pt: "…as observações…") |

**Not covered here** (in the post-merge prod check):
- a fresh booking from /book with a message (the seeds wrote
  `patient_note` directly);
- "Solicitar reagendamento";
- the clinic push (not observable on a Preview).

**CI at `1028239`:** ✅. **Review: clean (7f; the head adds only the
apostrophe escape since the clean `07ea1db`).** **Merge gate: 🟢 for
`1028239`.** The branch was up to date with `release`; this docs commit
sits on top.

**#137 post-merge prod check ✅** (www.solvymed.com; Vercel prod = release
`ae855b1`, checked with `vercel inspect`). The same spec as above, with no
bypass header on prod:
- **Patient reads:** REST notes → 0 rows; `get_my_appointments` has no
  `notes` key; /my-appointments shows no clinic note (text or HTML) and
  shows the patient's own message.
- **Actions:** accepting a proposal works; pending-confirmation lists the
  requests again, and Accept works.
- **Clinic and privacy:** the clinic sees "Mensagem do paciente"; privacy
  §8 is OK.
- **Plus a fresh /book booking with a message** (a new spec,
  `opus-pr137-book`):
  - the DB has `patient_note` = the message and `notes` null;
  - the patient sees their message in /my-appointments;
  - the clinic's request card shows "Mensagem do paciente: Mensagem nova
    Opus pelo booking".
- **Not yet covered:** a patient's "Solicitar reagendamento".

## PR #139 (`chore/merge-back-137`, base master) — merge-back of #137: master's patient reads through `get_my_appointments` + Help K5 line, 🟢 at `b1e8acc`

**Why:** since migration 106, master's patient pages read nothing: I saw
an empty pending-confirmation while testing #132.

**Tested on the #139 (master) Preview at `b1e8acc`**, against the prod DB
(106 live). Both #137 specs, unchanged:
- **REST as a patient:** notes / `*` → 0 rows; `get_my_appointments` →
  own rows, no `notes` key, no clinic note anywhere.
- **/my-appointments:** Confirmado, "Novo horário proposto" (master's
  #117 label) and Concluído. The patient's own message is shown; the
  clinic's notes are absent from text and HTML. Accepting the proposal
  saves **confirmed**.
- **pending-confirmation** (an invited patient): lists both requests again,
  and Aceitar saves **confirmed**.
- **Clinic:** "Mensagem do paciente: …" on the request cards and schedule
  rows.
- **/book with a message:** `patient_note` = the message, `notes` null; the
  patient sees it; the clinic card shows "Mensagem do paciente".
- **Help K5:** pt "As observações da clínica são privadas e não aparecem
  para o paciente."; en "The clinic's notes are private and never shown to
  the patient."
- **Privacy §8** (pt/en): the line is present.

(One run had a Preview login time out for the second patient; a re-run was
clean.)

**CI at `b1e8acc`:** ✅. **Review: clean (7f).** **Merge gate: 🟢 for
`b1e8acc`.** This docs commit sits directly on top; the branch is up to
date with master.

## PR #132 (`feat/saved-locale`, base master) — pushes in each reader's saved language; the website saves its language (migration 117), 🟢 at `9c0e60a`

**Setup:**
- **Server:** a local `next dev` with my test-only Expo sink (pushes are
  logged, never sent).
- **Three runs:**
  1. before 117 existed, against the prod DB;
  2. 117's RPCs **stubbed**;
  3. **live**, once 8d applied 117 (with master merged in locally, so it
     includes #139's patient-read fix).
- **Throwaway fixtures:** a doctor ("Clínica Opus Idioma"), a secretary,
  and a patient with a tentative request. Each has a device token.

**Live (117 applied): the result that matters**
- **Saving the language:**
  - The patient saved **fr-FR** through `set_my_locale` with their own
    token, the way the app does. The website's `<SaveMyLocale>` runs only
    on the dashboard, so it covers doctors and secretaries.
  - Secretary on the English site: `set_my_locale("en")`, stored.
  - Secretary then on **/ja**: **no call**. ja isn't a push language, so
    the saved "en" isn't overwritten.
  - Doctor on pt-BR: `set_my_locale("pt-BR")`.
- **The pushes:**
  - Doctor proposes a new time → the patient's push in **French**:
    "Nouvel horaire proposé | Un nouvel horaire a été proposé : 04/10/2026
    09:30."
  - The patient accepts (pending-confirmation) → **one clinic push per
    reader:**
    - doctor: **pt-BR** "Proposta aceita | Opus Idioma Paciente aceitou o
      novo horário: 04/10/2026 09:30.";
    - secretary: **en** "Proposal accepted | … accepted the new time:
      10/04/2026 09:30." (the en date format).
- **No page errors.** `<SaveMyLocale>` calls at most once per language per
  tab session, and stores `solvymed_saved_locale` when saved.

**Before 117 (prod as it was):**
- **Fail-soft:** `set_my_locale` fails silently (no UI error), and there's
  one attempt per language per tab session.
- **Pushes as before:** the pt-BR fallback for the patient's "Novo horário
  proposto" and the clinic's "Proposta aceita".

**117 stubbed:** the same routing as live (a French patient; doctor pt-BR
+ secretary en). After I fixed my own stub (a 204 needs a null body), the
client also stored the saved language.

**Help:** C8's new sentence is `{pending:saved-locale-live}`, which is
still unmet because it also needs the app's language saving in a released
build. `help-build` output is unchanged.

**Note (from testing):** between 106 going live and #139, master's
pending-confirmation showed no requests. #132's head needed master (#139)
for the patient-accept step. This docs commit includes that master sync.

**CI at `9c0e60a`:** ✅. **Review: clean (7f).** **Merge gate: 🟢 for
`9c0e60a`.** This docs commit sits on top of a master sync (8 behind,
clean merge; it brings #139).

## PR #134 (`feat/solvyai-actions-2`, base master) — SolvyAI actions part 2: unblock, booking decision, add patient, 🟢 at `a39dbf3`

Tested by web tester 2.

**Setup:**
- **Server:** a local `next dev` at `a39dbf3` with `SOLVYAI_API_ENABLED=1`,
  `NEXT_PUBLIC_SOLVYAI_ENABLED=1` and a fake key.
- **Test-only preload:** it answers the model call with scripted Anthropic
  SSE `tool_use` turns. Ids are taken from the route's own
  `list_appointments` results. The same preload logs Expo pushes and never
  sends them.
- **Data:** the real prod DB, with throwaway fixtures (all deleted
  afterwards):
  - a doctor with a confirmed appointment, a lunch block, a tentative
    request and a doctor's proposal;
  - an invited patient with a device token.
- **Flow:** everything goes through the panel. Confirmar and Desfazer run
  the screens' own actions.

**Unblock:**
- **U1:** the card reads "Desbloquear horário | Terça-feira, 06/10/2026,
  12:00–13:00 | Motivo: Almoço Opus". Confirmar → the block row is gone.
  Desfazer → the block is re-created with the same 12:00–13:00 and reason.
- **U2:** an appointment id given as `blockId` → no card; the model is
  told it isn't a block.

**Booking decision:**
- **D1, confirming the tentative request:** status `confirmed`, the patient
  linked (`linked_patient_id` set). One push: "Consulta confirmada | Sua
  consulta foi confirmada. Observação: Até lá!". The toast shows "✓ Feito"
  with **no Desfazer**.
- **D2, confirming a proposal:** the card says "Este pedido está aguardando
  a resposta do paciente à nova proposta; só é possível recusar."
  Confirmar is **disabled**.
- **D3, declining the proposal:** status `rejected`. One push: "Pedido não
  aceito | Não foi possível aceitar o seu pedido de consulta."

**Add patient:**
- **A1, name + birth date:**
  - The card shows only Nome and Nascimento.
  - Saved with phone, email and CPF all null.
  - Desfazer → the patient row is deleted. On `next dev` the delete lands
    more than 20 s after the click (first compile of the undo); a 90 s
    poll confirmed it.
- **A2, duplicates:**
  - Same name + birth date as an existing patient → the first tool result
    returns "Possible duplicates" to the model, and no card is shown.
  - With `createAnyway` → the card lists "Parecidos já cadastrados: Opus
    Bruno Lima (01/02/1985)".
  - A name alone doesn't match. That's by design: `find_similar_patients`
    matches the same phone, or the same name + birth date, as in the form.
- **A3, a typed phone:**
  - "Cadastra a Ana 11 91234-5678" → the model saw "Cadastra a Ana
    [phone]".
  - Its `fullName: "Ana [phone]"` is refused ("That isn't a name…").
  - No card; no patient row with "phone" in the name and no phone saved.

**CI at `a39dbf3`:** ✅ (lint, typecheck + unit tests, Vercel).
**Review: clean (7f).** **Merge gate: 🟢 for `a39dbf3`.** This docs commit
sits on top of a master sync (43 behind, clean merge).

## PR #141 (`docs/flip-115-119`, base master) — Help: flip `migration-115` and `linked-bookings` (115 and 119 applied), 🟢 at `5060fd3`

**Help (the #141 Preview vs the master Preview, all 156 pages):**
- **Changed as intended:** A1 and A4, pt and en, plain and `?app=1`, each
  gain one paragraph:
  - A1: "No site também: se o paciente tiver conta no SolvyMed, ele recebe
    uma notificação quando você agenda." / "On the website too: … they get
    a notification when you book."
  - A4: "No site também: … quando você cancela (ou arquiva o paciente).
    Consultas no passado não notificam." / "On the website too: … when you
    cancel (or archive the patient). Past appointments don't notify."
- **The only other difference was K5:** the branch predated #139's K5
  privacy line. After this docs commit's master sync, the built
  `helpArticles.json` differs from master **only** by those four A1/A4
  paragraphs.
- **SolvyAI stays hidden:** `/help/c9` is 404 and no SolvyAI text is
  built (`solvyai-live` is still unmet).

**Is the new sentence true? Live check on current master** (migrations 110
and 119 applied):
- **Setup:** a local `next dev` + my Expo sink (pushes logged, never sent);
  the #131 spec run through the UI with **no app-origin booking** for
  either patient (`NO_APP_ROW=1`).
- **Doctor's website booking → linked patients:** both get the push, which
  #131 could not do before 119:
  - pt: "Nova consulta | **Clínica Opus Push marcou uma consulta para você
    em 06/10/2026 às 10:00.**"
  - th: "นัดหมายใหม่ | **Clínica Opus Push ได้นัดหมายให้คุณในวันที่ 06/10/2569
    เวลา 11:00**"
- **Status → Cancelado:**
  - pt: "Clínica Opus Push cancelou sua consulta de 06/10/2026 às 10:00.
    Para marcar outra, abra o app."
  - th: "…ถูกยกเลิกโดย Clínica Opus Push หากต้องการนัดใหม่ กรุณาเปิดแอป"
- **No push** for an unlinked patient, a past booking or cancel, a block,
  or cancelled → confirmed.
- **Archive** → one push per future appointment. **Account close** (th) →
  "…ถูกยกเลิกโดย Consultório Opus Sul" (the first-location fallback, no
  suffix).

**Closes two ⏳ rows from #131:**
- **post-119 (`linked-bookings`):** website-only linked patients now get
  the book/cancel pushes ✅ (above).
- **post-110 (the secretary names the clinic):** a secretary booking and
  cancelling on a profile-named practice **with two locations** → "**Clínica
  Opus Push** marcou…" / "…cancelou…". That's the profile name, the same as
  the doctor's ✅.

**CI at `5060fd3`:** ✅. **Review: clean (7f).** **Merge gate: 🟢 for
`5060fd3`.** This docs commit sits on top of a master sync (14 behind,
clean merge).

## PR #135 (`feat/web-reschedule`, base master) — Remarcar on the website, 🟢 at `98f1679`

Tested by web tester 2.

**Setup:**
- **Server:** a local `next dev` at `98f1679` with a test-only Expo sink
  (pushes are logged, never sent), against the prod DB.
- **Throwaway fixtures (deleted afterwards):**
  - a doctor whose practice is **profile-named** ("Clínica Opus Perfil")
    with **2 locations** ("Aaa Opus Local Norte", "Zzz Opus Local Sul"),
    open Mon–Fri 08:00–18:00;
  - a linked patient with a device token;
  - a secretary;
  - appointments in every relevant status, plus a block on Wed 17:30–19:00.

**Icons (list):**
- Scheduled, confirmed and late → **Remarcar**.
- Tentative → none.
- Absent (with or without `patient_id`) → **"Nova consulta (mesmo
  paciente)"** only, with no Remarcar.
- A confirmed row with a message shows "Mensagem do paciente: Posso chegar
  10 min antes?".

**Icons (Dia view, calendar popover):** the same icons.
- A late 45 min appointment moved from the popover keeps **45 min**.
- The no-show's book-again opens with the name pre-filled.

**The dialog:** "Remarcar consulta", with the hint "A duração e os outros
dados continuam os mesmos."

**Moves:**
- **Scheduled Tue 06/10 09:00 → Wed 07/10 09:00:** saved, 30 min kept.
  - Push: "Consulta remarcada | Clínica Opus Perfil mudou sua consulta de
    06/10/2026 às 09:00 para 07/10/2026 às 09:00."
- **The same date + time:** nothing saved, **no push**.
- **Onto another appointment:** "Este horário conflita com Opus Outro às
  10:00 (30 min). Escolha outro horário." Unchanged.
- **Wed 18:00 (blocked AND outside the hours):** ONE question, "Este
  horário está bloqueado (17:30–19:00). Este horário está fora do horário
  de atendimento (08:00–18:00). Remarcar mesmo assim?".
  - Cancelar → unchanged, no push.
  - Remarcar → saved + push "…de 07/10/2026 às 09:00 para 07/10/2026 às
    18:00."
- **Refused:**
  - 23:45 + 30 min → "Esse horário e duração ultrapassariam a
    meia-noite.";
  - a Buddhist-era year → the BE message.
- **Late 45 min → Thu 11:00:** 45 min and `late` kept.
- **A row turned `tentative` after the page loaded:** "Use o card de
  solicitação de agendamento…". Nothing moved.
- **A confirmed row moved to yesterday:** saved, **no push**.

**Book again after a no-show:**
- **With `patient_id`:**
  - The name is read-only and the patient id is carried.
  - The procedure is "Retorno Opus", 45 min.
  - Saved Thu 15:00 for the same `patient_id` (the absent row stays).
  - The normal single-booking push was sent.
- **Without `patient_id`:** the name is editable and pre-filled "Opus Sem
  Ficha"; no hidden id.

**Secretary (post-110 row):**
- The secretary moved the linked appointment.
- The push names the **profile**: "Consulta remarcada | Clínica Opus
  Perfil mudou sua consulta de 07/10/2026 às 18:00 para 08/10/2026 às
  09:00." It names neither the first location nor the doctor.
- This also closes #131's ⏳ secretary-name row for moves.

**i18n / Help / App Map:**
- The 6 new `schedule` keys are present in all 15 locales. en is
  "Reschedule" / "New appointment (same patient)"; th and es were checked
  too.
- Help A4 (pt + en) now describes the website's Remarcar icon and button,
  which match the UI labels.
- The notification note is shown now that `linked-bookings` is met.
- The app's line is `{pending:mobile#116}`.
- The App Map `move_appointment` has web = `moveAppointment`.

**CI at `98f1679`:** ✅ (lint, typecheck + unit tests, Vercel).
**Review: clean (7f).** **Merge gate: 🟢 for `98f1679`.** This docs commit
sits on top of a master sync (10 behind: #134, #141; clean merge).

## PR #136 (`feat/solvyai-move-card`, base master) — SolvyAI's move card on the website (via Remarcar), 🟢 at `06c10f7`

Tested by web tester 2.

**Setup:**
- **Server:** a local `next dev` at `06c10f7` with `SOLVYAI_API_ENABLED=1`,
  `NEXT_PUBLIC_SOLVYAI_ENABLED=1` and a fake key.
- **Test-only preload:** it scripts the model's `tool_use` turns (ids taken
  from the route's own `list_appointments`) and logs Expo pushes, never
  sending them.
- **Data:** the prod DB, with throwaway fixtures (deleted afterwards):
  - a doctor, open Mon–Fri 08:00–18:00;
  - a linked patient with a device token;
  - "Opus Outro" Tue 10:00;
  - a block Wed 12:00–13:00;
  - a no-show; a tentative request.

**Moves:**
- **Tue 06/10 09:00 → Wed 07/10 09:00:**
  - The card reads "Remarcar consulta | Paciente | De: Terça-feira,
    06/10/2026, 09:00–09:30 | Para: Quarta-feira, 07/10/2026,
    09:00–09:30".
  - Confirmar → saved, same 30 min.
  - Push: "Consulta remarcada | Clínica Opus Mover mudou sua consulta de
    06/10/2026 às 09:00 para 07/10/2026 às 09:00."
  - The page opens `/dashboard/schedule?date=2026-10-07&highlight=<id>`
    with the appointment **ringed**.
  - **Desfazer** → back to Tue 09:00. It sends a second push, "…de
    07/10/2026 às 09:00 para 06/10/2026 às 09:00." (the same as a manual
    move back).
- **Overlapping its own old slot** (09:00 → 09:15): a normal card, no
  clash.
- **Onto "Opus Outro" (10:15):** no card. "…10:00 já tem Opus Outro
  (10:00–10:30). Qual destes horários?" with chips 09:30 / 10:30 / 11:00 /
  Outro horário. The model is told to ask and never pick.
- **Into the block (Wed 12:15):**
  - The card shows "⚠ Horário bloqueado (12:00–13:00)".
  - Confirmar → "Este horário está bloqueado (12:00–13:00). Remarcar mesmo
    assim?" [Cancelar] [Remarcar].
  - Remarcar → saved, plus the push.
- **A past time:** "Esse horário já passou. Escolha outro horário."
  Confirmar is **disabled**.
  - SolvyAI is stricter here than the Remarcar dialog, which allows a past
    date without a push.
- **Refused, no card:**
  - A no-show → the model gets "offer to book this patient again".
  - A request → "answered on the request (propose_booking_decision)".
- **Slot taken between the card and Confirmar:** "Esse horário acabou de
  ser ocupado. Nada foi salvo. Qual destes horários?" with fresh chips.
  The appointment is unchanged.

**Rules / App Map:** the "no move on the website" lines are gone. Sending
Pix by WhatsApp stays app-only (knowledge rule + `send_pix` web: null).

**CI at `06c10f7`:** ✅ (lint, typecheck + unit tests).
**Review: clean (7f).** **Merge gate: 🟢 for `06c10f7`.** This docs commit
sits on top of a master sync (12 behind: #135 merged; clean merge; the
`helpArticles.json` rebuild is identical).

## PR #138 (`feat/web-recurring`, base `feat/web-reschedule`) — recurring appointments on the website, 🟢 at `b74cf4f`

Tested by web tester 2.

**Setup:**
- **Server:** a local `next dev` at `b74cf4f` with a test-only Expo sink
  (pushes are logged, never sent), against the prod DB.
- **Throwaway fixtures (deleted afterwards):**
  - a doctor, "Clínica Opus Série", open Mon–Fri 08:00–18:00;
  - a linked patient with a device token;
  - an appointment on the 3rd weekly date at 10:00;
  - a block on the 4th weekly date, 14:00–15:00.
- **Flow:** everything goes through Nova Consulta. First date: Tue
  06/10/2026.

**Form:**
- **pt-BR:** Repetir "Sem repetição / Semanal / Quinzenal / Mensal";
  "Quantas consultas" defaults to 8; the button reads "Salvar ×8", then
  "Salvar ×4" after the count changes.
- **en:** "No repeat / Weekly / Every 2 weeks / Monthly"; "Save ×N".

**Series:**
- **Weekly ×4 for the linked patient:**
  - 4 rows (06/10, 13/10, 20/10, 27/10, 11:00–11:30), each with
    `patient_auth_id`.
  - **ONE push:** "Nova consulta | Clínica Opus Série marcou 4 consultas
    para você. A primeira é em 06/10/2026 às 11:00."
- **Clash on the 3rd date:** "Em 20/10/2026: Este horário conflita com
  Opus Ocupado às 10:00 (30 min). Escolha outro horário." **0 rows
  saved.**
  - en: "On 10/20/2026: This overlaps with Opus Ocupado at 10:00 (30
    min)…"
- **Block on the 4th date:** ONE question, "Em 27/10/2026: Este horário
  está bloqueado (14:00–15:00). Agendar mesmo assim?".
  - Cancelar → 0 rows.
  - Agendar → all 4 saved.
- **Quinzenal ×3:** 06/10, 20/10, 03/11.
- **Mensal ×3 from Sat 31/10:**
  - ONE question: "Em 31/10/2026: Sábado não é dia de atendimento. Agendar
    mesmo assim?".
  - Agendar → **31/10, 01/12 (31/11 rolls over), 31/12**.
- **Outside hours** (17:45 + 30 min on every date): the question names the
  first date, "Em 06/10/2026: … fora do horário de atendimento
  (08:00–18:00)".

**Limits and single bookings:**
- **Limits** (the browser's min/max bypassed): n=1 and n=53 → "Escolha de 2
  a 52 consultas.", 0 saved. n=52 → 52 rows, 06/10/2026 to 28/09/2027.
- **A single booking is unchanged:** its overlap message names no date.
- **Other patients:** no push for the unlinked patients' series.

**Follow-up (7f: not blocking; the merged app behaves the same):**
- **The problem:** a series whose **first date is past** sends no push,
  even for its future dates.
  - Live: weekly ×3 from 22/09 → rows 22/09, 29/09, 06/10 → **0
    pushes**.
  - Control, weekly ×2 from 06/10 → 1 push.
- **UX 36's rule for the fix (both repos):**
  - One push counting only the future appointments: the single-booking
    text for 1, the series text for 2+.
  - No push when none are in the future.

**CI at `b74cf4f`:** ✅ (lint, typecheck + unit tests, Vercel).
**Review: clean (7f).** **Merge gate: 🟢 for `b74cf4f`.** This docs commit
sits directly on top; the branch is up to date with its base.

## PR #140 (`feat/solvyai-series`, base master) — SolvyAI's series card on the website, 🟢 at `755fe42`

Tested by web tester 2.

**Setup:**
- **Server:** a local `next dev` at `755fe42` with `SOLVYAI_API_ENABLED=1`,
  `NEXT_PUBLIC_SOLVYAI_ENABLED=1` and a fake key.
- **Test-only preload:** it scripts the model's `tool_use` turns
  (`find_patients` → `propose_book_appointment` with `repeat`) and logs
  Expo pushes, never sending them.
- **Data:** the prod DB, with throwaway fixtures (deleted afterwards):
  - a doctor, open Mon–Fri 08:00–18:00;
  - a linked patient with a device token, and an unlinked patient;
  - "Opus Ocupado" Tue 20/10 10:00;
  - a block Tue 27/10 14:00–15:00.
- **Earlier run:** a first run at `81ab667` stopped at login (a harness
  flake). The src delta to `755fe42` is only `helpArticles.json`.

**Series:**
- **Weekly ×3:**
  - The card shows "Repetir | Semanal, 3 consultas (até 20/10/2026)".
  - Confirmar → 3 rows (06/10, 13/10, 20/10).
  - ONE push: "Clínica Opus Série IA marcou 3 consultas para você. A
    primeira é em 06/10/2026 às 11:00."
  - The toast is "✓ Feito" with **no Desfazer**.
- **Weekly ×4 with a clash on the 3rd date:** no card. "Terça-feira,
  20/10/2026 às 10:00 já tem Opus Ocupado. Nada foi salvo. Como prefere
  seguir?" with only "Outro horário". The model is told to ask and never
  pick. 0 rows.
- **Weekly ×4 with a block on the 4th date:**
  - The card shows "27/10/2026: ⚠ Horário bloqueado (14:00–15:00)".
  - Confirmar → "27/10/2026: Este horário está bloqueado (14:00–15:00).
    Agendar mesmo assim?" → Agendar → 4 rows.
  - No push (unlinked patient).
- **Bad repeats** (count 1, count 53, every "day"): no card; the model gets
  "Repeat is { every: "week" | "2weeks" | "month", count: 2–52 }; ask the
  user."
- **Every 2 weeks ×2:** "A cada 2 semanas, 2 consultas (até 20/10/2026)" →
  06/10 + 20/10, one push "marcou 2 consultas…".
- **A date taken between the card and Confirmar:** "Não foi possível
  salvar." Nothing saved (none of the series' dates).

**Nit (not blocking):** a series card's same-patient warning ("já tem
consulta nesse dia às 11:00") doesn't name the date, although it can apply
to several.

**CI at `755fe42`:** ✅ (lint, typecheck + unit tests, Vercel).
**Review: clean (7f).** **Merge gate: 🟢 for `755fe42`.** This docs commit
sits on top of a master sync (1 behind: #138's merge commit, no content
change).

## #142 A clinic-booked series announces only its future dates (web tester 1, 2026-09-29)

**What was tested:** PR head `dd58b72`, on a local `next dev` with the Expo
push sink.
- **The fix commit:** `5a96210`. It's identical at `dd58b72`
  (`git range-diff`: `=`).
- **Earlier run:** the same run at `5a96210` gave the same results.
- **Setup:** a linked patient with a device token (user_roles
  linked_patient_id + patient_connections + push_tokens), booked from
  Agenda → Nova Consulta → Repetir.
- **Clinic clock:** today 29/09/2026, 11:13 BRT.
- **Covers UX 36's rule:** one push counting only the future
  appointments. The single-booking text for 1, the series text for 2+, no
  push when none are in the future.

| Case | Rows | Push to the patient |
|---|---|---|
| Weekly ×4 from 22/09 08:00 (22/09, today 08:00 = past, 06/10, 13/10) | 4 | ✅ one: "Clínica Opus Futuro marcou 2 consultas para você. A primeira é em 06/10/2026 às 08:00." |
| Weekly ×3 from 22/09 09:00 (only 06/10 ahead) | 3 | ✅ one, the single text: "…marcou uma consulta para você em 06/10/2026 às 09:00." |
| Weekly ×2 from 15/09 10:00 (all past) | 2 | ✅ none |
| Weekly ×2 from today 16:00 (later today counts as future) | 2 | ✅ "…marcou 2 consultas… A primeira é em 29/09/2026 às 16:00." |
| Weekly ×3 from 06/10 11:00 (all future: unchanged) | 3 | ✅ "…marcou 3 consultas… A primeira é em 06/10/2026 às 11:00." |
| Single booking 01/10 12:00 (unchanged) | 1 | ✅ "…marcou uma consulta para você em 01/10/2026 às 12:00." |
| Single booking 28/09 12:00 (past: unchanged) | 1 | ✅ none |

**Also checked:**
- **Tester 2's repro** (weekly ×3 from last week) now gets its push; before
  the fix it got 0.
- **Unit tests:** clinic-notify + create-series pass, 11/11 (vitest exit
  0).
- **SolvyAI's series card (#140, now on master)** books through the same
  `createAppointment`, so it gets the fix too. SolvyAI refuses past start
  times, so its series never start in the past.

**Master sync:** master (#140) merged in under this docs commit. The merge
was clean, with no change to this PR's code.
**Review: clean (7f, `5a96210` / `dd58b72`).** **Merge gate: 🟢 for
`dd58b72`.**

## #143 Alterar senha on the website (web tester 1, 2026-09-29)

**What was tested:** PR head `a8dc0d8`, on its Vercel Preview (Playwright).
- **Accounts:** throwaway doctors (pt-BR and en) and a secretary (pt-BR),
  each signed in on two browsers:
  - A changes the password;
  - B is "another device";
  - a third session exists only through the API.
- **Where it shows:** Configurações → **Alterar senha** sits above Excluir
  conta for the doctor. For the secretary it sits after Sair da clínica and
  Tour guiado, above Excluir conta. The en card says **Change password**.

| Row | pt-BR (doctor + secretary) | en (doctor) | Auth calls |
|---|---|---|---|
| All fields empty | ✅ "Preencha todos os campos." | ✅ "Please fill in all fields." | none |
| New ≠ confirm | ✅ "As senhas não coincidem." | ✅ "Passwords do not match." | none |
| 7 characters | ✅ "A senha deve ter pelo menos 8 caracteres." | ✅ "…at least 8 characters." | none |
| New = current | ✅ "A nova senha deve ser diferente da senha atual." | ✅ "New password must differ…" | none |
| Wrong current | ✅ "Sua senha atual está incorreta." The old password still signs in; the new one doesn't. | ✅ "Your current password is incorrect." | 1 sign-in only; no update |
| Cancelar, then reopen | ✅ the fields and the error are cleared | ✅ | — |
| Success | ✅ "Senha alterada com sucesso! As sessões nos outros aparelhos foram encerradas." The form closes. | ✅ "Password changed successfully! …" | sign-in, then update, then logout (others) |

**After success (all 3 runs):**
- **Passwords:** the old one is refused (400) and the new one signs in
  (200).
- **This browser (A)** stays signed in: reloading Settings stays on
  Settings.
- **The other browser (B)** is signed out: Settings and /dashboard both go
  to /auth/login.
- **The API session** is ended too: its refresh fails with 400, and /user
  with its old access token returns 403.
- **A fresh sign-in** with the new password reaches /dashboard.

**Help and strings:**
- **Help K2** (/help/k2 and /pt-BR/help/k2) shows the new website note:
  - "No site: Configurações → Alterar senha: digite a senha atual e a
    nova (duas vezes). As sessões nos outros aparelhos são encerradas;
    este navegador continua conectado."
  - The en page matches.
- **Locales:** the `changePassword` namespace has all 14 keys in all 15
  locales (Thai included), and `tooShort` keeps `{min}`.

**Master sync:** master (#142) merged in under this docs commit. The merge
was clean, with no change to this PR's code.
**Review: clean (7f, `a8dc0d8`).** **Merge gate: 🟢 for `a8dc0d8`.**

## PR #144 (`feat/privacy-additions`, base master) — privacy policy additions for SolvyAI and LINE, gated on `solvyai-live` / `line-live`, 🟢 at `fc85fd4`

Tested by web tester 2.

**Today's pages are unchanged** (the Vercel Preview at `fc85fd4` vs the
master Preview, with the bypass header):
- `/pt-BR/privacy`, `/privacy`, `/pt-BR/terms` and `/terms` all return 200,
  and their main text is **identical** to master (137 / 61 lines).
- Anthropic, SolvyAI, LY Corporation and LINE are **not visible** on any of
  them.
- **The page source has none of #144's own strings** (0 on the PR, 0 on
  master): "LY Corporation", "6b. SolvyAI", "processados pela Anthropic" /
  "processed by Anthropic", "identidade tailandesa" / "Thai ID numbers",
  "Japão / Tailândia" / "Japan / Thailand", "6c.", "Desconectar".
  - The plain words Anthropic / SolvyAI / LINE in the raw HTML come from the
    next-intl bundle and are on master too.
  - "90 dias" / "90 days" appear 4× on both (existing text).
- **Gating:** `page.tsx` reads `conditionMet("solvyai-live" / "line-live")`
  server-side (both unmet).
  - The `c62a169` → `fc85fd4` delta (the LINE row, §6c bullets,
    "Desconectar", condition text) is entirely inside `{line && …}` /
    `...(line ? …)`.

**Policy = what runs**, for the gated §6b text, checked against the code:
- **"CPF and Thai ID numbers, phones and emails are masked":**
  `lib/assistant/mask.ts` masks email, CPF, 13-digit Thai ID and phone
  shapes. Passports aren't masked and aren't claimed.
- **"Never reads records, prescriptions, exams or files":** the server tools
  are `find_patients`, `list_appointments`, `find_free_slots` and the
  `propose_*` cards. None reads clinical tables.
- **"A 👍/👎 is recorded only as a vote":** the panel sends
  `track("solvyai_feedback", { vote })` and nothing else.
- **"Conversations aren't kept":** the assistant route has no insert.

**CI at `fc85fd4`:** ✅ (lint, typecheck + unit tests incl.
`privacy-gated.test.tsx`, Vercel).
**Review: clean (7f).** **Merge gate: 🟢 for `fc85fd4`.** This docs commit sits on top of a master sync (7 behind: #142, #143; clean merge).

## #145 (release) /subscribe?success=1 says "activated" only once the plan is on (web tester 1, 2026-09-29)

**What was tested:** PR head `1c89b62` (base `release`), on its Vercel
Preview (Playwright), with a throwaway doctor per row.
- **No Stripe checkout.** A service-role PATCH on `professionals`
  simulates the webhook's write: `subscription_status = 'active'` and
  `current_period_end` = +30 days.
- `subscription_id` stays null, so the page makes no Stripe call.

| Row | Result |
|---|---|
| R1 trial → ?success=1; the "webhook" lands at +8 s | ✅ "Pagamento recebido! Ativando sua assinatura…", with a spinner (aria-busy). At +12 s it shows "Assinatura ativada! Boas-vindas ao SolvyMed Pro." Polls: 2, then they stop. |
| R2 trial, no webhook | ✅ "Ativando…" until about 30 s, then "Recebemos seu pagamento, mas a ativação está demorando. … fale com o suporte: support@solvymed.com" (a mailto link). 8 polls, about every 3.5 s on the Preview, then none. The row stays trial. |
| R3 already active → ?success=1 | ✅ "Assinatura ativada!" on load, with 0 polls |
| R4 lifetime → ?success=1 | ✅ "Assinatura ativada!" on load, with 0 polls |
| R5 status active but the period ended 2 days ago | ✅ fails closed: "Ativando…", then the slow text. Never "ativada". |
| R6 trial ended (expired) | ✅ "Ativando…", then the slow text |
| R7 en, the "webhook" at +6 s | ✅ "Payment received! Activating your subscription…", then "Subscription activated! Welcome to SolvyMed Pro." at +8 s |
| R8 en, no webhook | ✅ "We received your payment, but activation is taking longer than usual. … contact support: support@solvymed.com" |
| While ?success=1 (R1–R8) | ✅ no subscribe button (no second checkout), and no trial text |
| R9 without ?success=1 (unchanged) | ✅ Trial: the trial text plus **Assinar com Cartão**. Active: bounced to /pt-BR/dashboard. |

**Also checked:**
- **Locales:** `activationPending` and `activationSlow` are in all 15
  locales (Thai included).
- **CI at `1c89b62`:** ✅ (lint, typecheck + unit tests, Vercel).

**Not covered here:** the real Stripe webhook landing, since its endpoint
URL fix is Vitor's dashboard change. After merge, the prod check will be
the same rows on www with a DB flip; no checkout.
**Review: clean (7f).** **Merge gate: 🟢 for `1c89b62`.** The branch was
up to date with `release`; this docs commit sits on top.

## #146 Merge-back of release #145 into master (web tester 1, 2026-09-29)

**What was tested:** PR head `4528f4b`, on its Vercel Preview, using
#145's spec with the same service-role flip and no checkout.

| Row | Result |
|---|---|
| Trial → ?success=1; the "webhook" at +8 s | ✅ "Ativando…" with the spinner, then "Assinatura ativada!" at +11 s |
| Trial, no webhook | ✅ the slow text + the support@solvymed.com mailto at about 30 s |
| Already active → ?success=1 | ✅ "ativada" on load |
| en, the "webhook" at +6 s | ✅ "Payment received! …", then "Subscription activated! …" |
| Without ?success=1 (unchanged) | ✅ Trial: the trial text plus **Assinar com Cartão**. Active: /pt-BR/dashboard. |
| **Master's plan-load error** (no `professionals` row, so the country lookup fails and there's no plan), without ?success=1 | ✅ "Não foi possível verificar o status da sua assinatura. Tente novamente.", with no subscribe button |
| Same, with ?success=1 | ✅ "Ativando…" only; no plan error and no button (success=1 wins, as in the merged condition) |

**#145 prod check (release `ec33299` on www, Ready):** ✅. The same 10 rows
as #145's entry, with a DB flip and no checkout:
- the flip → "ativada" about 3 s later;
- no webhook → the slow text at about 30 s, and then polling stops;
- active or lifetime → activated at once;
- lapsed or expired → never "ativada";
- en matches;
- no subscribe button while success=1.

**CI at `4528f4b`:** ✅. **Review: clean (7f).** **Merge gate: 🟢 for
`4528f4b`.** The branch was up to date with master; this docs commit sits
on top.

## PR #147 (`feat/web-patient-files`, base master) — exams and files on the website (Help P7), 🟢 at `6681b0a`

## PR #150 (`feat/web-prescription-pdf`, base master) — print / save a prescription as PDF on the website (Help P6), 🟢 at `29b90ee`

Tested by web tester 2.

**Setup:**
- **Where:** Vercel Preview (Playwright, Chromium) against the prod DB.
- **Fixtures:** a throwaway doctor and two patients, with throwaway 1-KB
  PNG / PDF files only (no real data), plus a throwaway secretary.
- **Purge:** 8d purges the doctors afterwards (files = clinical history).
- **Backdating:** for the >24 h row, 8d backdated one object
  (`exams/hemograma-opus.pdf`) to −2 days, guarded to this fixture.

**Tabs and upload (tested at `48ec09a`; `6681b0a` only changes `open()` + the UUID guard):**
- **Doctor:** tabs "Informações · Registros · Receitas · **Exames** ·
  **Arquivos** · Consultas · Registro de acessos". The secretary sees only
  "Informações · Consultas".
- **Upload:** PNG + PDF into Exames → `<prof>/<pat>/exams/…`, and into
  Arquivos → `<prof>/<pat>/…`, listed with the date and size.
- **The same name twice:** "raio-x opus (2).png". Nothing is overwritten
  (storage has both).
- **Rejected:**
  - a `.txt` → "Escolha uma foto ou um PDF.";
  - a 51 MB PDF → "O arquivo é grande demais (máximo 50 MB)."
- **Remover within 24 h:** confirm → the object is deleted from storage, no
  hide dialog.
- **Archived patient** (via "Arquivar cadastro"): only "Abrir"; no Enviar,
  no Remover.
- **Access log:** opening writes `record_access_log` kind `file` with the
  path.
- **en:** the tabs are "Exams / Files / Access log".

**Opening a file, re-tested at `6681b0a`:**
- **My finding at `48ec09a`** (7f: BLOCKING): `window.open(…, "noopener")`
  returned null, so "Abrir" replaced the app tab with the signed URL and
  left an about:blank tab. It's fixed.
- **Abrir:** a new tab opens the signed URL (HTTP 200) with
  `window.opener === null`. The app tab stays on
  `/pt-BR/dashboard/patients/<id>`.
- **Pop-ups blocked** (`window.open` → null): "O navegador bloqueou a nova
  aba. Permita pop-ups para o SolvyMed e tente de novo." No navigation.
- **Failed link** (the object deleted behind the page): "Algo deu errado.
  Tente novamente." The blank tab is closed (1 tab before and after).

**Hiding an older file** (the backdated PDF):
- Remover → "Remover arquivo: hemograma-opus.pdf | Já se passaram mais de 24
  horas desde o envio, então o arquivo é ocultado em vez de excluído.
  Informe o motivo."
- An empty reason → "Informe um motivo." (the dialog stays).
- With a reason → gone from the list; "Arquivos removidos (1)" →
  "hemograma-opus.pdf removido em 29/09/2026 por Dra Opus Arquivos: [TEST]
  exame duplicado", with **no Abrir**. The object stays in storage.
- **Nit (copy):** the reason field is labelled "Motivo da correção"
  (borrowed from record corrections). "Motivo" alone would fit a file
  removal.

**CI at `6681b0a`:** ✅ (lint, typecheck + unit tests, Vercel).
**Review: clean (7f).** **Merge gate: 🟢 for `6681b0a`.** This docs commit sits on top of a master sync (6 behind; clean).

## PR #149 (`feat/settings-subscription`, base master) — Configurações → Assinatura with "Gerenciar assinatura", 🟢 at `0c92dc2`

Tested by web tester 2.

**Setup:**
- **Where:** the Vercel Preview (Playwright) against the prod DB, with a
  throwaway doctor and secretary (deleted afterwards).
- **The active row:** a real **Stripe TEST** subscription made through the
  API.
  - The customer has `pm_card_visa`, the price is R$ 89/month, and
    `metadata.user_id` = the doctor, as the portal route requires.
  - `professionals` is set to `stripe` / that id / `active` (what the
    webhook would write).
  - The subscription is cancelled and the customer deleted afterwards.

- **Where:** the Vercel Preview (Playwright, Chromium) against the prod DB.
- **Doctor:** the #147 fixture doctor, already on 8d's purge list.
- **Prescriptions:** created as that doctor, with its own token.
  - Items can only be added by the author within 24 h (097).
  - The correction was made through `add_prescription_correction`, the
    real path.
- **Template:** a `prescription` template with `#7c3aed` / `#ea580c`, a
  header, a footer and an https logo.
- **Other accounts:** the secretary and the "other doctor" are fresh and
  were deleted.

**Results:**

| Row | Result |
|---|---|
| Trial (15 days) | ✅ "Assinatura: Teste grátis: faltam 15 dias" + "Ver o plano" → `/pt-BR/subscribe` |
| Trial ending in 25 h | ✅ "faltam 2 dias" (rounded up), link shown |
| Active Stripe sub | ✅ "Plano Pro · ativo" + **Gerenciar assinatura** → `billing.stripe.com/p/session…`. The portal's return link is `/pt-BR/dashboard/settings`, and following it lands back on Configurações (not /subscribe) |
| Lifetime | ✅ "Plano Pro · vitalício", no button |
| Expired | ✅ Configurações isn't reachable: the existing gate sends them to `/pt-BR/subscribe` ("Seu período de teste encerrou. Assine para continuar."). The card's "Nenhuma assinatura ativa" state isn't shown in this case |
| Secretary | ✅ no Assinatura card (no status line, no plan / manage buttons) |
| en / th | ✅ "Subscription · Free trial: 2 days left · See the plan"; "การสมัครสมาชิก · ทดลองใช้ฟรี: เหลืออีก 2 วัน" |

**CI at `0c92dc2`:** ✅ (lint, typecheck + unit tests, Vercel).
**Review: clean (7f).** **Merge gate: 🟢 for `0c92dc2`.** This docs commit sits on top of a master sync (3 behind; clean).

## #148 (release) Stripe webhook failures reported to Sentry (web tester 1, 2026-09-29)

**What was tested:** PR head `e80517a`, locally with `next dev`.
- **Sentry:** `NEXT_PUBLIC_SENTRY_DSN` pointed at a local sink (with
  `VERCEL_ENV=preview`), so the capture is exactly what Sentry would get
  after `beforeSend`, and nothing reached Sentry.
- **Webhook secret:** a local-only `STRIPE_WEBHOOK_SECRET`, used to sign
  test events with the stripe library's `generateTestHeaderString`.
- **Stripe key:** the test-mode key from `.env.local`, for the retrieve
  calls.
- **No prod env changes, and no checkout.**
- **Leak check:** every payload carried marker strings (an email, a
  customer id, the name "Dra Vazamento Opus", the amount 98765, "4242").

| Case | Response | Sentry |
|---|---|---|
| E1 bad signature | ✅ 400 "Invalid signature" | ✅ one event, "Stripe webhook: bad_signature", level error, tag `stripe_webhook_failure=bad_signature`, fingerprint [stripe-webhook, bad_signature] |
| E2 no stripe-signature header | 400 "No signature" | none (this path returns before the report; see the note) |
| E3 valid, an unhandled type (customer.created) | ✅ 200 | ✅ none |
| E4 valid checkout.session.completed, unpaid | ✅ 200 | ✅ none |
| E5 valid invoice.payment_failed, no subscription | ✅ 200 | ✅ none |
| E6 valid customer.subscription.updated; Stripe answers 404 on retrieve | ✅ 500 "Could not fetch subscription" | ✅ one "Stripe webhook: sync_failed", tags `stripe_event_type=customer.subscription.updated` + `stripe_event_id` |
| E7 valid checkout, paid, with a sub that can't be retrieved | ✅ 500 | ✅ one sync_failed, tags type `checkout.session.completed` + id |

**What Sentry got:**
- **Marker strings:** none of them, and no `stripe-signature` / `v1=` /
  whsec / cookie. `request` is only `{url, method}`, with no body.
- **Note (not blocking; for 7f/UX):** the two sync_failed events carry a
  Sentry **breadcrumb** of the failing Stripe API call, e.g.
  `https://api.stripe.com/v1/subscriptions/sub_… (404)`.
  - So the **Stripe subscription id** is in the event, as well as the
    event id in the tags.
  - It's a pseudonymous id, not an email, name or amount. It isn't in the
    PR's "type + id only" wording, though.
- **Not covered:**
  - a missing signature header (E2) isn't reported;
  - `handler_threw` and `no_professional_row` weren't forced. The second
    needs a live test-mode subscription for a user with no row.
- **The success path with a real subscription** (sync writes active → 200,
  no event) isn't run here. It would need a Stripe test subscription or a
  checkout. E3–E5 cover "200 → no event".

**Release sync:** release (#145) merged in under this docs commit. The
merge was clean, with no change to this PR's code.
**CI at `e80517a`:** ✅. **Review: clean (7f).** **Merge gate: 🟢 for
`e80517a`**, with the breadcrumb note for 7f/UX to decide.

**#148 prod check (www, release `6e90d70`, Ready):** ✅.
- A POST with a bad `stripe-signature` → 400 "Invalid signature"; no
  header → 400 "No signature".
- That bad-signature POST (about 15:40 UTC 2026-09-29) makes one real
  "Stripe webhook: bad_signature" event in prod Sentry. It's this test,
  not a Stripe problem; 7f and e7 were told.

## #151 Merge-back of release #148 into master (web tester 1, 2026-09-29)

**What was tested:** PR head `eba558c`.
- **The code:** the webhook route is identical to release's. Only the
  comment in `stripeWebhookReport.ts` changed; it now says what Sentry
  receives, including the Stripe API path breadcrumb.
- **The run:** #148's local run, repeated at `eba558c`: local `next dev`,
  the DSN pointed at a local sink, a local-only webhook secret with signed
  test events.

| Case | Result |
|---|---|
| Bad signature | ✅ 400 + one "Stripe webhook: bad_signature" event |
| No signature header | ✅ 400, no event |
| Valid unhandled / unpaid checkout / invoice with no subscription | ✅ 200, no event |
| Valid subscription.updated or paid checkout whose subscription 404s | ✅ 500 + one sync_failed, tagged with the event type and id |
| The marker strings (email, customer, name, amount, card) | ✅ none in what Sentry got |

**Master sync:** master (#147, #149) merged in under this docs commit.
There was a conflict in TESTING-WEB.md only: master's block comes first,
then #148's, and nothing was dropped.
**Review: clean (7f).** **Merge gate: 🟢 for `eba558c`.**

| Receitas tab | ✅ each prescription has a **PDF** link (aria "PDF da receita (imprimir ou salvar)") → `…/prescriptions/<rxId>/print` |
| Print page (the corrected rx) | ✅ "Receita", the header text, the logo; PACIENTE; DATA "29/09/2026 **(corrigido)**"; the items table; the notes as text (a typed `<b>` stays text); a blank signature line over "Dra Opus Arquivos / CRM 12345/SP"; the footer. The colours applied: rgb(124,58,237) / rgb(234,88,12) |
| The correction itself | ✅ its own items and notes, not marked "(corrigido)" |
| Logo | ✅ an https logo on another host loads (naturalWidth 120), with no CSP report |
| Toolbar | ✅ "← Voltar ao paciente", "Imprimir / Salvar PDF", and the hint "Para salvar o arquivo, escolha "Salvar como PDF" na janela de impressão." |
| Print | ✅ in print media only `#print-doc` stays visible (everything else is `visibility:hidden`). The Chromium PDF is **1 page, MediaBox 594.96×841.92 (A4)**, with colours kept |
| Scoping | ✅ the rx under another patient's id → 404; an unknown rx id → 404 |
| Secretary of the practice | ✅ 404 |
| Another doctor | ✅ 404 |
| Access log | ✅ `record_access_log` kind `prescription`, `object_ref` = the rx id, one per view |

**Nit (not blocking, same builder as the app):** the template's accent
colour is used as a **solid** background for the alternate table row and
the notes box. With a strong accent (`#ea580c`), the grey "Observações"
text on it is hard to read. A tint of the accent, or dark text, would keep
it legible.

**CI at `29b90ee`:** ✅ (lint, typecheck + unit tests, Vercel).
**Review: clean (7f).** **Merge gate: 🟢 for `29b90ee`.** This docs commit sits directly on the PR head. The branch is 8 behind master, and a master merge conflicts in code (app-map.ts + the 15 message files), so e7 syncs it.

## PR #157 (`feat/tour-try-solvyai`, base master) — the tour's SolvyAI step gets "Experimentar agora", 🟢 at `70858a7`

Tested by web tester 2.

**Setup:**
- **Server:** a local `next dev` at `70858a7` with `SOLVYAI_API_ENABLED=1`,
  `NEXT_PUBLIC_SOLVYAI_ENABLED=1` and a fake key.
- **Test-only preload:** it answers the model call with scripted text.
- **Accounts:** a fresh throwaway doctor per variant, so the tour opens on
  the first dashboard visit.

| Row | Result |
|---|---|
| The button | ✅ step 1 of 9 has no "Experimentar agora"; step **2 of 9** (SolvyAI) has it, next to Pular tour / Voltar / Próximo |
| Experimentar agora | ✅ the tour closes and the SolvyAI panel opens. It sends **"O que o SolvyAI pode fazer?"** by itself (the model request's last message is exactly that) and shows the answer, with 👍/👎 |
| ✕ on the panel | ✅ "**Continuar o tour? (passo 3 de 9)**" · Dispensar · Continuar, i.e. the step AFTER SolvyAI |
| Continuar | ✅ the tour resumes at **3 de 9** |
| Dispensar | ✅ after a reload, no tour and no resume offer |
| Console | ✅ no errors in either run |
| Strings | ✅ `tour.tryNow` / `tryNowQuestion`: en "Try it now" / "What can SolvyAI do?"; th "ลองใช้เลย" / "SolvyAI ทำอะไรได้บ้าง" |

**CI at `70858a7`:** ✅. **Review: clean.** **Merge gate: 🟢 for `70858a7`.** This docs commit sits directly on the PR head. The branch is 5 behind master, and a master merge conflicts in content/help/04-configuracoes.md, so the web dev syncs it.
