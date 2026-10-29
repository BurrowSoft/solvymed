import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import { parseSelfServeItem, rowText, toResolvedReport, type ReportItem } from "@/lib/patientChannel/resolvedReport";

// Item 43, "Resolvidas sem mensagem" (specs/pc-resolved-report.md + its contract, cf's OK
// 10-29): the item sent with /selfserve (only used while pc-resolved-items-live), the
// report's answer read defensively, and the card. Dark until the privacy text and 272.

const PROF = "11111111-1111-4111-8111-111111111111";
const h = vi.hoisted(() => ({
  live: false,
  calls: [] as { fn: string; args: unknown }[],
  report: { data: null as unknown, error: null as null | { message: string } },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/patientChannel/live", () => ({ patientChannelEnabled: async () => true }));
vi.mock("@/lib/patientChannel/resolvedReport", async (orig) => ({
  ...(await orig<typeof import("@/lib/patientChannel/resolvedReport")>()),
  resolvedReportLive: () => h.live,
}));
vi.mock("@/lib/patientChannel/server", async (orig) => ({
  ...(await orig<typeof import("@/lib/patientChannel/server")>()),
  pcCaller: async () => ({ user: { id: "pat1" }, db: { rpc: async () => ({ data: {}, error: null }) } }),
  pcAdmin: () => ({ rpc: async (fn: string, args: unknown) => { h.calls.push({ fn, args }); return { data: null, error: null }; } }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: async (fn: string, args: unknown) => { h.calls.push({ fn, args }); return h.report; } }),
}));

const { POST: selfserve } = await import("@/app/api/patient-channel/selfserve/route");
const { ResolvedReport } = await import("@/components/patientChannel/ResolvedReport");
const post = (body: unknown) => selfserve(new NextRequest("https://www.solvymed.com/api/x", { method: "POST", body: JSON.stringify(body) }));
const R = pt.patientChannel.report;

afterEach(() => {
  h.live = false;
  h.calls = [];
});

describe("/selfserve with the item (item 43)", () => {
  it("off (today): the item is ignored, only the kind counts, as before", async () => {
    expect((await post({ profId: PROF, kind: "faq_resolved", item: { kind: "faq", id: "f1" } })).status).toBe(204);
    expect(h.calls.at(-1)).toEqual({ fn: "pc_count_selfserve", args: { p_prof: PROF, p_kind: "faq_resolved" } });
    // Even a malformed item is ignored while off (older/newer clients never break the count).
    expect((await post({ profId: PROF, kind: "auto_resolved", item: "junk" })).status).toBe(204);
  });

  it("live: the kind + the item through 272's pc_count_selfserve_item", async () => {
    h.live = true;
    expect((await post({ profId: PROF, kind: "auto_resolved", item: { kind: "auto_message", id: "a-x.1 é" } })).status).toBe(204);
    expect(h.calls.at(-1)).toEqual({ fn: "pc_count_selfserve_item", args: { p_prof: PROF, p_kind: "auto_resolved", p_item_kind: "auto_message", p_item_id: "a-x.1 é" } });
    // No item: the kind only.
    expect((await post({ profId: PROF, kind: "faq_resolved" })).status).toBe(204);
    expect(h.calls.at(-1)?.fn).toBe("pc_count_selfserve");
  });

  it("live: a wrong pair or a bad id is a 400 (the contract's bad_request)", async () => {
    h.live = true;
    expect((await post({ profId: PROF, kind: "faq_resolved", item: { kind: "auto_message", id: "a1" } })).status).toBe(400);
    expect((await post({ profId: PROF, kind: "faq_resolved", item: { kind: "faq", id: "" } })).status).toBe(400);
    expect((await post({ profId: PROF, kind: "faq_resolved", item: { kind: "faq", id: "x".repeat(41) } })).status).toBe(400);
    expect(h.calls).toEqual([]);
  });

  it("parseSelfServeItem: any 1–40 character id (the same bounds as _pc_rules_valid)", () => {
    expect(parseSelfServeItem(undefined, "faq_resolved")).toBeNull();
    expect(parseSelfServeItem({ kind: "faq", id: "x".repeat(40) }, "faq_resolved")).toEqual({ kind: "faq", id: "x".repeat(40) });
    expect(parseSelfServeItem({ kind: "reason", id: "r1" }, "auto_resolved")).toBe("bad");
  });
});

describe("the report's answer (272's pc_selfserve_report)", () => {
  const answer = {
    days: 7,
    items: [
      { kind: "auto_message", id: "a1", label: "febre, febre leve", excerpt: "Para febre até 38,5 °C, tome…", archived: false, n: 5 },
      { kind: "faq", id: "f1", label: "Como tomar o remédio", excerpt: null, archived: false, n: 12 },
      { kind: "faq", id: "f2", label: "Posso beber?", excerpt: null, archived: true, n: 2 },
      { kind: "faq", id: "f3", label: null, excerpt: null, archived: false, n: 1 },
      { kind: "reason", id: "r1", label: "x", n: 9 },
      { kind: "faq", id: "f4", label: "zero", n: 0 },
    ],
    unattributed: 3,
    total: 23,
    sent: 31,
  };

  it("drops what it can't read, keeps the order highest first", () => {
    const r = toResolvedReport(answer)!;
    expect(r.items.map((i) => i.id)).toEqual(["f1", "a1", "f2", "f3"]);
    expect([r.unattributed, r.total, r.sent]).toEqual([3, 23, 31]);
    expect(toResolvedReport({ ...answer, days: 14 })).toBeNull();
    expect(toResolvedReport(null)).toBeNull();
  });

  it("rows: the question; an automatic message's terms with the start of its text; archived; removed (01, Q2/Q5)", () => {
    const t = (k: string, v?: Record<string, string>) => {
      const key = k.replace("report.", "") as keyof typeof R;
      return Object.entries(v ?? {}).reduce((s, [a, b]) => s.replace(`{${a}}`, b), R[key] as string);
    };
    const row = (i: Partial<ReportItem>) => rowText({ kind: "faq", id: "x", label: null, excerpt: null, archived: false, n: 1, ...i }, t);
    expect(row({ label: "Como tomar o remédio" })).toEqual({ line1: "Pergunta frequente: Como tomar o remédio", line2: null });
    expect(row({ label: "Posso beber?", archived: true })).toEqual({ line1: "Pergunta frequente: Posso beber? (arquivada)", line2: null });
    expect(row({ kind: "auto_message", label: "febre, febre leve", excerpt: "Para febre…" })).toEqual({ line1: "Mensagem automática: febre, febre leve", line2: "Para febre…" });
    expect(row({ kind: "auto_message", excerpt: "Para febre…" })).toEqual({ line1: "Mensagem automática: Para febre…", line2: null });
    expect(row({})).toEqual({ line1: R.faqRemoved, line2: null });
  });
});

describe("the card", () => {
  const show = () => render(<NextIntlClientProvider locale="pt-BR" messages={pt}><ResolvedReport profId={PROF} /></NextIntlClientProvider>);

  it("7 days first; the rows, the unattributed row last, the totals; 30 days asks again", async () => {
    h.report = { data: { days: 7, items: [{ kind: "faq", id: "f1", label: "Como tomar o remédio", excerpt: null, archived: false, n: 12 }], unattributed: 2, total: 14, sent: 20 }, error: null };
    show();
    expect(await screen.findByTestId("pc-report-row-faq-f1")).toHaveTextContent("Pergunta frequente: Como tomar o remédio12");
    expect(screen.getByTestId("pc-report-unattributed")).toHaveTextContent(`${R.unattributed}2`);
    expect(screen.getByTestId("pc-report-totals")).toHaveTextContent("Total no período: 14 · Mensagens enviadas: 20");
    expect(h.calls.at(-1)).toEqual({ fn: "pc_selfserve_report", args: { p_prof: PROF, p_days: 7 } });
    h.report = { data: { days: 30, items: [], unattributed: 0, total: 0, sent: 3 }, error: null };
    fireEvent.click(screen.getByTestId("pc-report-days-30"));
    expect(await screen.findByTestId("pc-report-empty")).toHaveTextContent(R.empty);
    expect(h.calls.at(-1)).toEqual({ fn: "pc_selfserve_report", args: { p_prof: PROF, p_days: 30 } });
  });

  it("no unattributed row at 0", async () => {
    h.report = { data: { days: 7, items: [{ kind: "faq", id: "f1", label: "Q", excerpt: null, archived: false, n: 1 }], unattributed: 0, total: 1, sent: 0 }, error: null };
    show();
    await screen.findByTestId("pc-report-row-faq-f1");
    expect(screen.queryByTestId("pc-report-unattributed")).toBeNull();
  });

  it("out of scope (a secretary without 'sees all'): the card hides; another error says so", async () => {
    h.report = { data: null, error: { message: "out_of_scope" } };
    const { container } = show();
    await waitFor(() => expect(h.calls.length).toBeGreaterThan(0));
    await waitFor(() => expect(container.querySelector("[data-testid='pc-report']")).toBeNull());
    h.report = { data: null, error: { message: "boom" } };
    container.remove();
    show();
    expect(await screen.findByTestId("pc-report-error")).toHaveTextContent(R.loadError);
  });
});
