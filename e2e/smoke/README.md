# Smoke suite

Critical web paths, run against a Vercel Preview or www. Humans still test each PR's own steps; this catches regressions on the paths every PR could break.

| Spec | Covers | Needs fixtures |
|---|---|---|
| `public.spec.ts` | the public pages in pt-BR / en / th: load, `lang`, no raw message keys, no 12-hour times, no console errors; the sign-in form; retired languages 308 → en; the app-link files | no |
| `accounts.spec.ts` | sign-in routing in each language (doctor → dashboard, patient → my appointments, expired trial → subscribe); a linked patient books (calendar → time → type → send); the doctor confirms / proposes / declines; the patient sees the visit day-first, 24 h | yes |
| `signup.spec.ts` | doctor signup per country (BR in pt-BR + en, TH in th + en): the country step → the form → "Create account" enabled, **never submitted** (every `/auth/v1/signup` request is aborted and fails the test); `?c=TH` skips the country step | no |
| `undo.spec.ts` | the Agenda's "Desfazer" toast for each kind: a booking made through Nova Consulta, a cancel (status → Cancelado → "Cancelar consulta"), a move (Remarcar → another slot); each is undone and the database must be back as before | yes |
| `public-legal.spec.ts` | `/privacy` and `/terms` show the versions in `src/lib/legalVersions.ts` (pt-BR, en; th reads the English text); `/founders` in each language: hero, places counters, required fields, consent + rules link, privacy notice, **never submitted** (`/api/founders/apply` is aborted); `/founders/rules` loads | no |
| `payments.spec.ts` | the Agenda's payment QR per practice country: a BR doctor with a Pix key gets "QR Code Pix" (the QR + the Pix Copia e Cola code: EMV, `br.gov.bcb.pix`, the key, BRL 150.00, a CRC) on an unpaid appointment with an amount, and none when paid or without an amount; a TH doctor gets "QR พร้อมเพย์" and no Pix. Nothing is paid | yes |
| `receipt.spec.ts` | the website recibo (`/dashboard/payments/<id>/receipt`): without an amount it shows "Defina o valor da consulta antes de emitir o recibo." and **Definir valor**; saving 150 there shows the recibo with the patient and R$ 150,00 (the database checked); a TH practice gets the "numbered receipts are issued in the app" hint instead | yes |

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

### Gating a web PR

Run the whole suite against the PR's Preview before the tester row:

```sh
E2E_BASE_URL=$(node scripts/preview-url.mjs <head sha>) npm run test:smoke
```

- The specs without fixtures need no secrets except `VERCEL_AUTOMATION_BYPASS_SECRET` for the Preview: `public`, `signup` and `public-legal`.
- The fixture specs need the Supabase keys and `E2E_PASSWORD` too (below).
- **Stripe:** no spec opens Checkout or the billing portal. On a Preview built before 2026-10-06 the Stripe key is live, so never add a Stripe step without checking for `cs_test_` first.

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

- Every account is `e2e-smoke-<RUN>-<tag>@burrowsoft.com`, where RUN is the 14-digit UTC time plus 4 random characters. The global setup picks one RUN for the whole run and logs it. Each account is logged when it is created (`[smoke] created <email> = <id>`).
- **The ledger:** each created account goes at once into `test-results/smoke-created-<RUN>.json` (git-ignored; Playwright empties `test-results/` at the start of the next run).
- **Cleanup** (`afterAll`) deletes exactly what the ledger lists: blocking rows first, then the user, newest first. Each account is retried 3 times (1 s, 2 s, 4 s), and a failure never stops the others. A deleted account leaves the ledger; a failed one stays and is logged (`cleanup FAILED for user <id>`).
- **The global teardown** retries whatever the ledger still lists after the tests. Anything still failing is printed (`STILL NOT DELETED`) and stays in the ledger file.
- **The sweep** (global setup, with the service key only) deletes leftovers of earlier runs: only `e2e-smoke-<14 digits><4 characters>-<tag>@burrowsoft.com`, and only when both the run tag and the account's creation are more than 2 h old. It never touches another prefix or a run in progress. Every swept account is logged with its id.
- The global setup and teardown are config-level, so they run for every project (the `chromium` specs too). They only sweep or delete when `SUPABASE_URL` and the service key are in the environment.
- A killed run's accounts are swept by the next run after 2 h. To delete them sooner, list them with `purgeRun("<RUN>")` (a dry run), then delete them with `purgeRun("<RUN>", false)`. It refuses anything but a full run tag.
- Never touch other prefixes (`e2e-test-opus-*`, `e2e-test-t2-*`, `e2e-mt1-*`, `e2e-mt2-*`) or Vitor's accounts.
- Never seed medical records or prescriptions. Retention rules then block deleting the doctor.
- Never complete a payment on www. Opening a live Checkout and abandoning it is allowed.
