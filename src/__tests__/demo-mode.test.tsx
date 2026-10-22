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
}));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: h.locale }),
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
  assign.mockClear();
  replace.mockClear();
  Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign, replace, search: "" } });
});
afterEach(() => Object.defineProperty(window, "location", { configurable: true, value: original }));

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
  const show = () => render(wrap(<DemoPage />));

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
    const { container, unmount } = render(wrap(<DemoCta className="x" />));
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
    unmount();
    h.flags = [{ key: "demo_mode", enabled: true }];
    render(wrap(<DemoCta className="x" />));
    const a = await screen.findByTestId("landing-demo-cta");
    expect(a).toHaveTextContent(pt.demo.landingCta);
    expect(a).toHaveAttribute("href", "/demo");
  });
});
