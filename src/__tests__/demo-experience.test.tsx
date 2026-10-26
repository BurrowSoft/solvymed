import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Demo mode, web part B2 (specs/demo-mode.md): the PDF DEMO stamp, the
// moments of value (one sheet per kind, Google first), and the 2-minute tour
// (4 steps, the ring, completion → the sign-up ask).

const h = vi.hoisted(() => ({ pathname: "/pt-BR/dashboard", track: vi.fn(), push: vi.fn(), calls: [] as string[] }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  usePathname: () => h.pathname,
  useRouter: () => ({ push: h.push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/track", () => ({ track: h.track }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: async (fn: string) => { h.calls.push(fn); return { data: null, error: null }; },
    auth: {
      signOut: async () => { h.calls.push("signOut"); },
      signInWithOAuth: async () => { h.calls.push("oauth"); return { error: null }; },
    },
  }),
}));

import { stampDemo } from "@/lib/pdf/demoStamp";
import { DemoAndroidChip, DemoProvider, DemoRealDataHint, DemoRealDataNote, DemoValueSheet, notifyDemoValue } from "@/components/DemoGate";
import { PrintToolbar } from "@/components/PrintToolbar";
import { DemoTour } from "@/components/DemoTour";
import { setDemoCounting } from "@/lib/demoMetrics";

const wrap = (node: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{node}</NextIntlClientProvider>;

describe("the demo's home stays uncluttered (01, 10-26)", () => {
  it("no setup checklist and no privacy-update card in a demo session", () => {
    const page = readFileSync(resolve(__dirname, "../app/[locale]/(site)/dashboard/(gated)/page.tsx"), "utf8");
    expect(page).toContain("const isDemo = isDemoUser(user);");
    expect(page).toContain("const privacyNotice = !isDemo && privacyNoticeDue(");
    expect(page).toContain("{!isDemo && setupProgress && showChecklist(setupProgress) && (");
  });
});

describe("the PDF DEMO stamp", () => {
  it("every page keeps its size and gets the stamp; Thai renders in the document's font", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    doc.addPage([595, 842]);
    const before = await doc.save();
    const font = new Uint8Array(readFileSync(resolve(__dirname, "../../public/fonts/sarabun/Sarabun-Regular.ttf")));
    const out = await stampDemo(before, "เอกสารเดโม ไม่มีผลทางกฎหมาย", font);
    const stamped = await PDFDocument.load(out);
    expect(stamped.getPageCount()).toBe(2);
    expect(stamped.getPage(1).getSize()).toEqual({ width: 595, height: 842 });
    expect(out.length).toBeGreaterThan(before.length);
  });
});

describe("moments of value", () => {
  beforeEach(() => {
    sessionStorage.clear();
    h.track.mockReset();
  });

  it("each kind once: the sheet, Google first; a second time, only the event", () => {
    render(wrap(<DemoValueSheet locale="pt-BR" country="BR" />));
    act(() => notifyDemoValue("prescription"));
    const sheet = screen.getByTestId("demo-value-sheet");
    expect(sheet).toHaveAttribute("data-kind", "prescription");
    expect(sheet).toHaveTextContent(pt.demo.valueTitle);
    const buttons = sheet.querySelectorAll("button");
    expect(buttons[1]).toHaveTextContent(pt.auth.google.continue);
    expect(buttons[2]).toHaveTextContent(pt.demo.emailSignup);
    fireEvent.click(screen.getByRole("button", { name: pt.demo.close }));
    act(() => notifyDemoValue("prescription"));
    expect(screen.queryByTestId("demo-value-sheet")).toBeNull();
    expect(h.track).toHaveBeenCalledTimes(2);
    expect(h.track).toHaveBeenCalledWith("demo_value", { type: "prescription" });
    act(() => notifyDemoValue("appointment"));
    expect(screen.getByTestId("demo-value-sheet")).toHaveAttribute("data-kind", "appointment");
  });

  it("Google from the sheet: the demo ends and signs out before OAuth starts", async () => {
    setDemoCounting(true);
    render(wrap(<DemoValueSheet locale="pt-BR" country="TH" />));
    act(() => notifyDemoValue("solvyai"));
    h.calls = [];
    fireEvent.click(screen.getByText(pt.auth.google.continue));
    await waitFor(() => expect(h.calls).toContain("oauth"));
    expect(h.calls).toEqual(["demo_count", "end_demo", "signOut", "oauth"]);
  });
});

describe("the 2-minute tour", () => {
  const matchMedia = window.matchMedia;
  beforeEach(() => {
    sessionStorage.clear();
    h.track.mockReset();
    h.pathname = "/pt-BR/dashboard";
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => { window.matchMedia = matchMedia; });

  it("4 steps; the agenda and a record by visiting; the PDF and SolvyAI by their moments; then the sign-up ask", async () => {
    const { rerender } = render(wrap(<DemoTour locale="pt-BR" country="BR" />));
    expect(await screen.findByTestId("demo-tour")).toHaveTextContent(pt.demo.tourTitle);
    for (const n of [1, 2, 3, 4]) expect(screen.getByTestId(`demo-tour-step-${n}`)).toBeInTheDocument();
    h.pathname = "/pt-BR/dashboard/schedule";
    rerender(wrap(<DemoTour locale="pt-BR" country="BR" />));
    h.pathname = "/pt-BR/dashboard/patients/abc";
    rerender(wrap(<DemoTour locale="pt-BR" country="BR" />));
    await waitFor(() => expect(screen.getByTestId("demo-tour-step-2")).toHaveAttribute("data-done", "true"));
    expect(screen.getByTestId("demo-tour-ring")).toHaveTextContent("2/4");
    act(() => notifyDemoValue("prescription"));
    act(() => notifyDemoValue("solvyai"));
    await waitFor(() => expect(screen.getByTestId("demo-tour")).toHaveTextContent(pt.demo.tourDoneTitle));
    expect(screen.getByText(pt.auth.google.continue)).toBeInTheDocument();
    expect(h.track).toHaveBeenCalledWith("demo_tour_done");
  });

  it("\"Mostrar\" leaves no spotlight search running once the tour is gone (cf, #610)", () => {
    vi.useFakeTimers();
    try {
      const qs = vi.spyOn(document, "querySelector");
      const { unmount } = render(wrap(<DemoTour locale="pt-BR" country="BR" />));
      fireEvent.click(screen.getAllByText(pt.demo.tourShow)[0]);
      const before = qs.mock.calls.length;
      unmount();
      vi.advanceTimersByTime(5000);
      expect(qs.mock.calls.length).toBe(before);
      qs.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the open card moves left of SolvyAI's panel at lg+ instead of covering its input (83, #610)", async () => {
    render(wrap(<DemoTour locale="pt-BR" country="BR" />));
    expect(await screen.findByTestId("demo-tour")).toHaveClass("demo-tour-card");
    const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");
    expect(css).toMatch(/@media \(min-width: 1024px\) \{\s*html\[data-solvyai-open\] \.demo-tour-card \{ right: calc\(400px \+ 1rem\); \}/);
    // Closed panel: above the ✦ opener (83, #611).
    expect(css).toMatch(/html:not\(\[data-solvyai-open\]\) \.demo-tour-card \{ bottom: calc\(5\.5rem \+ var\(--consent-h, 0px\)\); \}/);
  });

  it("\"Mostrar\" takes the visitor to the step's page", () => {
    render(wrap(<DemoTour locale="pt-BR" country="BR" />));
    fireEvent.click(screen.getAllByText(pt.demo.tourShow)[0]);
    expect(h.push).toHaveBeenCalledWith("/pt-BR/dashboard/schedule");
  });
});

describe("the HTML print views (no saved design, or the designed PDF failed)", () => {
  it("say DEMO in a demo, on screen and in print; never on a real account", () => {
    const { unmount } = render(wrap(<DemoProvider value={{ demo: true, locale: "pt-BR", country: "BR" }}><PrintToolbar backHref="/x" /></DemoProvider>));
    const mark = screen.getByTestId("demo-print-mark");
    expect(mark).toHaveTextContent("DEMO");
    expect(mark).toHaveTextContent(pt.demo.pdfFooter);
    expect(mark.className).not.toContain("print-hide");
    unmount();
    render(wrap(<PrintToolbar backHref="/x" />));
    expect(screen.queryByTestId("demo-print-mark")).toBeNull();
  });
});

describe("don't enter real patient data (the spec's guardrail; cf's #598 block)", () => {
  beforeEach(() => localStorage.clear());

  it("phones: a one-time line under the bar, gone for good once dismissed", () => {
    const { unmount } = render(wrap(<DemoRealDataHint />));
    expect(screen.getByTestId("demo-real-data-hint")).toHaveTextContent(pt.demo.realDataHint);
    fireEvent.click(screen.getByRole("button", { name: pt.demo.close }));
    expect(screen.queryByTestId("demo-real-data-hint")).toBeNull();
    unmount();
    render(wrap(<DemoRealDataHint />));
    expect(screen.queryByTestId("demo-real-data-hint")).toBeNull();
  });

  it("forms: a muted line above Save, in the demo only", () => {
    const { unmount } = render(wrap(<DemoProvider value={{ demo: true, locale: "pt-BR", country: "BR" }}><DemoRealDataNote /></DemoProvider>));
    expect(screen.getByTestId("demo-real-data-note")).toHaveTextContent(pt.demo.realDataHint);
    unmount();
    render(wrap(<DemoRealDataNote />));
    expect(screen.queryByTestId("demo-real-data-note")).toBeNull();
  });

  it("every locale has it; the patient, record and prescription forms carry the note", () => {
    const dir = resolve(__dirname, "../messages");
    for (const file of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const m = JSON.parse(readFileSync(resolve(dir, file), "utf8").trimStart());
      expect(m.demo.realDataHint, file).toBeTruthy();
    }
    const src = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
    const notes = (p: string) => src(p).split("<DemoRealDataNote />").length - 1;
    expect(notes("app/[locale]/(site)/dashboard/(gated)/patients/PatientsClient.tsx")).toBe(1);
    expect(notes("app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient.tsx")).toBe(3);
    expect(src("components/DemoBar.tsx")).toContain("data-testid=\"demo-bar-hint\"");
  });

  it("phones: the line under the bar keeps clear of the dashboard's ☰ (83, #610)", () => {
    const bar = readFileSync(resolve(__dirname, "../components/DemoBar.tsx"), "utf8");
    const stack = bar.split("\n").find((l) => l.includes("data-testid=\"demo-under-bar\""));
    expect(stack).toMatch(/\bpl-16\b/);
    expect(stack).not.toMatch(/\bpx-/);
  });
});

describe("the demo's Android chip (#601: the Play Store app, not its website)", () => {
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
  const WEBVIEW = "Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 Version/4.0 Chrome/129.0 Mobile Safari/537.36 Instagram 350.0";
  const click = () => {
    const a = screen.getByTestId("demo-android-chip").querySelector("a")!;
    a.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(a);
    return a;
  };
  beforeEach(() => { sessionStorage.clear(); h.track.mockReset(); });

  it("Android Chrome: an intent to the Play Store app, in this tab, the https listing as its fallback; the event", () => {
    const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ANDROID);
    render(wrap(<DemoAndroidChip />));
    const a = click();
    expect(a.href.startsWith("intent://details?id=com.burrowsoft.solvymed")).toBe(true);
    expect(a.href).toContain("#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2F");
    expect(a.target).toBe("_self");
    expect(h.track).toHaveBeenCalledWith("app_store_click", { platform: "android", from: "demo" });
    ua.mockRestore();
  });

  it("a plain WebView (\"; wv)\"): the https listing in a new tab", () => {
    const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue(WEBVIEW);
    render(wrap(<DemoAndroidChip />));
    const a = click();
    expect(a.href.startsWith("https://play.google.com/store/apps/details?id=com.burrowsoft.solvymed")).toBe(true);
    expect(a.target).toBe("_blank");
    ua.mockRestore();
  });
});
