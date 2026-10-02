import { LOCALES, isProductionHost, expect, expectNo12h, expectNoRawKeys, gotoIn, test } from "./harness";

// Public pages in every shipped language: they load, carry the language,
// show no raw message keys, no 12-hour times and no console errors. No
// account or fixture needed.
const PAGES = ["/", "/pricing", "/founders", "/privacy", "/terms", "/auth/login", "/auth/signup", "/auth/forgot-password"];

for (const locale of LOCALES) {
  test.describe(`public pages (${locale.code})`, () => {
    for (const path of PAGES) {
      test(`${path} loads`, async ({ page, consoleErrors }) => {
        const res = await gotoIn(page, locale, path);
        expect(res?.status(), `${locale.prefix}${path}`).toBeLessThan(400);
        await expect(page.locator("html")).toHaveAttribute("lang", locale.code);
        await page.waitForLoadState("networkidle");
        await expectNoRawKeys(page);
        await expectNo12h(page);
        expect(consoleErrors, `console errors on ${locale.prefix}${path}`).toEqual([]);
      });
    }

    test("the sign-in form is there", async ({ page }) => {
      await gotoIn(page, locale, "/auth/login");
      await expect(page.getByTestId("login-email")).toBeVisible();
      await expect(page.getByTestId("login-password")).toBeVisible();
      await expect(page.getByTestId("login-submit")).toBeEnabled();
    });
  });
}

// Plain HTTP checks: the bypass header goes only to a Preview host.
function headersFor(baseURL: string | undefined): Record<string, string> {
  const host = new URL(baseURL ?? "http://localhost:3000").host;
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return secret && !isProductionHost(host) ? { "x-vercel-protection-bypass": secret } : {};
}

test("a retired language redirects for good (308) to English", async ({ request, baseURL }) => {
  const res = await request.get("/es/privacy", { maxRedirects: 0, headers: headersFor(baseURL) });
  expect(res.status()).toBe(308);
  expect(new URL(res.headers()["location"], baseURL).pathname).toBe("/privacy");
});

for (const file of ["assetlinks.json", "apple-app-site-association"]) {
  test(`/.well-known/${file} is JSON with no redirect`, async ({ request, baseURL }) => {
    const res = await request.get(`/.well-known/${file}`, { maxRedirects: 0, headers: headersFor(baseURL) });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    await expect(res.json()).resolves.toBeTruthy();
  });
}
