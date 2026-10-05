import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";

// 167 "Refer a colleague" on the website (migration 180): the private list by
// exact public code, the referral message with the colleague's public link;
// nothing stored, no patient data shared. Doctors only.

const h = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn(), remove: vi.fn() }));
vi.mock("@/app/[locale]/(site)/dashboard/colleague-actions", () => ({ listColleagues: h.list, addColleague: h.add, removeColleague: h.remove }));
vi.mock("@/components/CookieSettingsButton", () => ({ CookieSettingsButton: () => null }));

import { colleagueError, colleagueLink, colleagueName, firstName, type ColleagueRow } from "@/lib/colleagues";
import { ColleaguesCard } from "@/app/[locale]/(site)/dashboard/settings/ColleaguesCard";
import { ReferColleague } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/ReferColleague";
import { PrivacyEn } from "@/app/[locale]/(site)/privacy/PrivacyEn";
import { PrivacyPtBR } from "@/app/[locale]/(site)/privacy/PrivacyPtBR";
import { conditionMet } from "@/lib/conditions";

const card = (o: Partial<ColleagueRow> = {}): ColleagueRow => ({
  colleague_id: "11111111-1111-4111-8111-111111111111", display_name: "Ana Lima", title: "Dra.", specialty: "Dermatologia",
  accent_color: null, logo_square_path: null, logo_wide_path: null, public_code: "ANA123", country: "BR",
  added_at: "2026-10-07T10:00:00Z", available: true, ...o,
});
const intl = (ui: React.ReactNode, locale = "pt-BR", messages: object = pt) => render(<NextIntlClientProvider locale={locale} messages={messages}>{ui}</NextIntlClientProvider>);

beforeEach(() => { h.list.mockReset(); h.add.mockReset(); h.remove.mockReset(); });

describe("the helpers", () => {
  it("the public link with the country hint; the name with the brand title; the first name", () => {
    expect(colleagueLink(card())).toBe("https://www.solvymed.com/join/ANA123?c=BR");
    expect(colleagueLink(card({ country: "US" }))).toBe("https://www.solvymed.com/join/ANA123");
    expect(colleagueLink(card({ public_code: null }))).toBeNull();
    expect(colleagueName(card())).toBe("Dra. Ana Lima");
    expect(firstName("  Maria  das Dores ")).toBe("Maria");
  });
  it("the RPC codes", () => {
    expect(colleagueError("self")).toBe("self");
    expect(colleagueError("limit_reached")).toBe("limit");
    expect(colleagueError("too_many_attempts")).toBe("tooMany");
    expect(colleagueError("not_allowed")).toBe("notAllowed");
    expect(colleagueError("boom")).toBe("failed");
  });
});

describe("Settings → Meus colegas", () => {
  it("empty, then add by code: the row and UX's confirmation", async () => {
    h.add.mockResolvedValue({ ok: true, row: card() });
    intl(<ColleaguesCard initial={[]} loadFailed={false} />);
    expect(screen.getByText(pt.colleagues.empty)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(pt.colleagues.codeLabel), { target: { value: "ana123" } });
    fireEvent.click(screen.getByRole("button", { name: pt.colleagues.addButton }));
    await screen.findByText("Dra. Ana Lima adicionado aos seus colegas.");
    expect(h.add).toHaveBeenCalledWith("ana123");
    expect(screen.getByText("Dermatologia")).toBeInTheDocument();
  });
  it("not found: UX's line (publish My brand)", async () => {
    h.add.mockResolvedValue({ ok: false, code: "notFound" });
    intl(<ColleaguesCard initial={[]} loadFailed={false} />);
    fireEvent.change(screen.getByLabelText(pt.colleagues.codeLabel), { target: { value: "XX" } });
    fireEvent.click(screen.getByRole("button", { name: pt.colleagues.addButton }));
    await screen.findByText("Código não encontrado. Se o código estiver certo, peça ao seu colega para publicar a marca em Minha marca.");
  });
  it("an unavailable colleague: the name, 'no longer available', Remove only; remove works", async () => {
    h.remove.mockResolvedValue({ ok: true });
    intl(<ColleaguesCard initial={[card({ available: false, title: null, specialty: null, public_code: null, country: null })]} loadFailed={false} />);
    expect(screen.getByText(pt.colleagues.unavailable)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: pt.colleagues.remove }));
    await waitFor(() => expect(screen.getByText(pt.colleagues.empty)).toBeInTheDocument());
  });
});

describe("Indicar colega", () => {
  const sheet = (props: Partial<React.ComponentProps<typeof ReferColleague>> = {}) =>
    intl(<ReferColleague patientName="Maria das Dores" patientPhone="(11) 98888-7777" practiceCountry="BR" whatsapp {...props} />);

  it("lists available colleagues only; the message with the first name, specialty and link; WhatsApp to the patient", async () => {
    h.list.mockResolvedValue({ ok: true, rows: [card(), card({ colleague_id: "22222222-2222-4222-8222-222222222222", display_name: "Paulo", available: false })] });
    sheet();
    fireEvent.click(screen.getByRole("button", { name: pt.colleagues.refer }));
    await screen.findByText("Dra. Ana Lima");
    expect(screen.queryByText("Paulo")).toBeNull();
    fireEvent.click(screen.getByText("Dra. Ana Lima"));
    const msg = "Olá, Maria! Indico Dra. Ana Lima (Dermatologia). Para marcar, acesse: https://www.solvymed.com/join/ANA123?c=BR";
    expect((screen.getByTestId("refer-message") as HTMLTextAreaElement).value).toBe(msg);
    const wa = new URL((screen.getByTestId("refer-whatsapp") as HTMLAnchorElement).href);
    expect(wa.pathname).toBe("/5511988887777");
    expect(wa.searchParams.get("text")).toBe(msg);
  });

  it("no specialty: no parentheses; no phone or no WhatsApp: copy only", async () => {
    h.list.mockResolvedValue({ ok: true, rows: [card({ specialty: null })] });
    sheet({ patientPhone: null });
    fireEvent.click(screen.getByRole("button", { name: pt.colleagues.refer }));
    fireEvent.click(await screen.findByText("Dra. Ana Lima"));
    expect((screen.getByTestId("refer-message") as HTMLTextAreaElement).value).toBe("Olá, Maria! Indico Dra. Ana Lima. Para marcar, acesse: https://www.solvymed.com/join/ANA123?c=BR");
    expect(screen.queryByTestId("refer-whatsapp")).toBeNull();
    expect(screen.getByRole("button", { name: pt.colleagues.copy })).toBeInTheDocument();
  });

  it("no colleagues yet: points to Settings", async () => {
    h.list.mockResolvedValue({ ok: true, rows: [] });
    sheet({ whatsapp: false });
    fireEvent.click(screen.getByRole("button", { name: pt.colleagues.refer }));
    await screen.findByText(pt.colleagues.referNone);
  });

  it("UX's copy in en / pt-BR / th", () => {
    expect([en.colleagues.title, pt.colleagues.title, th.colleagues.title]).toEqual(["My colleagues", "Meus colegas", "เพื่อนแพทย์ของฉัน"]);
    expect(th.colleagues.notFound).toBe("ไม่พบรหัสนี้ หากรหัสถูกต้อง โปรดขอให้เพื่อนแพทย์เผยแพร่แบรนด์ใน แบรนด์ของฉัน");
    expect(th.colleagues.shareMessage).toBe("สวัสดี คุณ{patient} ขอแนะนำ {colleague} ({specialty}) นัดหมายได้ที่: {link}");
  });
});

describe("privacy: the colleague-list line (referrals-live)", () => {
  it("hidden today; with it, in both languages", () => {
    expect(conditionMet("referrals-live")).toBe(false);
    let r = render(<PrivacyEn turnstile={false} />);
    expect(r.container.textContent).not.toContain("Colleague list");
    r.unmount();
    r = render(<PrivacyEn turnstile={false} referrals />);
    expect(r.container.textContent).toContain("Colleague list: a professional can keep a private list of colleagues");
    expect(r.container.textContent).toContain("Wrong codes entered are kept for 1 day, to prevent guessing.");
    r.unmount();
    r = render(<PrivacyPtBR turnstile={false} referrals />);
    expect(r.container.textContent).toContain("Lista de colegas: um profissional pode manter uma lista privada de colegas");
    expect(r.container.textContent).toContain("Códigos errados digitados ficam guardados por 1 dia, para evitar tentativas de adivinhação.");
    r.unmount();
  });
});
