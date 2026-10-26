import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Demo guards, web (specs/demo-mode.md; 234's contract §5): the web's own
// routes that reach the real world refuse a demo (anonymous) session with
// 403 demo_not_allowed BEFORE doing anything; in the UI, a blocked control
// is shown inert with "Disponível na sua conta" + the sign-up CTA, and a
// demo refusal or the demo's SolvyAI quota opens the same message as a sheet.

const h = vi.hoisted(() => ({
  user: { id: "anon-1", is_anonymous: true, email: null } as { id: string; is_anonymous?: boolean; email: string | null } | null,
  touched: [] as string[],
  calls: [] as string[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => { h.touched.push("from"); return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "professional" }, error: null }) }) }) }; },
    rpc: async (fn: string) => { h.touched.push(fn); return { data: null, error: null }; },
  }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: async (fn: string) => { h.calls.push(fn); return { data: null, error: null }; },
    auth: { signOut: async () => { h.calls.push("signOut"); }, getUser: async () => ({ data: { user: h.user } }) },
  }),
}));
vi.mock("@/lib/conditions", async (orig) => {
  const real = await orig<typeof import("@/lib/conditions")>();
  return { ...real, conditionMet: (id: Parameters<typeof real.conditionMet>[0]) => (id === "founders-upload-live" || id === "migration-126" ? true : real.conditionMet(id)) };
});
vi.mock("@/lib/liveFeatures", async (orig) => {
  const real = await orig<typeof import("@/lib/liveFeatures")>();
  return { ...real, liveFeatures: new Proxy(real.liveFeatures, { get: (t, k) => (k === "founders" ? true : (t as Record<string, unknown>)[k as string]) }) };
});
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { POST as checkout } from "@/app/api/checkout/stripe/route";
import { POST as portal } from "@/app/api/billing/portal/route";
import { POST as close } from "@/app/api/account/close/route";
import { POST as register } from "@/app/api/founders/register/route";
import { POST as uploadUrl } from "@/app/api/founders/upload-url/route";
import { GET as exportCsv } from "@/app/api/patients/export/route";
import { DemoBlockedSheet, DemoGate, DemoProvider, notifyDemoBlocked } from "@/components/DemoGate";
import { setDemoCounting } from "@/lib/demoMetrics";

const post = (body: unknown = {}) =>
  new NextRequest(new URL("/x", "https://www.solvymed.com"), { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("the web's real-world routes refuse a demo session (234 §5.7)", () => {
  beforeEach(() => {
    h.user = { id: "anon-1", is_anonymous: true, email: null };
    h.touched = [];
  });

  it.each([
    ["checkout (Stripe)", () => checkout(post({ plan: "monthly" }))],
    ["billing portal", () => portal(post())],
    ["close account", () => close(post({ reason: "x" }))],
    ["founders register", () => register(post({ path: "anon-1/x.pdf", confirmed: true }))],
    ["founders upload URL", () => uploadUrl(post({ fileName: "patients.csv", size: 10, confirmed: true }))],
    ["patients CSV export (no CSV leaves a demo)", () => exportCsv(new NextRequest(new URL("/api/patients/export?locale=pt-BR", "https://www.solvymed.com")))],
  ])("%s: 403 demo_not_allowed, before any query", async (_name, call) => {
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "demo_not_allowed" });
    expect(h.touched).toEqual([]);
  });

  it("a real account passes this check (it gets as far as its usual checks)", async () => {
    h.user = { id: "doc-1", is_anonymous: false, email: "doc@example.invalid" };
    const res = await portal(post());
    expect(res.status).not.toBe(403);
    expect(h.touched.length).toBeGreaterThan(0);
  });
});

describe("DemoGate + the sheet", () => {
  const assign = vi.fn((u: string) => h.calls.push(`assign ${u}`));
  const original = window.location;
  beforeEach(() => {
    h.calls = [];
    assign.mockClear();
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign } });
  });
  afterEach(() => Object.defineProperty(window, "location", { configurable: true, value: original }));

  const show = (demo: boolean) =>
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <DemoProvider value={{ demo, locale: "pt-BR", country: "TH" }}>
          <DemoGate><button type="button" onClick={() => h.calls.push("real-action")}>Convidar</button></DemoGate>
          <DemoBlockedSheet locale="pt-BR" country="TH" />
        </DemoProvider>
      </NextIntlClientProvider>,
    );

  it("outside a demo: the control as it is", () => {
    show(false);
    fireEvent.click(screen.getByText("Convidar"));
    expect(h.calls).toEqual(["real-action"]);
    expect(screen.queryByTestId("demo-blocked")).toBeNull();
  });

  it("in a demo: inert; a tap says \"Disponível na sua conta\"; its CTA leaves for the sign-up", async () => {
    setDemoCounting(true);
    show(true);
    const gate = screen.getByTestId("demo-blocked");
    fireEvent.click(screen.getByRole("button", { name: pt.demo.blocked }));
    expect(h.calls).not.toContain("real-action");
    expect(gate).toHaveTextContent(pt.demo.blockedBody);
    fireEvent.click(screen.getByText(pt.demo.signup));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(h.calls).toEqual(["demo_count", "end_demo", "signOut", "assign /pt-BR/auth/signup?c=TH&via=demo"]);
  });

  it("the safety net: a demo refusal and the SolvyAI quota open the sheet with their own text", () => {
    show(true);
    act(() => notifyDemoBlocked());
    expect(screen.getByTestId("demo-blocked-sheet")).toHaveTextContent(pt.demo.blocked);
    act(() => notifyDemoBlocked("aiQuota"));
    expect(screen.getByTestId("demo-blocked-sheet")).toHaveAttribute("data-kind", "aiQuota");
    expect(screen.getByTestId("demo-blocked-sheet")).toHaveTextContent(pt.demo.aiQuotaTitle);
  });
});
