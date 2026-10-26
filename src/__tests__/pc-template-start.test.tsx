import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// The ready-made starting template (246; 01, 10-27): while the doctor has no symptoms, a
// card offers the practice country's template; "Usar o modelo" calls pc_apply_template and
// reloads; an open request refuses it with the approved line.

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: h.rpc }) }));

import { TemplateStart } from "@/app/[locale]/(site)/dashboard/settings/patient-channel/TemplateStart";
import { PatientChannelSettings } from "@/app/[locale]/(site)/dashboard/settings/patient-channel/PatientChannelSettings";
import { EMPTY_RULES } from "@/lib/patientChannel/rules";
import { DEFAULT_SETTINGS } from "@/lib/patientChannel/channel";
import type { ChannelConfig } from "@/lib/patientChannel/score";

describe("the starting template card", () => {
  const reload = vi.fn();
  const original = window.location;
  beforeEach(() => {
    h.rpc.mockReset();
    reload.mockReset();
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, reload } });
  });
  afterEach(() => Object.defineProperty(window, "location", { configurable: true, value: original }));

  const show = () =>
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <TemplateStart templateId="general-side-effects-br" />
      </NextIntlClientProvider>,
    );

  it("offers the template with the approved strings", () => {
    show();
    expect(screen.getByText("Comece com o modelo pronto: Geral / efeitos colaterais")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Usar o modelo" })).toBeTruthy();
  });

  it("'Usar o modelo' applies the practice country's template, then reloads", async () => {
    h.rpc.mockResolvedValue({ data: 1, error: null });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Usar o modelo" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(h.rpc).toHaveBeenCalledWith("pc_apply_template", { p_template_id: "general-side-effects-br" });
  });

  it("an open request: the approved refusal, nothing reloaded", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "open_requests_exist" } });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Usar o modelo" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Responda ou feche as solicitações abertas antes de trocar o modelo.");
    expect(reload).not.toHaveBeenCalled();
  });

  it("any other failure: the generic save error", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "network" } });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Usar o modelo" }));
    expect((await screen.findByRole("alert")).textContent).toBe(pt.patientChannel.channel.saveError);
  });

  it("the settings page reads the template by the practice country", async () => {
    const fs = await import("node:fs");
    const page = fs.readFileSync("src/app/[locale]/(site)/dashboard/settings/patient-channel/page.tsx", "utf8");
    expect(page).toContain('.from("pc_templates").select("id").eq("country", country)');
  });
});

// cf: the template replaces the rules wholesale, so it's offered only on blank SAVED rules
// (no symptoms, medicines or automatic messages) with nothing unsaved.
describe("where the card shows", () => {
  const P = pt.patientChannel;
  const EXTRA = { professionalId: "doc1", channel: { settings: DEFAULT_SETTINGS, reasons: [], faq: [] }, brandHref: "/pt-BR/dashboard/settings#brand" };
  const show = (rules: ChannelConfig, templateId: string | null = "general-side-effects-br") =>
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <PatientChannelSettings {...EXTRA} templateId={templateId} initialRules={rules} initialVersion={0} emergencyNumber="192" />
      </NextIntlClientProvider>,
    );

  it("blank saved rules: shown", () => {
    show(EMPTY_RULES);
    expect(screen.getByTestId("pc-template-start")).toBeTruthy();
  });

  it("saved medicines but no symptoms: not shown (they'd be replaced)", () => {
    show({ ...EMPTY_RULES, medicines: ["Dipirona"] });
    expect(screen.queryByTestId("pc-template-start")).toBeNull();
  });

  it("blank, then an unsaved edit: hidden until it's saved or discarded", () => {
    show(EMPTY_RULES);
    fireEvent.change(screen.getByRole("textbox", { name: P.symptoms.new }), { target: { value: "Tontura" } });
    fireEvent.click(within(screen.getByRole("region", { name: P.symptoms.title })).getByRole("button", { name: P.symptoms.add }));
    expect(screen.queryByTestId("pc-template-start")).toBeNull();
  });

  it("no template for the practice country: not shown", () => {
    show(EMPTY_RULES, null);
    expect(screen.queryByTestId("pc-template-start")).toBeNull();
  });
});
