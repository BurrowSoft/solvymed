import pt from "../../src/messages/pt-BR.json";
import { LOCALES, dayFirst, expect, expectNo12h, expectNoRawKeys, test } from "./harness";
import { cleanup, mkDoctor, mkLinkedPatient, rest, signIn, skipTour, unambiguousDate } from "./fixtures";

// Signed-in critical paths, with throwaway accounts created for this run and
// deleted in afterAll. Needs the fixture env (e2e/smoke/README.md).
test.describe.configure({ mode: "serial" });

type Acct = { id: string; email: string };
let doctor: Acct;
let patient: Acct & { recordId: string };
let expired: Acct;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  doctor = await mkDoctor("doc", "Dra Smoke Teste");
  patient = await mkLinkedPatient(doctor, "pat");
  expired = await mkDoctor("expired", "Dr Smoke Expirado", { expiredTrial: true });
});
test.afterAll(async () => {
  test.setTimeout(180_000);
  await cleanup();
});

// Each account lands where it belongs, in every shipped language.
for (const locale of LOCALES) {
  test(`sign-in routes each account (${locale.code})`, async ({ page, context, consoleErrors }) => {
    test.setTimeout(240_000);
    await signIn(page, locale.prefix, doctor.email);
    await expect(page).toHaveURL(new RegExp(`${locale.prefix}/dashboard`));
    await skipTour(page);
    await expectNoRawKeys(page);
    await expectNo12h(page);

    await context.clearCookies({ name: /sb-/ });
    await signIn(page, locale.prefix, patient.email);
    await expect(page).toHaveURL(new RegExp(`${locale.prefix}/my-appointments`));
    await expectNoRawKeys(page);

    // An expired trial goes straight to the paywall.
    await context.clearCookies({ name: /sb-/ });
    await signIn(page, locale.prefix, expired.email);
    await expect(page).toHaveURL(new RegExp(`${locale.prefix}/subscribe`));
    await expectNoRawKeys(page);
    expect(consoleErrors).toEqual([]);
  });
}

// The patient books: calendar → time → type → send; the request reaches the
// doctor's database row as "tentative".
test("a linked patient books a consultation (pt-BR)", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, "/pt-BR", patient.email);
  await page.locator('a[href*="/book/"]').first().click();
  await expect(page).toHaveURL(/\/pt-BR\/book\//);

  await page.getByTestId("type-list").getByRole("radio", { name: new RegExp(pt.consultType.consultation) }).first().click();
  // A day after today (today may be past closing time): the second open day.
  const days = page.getByTestId("month-calendar").locator("button:not([disabled])[aria-pressed]");
  await expect(days.nth(1)).toBeVisible({ timeout: 60_000 });
  await days.nth(1).click();
  await expect(page.getByTestId("slots-skeleton")).toHaveCount(0, { timeout: 60_000 });
  const slot = page.locator("button[aria-pressed]").filter({ hasText: /^\d{2}:\d{2}$/ }).first();
  await slot.click();

  // Phone and birth date, if the form didn't fill them.
  const phone = page.locator('input[type="tel"]');
  if (!(await phone.inputValue())) await phone.fill("11912345678");
  const dob = page.locator('input[inputmode="numeric"]').first();
  if (!(await dob.inputValue())) await dob.pressSequentially("04051990");

  await page.getByRole("button", { name: pt.book.sendRequest }).click();
  await expect(page.getByText(pt.book.successTitle)).toBeVisible({ timeout: 60_000 });

  const rows = (await rest(`appointments?professional_id=eq.${doctor.id}&patient_auth_id=eq.${patient.id}&select=status,date,start_time`)).body as { status: string }[];
  expect(rows.map((r) => r.status)).toContain("tentative");
});

// The doctor answers three requests: confirm, propose a new time, decline.
// Then the patient sees the confirmed visit day-first and in 24 h.
test("the doctor confirms, proposes and declines; dates day-first, 24 h (pt-BR)", async ({ page, context }) => {
  test.setTimeout(300_000);
  const date = unambiguousDate(3);
  const base = { professional_id: doctor.id, patient_id: patient.recordId, patient_auth_id: patient.id, duration_minutes: 30, type: "in-person", consultation_type: "Consulta", payment_status: "pending", payment_type: "private", status: "tentative", scheduled_by: "patient", date };
  const seeds = [
    { ...base, patient_name: "Smoke Confirmar", start_time: "14:00", end_time: "14:30" },
    { ...base, patient_name: "Smoke Propor", start_time: "15:00", end_time: "15:30" },
    { ...base, patient_name: "Smoke Recusar", start_time: "16:00", end_time: "16:30" },
  ];
  const ins = await rest("appointments", { method: "POST", body: JSON.stringify(seeds) });
  expect(ins.status, "seed requests").toBeLessThan(300);
  const ids = Object.fromEntries((ins.body as { id: string; patient_name: string }[]).map((r) => [r.patient_name, r.id]));

  await signIn(page, "/pt-BR", doctor.email);
  await skipTour(page);
  await page.goto("/pt-BR/dashboard/schedule");
  const row = (name: string) => page.getByTestId("booking-request-row").filter({ hasText: name });

  await row("Smoke Confirmar").getByRole("button", { name: pt.schedule.confirm, exact: true }).click();
  await expect(row("Smoke Confirmar")).toHaveCount(0, { timeout: 60_000 });

  await row("Smoke Propor").getByRole("button", { name: pt.schedule.proposeNewTime }).first().click();
  const grid = row("Smoke Propor").getByTestId("doctor-time-grid");
  await expect(grid).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
  await grid.getByRole("button", { name: /^17:00/ }).click();
  await row("Smoke Propor").getByRole("button", { name: pt.schedule.send, exact: true }).click();

  const rejectButton = row("Smoke Recusar").getByRole("button", { name: pt.schedule.reject, exact: true });
  await rejectButton.first().click();
  // With reasons live, a second Rejeitar under the (optional) reason sends it.
  if (await rejectButton.count() > 1) await rejectButton.last().click();

  await expect.poll(async () => {
    const r = (await rest(`appointments?id=in.(${Object.values(ids).join(",")})&select=id,status,proposed_start_time`)).body as { id: string; status: string; proposed_start_time: string | null }[];
    const by = Object.fromEntries(r.map((x) => [x.id, x]));
    return [by[ids["Smoke Confirmar"]]?.status, by[ids["Smoke Propor"]]?.proposed_start_time?.slice(0, 5), by[ids["Smoke Recusar"]]?.status];
  }, { timeout: 60_000 }).toEqual(["confirmed", "17:00", "rejected"]);

  // The patient's list: the confirmed visit, day-first and 24-hour.
  await context.clearCookies({ name: /sb-/ });
  const ptBR = LOCALES.find((l) => l.code === "pt-BR")!;
  await signIn(page, "/pt-BR", patient.email);
  await expect(page.getByText(dayFirst(new Date(`${date}T12:00:00Z`), ptBR)).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/14:00/).first()).toBeVisible();
  await expectNo12h(page);
  await expectNoRawKeys(page);
});
