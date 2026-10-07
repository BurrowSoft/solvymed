import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";

// 1.8.0 E (cf): the doctor's card payment link. https only (the database's
// CHECK); the line in the Pix WhatsApp message; "Or pay by card" under the
// Pix and PromptPay QRs with Copy / Share; the card-only WhatsApp message
// when a Brazilian practice has no Pix key; the Settings field.

const h = vi.hoisted(() => ({ updates: [] as Record<string, unknown>[] }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/pt-BR/dashboard/schedule",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/effectiveProfId", () => ({ isProfessionalRole: async () => true, getEffectiveProfId: async () => "doc-1" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    from: () => ({
      update: (row: Record<string, unknown>) => { h.updates.push(row); return { eq: async () => ({ error: null }) }; },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { clinic_cnpj: null }, error: null }) }) }),
    }),
  }),
}));
vi.mock("@/lib/setupActions", () => ({ markInviteShared: vi.fn() }));

import { cardLinkInput, normalizeCardLink } from "@/lib/cardLink";
import { cardPatientMessage, pixPatientMessage } from "@/lib/whatsappLink";
import { CardLinkWhatsAppButton, PixQrButton, PromptPayQrButton } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/ScheduleClient";
import { ClinicForm } from "@/app/[locale]/(site)/dashboard/settings/SettingsClient";
import { updateClinic } from "@/app/[locale]/(site)/dashboard/settings/actions";

const LINK = "https://pay.example.com/dra-ana";

beforeEach(() => { h.updates.length = 0; });

describe("the link (migration 210's CHECK: ^https://\\S+$, ≤ 500)", () => {
  it("https only, no spaces, at most 500 characters", () => {
    expect(normalizeCardLink(` ${LINK} `)).toBe(LINK);
    expect(normalizeCardLink("http://pay.example.com")).toBeNull();
    expect(normalizeCardLink("https://pay example.com")).toBeNull();
    expect(normalizeCardLink("https://")).toBeNull();
    expect(normalizeCardLink(`https://${"a".repeat(492)}`)).toHaveLength(500);
    expect(normalizeCardLink(`https://${"a".repeat(493)}`)).toBeNull();
    expect(normalizeCardLink(null)).toBeNull();
  });

  it("the Settings input: empty clears, a bad link is refused", () => {
    expect(cardLinkInput("  ")).toEqual({ ok: true, value: null });
    expect(cardLinkInput(LINK)).toEqual({ ok: true, value: LINK });
    expect(cardLinkInput("pay.example.com")).toEqual({ ok: false });
  });
});

describe("the patient messages (pt-BR, as the app's lib/pix-message.ts)", () => {
  it("the Pix message gets cf's card line before the copy instruction", () => {
    expect(pixPatientMessage("2026-10-09", "14:00:00", "000201XYZ", LINK)).toBe(
      `Olá! Segue o Pix da sua consulta em 09/10/2026 às 14:00.\nOu pague com cartão: ${LINK}\nCopie o código abaixo e cole em "Pix Copia e Cola" no app do seu banco:\n000201XYZ`,
    );
    // Without a link: unchanged.
    expect(pixPatientMessage("2026-10-09", "14:00:00", "000201XYZ")).toBe(
      "Olá! Segue o Pix da sua consulta em 09/10/2026 às 14:00. Copie o código abaixo e cole em \"Pix Copia e Cola\" no app do seu banco:\n000201XYZ",
    );
  });

  it("the card-only message", () => {
    expect(cardPatientMessage("2026-10-09", "9:5", LINK)).toBe(`Olá! Para pagar sua consulta em 09/10/2026 às 09:05 com cartão, use este link: ${LINK}`);
  });

  it("the labels in en / pt-BR / th (cf)", () => {
    expect([en.schedule.orPayByCard, pt.schedule.orPayByCard, th.schedule.orPayByCard]).toEqual(["Or pay by card", "Ou pague com cartão", "หรือชำระด้วยบัตร"]);
    expect([en.schedule.shareCardLink, pt.schedule.shareCardLink, th.schedule.shareCardLink]).toEqual(["Share card link", "Compartilhar link do cartão", "แชร์ลิงก์ชำระด้วยบัตร"]);
    expect([en.schedule.sendCardWhatsApp, pt.schedule.sendCardWhatsApp]).toEqual(["Send card link via WhatsApp", "Enviar link do cartão por WhatsApp"]);
    expect([en.settings.cardLink, pt.settings.cardLink, th.settings.cardLink]).toEqual(["Card payment link", "Link de pagamento (cartão)", "ลิงก์ชำระด้วยบัตร"]);
    expect([en.settings.cardLinkInvalid, pt.settings.cardLinkInvalid, th.settings.cardLinkInvalid]).toEqual(["Enter a link that starts with https://", "Informe um link que comece com https://", "กรุณาใส่ลิงก์ที่ขึ้นต้นด้วย https://"]);
  });
});

describe("the payment dialogs", () => {
  it("Pix: \"Ou pague com cartão\" with the link, Copy, and the card line in the WhatsApp message", () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}>
      <PixQrButton pixKey="ana@example.com" clinicName="Clinica" clinicCity="Sao Paulo" amount={150}
        share={{ phone: "(11) 99999-9999", country: "BR", date: "2026-10-09", time: "14:00:00" }} cardLink={LINK} />
    </NextIntlClientProvider>);
    fireEvent.click(screen.getByTitle(pt.schedule.pixQrTitle));
    const box = screen.getByTestId("card-link");
    expect(box).toHaveTextContent(pt.schedule.orPayByCard);
    expect(within(box).getByRole("link", { name: LINK })).toHaveAttribute("href", LINK);
    fireEvent.click(within(box).getByRole("button", { name: pt.schedule.pixCopy }));
    expect(writeText).toHaveBeenCalledWith(LINK);
    const wa = decodeURIComponent(screen.getByTestId("send-pix-whatsapp").getAttribute("href")!.split("?text=")[1]);
    expect(wa).toContain(`\nOu pague com cartão: ${LINK}\nCopie o código`);
  });

  it("Pix without a link: no card box (as before)", () => {
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}>
      <PixQrButton pixKey="ana@example.com" clinicName="Clinica" clinicCity="Sao Paulo" amount={150} />
    </NextIntlClientProvider>);
    fireEvent.click(screen.getByTitle(pt.schedule.pixQrTitle));
    expect(screen.queryByTestId("card-link")).toBeNull();
  });

  it("PromptPay (Thai): the link under the QR, with Share where the browser can share", () => {
    const share = vi.fn(async () => {});
    Object.assign(navigator, { share });
    render(<NextIntlClientProvider locale="th" messages={th}>
      <PromptPayQrButton promptPayId="0812345678" amount={500} cardLink={LINK} />
    </NextIntlClientProvider>);
    fireEvent.click(screen.getByTitle(th.schedule.promptPayTitle));
    const box = screen.getByTestId("card-link");
    expect(box).toHaveTextContent(th.schedule.orPayByCard);
    fireEvent.click(within(box).getByRole("button", { name: th.schedule.shareCardLink }));
    expect(share).toHaveBeenCalledWith({ url: LINK });
    delete (navigator as { share?: unknown }).share;
  });

  it("no Pix key, a card link: the card-only message to the patient's WhatsApp", () => {
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}>
      <CardLinkWhatsAppButton link={LINK} share={{ phone: "(11) 99999-9999", country: "BR", date: "2026-10-09", time: "14:00:00" }} />
    </NextIntlClientProvider>);
    const a = screen.getByRole("link", { name: pt.schedule.sendCardWhatsApp });
    expect(a.getAttribute("href")).toBe(`https://wa.me/5511999999999?text=${encodeURIComponent(cardPatientMessage("2026-10-09", "14:00:00", LINK))}`);
  });
});

describe("Settings → Clinic", () => {
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

  it("the field shows only when it could be read; a bad link shows the error and isn't sent", () => {
    const { rerender } = render(<NextIntlClientProvider locale="pt-BR" messages={pt}><ClinicForm country="BR" data={{}} /></NextIntlClientProvider>);
    expect(document.querySelector("input[name=card_payment_url]")).toBeNull();
    rerender(<NextIntlClientProvider locale="pt-BR" messages={pt}><ClinicForm country="BR" showCardLink data={{ card_payment_url: LINK }} /></NextIntlClientProvider>);
    const input = document.querySelector("input[name=card_payment_url]") as HTMLInputElement;
    expect(input.value).toBe(LINK);
    expect(screen.getByText(pt.settings.cardLinkHint)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "http://pay.example.com" } });
    fireEvent.submit(input.form!);
    expect(screen.getByText(pt.settings.cardLinkInvalid)).toBeInTheDocument();
  });

  it("the action saves a valid link, clears an empty one, refuses a bad one and leaves it alone without the field", async () => {
    expect(await updateClinic(fd({ clinic_name: "X", card_payment_url: ` ${LINK} ` }))).toEqual({ success: true });
    expect(h.updates.at(-1)).toMatchObject({ card_payment_url: LINK });
    await updateClinic(fd({ clinic_name: "X", card_payment_url: "" }));
    expect(h.updates.at(-1)).toMatchObject({ card_payment_url: null });
    expect(await updateClinic(fd({ clinic_name: "X", card_payment_url: "ftp://x" }))).toEqual({ error: "invalid_card_link" });
    const n = h.updates.length;
    await updateClinic(fd({ clinic_name: "X" }));
    expect(h.updates).toHaveLength(n + 1);
    expect(h.updates.at(-1)).not.toHaveProperty("card_payment_url");
  });
});
