import { expect, test } from "./harness";
import { cleanup, mkDoctor, rest, signIn, skipTour, spDate, sleep } from "./fixtures";
import pt from "../../src/messages/pt-BR.json";

// The Agenda's "Desfazer" (Undo) toast for each kind it offers: a booking, a
// cancel, a move. Each is undone and the database must be back as before.
// One throwaway BR doctor with one patient record (no patient account, no
// email); appointments are seeded through the service role, then acted on in
// the UI. Everything is deleted in afterAll.

const s = pt.schedule;
const PATIENT = "Smoke Desfazer";
let doctor: { id: string; email: string };
let patientId: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  doctor = await mkDoctor("undo", "Dra Smoke Desfazer");
  const rec = await rest("patients", { method: "POST", body: JSON.stringify({ professional_id: doctor.id, full_name: PATIENT, phone: "11912340000", birth_date: "1990-05-04" }) });
  patientId = (rec.body as { id: string }[])[0].id;
});
test.afterAll(cleanup);

const seed = async (date: string, start: string) => {
  const [h, m] = start.split(":").map(Number);
  const end = `${String(h + (m === 30 ? 1 : 0)).padStart(2, "0")}:${m === 30 ? "00" : "30"}`;
  const r = await rest("appointments", { method: "POST", body: JSON.stringify({ professional_id: doctor.id, patient_id: patientId, patient_name: PATIENT, date, start_time: start, end_time: end, duration_minutes: 30, type: "in-person", consultation_type: "Consultation", scheduled_by: "professional", payment_type: "private", status: "confirmed", payment_status: "pending" }) });
  expect(r.status, "seed appointment").toBeLessThan(300);
  return (r.body as { id: string }[])[0].id;
};
const rowsOn = async (date: string) => (await rest(`appointments?professional_id=eq.${doctor.id}&date=eq.${date}&select=id,start_time,status`)).body as { id: string; start_time: string; status: string }[];

async function openAgenda(page: import("@playwright/test").Page, date: string) {
  await page.goto(`/pt-BR/dashboard/schedule?date=${date}&view=list`);
  await page.waitForLoadState("networkidle");
  await skipTour(page);
}
// The toast: "Desfazer (N s)", disabled ("…") while the screen still loads; click it, then "Desfeito.".
async function undo(page: import("@playwright/test").Page) {
  const btn = page.getByRole("button", { name: /^Desfazer/ });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  await btn.click();
  await expect(page.getByText(s.undoDone)).toBeVisible({ timeout: 20_000 });
}

test("undo a booking", async ({ page }) => {
  const date = spDate(3);
  await signIn(page, "/pt-BR", doctor.email);
  await openAgenda(page, date);
  await page.getByRole("button", { name: /^Nova Consulta$/ }).first().click();
  const pick = page.getByPlaceholder("Comece a digitar um nome…");
  await pick.click(); await pick.pressSequentially("Smoke Des", { delay: 50 });
  await page.getByText(PATIENT).last().click();
  const cal = page.getByTestId("month-calendar");
  await cal.locator("button:not([disabled])").filter({ hasText: new RegExp(`^${Number(date.slice(8))}$`) }).first().click();
  await expect(page.getByTestId("doctor-time-grid")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await page.getByTestId("doctor-time-grid").locator("button:not([disabled])").filter({ hasText: /^\s*11:00/ }).first().click();
  await page.getByRole("button", { name: "Salvar Consulta", exact: true }).last().click();
  await expect(page.getByText(s.undoBooked)).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await rowsOn(date)).length, { timeout: 20_000 }).toBe(1);
  await undo(page);
  await expect.poll(async () => (await rowsOn(date)).length, { timeout: 20_000 }).toBe(0);
});

test("undo a cancel", async ({ page }) => {
  const date = spDate(4);
  const id = await seed(date, "10:00");
  await signIn(page, "/pt-BR", doctor.email);
  await openAgenda(page, date);
  await page.locator("select").filter({ has: page.locator('option[value="cancelled"]') }).first().selectOption("cancelled");
  await page.getByRole("button", { name: s.confirmCancel }).click();
  await expect(page.getByText(s.undoCancelled)).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await rowsOn(date)).find((r) => r.id === id)?.status, { timeout: 20_000 }).toBe("cancelled");
  await undo(page);
  await expect.poll(async () => (await rowsOn(date)).find((r) => r.id === id)?.status, { timeout: 20_000 }).toBe("confirmed");
});

test("undo a move", async ({ page }) => {
  const date = spDate(5);
  const id = await seed(date, "14:00");
  await signIn(page, "/pt-BR", doctor.email);
  await openAgenda(page, date);
  await page.getByRole("button", { name: s.reschedule }).first().click();
  // The reschedule form (its Dialog has no dialog role, so scope by the form that holds the hint).
  const form = page.locator("form").filter({ has: page.getByText(s.rescheduleHint) });
  await expect(form.getByTestId("doctor-time-grid")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await form.getByTestId("doctor-time-grid").locator("button:not([disabled])").filter({ hasText: /^\s*16:00/ }).first().click();
  await form.locator('button[type="submit"]').click();
  await expect(page.getByText(s.undoMoved)).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await rowsOn(date)).find((r) => r.id === id)?.start_time?.slice(0, 5), { timeout: 20_000 }).toBe("16:00");
  await sleep(500);
  await undo(page);
  await expect.poll(async () => (await rowsOn(date)).find((r) => r.id === id)?.start_time?.slice(0, 5), { timeout: 20_000 }).toBe("14:00");
});
