import { test, expect } from "@playwright/test";
import { login, requireEnv } from "./helpers/login";

// Mirrors the mobile Maestro flow .maestro/doctor-respond-reschedule.yaml.
// Precondition: run patient-request-reschedule.spec.ts (or otherwise have a
// pending patient-initiated reschedule request) against the same
// professional as DOCTOR_EMAIL first — this flow does not create one itself.
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
