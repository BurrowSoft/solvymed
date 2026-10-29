import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import { isWellFormedTipsToken, toTipsPrefs } from "@/lib/tips";

// The re-engagement contract (agreed v3): the doctor's "Dicas e lembretes do SolvyMed"
// switches in Configurações → Notificações, and the e-mails' one-click unsubscribe
// (/api/tips/unsubscribe: the page's JSON button and RFC 8058's form POST). 276's RPCs.

const TOKEN = "abcdefghijklmnopqrstuvwxyz012345"; // 32 url-safe characters
const h = vi.hoisted(() => ({
  live: true,
  calls: [] as { fn: string; args: unknown }[],
  answers: [] as { data: unknown; error: null | { message: string } }[],
}));
vi.mock("@/lib/tips", async (orig) => ({ ...(await orig<typeof import("@/lib/tips")>()), tipsTogglesLive: () => h.live }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: async (fn: string, args: unknown) => { h.calls.push({ fn, args }); return h.answers.shift() ?? { data: true, error: null }; } }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: async (fn: string, args?: unknown) => { h.calls.push({ fn, args }); return h.answers.shift() ?? { data: { push: true, email: true }, error: null }; } }),
}));

const { POST } = await import("@/app/api/tips/unsubscribe/route");
const { NotificationsCard } = await import("@/app/[locale]/(site)/dashboard/settings/NotificationsCard");
let ip = 0;
const post = (url: string, init: { body: string; headers: Record<string, string> }) =>
  POST(new NextRequest(url, { method: "POST", body: init.body, headers: { "x-forwarded-for": `10.0.0.${++ip}`, ...init.headers } }));

afterEach(() => {
  h.live = true;
  h.calls = [];
  h.answers = [];
});

describe("/api/tips/unsubscribe", () => {
  it("dark until tips-toggles-live: 404, no RPC", async () => {
    h.live = false;
    expect((await post("https://www.solvymed.com/api/tips/unsubscribe", { body: JSON.stringify({ t: TOKEN }), headers: { "content-type": "application/json" } })).status).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it("the page's button: JSON { t } → tips_email_optout_confirm, the same answer for any token", async () => {
    const res = await post("https://www.solvymed.com/api/tips/unsubscribe", { body: JSON.stringify({ t: TOKEN }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(200);
    expect(h.calls).toEqual([{ fn: "tips_email_optout_confirm", args: { p_token: TOKEN } }]);
  });

  it("RFC 8058 one-click: a form POST with the token in the URL", async () => {
    const res = await post(`https://www.solvymed.com/api/tips/unsubscribe?t=${TOKEN}`, { body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(res.status).toBe(200);
    expect(h.calls).toEqual([{ fn: "tips_email_optout_confirm", args: { p_token: TOKEN } }]);
  });

  it("a malformed token: 400, no RPC; a database failure: 503", async () => {
    expect((await post("https://www.solvymed.com/api/tips/unsubscribe?t=short", { body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } })).status).toBe(400);
    expect(h.calls).toEqual([]);
    h.answers = [{ data: null, error: { message: "boom" } }];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post("https://www.solvymed.com/api/tips/unsubscribe", { body: JSON.stringify({ t: TOKEN }), headers: { "content-type": "application/json" } })).status).toBe(503);
    spy.mockRestore();
  });

  it("the token shape: 32 url-safe characters", () => {
    expect(isWellFormedTipsToken(TOKEN)).toBe(true);
    expect(isWellFormedTipsToken(TOKEN + "a")).toBe(false);
    expect(isWellFormedTipsToken("abc+defghijklmnopqrstuvwxyz01234")).toBe(false);
    expect(isWellFormedTipsToken(null)).toBe(false);
  });
});

describe("Configurações → Notificações (the tips switches)", () => {
  const show = () => render(<NextIntlClientProvider locale="pt-BR" messages={pt}><NotificationsCard /></NextIntlClientProvider>);

  it("named 'Notificações' (the privacy text's path); reads the switches; a change saves only that switch", async () => {
    h.answers = [{ data: { push: true, email: false }, error: null }, { data: { push: false, email: false }, error: null }];
    show();
    expect(screen.getByRole("heading", { name: pt.notificationsSettings.title })).toBeInTheDocument();
    expect(document.getElementById("notifications")).not.toBeNull();
    await waitFor(() => expect(screen.getByTestId("tips-push")).toBeChecked());
    expect(screen.getByTestId("tips-email")).not.toBeChecked();
    fireEvent.click(screen.getByTestId("tips-push"));
    await waitFor(() => expect(h.calls.at(-1)).toEqual({ fn: "tips_prefs_set", args: { p_push: false, p_email: null } }));
    expect(screen.getByTestId("tips-push")).not.toBeChecked();
  });

  it("a failed save rolls the switch back and says so", async () => {
    h.answers = [{ data: { push: true, email: true }, error: null }, { data: null, error: { message: "network" } }];
    show();
    await waitFor(() => expect(screen.getByTestId("tips-email")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("tips-email"));
    expect(await screen.findByRole("alert")).toHaveTextContent(pt.notificationsSettings.saveError);
    expect(screen.getByTestId("tips-email")).toBeChecked();
  });

  it("toTipsPrefs: anything but false reads as on (276's defaults)", () => {
    expect(toTipsPrefs(null)).toEqual({ push: true, email: true });
    expect(toTipsPrefs({ push: false, email: "x" })).toEqual({ push: false, email: true });
  });
});
