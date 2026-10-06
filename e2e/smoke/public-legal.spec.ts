import { LOCALES, expect, expectNoRawKeys, gotoIn, test } from "./harness";
import { PRIVACY_VERSION, TERMS_VERSION, legalDateLabel } from "../../src/lib/legalVersions";
import ptBR from "../../src/messages/pt-BR.json";
import en from "../../src/messages/en.json";
import th from "../../src/messages/th.json";

// The legal pages show the versions the code asks people to accept, and the
// Founders page has its form, consent and privacy notice. No fixtures. The
// Founders form is never submitted: /api/founders/apply is aborted, and the
// test fails if a POST is even attempted.

const MESSAGES = { "pt-BR": ptBR, en, th } as const;
// The policies exist in pt-BR and en; Thai readers get the English text.
const docLang = (code: string) => (code === "pt-BR" ? "pt-BR" : "en") as "pt-BR" | "en";
const updatedPrefix = { "pt-BR": "Última atualização:", en: "Last updated:" } as const;

for (const locale of LOCALES) {
  for (const [path, version] of [["/privacy", PRIVACY_VERSION], ["/terms", TERMS_VERSION]] as const) {
    test(`${path} shows version ${version} (${locale.code})`, async ({ page }) => {
      const res = await gotoIn(page, locale, path);
      expect(res?.status()).toBeLessThan(400);
      const lang = docLang(locale.code);
      await expect(page.getByText(`${updatedPrefix[lang]} ${legalDateLabel(lang, version)}`)).toBeVisible();
    });
  }

  test(`/founders: hero, counters, form, consent and notice, no submit (${locale.code})`, async ({ page, consoleErrors }) => {
    const f = MESSAGES[locale.code].founders;
    const posts: string[] = [];
    await page.route(/\/api\/founders\/apply/, (route) => { posts.push(route.request().method()); return route.abort(); });

    const res = await gotoIn(page, locale, "/founders");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1, name: f.heroTitle })).toBeVisible();

    // The places counter: "{system}: {n} of {capacity} places left" (or full).
    const left = new RegExp(f.placesLeft.replace("{system}", ".+").replace("{n}", "\\d+").replace("{capacity}", "\\d+"));
    const full = new RegExp(f.placesFull.replace("{system}", ".+"));
    const counters = page.getByText(left).or(page.getByText(full));
    expect(await counters.count(), "places counters").toBeGreaterThan(0);

    // The form: the required fields, the consent (with the rules link) and the notice.
    const form = page.locator("form").first();
    for (const name of ["full_name", "email", "phone"]) await expect(form.locator(`input[name="${name}"]`)).toHaveAttribute("required", "");
    const consentText = f.consent.replace(/<\/?rules>/g, "");
    await expect(form.getByText(consentText)).toBeVisible();
    await expect(form.getByRole("link", { name: f.consent.match(/<rules>(.*?)<\/rules>/)![1] })).toHaveAttribute("href", /\/founders\/rules$/);
    await expect(page.getByText(f.privacyNotice.slice(0, 40), { exact: false })).toBeVisible();
    await expect(form.getByRole("button", { name: f.submit })).toBeVisible();

    await expectNoRawKeys(page);
    expect(posts, "a Founders application was attempted").toEqual([]);
    expect(consoleErrors, `console errors on ${locale.prefix}/founders`).toEqual([]);
  });
}

test("/founders/rules loads in each language", async ({ page }) => {
  for (const locale of LOCALES) {
    const res = await gotoIn(page, locale, "/founders/rules");
    expect(res?.status(), `${locale.prefix}/founders/rules`).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
