import { test, expect } from "@playwright/test";
import { login, requireEnv } from "./helpers/login";

// Tests the decline path for a patient-initiated reschedule request.
// Self-contained: creates its own reschedule request (patient step) then
// declines it (doctor step) — does NOT depend on prior specs having run.
// Precondition: PATIENT_EMAIL must have at least one confirmed appointment
// with a professional who has open slots in the next 14 days.
test("professional declines a patient-initiated reschedule request", async ({ page }) => {
  const patientEmail = requireEnv("PATIENT_EMAIL");
  const patientPassword = requireEnv("PATIENT_PASSWORD");
  const doctorEmail = requireEnv("DOCTOR_EMAIL");
  const doctorPassword = requireEnv("DOCTOR_PASSWORD");

  // ── Step 1: patient submits a reschedule request ────────────────────────
  await login(page, patientEmail, patientPassword);
  await page.goto("/my-appointments");

  const card = page
    .getByTestId("appointment-card")
    .filter({ has: page.getByTestId("reschedule-request-button") })
    .first();
  await expect(card, "no reschedulable appointment found — check seed data").toBeVisible();

  await card.getByTestId("reschedule-request-button").click();

  const dialog = page.getByTestId("reschedule-dialog");
  await expect(dialog).toBeVisible();

  // Pick a day chip and the first available slot.
  await dialog.getByTestId("reschedule-day-chip").first().click();
  const slot = dialog.getByTestId("reschedule-slot-chip").first();
  await expect(slot, "no available slots for the selected day").toBeVisible({ timeout: 10_000 });
  await slot.click();

  await dialog.getByTestId("reschedule-submit-button").click();
  await expect(dialog).toBeHidden();

  // ── Step 2: doctor declines the request ─────────────────────────────────
  // Log in as doctor in the same page context (a fresh login replaces the session).
  await login(page, doctorEmail, doctorPassword);
  await page.goto("/dashboard/schedule");

  const row = page
    .getByTestId("booking-request-row")
    .filter({ has: page.getByTestId("reschedule-decline-button") })
    .first();
  await expect(row, "no pending patient-initiated reschedule request found").toBeVisible();

  await row.getByTestId("reschedule-decline-button").click();

  // On success the Accept/Decline pair disappears (status reverts to confirmed).
  await expect(row.getByTestId("reschedule-decline-button")).toBeHidden({ timeout: 10_000 });
});
