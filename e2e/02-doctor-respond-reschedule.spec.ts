import { test, expect } from "@playwright/test";
import { login, requireEnv } from "./helpers/login";

// Mirrors the mobile Maestro flow .maestro/doctor-respond-reschedule.yaml.
// Precondition: 01-patient-request-reschedule.spec.ts must run first in the
// same invocation (or otherwise leave a pending patient-initiated
// reschedule request against the same professional as DOCTOR_EMAIL) — this
// flow does not create one itself. The 01-/02- filename prefixes exist
// specifically to force that order under playwright.config.ts's
// workers: 1 / fullyParallel: false (Playwright otherwise collects spec
// files alphabetically, which used to run this one first and fail).
test("professional accepts a patient-initiated reschedule request", async ({ page }) => {
  const email = requireEnv("DOCTOR_EMAIL");
  const password = requireEnv("DOCTOR_PASSWORD");

  await login(page, email, password);
  await page.goto("/dashboard/schedule");

  const row = page
    .getByTestId("booking-request-row")
    .filter({ has: page.getByTestId("reschedule-accept-button") })
    .first();
  await expect(row, "no pending patient-initiated reschedule request found — run the patient flow first").toBeVisible();

  await row.getByTestId("reschedule-accept-button").click();

  // On success the row's accept/decline pair disappears (status moves off
  // "proposal"); on a slot-taken race the code alert()s instead — Playwright
  // auto-dismisses native dialogs, so that path just fails the assertion
  // below with the buttons still present, which is an acceptable signal for
  // now (see TESTING-WEB.md "Not covered yet" — no dedicated test for the
  // slot-taken race).
  await expect(row.getByTestId("reschedule-accept-button")).toBeHidden({ timeout: 10_000 });
});
