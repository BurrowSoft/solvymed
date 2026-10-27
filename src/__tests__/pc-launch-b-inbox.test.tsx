// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import { whenShortFormatter } from "@/lib/whenShort";

// Patient Channel launch polish, section B, the staff side (specs/patient-channel-launch-polish.md):
// administrative requests out of the band filters, with their own "Administrativas" filter (01);
// 26 the compact counts on phones; 28 "viu o aviso" on the row; 30 the secretary's note first;
// 31 the patient's name opens the patient file; 32 one short date form.

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ rows: [] as Row[], isSecretary: false, detail: null as Row | null }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator: make } = await import("next-intl");
  const messages = (await import("@/messages/pt-BR.json")).default;
  return { getTranslations: async ({ namespace }: { namespace: string }) => make({ locale: "pt-BR", messages, namespace: namespace as never }) };
});
vi.mock("@/lib/accessLog", () => ({ logChannelRequestOpen: async () => undefined }));
vi.mock("@/lib/patientChannel/server", () => ({ pcAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }));
vi.mock("@/lib/patientChannel/staff", () => {
  // A query on the rows: .eq("status", s) / .in("status", [...]) filter them, as the database would.
  const chain = (data: Row[]) => {
    let rows = data;
    const c: Record<string, unknown> = {};
    for (const k of ["select", "neq", "order", "limit"]) c[k] = () => c;
    c.eq = (col: string, v: unknown) => { if (col === "status") rows = rows.filter((r) => r.status === v); return c; };
    c.in = (col: string, vs: unknown[]) => { if (col === "status") rows = rows.filter((r) => vs.includes(r.status)); return c; };
    c.maybeSingle = async () => ({ data: h.detail, error: null });
    c.then = (ok: (v: unknown) => void) => ok({ data: rows, error: null });
    return c;
  };
  return {
    staffContext: async () => ({
      supabase: {
        from: () => chain(h.rows),
        rpc: async () => ({ data: { open: 3, urgent: 1, attention: 0, notUrgent: 1, admin: 1, openForDoctor: 1, openForSecretary: 2, faqResolved7d: 4, autoResolved7d: 5 }, error: null }),
      },
      prefix: "/pt-BR", profId: "doc1", isSecretary: h.isSecretary, country: "BR", doctorName: "Dra. Ana", formatWhen: (s: string) => s.slice(0, 10),
    }),
  };
});

const { default: InboxPage } = await import("@/app/[locale]/(site)/dashboard/(gated)/patient-channel/page");
const { default: DetailPage } = await import("@/app/[locale]/(site)/dashboard/(gated)/patient-channel/[requestId]/page");

const ID = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
const row = (n: number, o: Row = {}): Row => ({
  id: ID(n), patient_id: `p${n}`, destination: "doctor", band: "green", score_total: 2, status: "open", created_at: `2026-10-2${n}T10:00:00Z`,
  reason_snapshot: { title: `Motivo ${n}`, kind: "symptom_form" }, patients: { full_name: `Paciente ${n}` }, warning_shown: false, ...o,
});
const wrap = (node: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{node}</NextIntlClientProvider>;
const list = async (filter?: string) => render(wrap(await InboxPage({ params: Promise.resolve({ locale: "pt-BR" }), searchParams: Promise.resolve({ filter }) })));
const names = () => screen.queryAllByTestId("pc-inbox-row").map((r) => within(r).getByText(/Paciente \d/).textContent);

beforeEach(() => {
  h.isSecretary = false;
  h.rows = [
    row(1, { band: "red", score_total: 14, warning_shown: true }),
    row(2, { band: "green", score_total: 2 }),
    row(3, { band: "green", score_total: 0, destination: "secretary", reason_snapshot: { title: "Recibo", kind: "options" } }),
  ];
});

describe("the inbox list (section B)", () => {
  it("\"Não urgente\" leaves the administrative request out; \"Administrativas\" shows only those", async () => {
    await list("green");
    expect(names()).toEqual(["Paciente 2"]);
    const admin = screen.getByTestId("pc-filter-admin");
    expect(admin).toHaveTextContent("Administrativas");
    expect(admin).toHaveAttribute("href", "/pt-BR/dashboard/patient-channel?filter=admin");
  });
  it("the Administrativas filter: only the administrative ones, and it's the current chip", async () => {
    await list("admin");
    expect(names()).toEqual(["Paciente 3"]);
    expect(screen.getByTestId("pc-filter-admin")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("pc-filter-all")).not.toHaveAttribute("aria-current");
  });
  it("\"Todas\" keeps everything", async () => {
    await list();
    expect(names()).toEqual(["Paciente 1", "Paciente 2", "Paciente 3"]);
  });
  it("28: a row whose patient saw the emergency warning says so", async () => {
    await list();
    const rows = screen.getAllByTestId("pc-inbox-row");
    expect(within(rows[0]).getByTestId("pc-inbox-row-warning")).toHaveTextContent(pt.patientChannel.detail.warningShown);
    expect(within(rows[1]).queryByTestId("pc-inbox-row-warning")).toBeNull();
  });
  it("26: a compact counts row for phones, the full tiles from sm up", async () => {
    await list();
    expect(screen.getByTestId("pc-inbox-kpis-compact").className).toContain("sm:hidden");
    expect(screen.getByTestId("pc-inbox-kpis").className).toMatch(/\bhidden\b.*\bsm:grid\b/);
  });
  it("256: the \"Administrativas\" tile (and its compact twin) shows the admin count and opens the admin filter", async () => {
    await list();
    const tile = screen.getByTestId("pc-kpi-admin");
    expect(tile).toHaveTextContent("Administrativas");
    expect(tile).toHaveTextContent("1");
    expect(tile).toHaveAttribute("href", "/pt-BR/dashboard/patient-channel?filter=admin");
    expect(screen.getByTestId("pc-kpi-admin-compact")).toHaveTextContent("Administrativas 1");
    expect(screen.getByTestId("pc-kpi-green")).toHaveTextContent("1");
  });
});

describe("the request detail (section B)", () => {
  const detail = async () => render(wrap(await DetailPage({ params: Promise.resolve({ locale: "pt-BR", requestId: ID(1) }) })));
  beforeEach(() => {
    h.detail = { ...row(1, { band: "red", warning_shown: true }), professional_id: "doc1", answers: { symptomIds: [], chips: [], when: 0, intensity: 0, stillTaking: 0 }, text: "", lines: [] };
  });
  it("31: the patient's name opens the patient file", async () => {
    await detail();
    expect(screen.getByTestId("pc-detail-patient")).toHaveAttribute("href", "/pt-BR/dashboard/patients/p1");
  });
  it("30: a secretary on the doctor's request reads the note FIRST, before the warning and the answers", async () => {
    h.isSecretary = true;
    await detail();
    const note = screen.getByTestId("pc-detail-readonly");
    expect(note.compareDocumentPosition(screen.getByTestId("pc-detail-warning")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(screen.getByTestId("pc-detail-breakdown")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("32: one short date form for the staff lists", () => {
  it("day, short month and time; the year only when it isn't this year", () => {
    const f = whenShortFormatter("pt-BR", undefined, "America/Sao_Paulo");
    const thisYear = `${new Date().getUTCFullYear()}-03-05T15:07:00Z`;
    expect(f(thisYear)).toMatch(/^5 de mar\.?, 12:07$/);
    expect(f("2019-03-05T15:07:00Z")).toMatch(/2019/);
    expect(f("nope")).toBe("");
  });
  it("Thai: through dateLocale, so an earlier year shows in the Buddhist era (2019 → 2562); this year shows none", () => {
    const th = whenShortFormatter("th", undefined, "Asia/Bangkok");
    expect(th("2019-03-05T15:07:00Z")).toContain("2562");
    expect(th("2019-03-05T15:07:00Z")).not.toContain("2019");
    expect(th(`${new Date().getUTCFullYear()}-03-05T05:07:00Z`)).not.toMatch(/25\d\d|20\d\d/);
  });
});
