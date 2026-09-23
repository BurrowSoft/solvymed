import { Page, expect } from "@playwright/test";

/**
 * Logs in via the /auth/login form and waits for the post-login redirect
 * (patients land on /discover, professionals on /dashboard).
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/(discover|dashboard)/, { timeout: 15_000 });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing env var ${name} — export it or source .env.e2e before running the suite (see TESTING-WEB.md).`
    );
  }
  return value;
}
