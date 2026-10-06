import ptBR from "../../src/messages/pt-BR.json";
import th from "../../src/messages/th.json";
import { expect, expectNoRawKeys, test } from "./harness";
import { cleanup, mkDoctor, rest, signIn, skipTour, sleep, spDate } from "./fixtures";
import type { Page } from "@playwright/test";

// The Agenda's payment QR, per practice country (web tester 2). A Brazilian
// practice with a Pix key: the row's "QR Code Pix" opens the QR and the Pix
// Copia e Cola code (EMV, br.gov.bcb.pix, the amount, a CRC). A Thai practice
// with a PromptPay ID: "QR พร้อมเพย์" opens the PromptPay QR. No QR on a paid
// appointment or on one without an amount. Read-only: nothing is paid or
// sent; the appointments are seeded and deleted with this run's accounts.
test.describe.configure({ mode: "serial" });

type Acct = { id: string; email: string };
const DATE = spDate(2);
let br: Acct, thd: Acct;
const ids: Record<string, string> = {};

async function patientRow(doctorId: string, name: string) {
  const r = await rest("patients", { method: "POST", body: JSON.stringify({ professional_id: doctorId, full_name: name, birth_date: "1990-05-04" }) });
  expect(r.status, "POST patients").toBeLessThan(300);
  return (r.body as { id: string }[])[0].id;
}
async function appt(doctorId: string, patientId: string, name: string, start: string, x: Record<string, unknown>) {
  const end = `${start.slice(0, 2)}:30`;
  const r = await rest("appointments", { method: "POST", body: JSON.stringify({
    professional_id: doctorId, patient_id: patientId, patient_name: name, date: DATE, start_time: start, end_time: end,
    duration_minutes: 30, type: "in-person", consultation_type: "Consultation", payment_type: "private",
    patient_auth_via_link: false, status: "confirmed", payment_status: "pending", payment_amount: 150, ...x,
  }) });
  expect(r.status, `POST appointments ${name}`).toBeLessThan(300);
  return (r.body as { id: string }[])[0].id;
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  br = await mkDoctor("paybr", "Dra Smoke Pix");
  expect((await rest(`professionals?id=eq.${br.id}`, { method: "PATCH", body: JSON.stringify({ pix_key: "smoke@example.com", clinic_city: "Sao Paulo" }) })).status).toBeLessThan(300);
  const pb = await patientRow(br.id, "Smoke Paciente Pix");
  ids.pending = await appt(br.id, pb, "Smoke Pendente", "09:00", {});
  ids.paid = await appt(br.id, pb, "Smoke Pago", "10:00", { status: "completed", payment_status: "paid" });
  ids.noAmount = await appt(br.id, pb, "Smoke Sem Valor", "11:00", { payment_amount: null });

  thd = await mkDoctor("payth", "Smoke PromptPay");
  expect((await rest(`professionals?id=eq.${thd.id}`, { method: "PATCH", body: JSON.stringify({ country: "TH", time_zone: "Asia/Bangkok", promptpay_id: "0812345678", clinic_city: "Bangkok" }) })).status).toBeLessThan(300);
  const pt = await patientRow(thd.id, "Smoke Somchai");
  ids.thPending = await appt(thd.id, pt, "Smoke Somchai", "09:00", { payment_amount: 500 });
});
test.afterAll(async () => {
  test.setTimeout(180_000);
  await cleanup();
});

async function openList(page: Page, prefix: string, email: string) {
  await signIn(page, prefix, email);
  await page.goto(`${prefix}/dashboard/schedule?date=${DATE}&view=list`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => { const b = document.querySelector("main button"); return !!b && Object.keys(b).some((k) => k.startsWith("__reactProps")); }, null, { timeout: 120_000 });
  await sleep(1500);
  await skipTour(page);
}
const row = (page: Page, id: string) => page.locator(`[data-highlight-id="${id}"]`);

test("BR: Pix QR + Copia e Cola on an unpaid appointment with an amount; none when paid or without an amount", async ({ page }) => {
  test.setTimeout(240_000);
  await openList(page, "/pt-BR", br.email);
  const s = ptBR.schedule;
  await expect(row(page, ids.pending)).toBeVisible();
  await expect(row(page, ids.paid).getByTitle(s.pixQrTitle)).toHaveCount(0);
  await expect(row(page, ids.noAmount).getByTitle(s.pixQrTitle)).toHaveCount(0);

  await row(page, ids.pending).getByTitle(s.pixQrTitle).click();
  // The Dialog component has no role="dialog": its heading and contents are unique on the page.
  await expect(page.getByRole("heading", { name: s.pixQrTitle, level: 3 })).toBeVisible();
  await expect(page.getByText(s.pixCopyPaste, { exact: true })).toBeVisible();
  await expect(page.locator('img[src^="data:image"]')).toBeVisible();
  const code = await page.locator("textarea[readonly]").inputValue();
  // EMV: the payload format, the Pix GUI, the key, BRL, 150.00, BR, the CRC.
  expect(code.startsWith("000201"), "EMV payload format").toBe(true);
  for (const part of ["br.gov.bcb.pix", "smoke@example.com", "5303986", "5406150.00", "5802BR"]) expect(code, part).toContain(part);
  expect(code).toMatch(/6304[0-9A-F]{4}$/);
  await expect(page.getByRole("button", { name: s.pixCopy })).toBeVisible();
  await expectNoRawKeys(page);
});

test("TH: PromptPay QR on an unpaid appointment with an amount", async ({ page }) => {
  test.setTimeout(240_000);
  await openList(page, "/th", thd.email);
  const s = th.schedule;
  await row(page, ids.thPending).getByTitle(s.promptPayTitle).click();
  await expect(page.getByRole("heading", { name: s.promptPayTitle, level: 3 })).toBeVisible();
  await expect(page.locator(`img[alt="${s.promptPayTitle}"]`)).toBeVisible();
  await expect(page.getByText(s.promptPayScan)).toBeVisible();
  // No Pix in Thailand.
  await expect(page.getByTitle(s.pixQrTitle)).toHaveCount(0);
  await expectNoRawKeys(page);
});
