import { test, expect } from "@playwright/test";
import { login, requireEnv } from "./helpers/login";

// Tests the decline path for a patient-initiated reschedule request.
// Self-contained: creates its own reschedule request (patient step) then
// declines it (doctor step) — does NOT depend on prior specs having run.
// Precondition: PATIENT_EMAIL must have at least one confirmed appointment
// with a professional who has open slots in the next 14 days.
test("professional declines a patient-initiated reschedule request", async ({ page }) => {
  // This test does two full logins plus a full reschedule-request cycle
  // before even attempting the decline — comfortably over the 30s default
  // in this environment once dev-server latency (see TESTING-WEB.md) is
  // factored in. Diagnosed by running a version of this test with a
  // dialog listener and per-step logging: the decline click itself
  // reliably succeeds (confirmed via direct DB check every time — status
  // back to "confirmed" within ~200ms server-side) but can take several
  // seconds, and total elapsed time was what tripped the default timeout,
  // not a hang.
  test.setTimeout(60_000);

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

  // Same client-side refresh race documented in
  // 01-patient-request-reschedule.spec.ts: the server action (verified via
  // direct DB check) completes correctly in well under a second, but
  // waiting on the client to observe it via the implicit post-action
  // revalidation was unreliable here too (unlike the accept path in
  // 02-doctor-respond-reschedule.spec.ts, which observed it fine — same
  // category of dev-server flakiness, just manifesting on a different
  // action this time). Force a reload instead of trusting the timing.
  await page.reload();
  await expect(page.getByTestId("reschedule-decline-button")).toBeHidden({ timeout: 15_000 });
});
