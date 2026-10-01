import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Item 15 (151, send-secretary-invite): with secretary-invite-email-live the
// invite is emailed on create, "Reenviar convite" emails a fresh one once an
// hour (429s say when), and the invitee's signup shows the invite's email,
// locked. Off (today, until the privacy bump): nothing is emailed.

const h = vi.hoisted(() => ({
  live: false,
  sends: [] as unknown[],
  creates: [] as string[],
  sendResult: { ok: true, email: "ana@x.co", code: "S-NEWCODE1", nextAt: null } as Record<string, unknown>,
  params: new URLSearchParams(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/conditions", async (orig) => {
  const real = await orig<typeof import("@/lib/conditions")>();
  return { ...real, conditionMet: (id: string) => (id === "secretary-invite-email-live" ? h.live : real.conditionMet(id as never)) };
});
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => h.params,
}));
vi.mock("@/app/[locale]/(site)/dashboard/settings/team-actions", () => ({
  createSecretaryInvite: async (email: string) => { h.creates.push(email); return { ok: true, code: "S-ABCD2345" }; },
  revokeSecretaryInvite: async () => ({ ok: true }),
  removeSecretary: async () => ({ ok: true }),
  sendSecretaryInviteEmail: async (body: unknown) => { h.sends.push(body); return h.sendResult; },
}));
vi.mock("@/app/[locale]/(site)/dashboard/settings/SettingsClient", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: h.rpc }) }));
vi.mock("@/components/CookieSettingsButton", () => ({ CookieSettingsButton: () => null }));

import { TeamPanel, type TeamRow } from "@/app/[locale]/(site)/dashboard/settings/TeamPanel";
import SignupPage from "@/app/[locale]/(site)/auth/signup/page";
import { PrivacyEn } from "@/app/[locale]/(site)/privacy/PrivacyEn";
import { PrivacyPtBR } from "@/app/[locale]/(site)/privacy/PrivacyPtBR";

const invite = (sentMinutesAgo: number | null): TeamRow => ({
  kind: "invite", id: "inv-1", email: "ana@x.co", name: null, created_at: "2030-01-01T00:00:00Z", expires_at: null,
  sent_at: sentMinutesAgo === null ? null : new Date(Date.now() - sentMinutesAgo * 60_000).toISOString(),
});
function team(rows: TeamRow[]) {
  return render(<NextIntlClientProvider locale="pt-BR" messages={pt}><TeamPanel rows={rows} loadFailed={false} /></NextIntlClientProvider>);
}

beforeEach(() => {
  h.live = false; h.sends = []; h.creates = [];
  h.sendResult = { ok: true, email: "ana@x.co", code: "S-NEWCODE1", nextAt: null };
  h.rpc.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("Team: off (today)", () => {
  it("never emails; Reenviar makes a fresh invite to share, as before", async () => {
    team([invite(5)]);
    expect(screen.getByRole("button", { name: "Reenviar" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reenviar" }));
    await waitFor(() => expect(h.creates).toEqual(["ana@x.co"]));
    expect(h.sends).toEqual([]);
  });
});

describe("Team: live", () => {
  it("a new invite is emailed right away; the share buttons stay", async () => {
    h.live = true;
    team([]);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Bia@X.co" } });
    fireEvent.click(screen.getByRole("button", { name: pt.secretary.teamInvite }));
    expect(await screen.findByRole("status")).toHaveTextContent("E-mail enviado para bia@x.co");
    expect(h.sends).toEqual([{ code: "S-ABCD2345" }]);
    expect(screen.getByText("S-ABCD2345")).toBeInTheDocument();
  });

  it("Reenviar convite waits an hour after the last email, and says until when", () => {
    h.live = true;
    team([invite(10)]);
    expect(screen.getByRole("button", { name: "Reenviar convite" })).toBeDisabled();
    expect(screen.getByTestId("resend-wait")).toHaveTextContent(/^Você poderá reenviar às \d{2}:\d{2}$/);
  });

  it("after the hour: emails a fresh invite and shows its new code", async () => {
    h.live = true;
    team([invite(61)]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Reenviar convite" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Reenviar convite" }));
    expect(await screen.findByRole("status")).toHaveTextContent("E-mail enviado para ana@x.co");
    expect(h.sends).toEqual([{ resend_email: "ana@x.co" }]);
    expect(screen.getByText("S-NEWCODE1")).toBeInTheDocument();
    expect(h.creates).toEqual([]);
  });

  it("the daily cap and a failed send say what to do", async () => {
    h.live = true;
    h.sendResult = { ok: false, code: "daily_limit", nextAt: "2030-01-01T15:30:00Z" };
    const { unmount } = team([invite(null)]);
    fireEvent.click(screen.getByRole("button", { name: "Reenviar convite" }));
    expect(await screen.findByText(/^Você atingiu o limite de 10 convites por dia\. Tente novamente às \d{2}:\d{2}\.$/)).toBeInTheDocument();
    unmount();
    h.sendResult = { ok: false, code: "send_failed", nextAt: null };
    team([invite(null)]);
    fireEvent.click(screen.getByRole("button", { name: "Reenviar convite" }));
    expect(await screen.findByText("Não foi possível enviar o e-mail agora. Tente de novo ou compartilhe o link.")).toBeInTheDocument();
  });
});

describe("signup from an invite", () => {
  function signup() {
    h.params = new URLSearchParams("secretary=S-ABCD2345");
    return render(<NextIntlClientProvider locale="pt-BR" messages={pt}><SignupPage /></NextIntlClientProvider>);
  }
  it("live: the invite's email, filled in and locked", async () => {
    h.live = true;
    h.rpc.mockResolvedValue({ data: "ana@x.co", error: null });
    signup();
    expect(await screen.findByTestId("invite-email-locked")).toHaveTextContent("Este convite é para ana@x.co.");
    const input = screen.getByDisplayValue("ana@x.co") as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    expect(h.rpc).toHaveBeenCalledWith("secretary_invite_email", { p_code: "S-ABCD2345" });
  });
  it("off: typed as before, no lookup", () => {
    signup();
    expect(screen.queryByTestId("invite-email-locked")).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("privacy: the invite text only with the flag", () => {
  it("§3.7 and the Resend row", () => {
    let r = render(<PrivacyPtBR turnstile={false} />);
    expect(r.container.textContent).not.toMatch(/Convites de secretária|a pedido de um profissional/);
    r.unmount();
    r = render(<PrivacyPtBR turnstile={false} secretaryInvites />);
    expect(r.container.textContent).toContain("3.7 Convites de secretária:");
    expect(r.container.textContent).toContain("e convites enviados a pedido de um profissional");
    r.unmount();
    r = render(<PrivacyEn turnstile={false} secretaryInvites />);
    expect(r.container.textContent).toContain("the address is deleted 30 days after the invitation expires or is cancelled.");
    expect(r.container.textContent).toContain("and invitations sent at a professional's request");
  });
});
