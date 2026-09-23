import { test, expect } from "@playwright/test";
import { login, requireEnv } from "./helpers/login";

// Mirrors the mobile Maestro flow .maestro/patient-request-reschedule.yaml.
// Precondition (seed data): PATIENT_EMAIL already has a "confirmed" or
// "scheduled" appointment with a professional who has open slots in the
// next 14 days. This flow does not book that appointment itself — see
// TESTING-WEB.md "Not covered yet".
test("patient requests a reschedule on a confirmed appointment", async ({ page }) => {
  const email = requireEnv("PATIENT_EMAIL");
  const password = requireEnv("PATIENT_PASSWORD");

  await login(page, email, password);
  await page.goto("/my-appointments");

  const card = page
    .getByTestId("appointment-card")
    .filter({ has: page.getByTestId("reschedule-request-button") })
    .first();
  await expect(card, "no reschedulable appointment found for this patient — check seed data").toBeVisible();

  await card.getByTestId("reschedule-request-button").click();

  const dialog = page.getByTestId("reschedule-dialog");
  await expect(dialog).toBeVisible();

  // Pick the first day chip (tomorrow). If that day has no open slots the
  // test fails here — see TESTING-WEB.md "Not covered yet" re: multi-day
  // fallback, same open question as the mobile flow.
  await dialog.getByTestId("reschedule-day-chip").first().click();

  const slot = dialog.getByTestId("reschedule-slot-chip").first();
  await expect(slot, "no available slots for the selected day").toBeVisible({ timeout: 10_000 });
  await slot.click();

  await dialog.getByTestId("reschedule-submit-button").click();
  await expect(dialog).toBeHidden();

  await expect(card.getByTestId("appointment-status-badge")).toHaveText("Reschedule Pending");
});
