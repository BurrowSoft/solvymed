import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";

// 1.8.0 C2 (migration 212; ad): a linked patient completes the details their
// doctor requires that are still empty, once, from a non-blocking card on
// My appointments; the record's values are never shown.

const h = vi.hoisted(() => ({ saves: [] as unknown[][], dismissed: [] as string[], saveResult: { ok: true } as Record<string, unknown> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/my-appointments/self-fields-actions", () => ({
  saveSelfFields: vi.fn(async (...a: unknown[]) => { h.saves.push(a); return h.saveResult; }),
  dismissSelfFields: vi.fn(async (id: string) => { h.dismissed.push(id); return true; }),
}));

import { loadSelfFieldPrompts, selfMissing, selfValues, type SelfPrompt } from "@/lib/selfFields";
import { CompleteRegistrationCards } from "@/app/[locale]/(site)/my-appointments/CompleteRegistrationCard";
import { PrivacyEn } from "@/app/[locale]/(site)/privacy/PrivacyEn";
import { PrivacyPtBR } from "@/app/[locale]/(site)/privacy/PrivacyPtBR";

const D = "55555555-5555-4555-8555-555555555555";
const T = pt.selfFields;

beforeEach(() => { h.saves = []; h.dismissed = []; h.saveResult = { ok: true }; });

describe("212's values", () => {
  const form = (o: Record<string, string>) => (n: string) => o[n] ?? "";
  it("only the asked keys, only what was typed; the ID by country; the address as parts", () => {
    expect(selfValues(["national_id", "cns", "address", "sex"], "BR", form({ cpf: "111.444.777-35", cns: "898 0012 3456 7890", address_street: "Rua A", address_city: "Recife", sex: "female", profession: "x" })))
      .toEqual({ national_id: { cpf: "11144477735" }, cns: "898001234567890", address: { street: "Rua A", city: "Recife" }, sex: "female" });
    expect(selfValues(["national_id"], "TH", form({ th_national_id: "1-2345-67890-12-1" }))).toEqual({ national_id: { th_national_id: "1234567890121" } });
    expect(selfValues(["national_id"], "TH", form({ national_passport: "AA123" }))).toEqual({ national_id: { passport_number: "AA123" } });
    // An address needs a street, a city or a postal code.
    expect(selfValues(["address"], "BR", form({ address_number: "12" }))).toEqual({});
    expect(selfMissing(["email", "sex"], { sex: "male" })).toEqual(["email"]);
  });

  it("the prompts: keys left, not put off; notes never; NULL or an error = no card", async () => {
    const rows: Record<string, unknown> = {
      a: { country: "BR", keys: ["email", "notes", "sex"], prefill: { email: "me@x.com" }, prompted: false },
      b: { country: "BR", keys: ["sex"], prompted: true },
      c: null,
    };
    const db = { rpc: async (_fn: string, args?: Record<string, unknown>) => ({ data: rows[args!.p_professional_id as string], error: null }) };
    const out = await loadSelfFieldPrompts(db, [{ id: "a", name: "Dra. Ana" }, { id: "b", name: "Dr. B" }, { id: "c", name: "Dr. C" }]);
    expect(out).toEqual([{ doctorId: "a", doctorName: "Dra. Ana", country: "BR", keys: ["email", "sex"], prefill: { email: "me@x.com" } }]);
  });
});

describe("the card", () => {
  const prompt: SelfPrompt = { doctorId: D, doctorName: "Dra. Ana", country: "BR", keys: ["email", "national_id", "sex"], prefill: { email: "me@x.com" } };
  const show = (p = prompt, msgs: typeof pt = pt, locale = "pt-BR") =>
    render(<NextIntlClientProvider locale={locale} messages={msgs}><CompleteRegistrationCards prompts={[p]} /></NextIntlClientProvider>);

  it("ad's copy; Agora não puts it off", async () => {
    show();
    const card = screen.getByTestId("self-fields-card");
    expect(card).toHaveTextContent("Dra. Ana pediu alguns dados");
    expect(card).toHaveTextContent(T.cardBody);
    fireEvent.click(within(card).getByRole("button", { name: T.notNow }));
    await waitFor(() => expect(screen.queryByTestId("self-fields-card")).toBeNull());
    expect(h.dismissed).toEqual([D]);
  });

  it("Completar: only the asked fields, the profile's own e-mail prefilled; saving sends 212's values", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: T.complete }));
    const form = screen.getByTestId("self-fields-form");
    expect(form).toHaveTextContent("Esses dados vão para o seu cadastro com Dra. Ana.");
    expect((form.querySelector("input[name=email]") as HTMLInputElement).value).toBe("me@x.com");
    expect(form.querySelector("input[name=profession]")).toBeNull();
    fireEvent.change(form.querySelector("input[name=cpf]")!, { target: { value: "111.444.777-35" } });
    fireEvent.change(form.querySelector("select[name=sex]")!, { target: { value: "female" } });
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByTestId("self-fields-done")).toHaveTextContent(T.done));
    expect(h.saves[0]).toEqual([D, { email: "me@x.com", national_id: { cpf: "11144477735" }, sex: "female" }]);
  });

  it("a field left empty says so; nothing is sent", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: T.complete }));
    fireEvent.submit(screen.getByTestId("self-fields-form"));
    expect(screen.getByRole("alert")).toHaveTextContent(/CPF/);
    expect(h.saves).toHaveLength(0);
  });

  it("the server's refusals: under the field (ad), and id_in_use", async () => {
    h.saveResult = { ok: false, error: "invalid", key: "national_id" };
    show();
    fireEvent.click(screen.getByRole("button", { name: T.complete }));
    const form = screen.getByTestId("self-fields-form");
    fireEvent.change(form.querySelector("input[name=cpf]")!, { target: { value: "123" } });
    fireEvent.change(form.querySelector("select[name=sex]")!, { target: { value: "male" } });
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Confira: CPF."));
    h.saveResult = { ok: false, error: "id_in_use", key: "national_id" };
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(T.idInUse));
  });

  it("the strings in en / th (ad)", () => {
    expect([en.selfFields.cardTitle, th.selfFields.cardTitle]).toEqual(["{doctor} asked for a few details", "{doctor} ขอข้อมูลเพิ่มเติม"]);
    expect([en.selfFields.invalid, th.selfFields.invalid]).toEqual(["Please check: {field}.", "โปรดตรวจสอบ: {field}"]);
  });
});

describe("privacy §3.2 (ad; hidden until c2-patient-step-live)", () => {
  it("off: unchanged; on: the heading and the sentence, en + pt", () => {
    let r = render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PrivacyEn turnstile={false} /></NextIntlClientProvider>);
    expect(r.container.textContent).toContain("3.2 Patient data entered by professionals or their secretaries:");
    expect(r.container.textContent).not.toContain("the patients themselves");
    r.unmount();
    r = render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PrivacyEn turnstile={false} selfFields /></NextIntlClientProvider>);
    expect(r.container.textContent).toContain("3.2 Patient data entered by professionals, their secretaries, or the patients themselves:");
    expect(r.container.textContent).toContain("A patient with an account may complete the details their professional asks for");
    r.unmount();
    r = render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PrivacyPtBR turnstile={false} selfFields /></NextIntlClientProvider>);
    expect(r.container.textContent).toContain("pelos próprios pacientes:");
    expect(r.container.textContent).toContain("Um paciente com conta pode completar os dados que o seu profissional solicita");
    r.unmount();
  });
});

describe("212's named duplicates (86, ad)", () => {
  it("a duplicate e-mail says so under the e-mail field", async () => {
    h.saveResult = { ok: false, error: "id_in_use", key: "email" };
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><CompleteRegistrationCards prompts={[{ doctorId: D, doctorName: "Dra. Ana", country: "BR", keys: ["email"], prefill: { email: "me@x.com" } }]} /></NextIntlClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: T.complete }));
    fireEvent.submit(screen.getByTestId("self-fields-form"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(T.emailInUse));
  });
});

describe("0f's review", () => {
  it("212's national-ID prefill ({cpf}) fills the CPF input", async () => {
    const db = { rpc: async () => ({ data: { country: "BR", keys: ["national_id"], prefill: { national_id: { cpf: "11144477735" }, email: "me@x.com" }, prompted: false }, error: null }) };
    const [p] = await loadSelfFieldPrompts(db, [{ id: D, name: "Dra. Ana" }]);
    expect(p.prefill).toEqual({ email: "me@x.com", cpf: "11144477735" });
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><CompleteRegistrationCards prompts={[p]} /></NextIntlClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: T.complete }));
    expect((screen.getByTestId("self-fields-form").querySelector("input[name=cpf]") as HTMLInputElement).value).toBe("11144477735");
  });

  it("the form posts (#332: a submit before hydration never puts the details in the URL)", () => {
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><CompleteRegistrationCards prompts={[{ doctorId: D, doctorName: "Dra. Ana", country: "BR", keys: ["national_id"], prefill: {} }]} /></NextIntlClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: T.complete }));
    expect(screen.getByTestId("self-fields-form").getAttribute("method")).toBe("post");
  });
});
