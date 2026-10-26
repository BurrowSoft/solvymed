import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// The ready-made starting template (246; 01, 10-27): while the doctor has no symptoms, a
// card offers the practice country's template; "Usar o modelo" calls pc_apply_template and
// reloads; an open request refuses it with the approved line.

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: h.rpc }) }));

import { TemplateStart } from "@/app/[locale]/(site)/dashboard/settings/patient-channel/TemplateStart";

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

  it("the settings page reads the template by the practice country and shows it only with no symptoms", async () => {
    const fs = await import("node:fs");
    const page = fs.readFileSync("src/app/[locale]/(site)/dashboard/settings/patient-channel/page.tsx", "utf8");
    expect(page).toContain('.from("pc_templates").select("id").eq("country", country)');
    const settings = fs.readFileSync("src/app/[locale]/(site)/dashboard/settings/patient-channel/PatientChannelSettings.tsx", "utf8");
    expect(settings).toContain("templateId && rules.symptoms.length === 0 && <TemplateStart");
  });
});
