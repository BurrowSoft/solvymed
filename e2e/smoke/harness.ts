import { test as base, expect, type Page } from "@playwright/test";
import en from "../../src/messages/en.json";

// The smoke suite's shared setup (e7; web tester playbook ideas 1, 4, 9).
// Runs against a Preview or www: E2E_BASE_URL=<url> npx playwright test --project=smoke
// Secrets come from the environment only (never printed or committed):
//   VERCEL_AUTOMATION_BYPASS_SECRET  for SSO-protected Previews
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY  for fixtures (fixtures.ts)

// The shipped languages (country-first, 1 Oct): the URL prefix of each
// (en is unprefixed: localePrefix "as-needed").
export const LOCALES = [
  { code: "pt-BR", prefix: "/pt-BR" },
  { code: "en", prefix: "" },
  { code: "th", prefix: "/th" },
] as const;
export type Locale = (typeof LOCALES)[number];

// The bypass header is never sent to our own domains (www and apex).
export const isProductionHost = (host: string) => /(^|\.)solvymed\.com$/.test(host);

// Console errors that aren't the app's: the Vercel toolbar on Previews,
// third-party frames, the browser's own favicon miss.
const IGNORED_CONSOLE = [/vercel\.live/i, /_vercel\/insights/i, /favicon\.ico/i, /Failed to load resource: the server responded with a status of 401/i];

type Fixtures = { consoleErrors: string[] };

export const test = base.extend<Fixtures>({
  page: async ({ page, baseURL }, provide) => {
    const host = new URL(baseURL ?? "http://localhost:3000").host;
    const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    // The bypass header on the Preview host only: never sent to www or to
    // any third party.
    if (secret && !isProductionHost(host)) {
      await page.route((url) => url.host === host, (route) =>
        route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" } }),
      );
    }
    // Previews only: block Vercel's toolbar (vercel.live). Its script fires
    // same-origin OPTIONS requests that get 400 (console errors that aren't
    // ours; 3e on #330) and draws the ≡ pill over the page. www has none.
    if (!isProductionHost(host)) await page.route(/vercel\.live/, (route) => route.abort());
    // Consent answered (necessary only), so the banner never covers a step
    // and no analytics run during the smoke.
    const cookieUrl = baseURL ?? "http://localhost:3000";
    await page.context().addCookies([
      { name: "sm_consent", value: `1.00.${Math.floor(Date.now() / 1000)}`, url: cookieUrl },
    ]);
    await provide(page);
  },
  consoleErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      // By text, or by where it came from (the blocked toolbar script logs
      // its own net::ERR_FAILED).
      const from = m.location().url ?? "";
      if (m.type() === "error" && !IGNORED_CONSOLE.some((r) => r.test(m.text()) || r.test(from))) errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    await provide(errors);
  },
});

export { expect };

// Open a page in a language: the NEXT_LOCALE cookie set to match, so the
// middleware never redirects to a detected language mid-test.
export async function gotoIn(page: Page, locale: Locale, path: string) {
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale.code, url: test.info().project.use.baseURL ?? "http://localhost:3000" }]);
  const res = await page.goto(`${locale.prefix}${path}`);
  return res;
}

// A missing message renders as its key ("assistant.open",
// "patientDetail.deletePatient"): one of the messages' namespaces, a dot,
// then the key with no space. Prose ("home. Then"), domains and emails
// ("solvymed.com", "a@home.com") don't match.
const RAW_KEY = new RegExp(`(?<![@.\\w-])(?:${Object.keys(en).join("|")})\\.[a-zA-Z][\\w.]*`);
export async function expectNoRawKeys(page: Page) {
  const text = await page.locator("body").innerText();
  const m = text.match(RAW_KEY);
  expect(m?.[0], `a raw message key on ${page.url()}`).toBeUndefined();
}

// Times are 24-hour in every language (Vitor): no AM/PM anywhere.
export async function expectNo12h(page: Page) {
  const text = await page.locator("body").innerText();
  const m = text.match(/\b\d{1,2}(?::\d{2})?\s?(?:AM|PM|a\.m\.|p\.m\.)/i);
  expect(m?.[0], `a 12-hour time on ${page.url()}`).toBeUndefined();
}

// Dates are DD/MM/YYYY in every language: a known date must appear
// day-first (Thai: the Buddhist year, +543).
export function dayFirst(d: Date, locale: Locale): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear() + (locale.code === "th" ? 543 : 0);
  return `${dd}/${mm}/${yyyy}`;
}
