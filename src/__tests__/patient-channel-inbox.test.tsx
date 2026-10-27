// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { NextRequest } from "next/server";
import pt from "@/messages/pt-BR.json";
import cases from "./fixtures/patient-channel-score-cases.json";
import type { ChannelConfig, ScoreLine } from "@/lib/patientChannel/score";
import { scoreRequest } from "@/lib/patientChannel/score";
import {
  INBOX_COLUMNS, detailHighlights, detailLineLabel, detailNames, filterInbox, highlightParts, sortInbox, toCounts, toDetailAnswers, toInboxRow, warningFloorCause,
  type InboxRow,
} from "@/lib/patientChannel/inbox";

// Patient Channel M5: the inbox's order and filters, the detail's names and highlights
// (names only, never the weights), the reply route over 237's pc_reply, the staff gate that
// outlives a switch-off (01, 10-26), and the sidebar entry.

const sample = cases.config as ChannelConfig;

const h = vi.hoisted(() => ({
  user: { id: "doc1" } as { id: string } | null,
  readable: true,
  replyError: null as null | { message: string },
  calls: [] as { fn: string; args: unknown }[],
  flagOn: false,
  testers: [] as string[],
  practiceRows: 0,
  rowsError: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/pt-BR/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ locale: "pt-BR" }),
  useSearchParams: () => new URLSearchParams(),
  notFound: () => { throw new Error("404"); },
  redirect: () => { throw new Error("redirect"); },
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/patientChannel/server", async (orig) => ({
  ...(await orig<typeof import("@/lib/patientChannel/server")>()),
  pcCaller: async () => ({
    user: h.user,
    db: {
      from: () => {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: h.readable ? { professional_id: "doc1" } : null, error: null }) };
        return chain;
      },
      rpc: async (fn: string, args: unknown) => {
        h.calls.push({ fn, args });
        const a = args as { p_request_id: string; p_call_back: boolean };
        return h.replyError ? { data: null, error: h.replyError } : { data: { id: a.p_request_id, status: a.p_call_back ? "call_back" : "answered" }, error: null };
      },
    },
  }),
}));

const { POST: reply } = await import("@/app/api/patient-channel/requests/[id]/reply/route");
const { inboxAvailable, inboxOpenCount } = await import("@/lib/patientChannel/staff");
const { DashboardSidebar } = await import("@/components/DashboardSidebar");

const ID = "33333333-3333-4333-8333-333333333333";
const post = (id: string, body: unknown) =>
  reply(new NextRequest(`https://www.solvymed.com/api/patient-channel/requests/${id}/reply`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  h.user = { id: "doc1" };
  h.readable = true;
  h.replyError = null;
  h.calls = [];
  h.flagOn = false;
  h.testers = [];
  h.practiceRows = 0;
  h.rowsError = false;
});

const row = (p: Partial<InboxRow>): InboxRow => ({
  id: "x", patientId: "p", patientName: "Ana", destination: "doctor", band: "green", score: 0, status: "open",
  reasonTitle: "Efeito colateral", text: "", createdAt: "2026-10-26T08:00:00Z", ...p,
});

describe("the inbox list", () => {
  // cf's privacy review F2 (01, 10-26): the patient's message text never in the list (it isn't
  // access-logged); only the detail shows it, and opening the detail is logged (241).
  it("never reads or shows the patient's message text", async () => {
    expect(INBOX_COLUMNS.split(",").map((c) => c.trim())).not.toContain("text");
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const list = readFileSync(resolve(__dirname, "../app/[locale]/(site)/dashboard/(gated)/patient-channel/page.tsx"), "utf8");
    expect(list).not.toContain("r.text");
    const detail = readFileSync(resolve(__dirname, "../app/[locale]/(site)/dashboard/(gated)/patient-channel/[requestId]/page.tsx"), "utf8");
    expect(detail.match(/HISTORY_COLUMNS = "([^"]+)"/)?.[1].split(",").map((c) => c.trim())).not.toContain("text");
  });

  it("open first by score (highest), the longest waiting first on a tie; closed after, newest first", () => {
    const rows = [
      row({ id: "closed-old", status: "answered", score: 99, createdAt: "2026-10-20T00:00:00Z" }),
      row({ id: "low", score: 2 }),
      row({ id: "high-new", score: 12, createdAt: "2026-10-26T09:00:00Z" }),
      row({ id: "high-old", score: 12, createdAt: "2026-10-26T07:00:00Z" }),
      row({ id: "closed-new", status: "call_back", score: 1, createdAt: "2026-10-25T00:00:00Z" }),
    ];
    expect(sortInbox(rows).map((r) => r.id)).toEqual(["high-old", "high-new", "low", "closed-new", "closed-old"]);
  });

  it("filters: all / a band / secretary / open; a substituted request is never listed", () => {
    const rows = [
      row({ id: "r", band: "red" }), row({ id: "a", band: "amber", status: "answered" }),
      row({ id: "s", destination: "secretary" }), row({ id: "old", status: "substituted", band: "red" }),
    ];
    expect(filterInbox(rows, "all").map((r) => r.id)).toEqual(["r", "a", "s"]);
    expect(filterInbox(rows, "red").map((r) => r.id)).toEqual(["r"]);
    expect(filterInbox(rows, "secretary").map((r) => r.id)).toEqual(["s"]);
    expect(filterInbox(rows, "open").map((r) => r.id)).toEqual(["r", "s"]);
  });

  it("a row from the database, the patient embedded either way; the counts from 237's pc_inbox_counts", () => {
    const r = toInboxRow({ id: "q", patient_id: "p", destination: "secretary", band: "red", score_total: 15, status: "open", text: "dor", created_at: "t", reason_snapshot: { title: "Receita" }, patients: [{ full_name: "Bia" }] });
    expect(r).toMatchObject({ patientName: "Bia", destination: "secretary", band: "red", score: 15, reasonTitle: "Receita" });
    expect(toCounts({ open: 3, urgent: 1, attention: 1, notUrgent: 1, openForDoctor: 2, openForSecretary: 1, faqResolved7d: 4, autoResolved7d: 5 }))
      .toMatchObject({ urgent: 1, faqResolved7d: 4, autoResolved7d: 5, admin: 0 });
    // 256: the open administrative requests; an older answer without it reads 0.
    expect(toCounts({ open: 4, urgent: 1, attention: 1, notUrgent: 1, admin: 1 })).toMatchObject({ admin: 1 });
    expect(toCounts(null)).toBeNull();
  });
});

describe("the detail", () => {
  const answers = { symptomIds: ["s1", "s2"], chips: [], when: 2, intensity: 0, stillTaking: 0, text: "" };
  const lines = scoreRequest(sample, answers).lines as ScoreLine[];

  it("the names the lines need, never the weights (a secretary's page gets no rules)", () => {
    const names = detailNames(sample, lines, ["s1", "s2"]);
    expect(Object.keys(names.symptoms).sort()).toEqual(["s1", "s2"]);
    expect(JSON.stringify(names)).not.toMatch(/points|adjust|thresholds|urgent/);
    const t = (k: string, v?: Record<string, string | number>) => (k === "lines.combo" ? `Combinação ${v?.names}` : k === "lines.text" ? "(texto)" : k);
    expect(detailLineLabel(names, lines[0], t)).toBe(sample.symptoms.find((s) => s.id === "s1")!.name);
    // A symptom the rules no longer have shows "?", never a wrong name.
    expect(detailLineLabel({ symptoms: {}, combos: {}, warnings: [] }, lines[0], t)).toBe("?");
  });

  it("the safety floor line (01, 10-26): a warning symptom the patient chose, or one only the AI found", () => {
    const floor = cases.safetyFloor.config as ChannelConfig;
    const mild = { symptomIds: ["f1"], chips: [], when: 0, intensity: 0, stillTaking: 0, text: "" };
    const warn = floor.symptoms.filter((s) => s.immediateWarning).map((s) => s.id);
    const byPatient = scoreRequest(floor, mild);
    expect(warningFloorCause(warn, mild.symptomIds, byPatient.lines, byPatient.band)).toBe("patient");
    const byAi = scoreRequest(floor, { ...mild, symptomIds: [], text: "não estou bem" }, { aiSymptomIds: ["f1"] });
    expect(warningFloorCause(warn, [], byAi.lines, byAi.band)).toBe("ai");
    expect(detailNames(floor, byAi.lines, []).warnings).toEqual(["f1"]);
    const plain = scoreRequest(floor, { ...mild, symptomIds: ["f2"] });
    expect(warningFloorCause(warn, ["f2"], plain.lines, plain.band)).toBeNull();
    // cf: a warning symptom worth 0 points (and no answer points) has no line, still the reason.
    const zero = { ...floor, symptoms: floor.symptoms.map((s) => (s.id === "f1" ? { ...s, points: 0, adjust: { when: [0, 0, 0], intensity: [0, 0, 0], stillTaking: [0, 0] } } : s)) };
    const silent = scoreRequest(zero, mild);
    expect([silent.lines, silent.band]).toEqual([[], "red"]);
    expect(warningFloorCause(warn, mild.symptomIds, silent.lines, silent.band)).toBe("patient");
  });

  it("the highlights: the list's words in the patient's text, split for <mark>", () => {
    const text = "Estou com muita coceira hoje";
    const parts = highlightParts(text, detailHighlights(sample, text));
    expect(parts.filter((p) => p.mark).map((p) => p.text)).toEqual(["coceira"]);
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(detailHighlights(null, text)).toEqual([]);
  });

  it("the answers: the symptom form or an option", () => {
    expect(toDetailAnswers({ option: "Recibo" })).toEqual({ kind: "option", option: "Recibo" });
    expect(toDetailAnswers({ symptomIds: ["s1"], chips: [{ kind: "medicine", ref: "m", text: "Tylenol" }], when: 1, intensity: 2, stillTaking: 1 }))
      .toMatchObject({ kind: "form", symptomIds: ["s1"], chips: [{ kind: "medicine", text: "Tylenol" }], when: 1, intensity: 2 });
  });
});

describe("POST /api/patient-channel/requests/[id]/reply", () => {
  it("answers and closes through pc_reply as the caller", async () => {
    const res = await post(ID, { text: "  Pode tomar com comida.  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID, status: "answered" });
    expect(h.calls).toEqual([{ fn: "pc_reply", args: { p_request_id: ID, p_text: "Pode tomar com comida.", p_call_back: false } }]);
  });

  it("'I'll call the patient' needs no text", async () => {
    const res = await post(ID, { text: "", callBack: true });
    expect([res.status, (await res.json()).status]).toEqual([200, "call_back"]);
  });

  it("refuses: signed out 401, a bad id 400, a request the caller can't read 404, empty or over 500 → 422", async () => {
    expect((await post("x", { text: "a" })).status).toBe(400);
    expect((await post(ID, { text: "" })).status).toBe(422);
    expect((await post(ID, { text: "x".repeat(501) })).status).toBe(422);
    expect((await post(ID, { text: "x".repeat(500) })).status).toBe(200);
    h.readable = false;
    expect((await post(ID, { text: "a" })).status).toBe(404);
    h.user = null;
    expect((await post(ID, { text: "a" })).status).toBe(401);
  });

  it("237's answers: a secretary on a doctor's request 403 out_of_scope; already closed 409 not_open", async () => {
    h.replyError = { message: "out_of_scope" };
    const scope = await post(ID, { text: "a" });
    expect([scope.status, (await scope.json()).code]).toEqual([403, "out_of_scope"]);
    h.replyError = { message: "not_open" };
    const closed = await post(ID, { text: "a" });
    expect([closed.status, (await closed.json()).code]).toEqual([409, "not_open"]);
  });
});

describe("the staff gate (01, 10-26: a switch-off never hides waiting patients)", () => {
  const db = () => ({
    rpc: async () => ({ data: [{ key: "patient_channel", enabled: h.flagOn }], error: null }),
    from: () => {
      const chain = {
        select: () => chain, eq: () => chain,
        limit: async () => (h.rowsError ? { data: null, error: { message: "x" } } : { data: Array.from({ length: h.practiceRows }, (_, i) => ({ id: i })), error: null }),
      };
      return chain;
    },
  });
  const deps = async (id: string) => h.testers.includes(id);

  it("on with the flag; on for a secretary whose doctor is allowlisted; on while the practice has requests; else off", async () => {
    const { patientChannelOnForPractice } = await import("@/lib/patientChannel/live");
    h.flagOn = true;
    expect(await patientChannelOnForPractice(db(), "sec1", "doc1", deps)).toBe(true);
    h.flagOn = false;
    expect(await patientChannelOnForPractice(db(), "sec1", "doc1", deps)).toBe(false);
    h.testers = ["doc1"];
    expect(await patientChannelOnForPractice(db(), "sec1", "doc1", deps)).toBe(true);
    h.testers = [];
    // The real allowlist check needs the service role (absent here: false), so these lean on the requests.
    expect(await inboxAvailable(db() as never, "doc1", "doc1")).toBe(false);
    h.practiceRows = 1;
    expect(await inboxAvailable(db() as never, "doc1", "doc1")).toBe(true);
    h.rowsError = true;
    expect(await inboxAvailable(db() as never, "doc1", "doc1")).toBe(false);
  });
});

describe("the sidebar entry", () => {
  const renderSidebar = (patientChannel?: boolean, patientChannelOpen?: number) =>
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <DashboardSidebar locale="pt-BR" firstName="Ana" email="ana@x.invalid" patientChannel={patientChannel} patientChannelOpen={patientChannelOpen} />
      </NextIntlClientProvider>,
    );

  it("'Mensagens' only when the inbox is available", () => {
    const { unmount } = renderSidebar(true);
    expect(screen.getAllByRole("link", { name: /Mensagens/ })[0].getAttribute("href")).toBe("/pt-BR/dashboard/patient-channel");
    unmount();
    renderSidebar();
    expect(screen.queryByRole("link", { name: /Mensagens/ })).toBeNull();
  });

  // 01, 10-26: the open requests the caller can act on, as a badge on "Mensagens".
  it("the open-count badge: shown with its count and a spoken label, hidden at 0, capped at 99+", () => {
    const a = renderSidebar(true, 3);
    const badge = screen.getAllByTestId("pc-nav-badge")[0];
    expect(badge.textContent).toBe("3");
    expect(badge.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByTestId("pc-nav-badge-label")[0].textContent).toBe("3 mensagens abertas");
    // The link's accessible name includes the spoken count (cf).
    expect(screen.getAllByRole("link", { name: /Mensagens.*3 mensagens abertas/ }).length).toBeGreaterThan(0);
    a.unmount();
    const b = renderSidebar(true, 0);
    expect(screen.queryByTestId("pc-nav-badge")).toBeNull();
    b.unmount();
    renderSidebar(true, 250);
    expect(screen.getAllByTestId("pc-nav-badge")[0].textContent).toBe("99+");
  });

  it("the count: the doctor all open; a secretary the administrative ones; 0 on a failure", async () => {
    const counts = { open: 5, openForDoctor: 3, openForSecretary: 2 };
    const ok = { rpc: async () => ({ data: counts, error: null }) } as never;
    expect(await inboxOpenCount(ok, "doc1", false)).toBe(5);
    expect(await inboxOpenCount(ok, "doc1", true)).toBe(2);
    const bad = { rpc: async () => ({ data: null, error: { message: "out_of_scope" } }) } as never;
    expect(await inboxOpenCount(bad, "doc1", false)).toBe(0);
  });
});

describe("the Access tab (241): opening a request is logged", () => {
  it("log_record_access with kind pc_request and the request id; never throws; its own label", async () => {
    const { accessKindLabelKey, logChannelRequestOpen } = await import("@/lib/accessLog");
    const calls: unknown[] = [];
    await logChannelRequestOpen({ rpc: async (fn: string, args: unknown) => { calls.push([fn, args]); return { data: null, error: null }; } }, "pat1", ID);
    expect(calls).toEqual([["log_record_access", { p_patient_id: "pat1", p_kind: "pc_request", p_object_ref: ID }]]);
    await expect(logChannelRequestOpen({ rpc: async () => { throw new Error("offline"); } }, "pat1", ID)).resolves.toBeUndefined();
    await expect(logChannelRequestOpen({ rpc: async () => ({ data: null, error: { code: "P0001" } }) }, "pat1", ID)).resolves.toBeUndefined();
    expect(accessKindLabelKey("pc_request")).toBe("accessKindPcRequest");
    expect(pt.patientDetail.accessKindPcRequest).toBe("Abriu uma mensagem do Canal do Paciente");
  });
});
