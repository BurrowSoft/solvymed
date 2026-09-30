import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Settings → Clinic follows the practice country (the app's rule, UX): the
// state label and the sample placeholders.

const h = vi.hoisted(() => ({ updates: [] as Record<string, unknown>[], storedCnpj: null as string | null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/effectiveProfId", () => ({ isProfessionalRole: async () => true, getEffectiveProfId: async () => "doc-1" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    from: () => ({
      update: (row: Record<string, unknown>) => { h.updates.push(row); return { eq: async () => ({ error: null }) }; },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { clinic_cnpj: h.storedCnpj }, error: null }) }) }),
    }),
  }),
}));
vi.mock("@/lib/setupActions", () => ({ markInviteShared: vi.fn() }));

import { ClinicForm } from "@/app/[locale]/(site)/dashboard/settings/SettingsClient";
import { updateClinic } from "@/app/[locale]/(site)/dashboard/settings/actions";

const show = (country: string) =>
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <ClinicForm data={{}} country={country} showPix={country === "BR"} showPromptPay={country === "TH"} showTaxId={country === "TH"} />
    </NextIntlClientProvider>,
  );
const input = (name: string, c: HTMLElement) => c.querySelector(`input[name="${name}"]`) as HTMLInputElement;

describe("ClinicForm by practice country", () => {
  it("Brazil: Estado and the Brazilian samples", () => {
    const { container } = show("BR");
    expect(screen.getByText("Estado")).toBeInTheDocument();
    expect(input("clinic_state", container).placeholder).toBe("SP");
    expect(input("clinic_phone", container).placeholder).toBe("(11) 3000-0000");
    expect(input("clinic_cnpj", container)).not.toBeNull();
    expect(input("clinic_tax_id", container)).toBeNull();
  });

  it("Thailand: Província, no Brazilian samples", () => {
    const { container } = show("TH");
    expect(screen.getByText("Província")).toBeInTheDocument();
    expect(input("clinic_state", container).placeholder).toBe("");
    expect(input("clinic_city", container).placeholder).toBe("Bangkok");
    expect(input("clinic_phone", container).placeholder).not.toContain("(11)");
    expect(input("clinic_cnpj", container)).toBeNull();
    expect(screen.getByText("Nº de identificação fiscal (13 dígitos)")).toBeInTheDocument();
  });

  it("elsewhere: Estado ou província and a country-code phone hint", () => {
    const { container } = show("US");
    expect(screen.getByText("Estado ou província")).toBeInTheDocument();
    expect(input("clinic_phone", container).placeholder).toBe("+ código do país e número");
    expect(input("clinic_city", container).placeholder).toBe("");
    expect(input("clinic_website", container).placeholder).toBe("www.example.com");
    expect(input("clinic_cnpj", container)).toBeNull();
    expect(input("clinic_tax_id", container)).toBeNull();
  });
});

describe("updateClinic: CNPJ and the Thai tax ID", () => {
  it("CNPJ (the app's rule, alphanumeric included): checked and saved formatted only when changed", async () => {
    h.updates = []; h.storedCnpj = "11.222.333/0001-99"; // an old bad value
    const f = (v: string) => { const x = new FormData(); x.set("clinic_name", "X"); x.set("clinic_cnpj", v); return x; };
    expect(await updateClinic(f("11.222.333/0001-99"))).toEqual({ success: true });
    expect(h.updates[0]).not.toHaveProperty("clinic_cnpj");
    expect(await updateClinic(f("11.222.333/0001-82"))).toEqual({ error: "invalid_cnpj" });
    expect(await updateClinic(f("12abc34501de35"))).toEqual({ success: true });
    expect(h.updates[1].clinic_cnpj).toBe("12.ABC.345/01DE-35");
    expect(await updateClinic(f(""))).toEqual({ success: true });
    expect(h.updates[2].clinic_cnpj).toBeNull();
  });

  const fd = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };

  it("a form without CNPJ leaves it untouched; the tax ID is checked (13 digits, Thai checksum) and stored as digits", async () => {
    h.updates = [];
    expect(await updateClinic(fd({ clinic_name: "X", clinic_tax_id: "1-2345-67890-12-1" }))).toEqual({ success: true });
    expect(h.updates[0]).not.toHaveProperty("clinic_cnpj");
    expect(h.updates[0].clinic_tax_id).toBe("1234567890121");
    expect(await updateClinic(fd({ clinic_tax_id: "1234567890123" }))).toEqual({ error: "invalid_tax_id" });
    expect(h.updates).toHaveLength(1);
    await updateClinic(fd({ clinic_tax_id: "" }));
    expect(h.updates[1].clinic_tax_id).toBeNull();
    await updateClinic(fd({ clinic_name: "X" }));
    expect(h.updates[2]).not.toHaveProperty("clinic_tax_id");
  });
});
