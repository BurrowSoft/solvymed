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

  // The date/time line (e.g. "Sat, Sep 26, 2026 · 10:00 AM – 10:30 AM")
  // stays put even after the reschedule request lands (it shows the
  // *current* appointment time, not the proposed one — see
  // MyAppointmentsClient.tsx's `displayDate`/`displayStart`). Capture it
  // now so the card can be re-found by content after a reload, since the
  // "has reschedule-request-button" filter above stops matching the
  // instant the request succeeds (the button disappears once the card is
  // no longer reschedulable).
  const cardText = await card.innerText();
  const dateTimeLine = cardText.split("\n").find(line => line.includes(" · "));
  if (!dateTimeLine) throw new Error(`Could not find date/time line in card text: ${cardText}`);

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

  // onSuccess calls router.refresh(), but that only guarantees the mutation
  // was *submitted* — in this environment (next dev) waiting on the client
  // refresh to reflect the change proved unreliable (observed 15-30s+ before
  // the transition resolved, likely dev-mode compile/re-render latency, not
  // an app bug: the same mutation applied via direct RPC call is instant,
  // and the accept flow's own polling for the row disappearing works fine).
  // A hard reload sidesteps the race by forcing a fresh server fetch.
  await page.reload();
  const updatedCard = page
    .getByTestId("appointment-card")
    .filter({ hasText: dateTimeLine });
  await expect(updatedCard).toHaveAttribute("data-status", "proposal", { timeout: 15_000 });
});
