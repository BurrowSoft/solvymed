import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/components/CookieSettingsButton", () => ({ CookieSettingsButton: () => null }));

import { PrivacyEn } from "@/app/[locale]/(site)/privacy/PrivacyEn";
import { PrivacyPtBR } from "@/app/[locale]/(site)/privacy/PrivacyPtBR";
import { conditionMet } from "@/lib/conditions";

// UX 36's 1.4.0 privacy additions: the SolvyAI and LINE blocks appear only
// when their features are live (policy = what runs).

describe("privacy policy: SolvyAI / LINE blocks follow their conditions", () => {
  it("today (both unmet) neither appears, in either language", () => {
    expect(conditionMet("solvyai-live")).toBe(false);
    expect(conditionMet("line-live")).toBe(false);
    for (const Doc of [PrivacyEn, PrivacyPtBR]) {
      const { container, unmount } = render(<Doc turnstile={false} />);
      expect(container.textContent).not.toMatch(/Anthropic|SolvyAI|LY Corporation|LINE/);
      unmount();
    }
  });

  it("each block shows with its own flag only", () => {
    let r = render(<PrivacyEn turnstile={false} solvyai />);
    expect(r.container.textContent).toContain("Anthropic (SolvyAI, professionals only, when used)");
    expect(r.container.textContent).toContain("6b. SolvyAI (professionals only)");
    // The mask covers CPF and Thai IDs, not passports: the text says so.
    expect(r.container.textContent).toContain("CPF and Thai ID numbers, phone numbers and emails are masked");
    expect(r.container.textContent).not.toMatch(/LY Corporation|6c\./);
    r.unmount();
    r = render(<PrivacyPtBR turnstile={false} line />);
    expect(r.container.textContent).toContain("LY Corporation (LINE)");
    expect(r.container.textContent).toContain("6c. Avisos pelo LINE (Tailândia)");
    expect(r.container.textContent).not.toMatch(/Anthropic|6b\./);
    r.unmount();
  });

  it("with SolvyAI: Anthropic's deletion within 30 days (with its exceptions) and no training, in both languages; never with LINE alone", () => {
    let r = render(<PrivacyEn turnstile={false} solvyai />);
    expect(r.container.textContent).toContain("Anthropic deletes what is sent to SolvyAI within 30 days, except content flagged for violating its usage policies (kept for up to 2 years) or where the law requires longer retention. It is not used to train AI models.");
    r.unmount();
    r = render(<PrivacyPtBR turnstile={false} solvyai line />);
    expect(r.container.textContent).toContain("A Anthropic apaga o que é enviado ao SolvyAI em até 30 dias, exceto conteúdo sinalizado por violar suas políticas de uso (guardado por até 2 anos) ou quando a lei exigir guardar por mais tempo. Esses dados não são usados para treinar modelos de IA.");
    r.unmount();
    r = render(<PrivacyEn turnstile={false} line />);
    expect(r.container.textContent).not.toContain("Anthropic deletes what is sent to SolvyAI"); // (§6g has its own 30 days)
    r.unmount();
  });

  it("§6d's test-export paragraph only once uploads are live (founders-upload-live)", () => {
    expect(conditionMet("founders-upload-live")).toBe(false);
    let r = render(<PrivacyEn turnstile={false} founders />);
    expect(r.container.textContent).toContain("6d. Founders Program applications");
    expect(r.container.textContent).not.toContain("Test exports");
    r.unmount();
    r = render(<PrivacyPtBR turnstile={false} founders founderUploads />);
    expect(r.container.textContent).toContain("Exportações de teste");
    r.unmount();
  });

  it("the patient notice record (135) only once the outbox is live", () => {
    // Live since the flip (runbook: §6e published before the Vault secret).
    expect(conditionMet("notice-outbox-live")).toBe(true);
    for (const [Doc, title] of [[PrivacyEn, "6e. Patient notices"], [PrivacyPtBR, "6e. Avisos ao paciente"]] as const) {
      let r = render(<Doc turnstile={false} />);
      expect(r.container.textContent).not.toContain(title);
      r.unmount();
      r = render(<Doc turnstile={false} notices />);
      expect(r.container.textContent).toContain(title);
      expect(r.container.textContent).toMatch(/30 (days|dias)/);
      expect(r.container.textContent).not.toContain("WhatsApp");
      r.unmount();
    }
  });

  it("§6e names WhatsApp only once its outbox (137) is live, with only the live channels", () => {
    // Met since 1 Oct (published before whatsapp_notify_secret, 38's runbook).
    expect(conditionMet("whatsapp-outbox-live")).toBe(true);
    // Never LINE, even when it's live: its record is 90 days and its hold
    // another migration (§6c covers LINE).
    let r = render(<PrivacyPtBR turnstile={false} notices line whatsapp />);
    expect(r.container.textContent).toContain("o aviso ao paciente (push ou WhatsApp) espera cerca de 1 minuto");
    expect(r.container.textContent).not.toMatch(/push, LINE|LINE ou WhatsApp/);
    r.unmount();
    r = render(<PrivacyEn turnstile={false} notices line whatsapp />);
    expect(r.container.textContent).toContain("the notice to the patient (push or WhatsApp) waits about 1 minute");
    expect(r.container.textContent).not.toMatch(/push, LINE|LINE or WhatsApp/);
    r.unmount();
    // WhatsApp's outbox alone still publishes §6e, without claiming push waits.
    r = render(<PrivacyEn turnstile={false} whatsapp />);
    expect(r.container.textContent).toContain("6e. Patient notices");
    expect(r.container.textContent).toContain("the notice to the patient (WhatsApp) waits");
    r.unmount();
  });
});

describe("privacy policy: automatic WhatsApp processors (whatsapp-auto-live)", () => {
  it("hidden today; with it, the Z-API and WhatsApp (Meta) rows + §6e's line, in both languages", () => {
    expect(conditionMet("whatsapp-auto-live")).toBe(false);
    let r = render(<PrivacyEn turnstile={false} notices whatsapp />);
    expect(r.container.textContent).not.toMatch(/Z-API|Meta/);
    r.unmount();
    r = render(<PrivacyEn turnstile={false} notices whatsapp whatsappAuto />);
    expect(r.container.textContent).toContain("Z-API, Brazilian clinics that turn on automatic WhatsApp messages");
    expect(r.container.textContent).toContain("WhatsApp (Meta)");
    expect(r.container.textContent).toContain("Automatic WhatsApp messages are sent from our servers through Z-API, using the clinic\u2019s own Z-API account and WhatsApp number, and delivered by WhatsApp (Meta).");
    r.unmount();
    r = render(<PrivacyPtBR turnstile={false} notices whatsapp whatsappAuto />);
    expect(r.container.textContent).toContain("Z-API, clínicas no Brasil que ativam mensagens automáticas de WhatsApp");
    expect(r.container.textContent).toContain("As mensagens automáticas de WhatsApp saem dos nossos servidores pela Z-API, com a conta Z-API e o número de WhatsApp da própria clínica, e são entregues pelo WhatsApp (Meta).");
    r.unmount();
  });
});
