import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// The patient record's "Canal do Paciente" tab (specs/pc-patient-record-tab.md, 01 + Vitor
// 10-30): the patient's requests from pc_requests under 237's RLS (no new RPC), newest first;
// the doctor, or a secretary with "sees all"; hidden when the practice never set the channel
// up and the patient sent nothing; dark until pc-record-tab-live.
const h = vi.hoisted(() => ({
  live: true,
  settings: { data: null, error: null } as { data: { secretary_sees_all: boolean } | null; error: null | { message: string } },
  requests: { data: [], error: null } as { data: Record<string, unknown>[]; error: null | { message: string } },
  queries: [] as { table: string; eq: [string, unknown][]; order?: string }[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/conditions", async (orig) => {
  const real = await orig<typeof import("@/lib/conditions")>();
  return { ...real, conditionMet: (k: string) => (k === "pc-record-tab-live" ? h.live : real.conditionMet(k)) };
});
vi.mock("@/lib/effectiveProfId", () => ({
  myPractices: async () => [{ professional_id: "doc1", title: "Dra.", display_name: "Ana Lima" }],
}));

const { loadRecordTab, toRecordTabRow, RECORD_TAB_LIMIT } = await import("@/lib/patientChannel/recordTab");
const { PatientChannelTab } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientChannelTab");

// A query builder that records its filters and answers from h.
function db() {
  return {
    from(table: string) {
      const q = { table, eq: [] as [string, unknown][], order: undefined as string | undefined };
      h.queries.push(q);
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => { q.eq.push([c, v]); return b; },
        order: (c: string) => { q.order = c; return b; },
        limit: async (n: number) => { expect(n).toBe(RECORD_TAB_LIMIT); return h.requests; },
        maybeSingle: async () => h.settings,
      };
      return b;
    },
  } as never;
}
const when = (iso: string) => `W:${iso}`;
const load = (isSecretary = false) => loadRecordTab(db(), { userId: isSecretary ? "sec1" : "doc1", profId: "doc1", patientId: "pat1", isSecretary, formatWhen: when });
const req = (over: Record<string, unknown>) => ({
  id: "r1", destination: "doctor", band: "red", status: "open", created_at: "2026-10-30T10:00:00Z",
  reason_snapshot: { title: "Efeito colateral", kind: "form" }, ...over,
});

afterEach(() => {
  h.live = true;
  h.settings = { data: null, error: null };
  h.requests = { data: [], error: null };
  h.queries = [];
});

describe("loadRecordTab", () => {
  it("dark until pc-record-tab-live: no tab, no query", async () => {
    h.live = false;
    expect(await load()).toBeNull();
    expect(h.queries).toEqual([]);
  });

  it("the doctor: this patient's requests in this practice, newest first", async () => {
    h.settings = { data: { secretary_sees_all: false }, error: null };
    h.requests = { data: [req({})], error: null };
    const tab = await load();
    expect(tab?.rows.map((r) => r.id)).toEqual(["r1"]);
    expect(tab?.failed).toBe(false);
    const q = h.queries.find((x) => x.table === "pc_requests");
    expect(q?.eq).toEqual([["professional_id", "doc1"], ["patient_id", "pat1"]]);
    expect(q?.order).toBe("created_at");
  });

  it("a secretary without 'sees all' (or no settings row): no tab, and pc_requests is never asked", async () => {
    h.settings = { data: { secretary_sees_all: false }, error: null };
    h.requests = { data: [req({ destination: "secretary" })], error: null };
    expect(await load(true)).toBeNull();
    h.settings = { data: null, error: null };
    expect(await load(true)).toBeNull();
    expect(h.queries.some((x) => x.table === "pc_requests")).toBe(false);
  });

  it("a secretary with 'sees all': the tab, with the doctor's name for 'Para {doctor}'", async () => {
    h.settings = { data: { secretary_sees_all: true }, error: null };
    h.requests = { data: [req({})], error: null };
    const tab = await load(true);
    expect(tab?.rows).toHaveLength(1);
    expect(tab?.doctorName).toContain("Ana");
  });

  it("hidden when the practice never set the channel up and the patient sent nothing; shown empty once it did", async () => {
    expect(await load()).toBeNull();
    h.settings = { data: { secretary_sees_all: false }, error: null };
    expect(await load()).toEqual({ rows: [], failed: false, doctorName: "" });
  });

  it("requests without a settings row still show (the practice had the channel)", async () => {
    h.requests = { data: [req({})], error: null };
    expect((await load())?.rows).toHaveLength(1);
  });

  it("a failed read shows the tab with the error, not an empty list", async () => {
    h.requests = { data: [], error: { message: "boom" } };
    expect(await load()).toEqual({ rows: [], failed: true, doctorName: "" });
  });
});

describe("toRecordTabRow", () => {
  it("an administrative request has no band; the statuses and the destination; the date formatted on the server", () => {
    expect(toRecordTabRow(req({ band: "green", reason_snapshot: { title: "Atestado", kind: "options" } }), when).band).toBeNull();
    expect(toRecordTabRow(req({ band: "amber" }), when)).toMatchObject({ band: "amber", status: "open", destination: "doctor", reasonTitle: "Efeito colateral", when: "W:2026-10-30T10:00:00Z" });
    expect(toRecordTabRow(req({ status: "call_back", destination: "secretary" }), when)).toMatchObject({ status: "call_back", destination: "secretary" });
    expect(toRecordTabRow(req({ status: "weird", band: "weird" }), when)).toMatchObject({ status: "open", band: "green" });
  });
});

describe("PatientChannelTab", () => {
  const show = (tab: Parameters<typeof PatientChannelTab>[0]["tab"], isSecretary = false) =>
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PatientChannelTab tab={tab} locale="pt-BR" isSecretary={isSecretary} /></NextIntlClientProvider>);
  const rows = [
    toRecordTabRow(req({ id: "a" }), when),
    toRecordTabRow(req({ id: "b", status: "answered", destination: "secretary", reason_snapshot: { title: "Atestado", kind: "options" } }), when),
  ];

  it("each row: band (or Administrativa), reason, date, to whom · status; it opens the inbox detail", () => {
    show({ rows, failed: false, doctorName: "" });
    const links = screen.getAllByTestId("pc-record-row");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/pt-BR/dashboard/patient-channel/a", "/pt-BR/dashboard/patient-channel/b"]);
    expect(links[0]).toHaveTextContent(pt.patientChannel.bands.red);
    expect(links[0]).toHaveTextContent(`${pt.patientChannel.reasons.to.doctor} · ${pt.patientChannel.inbox.status.open}`);
    expect(links[1]).toHaveTextContent(pt.patientDetail.pcAdmin);
    expect(links[1]).toHaveTextContent(`${pt.patientChannel.inbox.toSecretary} · ${pt.patientChannel.inbox.status.answered}`);
    expect(links[1]).toHaveTextContent("Atestado");
    expect(links[1]).toHaveTextContent("W:2026-10-30T10:00:00Z");
  });

  it("a secretary reads 'Para {doctor}' on the doctor's requests", () => {
    show({ rows: rows.slice(0, 1), failed: false, doctorName: "Dra. Ana" }, true);
    expect(screen.getByTestId("pc-record-row")).toHaveTextContent("Para Dra. Ana");
  });

  it("the empty state, and the error", () => {
    show({ rows: [], failed: false, doctorName: "" });
    expect(screen.getByTestId("pc-record-empty")).toHaveTextContent(pt.patientDetail.pcEmpty);
    show({ rows: [], failed: true, doctorName: "" });
    expect(screen.getByTestId("pc-record-error")).toHaveTextContent(pt.settings.loadError);
  });
});
