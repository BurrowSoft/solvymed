import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
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
import { DemoProvider, DemoValueSheet, notifyDemoValue } from "@/components/DemoGate";
import { PrintToolbar } from "@/components/PrintToolbar";
import { DemoTour } from "@/components/DemoTour";

const wrap = (node: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{node}</NextIntlClientProvider>;

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
    render(wrap(<DemoValueSheet locale="pt-BR" country="TH" />));
    act(() => notifyDemoValue("solvyai"));
    h.calls = [];
    fireEvent.click(screen.getByText(pt.auth.google.continue));
    await waitFor(() => expect(h.calls).toContain("oauth"));
    expect(h.calls).toEqual(["end_demo", "signOut", "oauth"]);
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
