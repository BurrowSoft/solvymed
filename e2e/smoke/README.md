# Smoke suite

Critical web paths, run against a Vercel Preview or www. Humans still test each PR's own steps; this catches regressions on the paths every PR could break.

| Spec | Covers | Needs fixtures |
|---|---|---|
| `public.spec.ts` | the public pages in pt-BR / en / th: load, `lang`, no raw message keys, no 12-hour times, no console errors; the sign-in form; retired languages 308 → en; the app-link files | no |
| `accounts.spec.ts` | sign-in routing in each language (doctor → dashboard, patient → my appointments, expired trial → subscribe); a linked patient books (calendar → time → type → send); the doctor confirms / proposes / declines; the patient sees the visit day-first, 24 h | yes |

## Run

```sh
# A Preview (SSO-protected: the bypass header is sent to that host only)
E2E_BASE_URL=https://<preview-host> npm run test:smoke
# One spec
E2E_BASE_URL=https://www.solvymed.com npm run test:smoke -- public.spec.ts
# The Preview URL of a commit (from GitHub's deployment statuses)
node scripts/preview-url.mjs <sha>
```

Always set `E2E_BASE_URL`, or Playwright starts a local `next dev`.

## Environment (never commit or print these)

| Variable | For |
|---|---|
| `E2E_BASE_URL` | the site under test |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Previews only; never sent to `*.solvymed.com` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | sign-in tokens for fixtures |
| `SUPABASE_SERVICE_ROLE_KEY` | creating and deleting this run's accounts only; never used in a browser |
| `E2E_PASSWORD` | the throwaway accounts' password |
| `E2E_RUN` | optional: reuse a run tag |

## Fixtures and cleanup

- **Previews and www share the production database.** `accounts.spec.ts` creates and deletes real rows there, which is why it needs the service-role key and the cleanup below.
- **No email is sent.** Accounts are created through the admin API with `email_confirm: true` (no confirmation email), and the flows the suite clicks (sign-in, booking, confirm / propose / decline) notify by push only. The seeded patient record has no email, so no patient notice can go out by email either. The `@burrowsoft.com` addresses are our own domain. Any future test that triggers an email must use `@example.invalid`, or Resend's `delivered@resend.dev` for a real send.

- Every account is `e2e-smoke-<RUN>-<tag>@burrowsoft.com`, where RUN is the 14-digit UTC time plus 4 random characters. `afterAll` deletes exactly what the run created: blocking rows first, then the users.
- A killed run leaves its accounts behind. List them with `purgeRun("<RUN>")` (a dry run), then delete them with `purgeRun("<RUN>", false)`. It refuses anything but a full run tag.
- Never touch other prefixes (`e2e-test-opus-*`, `e2e-test-t2-*`, `e2e-mt1-*`, `e2e-mt2-*`) or Vitor's accounts.
- Never seed medical records or prescriptions. Retention rules then block deleting the doctor.
- Never complete a payment on www. Opening a live Checkout and abandoning it is allowed.
