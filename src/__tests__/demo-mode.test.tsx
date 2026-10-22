import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Demo mode, web PR A (specs/demo-mode.md): /demo → an anonymous session →
// start_demo → the dashboard; the amber DEMO bar with the teal sign-up button
// and "[Demo]" titles; exit and sign-up end the demo and sign out BEFORE
// leaving (01); the landing CTA; all dark until demo_mode (or ?demo_test=1).

const h = vi.hoisted(() => ({
  flags: [] as { key: string; enabled: boolean }[],
  user: null as null | { id: string; is_anonymous?: boolean },
  calls: [] as string[],
  startError: null as unknown,
  anonError: null as unknown,
  track: vi.fn(),
  locale: "pt-BR",
  verifyStatus: 200,
}));
// The bot check: the widget hands a token at once; /api/demo/verify answers verifyStatus.
vi.mock("@/components/DemoTurnstile", async () => {
  const { useEffect } = await import("react");
  return { DemoTurnstile: ({ onToken }: { onToken: (t: string) => void }) => { useEffect(() => { h.calls.push("turnstile"); onToken("tok"); }, []); return null; } }; // eslint-disable-line react-hooks/exhaustive-deps
});
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: h.locale }),
  usePathname: () => "/pt-BR/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/lib/track", () => ({ track: h.track }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      h.calls.push(args ? `${fn}(${JSON.stringify(args)})` : fn);
      if (fn === "get_public_flags") return { data: h.flags, error: null };
      if (fn === "start_demo") return { data: null, error: h.startError };
      return { data: null, error: null };
    },
    auth: {
      getUser: async () => ({ data: { user: h.user } }),
      signInAnonymously: async () => { h.calls.push("signInAnonymously"); return { data: {}, error: h.anonError }; },
      signOut: async () => { h.calls.push("signOut"); return { error: null }; },
    },
  }),
}));

import { demoCountry, demoTitle, isDemoUser, leaveDemo } from "@/lib/demo";
import { DemoBar } from "@/components/DemoBar";
import { DemoCta } from "@/components/DemoCta";
import DemoPage from "@/app/[locale]/(site)/demo/page";
import { DemoClient } from "@/app/[locale]/(site)/demo/DemoClient";

const wrap = (node: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{node}</NextIntlClientProvider>;

const assign = vi.fn((u: string) => h.calls.push(`assign ${u}`));
const replace = vi.fn((u: string) => h.calls.push(`replace ${u}`));
const original = window.location;
beforeEach(() => {
  h.flags = [];
  h.user = null;
  h.calls = [];
  h.startError = null;
  h.anonError = null;
  h.track.mockReset();
  h.locale = "pt-BR";
  h.verifyStatus = 200;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => { h.calls.push(`verify ${init?.body}`); return new Response(JSON.stringify({}), { status: url === "/api/demo/verify" ? h.verifyStatus : 404 }); }));
  assign.mockClear();
  replace.mockClear();
  Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign, replace, search: "" } });
});
afterEach(() => { Object.defineProperty(window, "location", { configurable: true, value: original }); vi.unstubAllGlobals(); });

describe("lib/demo", () => {
  it("the country from the path (data), BR as the explicit default", () => {
    expect(demoCountry("pt-BR")).toBe("BR");
    expect(demoCountry("th")).toBe("TH");
    expect(demoCountry("en")).toBe("BR");
    expect(demoCountry("ja")).toBe("BR");
  });
  it("[Demo] once in the title; only anonymous sessions are demo ones", () => {
    expect(demoTitle("Agenda | SolvyMed")).toBe("[Demo] Agenda | SolvyMed");
    expect(demoTitle("[Demo] Agenda")).toBe("[Demo] Agenda");
    expect(isDemoUser({ is_anonymous: true })).toBe(true);
    expect(isDemoUser({ is_anonymous: false })).toBe(false);
    expect(isDemoUser(null)).toBe(false);
  });
  it("leaveDemo: end_demo then sign-out; an end_demo failure never blocks the sign-out", async () => {
    await leaveDemo({ rpc: async () => { throw new Error("down"); }, auth: { signOut: async () => { h.calls.push("signOut"); } } });
    expect(h.calls).toEqual(["signOut"]);
  });
});

describe("DemoBar", () => {
  it("DEMO, what it is, and the teal sign-up button; [Demo] in the title", async () => {
    document.title = "Agenda | SolvyMed";
    render(wrap(<DemoBar locale="pt-BR" country="TH" />));
    const bar = screen.getByTestId("demo-bar");
    expect(bar).toHaveTextContent("DEMO");
    expect(bar).toHaveTextContent(pt.demo.barText);
    expect(screen.getByTestId("demo-signup")).toHaveTextContent(pt.demo.signup);
    await waitFor(() => expect(document.title).toBe("[Demo] Agenda | SolvyMed"));
  });

  it("sign-up: end_demo + sign-out BEFORE the sign-up page loads, country prefilled (01)", async () => {
    render(wrap(<DemoBar locale="pt-BR" country="TH" />));
    fireEvent.click(screen.getByTestId("demo-signup"));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(h.calls).toEqual(["end_demo", "signOut", "assign /pt-BR/auth/signup?c=TH&via=demo"]);
    expect(h.track).toHaveBeenCalledWith("demo_signup_click", { where: "bar" });
  });

  it("exit (behind the DEMO tag): end_demo + sign-out, then the landing", async () => {
    render(wrap(<DemoBar locale="en" country="BR" />));
    fireEvent.click(screen.getByRole("button", { name: pt.demo.menu }));
    fireEvent.click(screen.getByTestId("demo-exit"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(h.calls).toEqual(["end_demo", "signOut", "assign /"]);
    expect(h.track).toHaveBeenCalledWith("demo_exit");
  });
});

describe("/demo", () => {
  const show = () => render(wrap(<DemoClient testAllowed siteKey="site" />));

  it("the bot check (01 + 0e): a new visitor passes Turnstile BEFORE any session, then the ticket, then start_demo", async () => {
    h.flags = [{ key: "demo_mode", enabled: true }];
    show();
    await waitFor(() => expect(replace).toHaveBeenCalled());
    const order = ["turnstile", "signInAnonymously", `verify ${JSON.stringify({ token: "tok" })}`];
    expect(h.calls.filter((c) => order.includes(c))).toEqual(order);
    expect(h.calls.findIndex((c) => c.startsWith("start_demo"))).toBeGreaterThan(h.calls.indexOf(order[2]));
  });

  it("the check fails (verify refused): end_demo, sign-out, the retry; start_demo never called", async () => {
    h.flags = [{ key: "demo_mode", enabled: true }];
    h.verifyStatus = 403;
    show();
    expect(await screen.findByTestId("demo-error")).toBeInTheDocument();
    await waitFor(() => expect(h.calls).toContain("signOut"));
    expect(h.calls.indexOf("end_demo")).toBeLessThan(h.calls.indexOf("signOut"));
    expect(h.calls.some((c) => c.startsWith("start_demo"))).toBe(false);
  });

  it("a returning demo session: start_demo first (an open sandbox needs no check); demo_unverified → the check, then start_demo again", async () => {
    h.flags = [{ key: "demo_mode", enabled: true }];
    h.user = { id: "anon-1", is_anonymous: true };
    h.startError = { message: "demo_unverified", code: "P0001" };
    show();
    await waitFor(() => expect(h.calls.filter((c) => c.startsWith("start_demo")).length).toBe(2));
    const i = h.calls.indexOf("turnstile");
    expect(i).toBeGreaterThan(h.calls.findIndex((c) => c.startsWith("start_demo")));
    expect(h.calls).not.toContain("signInAnonymously");
  });

  it("the loading screen says not to enter real patient data", () => {
    h.flags = [{ key: "demo_mode", enabled: true }];
    show();
    expect(screen.getByTestId("demo-loading-hint")).toHaveTextContent(pt.demo.realDataHint);
  });

  it("the switch off: the sign-up card, no session created", async () => {
    show();
    expect(await screen.findByTestId("demo-unavailable")).toBeInTheDocument();
    expect(h.calls).not.toContain("signInAnonymously");
  });

  it("on, no session: anonymous sign-in → start_demo with the path's country → the dashboard", async () => {
    h.flags = [{ key: "demo_mode", enabled: true }];
    h.locale = "th";
    show();
    expect(screen.getByTestId("demo-loading")).toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/th/dashboard"));
    expect(h.calls).toContain("signInAnonymously");
    expect(h.calls).toContain(`start_demo(${JSON.stringify({ p_country: "TH", p_locale: "th" })})`);
    expect(h.track).toHaveBeenCalledWith("demo_start", { platform: "web", c: "TH" });
  });

  it("?demo_test=1 opens it with the switch off; an existing demo session is reused", async () => {
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign, replace, search: "?demo_test=1" } });
    h.user = { id: "anon-1", is_anonymous: true };
    show();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/pt-BR/dashboard"));
    expect(h.calls).not.toContain("signInAnonymously");
  });

  it("on Production (www), ?demo_test=1 does nothing: only the switch opens the demo (01)", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    try {
      Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign, replace, search: "?demo_test=1" } });
      render(wrap(<DemoPage />));
      expect(await screen.findByTestId("demo-unavailable")).toBeInTheDocument();
      expect(h.calls).not.toContain("signInAnonymously");
      expect(h.calls.some((c) => c.startsWith("start_demo"))).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("on a preview, the server page lets ?demo_test=1 through", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    try {
      Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign, replace, search: "?demo_test=1" } });
      render(wrap(<DemoPage />));
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/pt-BR/dashboard"));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("a real account signed in: never touched, offered its dashboard", async () => {
    h.flags = [{ key: "demo_mode", enabled: true }];
    h.user = { id: "doc-1", is_anonymous: false };
    show();
    expect(await screen.findByText(pt.demo.signedInTitle)).toBeInTheDocument();
    expect(h.calls.some((c) => c.startsWith("start_demo"))).toBe(false);
    expect(h.calls).not.toContain("signInAnonymously");
  });

  it("demo_busy (234's caps): \"try again in a moment\", not an error", async () => {
    h.flags = [{ key: "demo_mode", enabled: true }];
    h.startError = { message: "demo_busy", code: "P0001" };
    show();
    expect(await screen.findByTestId("demo-busy")).toHaveTextContent(pt.demo.busy);
    expect(screen.queryByTestId("demo-error")).toBeNull();
  });

  it("demo_off (234: the server's switch is off, even with ?demo_test=1 here): the sign-up card, signed out", async () => {
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign, replace, search: "?demo_test=1" } });
    h.startError = { message: "demo_off", code: "P0001" };
    show();
    expect(await screen.findByTestId("demo-unavailable")).toBeInTheDocument();
    await waitFor(() => expect(h.calls).toContain("signOut"));
    expect(h.calls.indexOf("end_demo")).toBeGreaterThan(-1);
    expect(h.calls.indexOf("end_demo")).toBeLessThan(h.calls.indexOf("signOut"));
    expect(screen.queryByTestId("demo-error")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ["demo_busy", "demo-busy"],
    ["unsupported_country", "demo-error"],
    ["network down", "demo-error"],
  ])("%s on a fresh session: end_demo, then sign-out (no orphan; 01)", async (message, testId) => {
    h.flags = [{ key: "demo_mode", enabled: true }];
    h.startError = { message };
    show();
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    await waitFor(() => expect(h.calls).toContain("signOut"));
    expect(h.calls.filter((c) => c === "end_demo")).toHaveLength(1);
    expect(h.calls.indexOf("end_demo")).toBeLessThan(h.calls.indexOf("signOut"));
  });

  it("a reload's network error never ends a running demo (the session wasn't made here)", async () => {
    h.flags = [{ key: "demo_mode", enabled: true }];
    h.user = { id: "anon-1", is_anonymous: true };
    h.startError = { message: "network down" };
    show();
    expect(await screen.findByTestId("demo-error")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(h.calls).not.toContain("end_demo");
    expect(h.calls).not.toContain("signOut");
  });

  it("start_demo fails: the error with retry and sign-up", async () => {
    h.flags = [{ key: "demo_mode", enabled: true }];
    h.startError = { message: "rate_limited" };
    show();
    expect(await screen.findByTestId("demo-error")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("DemoCta (landing)", () => {
  it("hidden while off; shown when on, to /demo", async () => {
    const { container, unmount } = render(wrap(<DemoCta className="x" testAllowed />));
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
    unmount();
    h.flags = [{ key: "demo_mode", enabled: true }];
    render(wrap(<DemoCta className="x" testAllowed />));
    const a = await screen.findByTestId("landing-demo-cta");
    expect(a).toHaveTextContent(pt.demo.landingCta);
    expect(a).toHaveAttribute("href", "/demo");
  });

  it("?demo_test=1 shows it off Production only (testAllowed comes from the server)", async () => {
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, search: "?demo_test=1" } });
    const { container, unmount } = render(wrap(<DemoCta className="x" testAllowed={false} />));
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
    unmount();
    render(wrap(<DemoCta className="x" testAllowed />));
    expect(await screen.findByTestId("landing-demo-cta")).toHaveAttribute("href", "/demo?demo_test=1");
  });
});
