import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";

vi.mock("@/components/CookieSettingsButton", () => ({ CookieSettingsButton: () => null }));

import { AddressFields } from "@/components/patient/AddressFields";
import { PrivacyEn } from "@/app/[locale]/(site)/privacy/PrivacyEn";
import { PrivacyPtBR } from "@/app/[locale]/(site)/privacy/PrivacyPtBR";
import { conditionMet } from "@/lib/conditions";

// Migration 138's section in the patient forms, and privacy §3.2.

const inPt = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="pt-BR" messages={pt}>{ui}</NextIntlClientProvider>);

describe("AddressFields", () => {
  it("BR: CEP…UF, the CNS with its check, Observações with the hint and counter; collapsed while empty", () => {
    const { container } = inPt(<AddressFields kind="BR" />);
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(container.querySelector('input[name="address_fields"]')).toHaveValue("1");
    for (const l of ["CEP", "Rua", "Número", "Complemento", "Bairro", "Cidade", "UF"]) expect(screen.getByLabelText(l)).toBeInTheDocument();
    const cns = screen.getByLabelText("CNS (Cartão Nacional de Saúde)");
    expect(screen.getByText("15 dígitos, no cartão do SUS")).toBeInTheDocument();
    fireEvent.change(cns, { target: { value: "123" } });
    fireEvent.blur(cns);
    expect(screen.getByText("CNS inválido: confira os 15 dígitos do cartão do SUS.")).toBeInTheDocument();
    expect(cns).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(cns, { target: { value: "700000000000005" } });
    fireEvent.blur(cns);
    expect(cns).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText(pt.patientAddress.notesHint)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Observações"), { target: { value: "Prefere manhã" } });
    expect(screen.getByText(/^13\/2[.,]?000$/)).toBeInTheDocument();
  });

  it("TH: Thai labels, no CNS; open when an address is stored", () => {
    const { container } = inPt(<AddressFields kind="TH" values={{ address_city: "Nan" }} />);
    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByLabelText("Prédio, andar, sala")).toBeInTheDocument();
    expect(screen.getByLabelText("Distrito (amphoe/khet)")).toHaveValue("Nan");
    expect(screen.queryByLabelText(/CNS/)).toBeNull();
  });

  it("other countries: generic labels", () => {
    render(<NextIntlClientProvider locale="en" messages={en}><AddressFields kind="OTHER" /></NextIntlClientProvider>);
    expect(screen.getByLabelText("State or province")).toBeInTheDocument();
    expect(screen.getByLabelText("Apartment, suite")).toBeInTheDocument();
  });
});

describe("privacy §3.2: address, CNS and notes only once 138 is live", () => {
  it("both languages", () => {
    // Live since the flip (138 + 139 on prod, 3e's live 🟢).
    expect(conditionMet("patient-address-live")).toBe(true);
    let r = render(<PrivacyEn turnstile={false} />);
    expect(r.container.textContent).not.toContain("CNS");
    r.unmount();
    r = render(<PrivacyEn turnstile={false} address />);
    expect(r.container.textContent).toContain("; address, CNS (the Brazilian national health card number, Brazilian clinics only) and administrative notes) and health data");
    r.unmount();
    r = render(<PrivacyPtBR turnstile={false} address />);
    expect(r.container.textContent).toContain("; endereço, CNS (Cartão Nacional de Saúde, só clínicas no Brasil) e observações administrativas) e dados de saúde");
    r.unmount();
  });
});
