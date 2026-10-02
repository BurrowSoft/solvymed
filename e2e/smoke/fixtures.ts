import { expect, type Page } from "@playwright/test";

// Fixtures for the smoke suite (web tester 1's helpers, 3e). Accounts are
// created with the service role and deleted by cleanup() in afterAll.
// Everything secret comes from the environment, read only when a fixture is
// made (the public spec runs without any of it):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (fixtures and cleanup only, never in a browser)
//   E2E_PASSWORD  the throwaway accounts' password (local env / CI secret only)
//   E2E_RUN       optional; default = a fresh run tag
// Never seed medical_records / prescriptions: retention then blocks deleting
// the doctor.

function need(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k} (see e2e/smoke/README.md)`);
  return v;
}
const sb = () => need("SUPABASE_URL");
const service = () => {
  const key = need("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
};
export const password = () => need("E2E_PASSWORD");
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log("[smoke]", ...a);

// The run tag: every account this run creates carries it, and cleanup /
// purgeRun match it exactly. e2e-smoke-<run>-<tag>@burrowsoft.com, run =
// yyyymmddHHMMss + 4 random characters. Never touch other prefixes
// (e2e-test-opus-*, e2e-test-t2-*, e2e-mt1-*, e2e-mt2-*) or Vitor's accounts.
export const RUN = process.env.E2E_RUN ?? `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`;
// A reused tag must be a full one, as purgeRun requires (9a).
if (!/^\d{14}[a-z0-9]{4}$/.test(RUN)) throw new Error("E2E_RUN must be a full run tag (yyyymmddHHMMss + 4 characters)");
const PREFIX = `e2e-smoke-${RUN}-`;
export const emailFor = (tag: string) => `${PREFIX}${tag}@burrowsoft.com`;

const created: string[] = []; // user ids this run created, in order

type Res = { status: number; body: unknown };
async function parse(r: Response): Promise<Res> {
  const text = await r.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
}

// Service-role REST (fixtures and cleanup).
export async function rest(path: string, init: RequestInit = {}): Promise<Res> {
  const go = () => fetch(`${sb()}/rest/v1/${path}`, { ...init, headers: { ...service(), Prefer: "return=representation", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
  for (let i = 0; ; i++) {
    try { return await parse(await go()); } catch (e) {
      // Reads only are retried.
      if ((init.method ?? "GET") !== "GET" || i >= 3) throw e;
      await sleep(1500);
    }
  }
}

export async function mkUser(role: "professional" | "patient", tag: string, fullName: string) {
  const email = emailFor(tag);
  const r = await fetch(`${sb()}/auth/v1/admin/users`, {
    method: "POST",
    headers: service(),
    body: JSON.stringify({ email, password: password(), email_confirm: true, user_metadata: { role, platform: "web", full_name: fullName } }),
  });
  const u = (await r.json()) as { id?: string };
  if (!u.id) throw new Error(`mkUser ${tag} failed (${r.status})`);
  created.push(u.id);
  return { id: u.id, email };
}

export async function tokenFor(email: string): Promise<string> {
  const r = await fetch(`${sb()}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: need("SUPABASE_ANON_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: password() }),
  });
  const j = (await r.json()) as { access_token?: string };
  if (!j.access_token) throw new Error(`token for ${email} failed (${r.status})`);
  return j.access_token;
}

export async function rpcAs(token: string, fn: string, args: object): Promise<Res> {
  return parse(await fetch(`${sb()}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: need("SUPABASE_ANON_KEY"), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  }));
}

// Blocking rows first (they keep a doctor alive by design), then the users,
// newest first. Only what THIS run created.
export async function cleanup() {
  for (const id of [...created].reverse()) {
    for (const t of ["appointments", "procedures", "secretary_invites", "patients"]) {
      await rest(`${t}?professional_id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    }
    const r = await fetch(`${sb()}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: service() });
    if (r.status >= 300) log(`cleanup: user ${id} → ${r.status}`);
  }
  log(`cleanup: ${created.length} users (run ${RUN})`);
  created.length = 0;
}

// A killed run skips afterAll: list (and with dryRun=false delete) the
// accounts of ONE full run tag. Refuses anything shorter.
export async function purgeRun(run: string, dryRun = true) {
  if (!/^\d{14}[a-z0-9]{4}$/.test(run)) throw new Error("purgeRun needs a full run tag");
  const pre = `e2e-smoke-${run}-`;
  const hits: { id: string; email: string }[] = [];
  for (let p = 1; p < 50; p++) {
    const r = (await (await fetch(`${sb()}/auth/v1/admin/users?per_page=200&page=${p}`, { headers: service() })).json()) as { users?: { id: string; email: string }[] };
    const us = r.users ?? [];
    if (!us.length) break;
    hits.push(...us.filter((u) => u.email.startsWith(pre)));
  }
  log(`purgeRun ${run}: ${hits.length} accounts`, hits.map((h) => h.email));
  if (!dryRun) { created.push(...hits.map((h) => h.id)); await cleanup(); }
  return hits;
}

// ── Recipes (3e's smoke-fixtures.md) ──

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// A bookable doctor in Brazil: the signup trigger makes the professionals
// row and a 14-day trial; open every day 08:00–18:00.
export async function mkDoctor(tag: string, fullName = "Dra Smoke Teste", opts: { expiredTrial?: boolean } = {}) {
  const d = await mkUser("professional", tag, fullName);
  const patch: Record<string, unknown> = {
    country: "BR",
    time_zone: "America/Sao_Paulo",
    clinic_name: "Clínica Smoke",
    working_hours: Object.fromEntries(DAYS.map((k) => [k, { enabled: true, start: "08:00", end: "18:00" }])),
  };
  if (opts.expiredTrial) patch.trial_ends_at = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const r = await rest(`professionals?id=eq.${d.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  expect(r.status, "PATCH professionals").toBeLessThan(300);
  return d;
}

// A patient account linked to the doctor's record (personal invite code).
export async function mkLinkedPatient(doctor: { id: string; email: string }, tag: string, fullName = "Smoke Paciente") {
  const rec = await rest("patients", { method: "POST", body: JSON.stringify({ professional_id: doctor.id, full_name: fullName, phone: "11912345678", birth_date: "1990-05-04" }) });
  const recordId = (rec.body as { id: string }[])[0].id;
  const code = String((await rpcAs(await tokenFor(doctor.email), "generate_patient_invite_code", { p_patient_id: recordId })).body).replace(/"/g, "");
  const p = await mkUser("patient", tag, fullName);
  const linked = await rpcAs(await tokenFor(p.email), "connect_with_code", { p_code: code });
  expect(String(linked.body), "connect_with_code").toContain("personal");
  return { ...p, recordId };
}

// A date in São Paulo, n days from today, as YYYY-MM-DD.
export function spDate(n: number): string {
  return new Date(Date.now() - 3 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);
}

// The next date after `minDays` whose day of the month is > 12, so a
// day-first check can't pass by accident (28/10 vs 10/28).
export function unambiguousDate(minDays = 2): string {
  for (let n = minDays; n < minDays + 40; n++) {
    const d = spDate(n);
    if (Number(d.slice(8)) > 12) return d;
  }
  throw new Error("no date");
}

// Sign-in that survives hydration (typing before React hydrates loses the
// input). Lands wherever the app sends this account.
export async function signIn(page: Page, prefix: string, email: string) {
  await page.goto(`${prefix}/auth/login`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-testid="login-submit"]');
    return !!b && Object.keys(b).some((k) => k.startsWith("__reactProps"));
  }, null, { timeout: 120_000 });
  const emailInput = page.getByTestId("login-email");
  const passwordInput = page.getByTestId("login-password");
  // A late re-render can still empty a field after it was filled (3e: on a
  // 2nd/3rd sign-in in the same browser, the email was empty at submit).
  // Fill, then require both values to hold for a moment; re-fill if not.
  const filled = async () => {
    await expect(async () => {
      if ((await emailInput.inputValue()) !== email) await emailInput.fill(email);
      if ((await passwordInput.inputValue()) !== password()) await passwordInput.fill(password());
      await sleep(500);
      await expect(emailInput).toHaveValue(email, { timeout: 100 });
      await expect(passwordInput).toHaveValue(password(), { timeout: 100 });
    }).toPass({ timeout: 30_000 });
  };
  // Submit, then wait for the redirect away from the form; if the form is
  // still there (a field was emptied at the click), fill and submit again,
  // up to 3 times. A real sign-in error fails at once.
  for (let attempt = 1; ; attempt++) {
    await filled();
    await page.getByTestId("login-submit").click();
    const left = await page.waitForURL((u) => !/auth\/login/.test(u.pathname), { timeout: 60_000 }).then(() => true, () => false);
    if (left) return;
    // The login page's error banner (wrong password, unconfirmed, …).
    const banner = page.locator(".error-banner");
    if (await banner.count()) throw new Error(`sign-in error for ${email}: ${await banner.first().innerText()}`);
    if (attempt === 3) throw new Error(`sign-in for ${email} never left /auth/login`);
  }
}

// The dashboard tour: skip it when it's up.
export async function skipTour(page: Page) {
  const skip = page.locator("button").filter({ hasText: /Pular tour|Skip tour|ข้าม/ }).first();
  if (await skip.isVisible().catch(() => false)) {
    await skip.click().catch(() => {});
    await sleep(600);
    const yes = page.locator("button").filter({ hasText: /^(Pular|Skip|ข้าม)$/ }).first();
    if (await yes.count()) await yes.click().catch(() => {});
  }
}
