import { LOCALES, expect, expectNo12h, expectNoRawKeys, gotoIn, test, type Locale } from "./harness";
import ptBR from "../../src/messages/pt-BR.json";
import en from "../../src/messages/en.json";
import th from "../../src/messages/th.json";

// Doctor signup per country, in each of the country's languages, up to the
// last step BEFORE submitting. No account is ever created: every request to
// Supabase's /auth/v1/signup is aborted, and the test fails if one is even
// attempted. No fixtures, no email.
//
// The flow: /auth/signup → the country step ("Onde você está? · …") → the
// country → the role "doctor" → name, email, passwords, consent → "Create
// account" enabled. The country is carried in ?c=.

const MESSAGES = { "pt-BR": ptBR, en, th } as const;
const byCode = (code: Locale["code"]) => LOCALES.find((l) => l.code === code)!;

// Each country with the languages its doctors get (country first: the
// country's own language + English).
const CASES = [
  { country: "BR", button: /Brasil/, locales: ["pt-BR", "en"] },
  { country: "TH", button: /ประเทศไทย/, locales: ["th", "en"] },
] as const;

for (const c of CASES) {
  for (const code of c.locales) {
    const locale = byCode(code);
    const s = MESSAGES[code].auth.signup;

    test(`doctor signup ${c.country} in ${code}, up to submit`, async ({ page, consoleErrors }) => {
      const signupCalls: string[] = [];
      await page.route(/\/auth\/v1\/signup/, (route) => { signupCalls.push(route.request().url()); return route.abort(); });

      await gotoIn(page, locale, "/auth/signup");
      // The country step comes first (no ?c= yet).
      const country = page.getByRole("button", { name: c.button });
      await expect(country).toBeVisible();
      await country.click();
      await expect(page).toHaveURL(new RegExp(`[?&]c=${c.country}\\b`));
      await expect(page.getByRole("heading", { name: s.title })).toBeVisible();

      await page.getByRole("button", { name: new RegExp(s.roleDoctor) }).first().click();
      await page.locator("#signup-full-name").fill("Dra Smoke Cadastro");
      await page.locator("#signup-email").fill("e2e-smoke-signup@example.invalid");
      await page.locator("#signup-password").fill("Smoke-Only-Never-Sent-1");
      await page.locator("#signup-confirm-password").fill("Smoke-Only-Never-Sent-1");
      const boxes = page.locator('#signup-form input[type="checkbox"]');
      for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();

      const submit = page.locator('#signup-form button[type="submit"], button[type="submit"][form="signup-form"]').last();
      await expect(submit).toBeEnabled();
      await expect(submit).toHaveText(new RegExp(s.submit));
      // Stop here: never submit.

      await expectNoRawKeys(page);
      await expectNo12h(page);
      expect(signupCalls, "a signup request was attempted").toEqual([]);
      expect(consoleErrors, `console errors on ${locale.prefix}/auth/signup`).toEqual([]);
    });
  }
}

// ?c= in the link skips the country step (the landing's CTA and the
// Founders form link this way).
test("?c=TH opens the form directly, in Thai", async ({ page }) => {
  await gotoIn(page, byCode("th"), "/auth/signup?c=TH");
  await expect(page.getByRole("heading", { name: th.auth.signup.title })).toBeVisible();
  await expect(page.getByRole("button", { name: /ประเทศไทย/ })).toHaveCount(0);
});
