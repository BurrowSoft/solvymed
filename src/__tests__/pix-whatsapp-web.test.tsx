import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";

// G4 on the website (cf): "Enviar Pix por WhatsApp" in the Pix dialog, as a
// wa.me link with the app's message; gated by the registry's paymentShare
// (BR only today) and the patient's phone.

vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/pt-BR/dashboard/schedule",
  useSearchParams: () => new URLSearchParams(),
}));

import { countryProfile } from "@/lib/country";
import { pixPatientMessage, whatsappLink, whatsappNumber } from "@/lib/whatsappLink";
import { PixQrButton } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/ScheduleClient";
import { generatePixString } from "@/lib/pix";

describe("the registry", () => {
  it("paymentShare: WhatsApp in Brazil, none in Thailand or the default", () => {
    expect(countryProfile("BR").paymentShare).toBe("whatsapp");
    expect(countryProfile("TH").paymentShare).toBeNull();
    expect(countryProfile("US").paymentShare).toBeNull();
  });
});

describe("the number and the message (the app's rules)", () => {
  it("wa.me numbers by the practice country", () => {
    expect(whatsappNumber("(11) 99999-9999", "BR")).toBe("5511999999999");
    expect(whatsappNumber("+55 11 99999-9999", "BR")).toBe("5511999999999");
    expect(whatsappNumber("5511999999999", "BR")).toBe("5511999999999");
    expect(whatsappNumber("(55) 99999-9999", "BR")).toBe("5555999999999");
    expect(whatsappNumber("081 234 5678", "TH")).toBe("66812345678");
    expect(whatsappNumber("123", "BR")).toBeNull();
    expect(whatsappLink("123", "BR", "x")).toBeNull();
  });

  it("the patient's message is the app's pt-BR one, the code alone on the last line", () => {
    expect(pixPatientMessage("2026-10-09", "9:5:00", "000201XYZ")).toBe(
      "Olá! Segue o Pix da sua consulta em 09/10/2026 às 09:05. Copie o código abaixo e cole em \"Pix Copia e Cola\" no app do seu banco:\n000201XYZ",
    );
  });

  it("the label in en / pt-BR / th", () => {
    expect([en.schedule.sendPixWhatsApp, pt.schedule.sendPixWhatsApp, th.schedule.sendPixWhatsApp]).toEqual(["Send Pix via WhatsApp", "Enviar Pix por WhatsApp", "ส่ง Pix ทาง WhatsApp"]);
  });
});

describe("the Pix dialog", () => {
  const show = (share: Parameters<typeof PixQrButton>[0]["share"]) =>
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PixQrButton pixKey="ana@example.com" clinicName="Clinica" clinicCity="Sao Paulo" amount={150} share={share} /></NextIntlClientProvider>);

  it("with a phone: the link opens the clinic's WhatsApp to the patient with the Pix message", () => {
    show({ phone: "(11) 99999-9999", country: "BR", date: "2026-10-09", time: "14:00:00" });
    fireEvent.click(screen.getByTitle(pt.schedule.pixQrTitle));
    const a = screen.getByTestId("send-pix-whatsapp") as HTMLAnchorElement;
    expect(a.textContent).toBe("Enviar Pix por WhatsApp");
    expect(a.target).toBe("_blank");
    const url = new URL(a.href);
    expect(url.origin + url.pathname).toBe("https://wa.me/5511999999999");
    const code = generatePixString("ana@example.com", "Clinica", "Sao Paulo", 150);
    expect(url.searchParams.get("text")).toBe(pixPatientMessage("2026-10-09", "14:00:00", code));
  });

  it("no share (no phone, or a country without it): no link, the QR and Copia e Cola stay", () => {
    show(null);
    fireEvent.click(screen.getByTitle(pt.schedule.pixQrTitle));
    expect(screen.queryByTestId("send-pix-whatsapp")).toBeNull();
    expect(screen.getByText(pt.schedule.pixCopy)).toBeInTheDocument();
  });
});
