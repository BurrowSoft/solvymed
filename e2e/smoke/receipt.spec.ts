import ptBR from "../../src/messages/pt-BR.json";
import th from "../../src/messages/th.json";
import { expect, expectNoRawKeys, test } from "./harness";
import { cleanup, mkDoctor, rest, signIn, sleep, spDate } from "./fixtures";

// The website's recibo (Pagamentos → Recibo; web tester 2). No recibo without
// an amount: the page asks "Defina o valor da consulta antes de emitir o
// recibo." with "Definir valor"; once the amount is saved there, the recibo
// shows it. A Thai practice gets no recibo here: its numbered receipt is
// issued in the app. Seeded appointments only; nothing is sent.
test.describe.configure({ mode: "serial" });

type Acct = { id: string; email: string };
const DATE = spDate(-1);
let br: Acct, thd: Acct;
let brAppt = "", thAppt = "";

async function seed(doctorId: string, name: string, amount: number | null) {
  const p = await rest("patients", { method: "POST", body: JSON.stringify({ professional_id: doctorId, full_name: name, birth_date: "1990-05-04" }) });
  expect(p.status, "POST patients").toBeLessThan(300);
  const a = await rest("appointments", { method: "POST", body: JSON.stringify({
    professional_id: doctorId, patient_id: (p.body as { id: string }[])[0].id, patient_name: name, date: DATE, start_time: "09:00", end_time: "09:30",
    duration_minutes: 30, type: "in-person", consultation_type: "Consultation", payment_type: "private",
    patient_auth_via_link: false, status: "completed", payment_status: "pending", payment_amount: amount,
  }) });
  expect(a.status, "POST appointments").toBeLessThan(300);
  return (a.body as { id: string }[])[0].id;
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  br = await mkDoctor("recbr", "Dra Smoke Recibo");
  brAppt = await seed(br.id, "Smoke Paciente Recibo", null);
  thd = await mkDoctor("recth", "Smoke Receipt TH");
  expect((await rest(`professionals?id=eq.${thd.id}`, { method: "PATCH", body: JSON.stringify({ country: "TH", time_zone: "Asia/Bangkok" }) })).status).toBeLessThan(300);
  thAppt = await seed(thd.id, "Smoke Somchai", 500);
});
test.afterAll(async () => {
  test.setTimeout(180_000);
  await cleanup();
});

test("BR: no recibo without an amount; Definir valor, then the recibo shows it", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, "/pt-BR", br.email);
  await page.goto(`/pt-BR/dashboard/payments/${brAppt}/receipt`, { waitUntil: "domcontentloaded" });
  const needs = page.getByTestId("receipt-needs-amount");
  await expect(needs).toBeVisible({ timeout: 60_000 });
  await expect(needs).toContainText(ptBR.prescriptionDoc.receiptNeedsAmount);
  // Never "R$ 0,00": no recibo on the page yet.
  await expect(page.getByText(/R\$\s?0,00/)).toHaveCount(0);
  await page.waitForFunction(() => { const b = document.querySelector('[data-testid="receipt-needs-amount"] button'); return !!b && Object.keys(b).some((k) => k.startsWith("__reactProps")); }, null, { timeout: 60_000 });
  await needs.getByRole("button", { name: ptBR.payments.setAmount }).click();
  await needs.getByRole("textbox", { name: ptBR.payments.setAmount }).fill("150");
  await needs.getByRole("button", { name: ptBR.payments.confirm }).click();
  // The page refreshes into the recibo.
  await expect(needs).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText(ptBR.prescriptionDoc.receiptTitle, { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Smoke Paciente Recibo").first()).toBeVisible();
  await expect(page.getByText(/R\$\s?150,00/).first()).toBeVisible();
  const saved = await rest(`appointments?id=eq.${brAppt}&select=payment_amount`);
  expect((saved.body as { payment_amount: number }[])[0].payment_amount).toBe(150);
  await expectNoRawKeys(page);
});

test("TH: no recibo on the website; the hint points to the app", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, "/th", thd.email);
  await page.goto(`/th/dashboard/payments/${thAppt}/receipt`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(th.prescriptionDoc.receiptThaiHint)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("receipt-needs-amount")).toHaveCount(0);
  await sleep(500);
  await expectNoRawKeys(page);
});
