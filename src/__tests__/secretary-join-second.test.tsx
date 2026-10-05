import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";

// 0a slice 1b on the website (cf): with multi_practice_secretary on, a
// secretary already on one team can join another doctor's, from the invite
// link or from Settings → "Entrar na equipe de outro médico"; the RPC decides
// (181: one country; the team limit). Switch off: today's "already in a
// clinic" message, and no card.

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const h = vi.hoisted(() => ({
  multi: true,
  flags: [] as { key: string; enabled: boolean }[],
  acceptError: null as null | { message: string },
  calls: [] as string[],
  refresh: vi.fn(),
}));
vi.mock("@/lib/liveFeatures", async (orig) => {
  const real = await orig<typeof import("@/lib/liveFeatures")>();
  return { ...real, liveFeatures: new Proxy(real.liveFeatures, { get: (t, k) => (k === "multiPractice" ? h.multi : t[k as keyof typeof t]) }) };
});
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: h.refresh, replace: vi.fn() }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
const client = {
  auth: { getUser: async () => ({ data: { user: { id: "sec-1" } } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "secretary", invited_by_professional_id: A } }) }) }) }),
  rpc: async (name: string) => {
    h.calls.push(name);
    if (name === "get_server_flags") return { data: h.flags, error: null };
    if (name === "get_my_clinic") return { data: [{ professional_name: "Dra. Ana" }], error: null };
    if (name === "get_secretary_invite") return { data: [{ professional_name: "Dr. Bruno", clinic_name: null }], error: null };
    if (name === "accept_secretary_invite") return h.acceptError ? { data: null, error: h.acceptError } : { data: B, error: null };
    return { data: null, error: null };
  },
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("@/lib/effectiveProfId", () => ({
  myPractices: async () => [
    { professional_id: A, display_name: "Ana Lima", title: "Dra.", accent_color: null, is_primary: true },
    { professional_id: B, display_name: "Bruno Reis", title: "Dr.", accent_color: null, is_primary: false },
  ],
}));

import SecretaryInvitePage from "@/app/[locale]/(site)/join/secretary/[code]/page";
import { acceptSecretaryInvite } from "@/app/[locale]/(site)/join/secretary/[code]/actions";
import { InviteDecision } from "@/app/[locale]/(site)/join/secretary/[code]/InviteDecision";
import { JoinPracticeCard } from "@/app/[locale]/(site)/dashboard/settings/JoinPracticeCard";
import { canJoinAnotherPractice } from "@/lib/secretaryJoin";
import { createClient } from "@/lib/supabase/server";

const ON = [{ key: "multi_practice_secretary", enabled: true }];
const wrap = (ui: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{ui}</NextIntlClientProvider>;
const page = async () =>
  renderToStaticMarkup(wrap(await SecretaryInvitePage({ params: Promise.resolve({ locale: "pt-BR", code: "S-ABCD1234" }) })));

beforeEach(() => {
  h.multi = true;
  h.flags = ON;
  h.acceptError = null;
  h.calls = [];
  h.refresh.mockReset();
});

describe("the switch", () => {
  it("needs both the website flag and the server switch", async () => {
    const s = await createClient();
    expect(await canJoinAnotherPractice(s as never)).toBe(true);
    h.flags = [{ key: "multi_practice_secretary", enabled: false }];
    expect(await canJoinAnotherPractice(s as never)).toBe(false);
    h.flags = ON;
    h.multi = false;
    expect(await canJoinAnotherPractice(s as never)).toBe(false);
  });
});

describe("the invite link, for a secretary already on a team", () => {
  it("switch on: no pre-check, the invite and Accept", async () => {
    const html = await page();
    expect(html).toContain("inviteBodyNoClinic");
    expect(html).not.toContain("alreadyInClinic");
    expect(h.calls).not.toContain("get_my_clinic");
  });

  it("switch off: today's message, naming her doctor", async () => {
    h.flags = [];
    const html = await page();
    expect(html).toContain("alreadyInClinicNamed");
    expect(h.calls).not.toContain("get_secretary_invite");
  });

  it("the action returns the doctor she joined, by her practice list", async () => {
    expect(await acceptSecretaryInvite("S-ABCD1234")).toEqual({ ok: true, doctor: "Dr. Bruno Reis" });
    h.multi = false;
    expect(await acceptSecretaryInvite("S-ABCD1234")).toEqual({ ok: true, doctor: "" });
  });

  it("Accept says who added her and where to pick them (no redirect)", async () => {
    render(wrap(<InviteDecision code="S-ABCD1234" locale="pt-BR" secondPractice />));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Aceitar" })); });
    expect((await screen.findByTestId("invite-joined")).textContent).toBe('Dr. Bruno Reis adicionou você à equipe. Escolha o médico em "Agenda de".');
    expect(screen.getByRole("link", { name: pt.secretary.continue }).getAttribute("href")).toBe("/pt-BR/dashboard");
  });
});

describe("Settings → Entrar na equipe de outro médico", () => {
  it("joins with the code, says so, and refreshes the switcher", async () => {
    render(wrap(<JoinPracticeCard />));
    expect(screen.getByRole("heading").textContent).toBe("Entrar na equipe de outro médico");
    fireEvent.change(screen.getByLabelText("Código de convite"), { target: { value: "S-ABCD1234" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Entrar" })); });
    expect((await screen.findByTestId("join-practice-done")).textContent).toBe('Dr. Bruno Reis adicionou você à equipe. Escolha o médico em "Agenda de".');
    expect(h.refresh).toHaveBeenCalled();
  });

  it("maps the RPC's refusals", async () => {
    render(wrap(<JoinPracticeCard />));
    for (const [code, text] of [
      ["different_country", pt.secretary.differentCountry],
      ["team_limit_reached", pt.secretary.teamLimitReachedInvitee],
      ["invite_invalid", pt.secretary.inviteInvalid],
      ["boom", pt.secretary.genericError],
    ]) {
      h.acceptError = { message: code };
      fireEvent.change(screen.getByLabelText("Código de convite"), { target: { value: "S-ABCD1234" } });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Entrar" })); });
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("the app's words in en / pt-BR / th", () => {
    expect([en, pt, th].map((m) => [m.secretaryPractices.joinRow, m.secretaryPractices.joinPickHint])).toEqual([
      ["Join another doctor's team", 'Pick the doctor in "{label}".'],
      ["Entrar na equipe de outro médico", 'Escolha o médico em "{label}".'],
      ["เข้าร่วมทีมของแพทย์ท่านอื่น", 'เลือกแพทย์ได้ที่ "{label}"'],
    ]);
  });
});
