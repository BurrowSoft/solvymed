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

describe("privacy 2026-10-08: Resend's support alerts (visible), LINE names the doctor (hidden)", () => {
  it("Resend lists the support-team alerts, with or without invitations, in both languages", () => {
    let r = render(<PrivacyEn turnstile={false} />);
    expect(r.container.textContent).toContain("Transactional email (confirmations, password resets) and alerts to our support team about an account (for example, a deletion request or a clinic setting that needs our action)");
    r.unmount();
    r = render(<PrivacyEn turnstile={false} secretaryInvites />);
    expect(r.container.textContent).toContain("Transactional email (confirmations, password resets), invitations sent at a professional's request and alerts to our support team about an account");
    r.unmount();
    r = render(<PrivacyPtBR turnstile={false} />);
    expect(r.container.textContent).toContain("E-mails transacionais (confirmações, redefinição de senha) e alertas à nossa equipe de suporte sobre uma conta (por exemplo, um pedido de exclusão ou uma configuração da clínica que precisa de ação nossa)");
    r.unmount();
  });

  it("LINE (once live) names the doctor and the clinic", () => {
    let r = render(<PrivacyEn turnstile={false} line />);
    expect(r.container.textContent).toContain("LINE receives only the doctor\u2019s and the clinic\u2019s names");
    expect(r.container.textContent).toContain("the doctor's and the clinic's names, the date and time");
    r.unmount();
    r = render(<PrivacyPtBR turnstile={false} line />);
    expect(r.container.textContent).toContain("O LINE recebe só os nomes do médico e da clínica");
    r.unmount();
  });
});

describe("privacy 2026-10-09: §3.6 marketing attribution, signups and Founders applications (visible)", () => {
  it("what is saved and where, in both languages; the Founders clause with the Founders page", () => {
    let r = render(<PrivacyEn turnstile={false} founders />);
    expect(r.container.textContent).toContain("only with your consent, anonymous usage statistics about our website and where your visit came from: we save the campaign that brought you (UTM tags), the referring website, the first page you visited and when, with your account when you sign up, or, if you apply to the Founders Program, with your application (kept up to 12 months after its last status change, or while your account exists if you're accepted).");
    r.unmount();
    r = render(<PrivacyEn turnstile={false} />);
    expect(r.container.textContent).toContain("the first page you visited and when, with your account when you sign up. ");
    expect(r.container.textContent).not.toContain("Founders Program, with your application");
    r.unmount();
    r = render(<PrivacyPtBR turnstile={false} founders />);
    expect(r.container.textContent).toContain("somente com o seu consentimento, estatísticas anônimas de uso do nosso site e a origem da sua visita: guardamos a campanha que trouxe você (tags UTM), o site de origem, a primeira página que você visitou e quando, com a sua conta quando você se cadastra, ou, se você se inscrever no Programa Fundadores, com a sua inscrição (guardada até 12 meses após a última mudança de status, ou enquanto a sua conta existir, se você for aceito).");
    r.unmount();
  });

  it("G7 (187): kept with the pending signup until the email is confirmed (cf's words)", () => {
    let r = render(<PrivacyEn turnstile={false} />);
    expect(r.container.textContent).toContain("Until you confirm your email, we keep these details with your pending signup (deleted when you confirm, or after 30 days at most).");
    r.unmount();
    r = render(<PrivacyPtBR turnstile={false} founders />);
    expect(r.container.textContent).toContain("Até você confirmar o e-mail, guardamos esses dados com o seu cadastro pendente (apagados na confirmação ou em no máximo 30 dias).");
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

describe("Z-API row lists every send-whatsapp message (c6 B1)", () => {
  it("reminders, payment reminders and reschedule requests to the clinic, in both languages", () => {
    let r = render(<PrivacyEn turnstile={false} notices whatsapp whatsappAuto />);
    expect(r.container.textContent).toContain("appointment confirmations, changes, cancellations, reminders, payment reminders and a welcome message when they connect, to the patient (their phone number and the message), and reschedule requests to the clinic (the patient's name and the proposed time)");
    r.unmount();
    r = render(<PrivacyPtBR turnstile={false} notices whatsapp whatsappAuto />);
    expect(r.container.textContent).toContain("confirmações, alterações, cancelamentos, lembretes, lembretes de pagamento e uma mensagem de boas-vindas quando ele se conecta, ao paciente (o telefone dele e a mensagem), e pedidos de remarcação à clínica (o nome do paciente e o horário proposto)");
    r.unmount();
  });
});
