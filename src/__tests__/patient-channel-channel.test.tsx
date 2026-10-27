import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import {
  DEFAULT_SETTINGS,
  hoursValid,
  parseOptions,
  reasonProblems,
  settingsFromRow,
  settingsRow,
  swapSort,
  type PcReasonRow,
} from "@/lib/patientChannel/channel";

// Patient Channel M3b-2: the practice settings, reasons and FAQ (237's tables, the
// doctor's rows under RLS). The cover image comes later.

const h = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; payload?: unknown; eq?: [string, unknown] }[],
  fail: false,
  // The insert's error (a duplicate key: 23505), and how many updates succeed before one fails.
  insertError: null as null | { code: string; message: string },
  updatesOk: Infinity,
  stored: [] as unknown[],
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => {
      const result = () => (h.fail ? { data: null, error: { message: "x" } } : { data: { id: `new-${h.calls.length}` }, error: null });
      return {
        insert: (payload: unknown) => {
          h.calls.push({ table, op: "insert", payload });
          const r = h.insertError ? { data: null, error: h.insertError } : result();
          return { select: () => ({ single: async () => r }), then: (ok: (v: unknown) => void) => ok(r) };
        },
        update: (payload: unknown) => ({
          eq: async (col: string, val: unknown) => {
            h.calls.push({ table, op: "update", payload, eq: [col, val] });
            if (h.calls.filter((c) => c.op === "update").length > h.updatesOk) return { data: null, error: { message: "x" } };
            return result();
          },
        }),
        select: (cols: string) => {
          h.calls.push({ table, op: "select", payload: cols });
          const chain = { eq: () => chain, is: () => chain, order: () => chain, then: (ok: (v: unknown) => void) => ok({ data: h.stored, error: null }) };
          return chain;
        },
      };
    },
  }),
}));

import { ChannelSettings } from "@/app/[locale]/(site)/dashboard/settings/patient-channel/ChannelSettings";

const C = pt.patientChannel;
const wrap = (node: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{node}</NextIntlClientProvider>;
const reason = (id: string, sort: number): PcReasonRow => ({ id, title: `Motivo ${id}`, subtitle: "", kind: "options", options: ["A"], destination: "doctor", sort });
const mount = (opts: { hasRow?: boolean; reasons?: PcReasonRow[]; onRowCreated?: () => void } = {}) =>
  render(wrap(
    <ChannelSettings professionalId="doc1" hasRow={opts.hasRow ?? false} onRowCreated={opts.onRowCreated ?? (() => {})}
      initial={DEFAULT_SETTINGS} reasons={opts.reasons ?? []} faq={[]} brandHref="/pt-BR/dashboard/settings#brand" />,
  ));

beforeEach(() => { h.calls = []; h.fail = false; h.insertError = null; h.updatesOk = Infinity; h.stored = []; });

describe("the channel's pure rules (237's checks)", () => {
  it("reading hours: 1+ days in 1..7, HH:MM, end after start, at most 14 rows", () => {
    expect(hoursValid([{ days: [1, 2], from: "08:00", to: "18:00" }])).toBe(true);
    expect(hoursValid([{ days: [], from: "08:00", to: "18:00" }])).toBe(false);
    expect(hoursValid([{ days: [8], from: "08:00", to: "18:00" }])).toBe(false);
    expect(hoursValid([{ days: [1], from: "18:00", to: "08:00" }])).toBe(false);
    expect(hoursValid(Array.from({ length: 15 }, () => ({ days: [1], from: "08:00", to: "09:00" })))).toBe(false);
  });

  it("the row: 237's columns, empty texts as null, days sorted and unique; and back", () => {
    const row = settingsRow({ ...DEFAULT_SETTINGS, enabled: true, readingHours: [{ days: [3, 1, 3], from: "08:00", to: "12:00" }], welcome: "  " });
    expect(row).toEqual({ enabled: true, secretary_sees_all: false, sla_business_days: 2, reading_hours: [{ days: [1, 3], from: "08:00", to: "12:00" }], reading_note: null, welcome: null, page_bg: "both" });
    expect(settingsFromRow(row)).toMatchObject({ enabled: true, welcome: "", readingHours: [{ days: [1, 3] }] });
    expect(settingsFromRow(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("reasons: options one per line (deduplicated); options reasons need 1..12; the symptom form none", () => {
    expect(parseOptions(" A \n\nB\na\n")).toEqual(["A", "B"]);
    const base = { title: "T", subtitle: "", destination: "doctor" as const };
    expect(reasonProblems({ ...base, kind: "options", options: [] })).toEqual(["options"]);
    expect(reasonProblems({ ...base, kind: "symptom_form", options: [] })).toEqual([]);
    expect(reasonProblems({ ...base, title: " ", kind: "symptom_form", options: [] })).toEqual(["title"]);
  });

  it("reordering swaps two and numbers 1..n, returning only what changed", () => {
    const rows = [reason("a", 1), reason("b", 2), reason("c", 3)];
    expect(swapSort(rows, "c", -1)).toEqual([{ id: "c", sort: 2 }, { id: "b", sort: 3 }]);
    expect(swapSort(rows, "a", -1)).toEqual([]);
    expect(swapSort([reason("a", 0), reason("b", 0)], "b", -1)).toEqual([{ id: "b", sort: 1 }, { id: "a", sort: 2 }]);
  });
});

describe("Seu canal", () => {
  it("the first save creates the row (then the rules editor follows); later saves update it", async () => {
    const onRowCreated = vi.fn();
    mount({ onRowCreated });
    const save = screen.getByTestId("pc-channel-save");
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(C.channel.enabled) }));
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(C.channel.saved));
    expect(h.calls[0]).toMatchObject({ table: "pc_settings", op: "insert", payload: { professional_id: "doc1", enabled: true } });
    expect(onRowCreated).toHaveBeenCalledTimes(1);
  });

  it("the first save meets a row made elsewhere (23505): updated instead, saved, once", async () => {
    const onRowCreated = vi.fn();
    h.insertError = { code: "23505", message: "duplicate key" };
    mount({ onRowCreated });
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(C.channel.enabled) }));
    fireEvent.click(screen.getByTestId("pc-channel-save"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(C.channel.saved));
    expect(h.calls.map((c) => c.op)).toEqual(["insert", "update"]);
    expect(h.calls[1]).toMatchObject({ table: "pc_settings", payload: { enabled: true }, eq: ["professional_id", "doc1"] });
    expect(onRowCreated).toHaveBeenCalledTimes(1);
    // The next save updates, even before the parent passes hasRow.
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(C.channel.enabled) }));
    fireEvent.click(screen.getByTestId("pc-channel-save"));
    await waitFor(() => expect(h.calls).toHaveLength(3));
    expect(h.calls[2].op).toBe("update");
  });

  it("another insert error is not retried", async () => {
    h.insertError = { code: "42501", message: "rls" };
    mount();
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(C.channel.enabled) }));
    fireEvent.click(screen.getByTestId("pc-channel-save"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(C.channel.saveError));
    expect(h.calls.map((c) => c.op)).toEqual(["insert"]);
  });

  it("with a row: an update of the doctor's own row", async () => {
    mount({ hasRow: true });
    fireEvent.change(screen.getByRole("combobox", { name: C.channel.sla }), { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("pc-channel-save"));
    await waitFor(() => expect(h.calls).toHaveLength(1));
    expect(h.calls[0]).toMatchObject({ table: "pc_settings", op: "update", payload: { sla_business_days: 1 }, eq: ["professional_id", "doc1"] });
  });

  it("reading hours: a row is added Mon–Fri 08–18; an invalid one blocks the save", () => {
    mount({ hasRow: true });
    fireEvent.click(screen.getByRole("button", { name: C.channel.addHours }));
    const fieldset = screen.getByRole("group", { name: C.channel.hours });
    expect(within(fieldset).getAllByRole("checkbox").filter((c) => (c as HTMLInputElement).checked)).toHaveLength(5);
    const [from, to] = within(fieldset).getAllByDisplayValue(/:/);
    fireEvent.change(to, { target: { value: "07:00" } });
    expect(screen.getByText(C.channel.hoursInvalid)).toBeInTheDocument();
    expect(screen.getByTestId("pc-channel-save")).toBeDisabled();
    expect(from).toHaveValue("08:00");
  });
});

describe("Motivos do contato", () => {
  it("adds an options reason (one per line) at the end; an empty list of options is refused", async () => {
    mount({ reasons: [reason("r1", 1)] });
    const region = within(screen.getByRole("region", { name: C.reasons.title }));
    fireEvent.change(region.getByRole("textbox", { name: C.reasons.titleLabel }), { target: { value: "Administrativo" } });
    fireEvent.click(region.getByRole("button", { name: C.reasons.add }));
    expect(region.getByRole("status")).toHaveTextContent(C.reasons.problem.options);
    fireEvent.change(region.getByRole("textbox", { name: C.reasons.optionsLabel }), { target: { value: "Recibo\nNova receita" } });
    fireEvent.change(region.getByRole("combobox", { name: C.reasons.destinationLabel }), { target: { value: "secretary" } });
    fireEvent.click(region.getByRole("button", { name: C.reasons.add }));
    await waitFor(() => expect(region.getAllByTestId("pc-reason")).toHaveLength(2));
    expect(h.calls[0]).toMatchObject({ table: "pc_reasons", op: "insert", payload: { professional_id: "doc1", title: "Administrativo", kind: "options", options: ["Recibo", "Nova receita"], destination: "secretary", sort: 2 } });
  });

  it("archives (never deletes) and reorders", async () => {
    mount({ reasons: [reason("r1", 1), reason("r2", 2)] });
    const region = within(screen.getByRole("region", { name: C.reasons.title }));
    fireEvent.click(region.getByRole("button", { name: C.reasons.up.replace("{title}", "Motivo r2") }));
    await waitFor(() => expect(region.getAllByTestId("pc-reason")[0]).toHaveTextContent("Motivo r2"));
    expect(h.calls.map((c) => [c.op, c.eq?.[1], (c.payload as { sort?: number }).sort])).toEqual([["update", "r2", 1], ["update", "r1", 2]]);
    fireEvent.click(region.getAllByRole("button", { name: C.reasons.archive })[0]);
    await waitFor(() => expect(region.getAllByTestId("pc-reason")).toHaveLength(1));
    expect(h.calls.at(-1)).toMatchObject({ table: "pc_reasons", op: "update", eq: ["id", "r2"] });
    expect((h.calls.at(-1)!.payload as { archived_at?: string }).archived_at).toBeTruthy();
  });

  it("a failed ↑↓ (one moved, one not): the error, and the list re-read as stored", async () => {
    h.updatesOk = 1;
    h.stored = [{ ...reason("r2", 1), subtitle: null }, reason("r1", 1)];
    mount({ reasons: [reason("r1", 1), reason("r2", 2)] });
    const region = within(screen.getByRole("region", { name: C.reasons.title }));
    fireEvent.click(region.getByRole("button", { name: C.reasons.up.replace("{title}", "Motivo r2") }));
    await waitFor(() => expect(h.calls.some((c) => c.op === "select" && c.table === "pc_reasons")).toBe(true));
    expect(region.getByRole("status")).toHaveTextContent(C.reasons.saveError);
    await waitFor(() => expect(region.getAllByTestId("pc-reason")[0]).toHaveTextContent("Motivo r2"));
  });
});

describe("Dúvidas frequentes", () => {
  it("adds a question; both fields are required", async () => {
    mount();
    const region = within(screen.getByRole("region", { name: C.faq.title }));
    fireEvent.change(region.getByRole("textbox", { name: C.faq.questionLabel }), { target: { value: "Esqueci uma dose?" } });
    fireEvent.click(region.getByRole("button", { name: C.faq.add }));
    expect(region.getByRole("status")).toHaveTextContent(C.faq.problem.answer);
    fireEvent.change(region.getByRole("textbox", { name: C.faq.answerLabel }), { target: { value: "Tome assim que lembrar." } });
    fireEvent.click(region.getByRole("button", { name: C.faq.add }));
    await waitFor(() => expect(region.getAllByTestId("pc-faq")).toHaveLength(1));
    expect(h.calls[0]).toMatchObject({ table: "pc_faq", op: "insert", payload: { professional_id: "doc1", question: "Esqueci uma dose?", answer: "Tome assim que lembrar.", sort: 1 } });
  });
});

describe("the channel switch needs a reason (launch polish 8)", () => {
  it("no reasons: it can't be turned on, and the hint says why", () => {
    mount();
    const box = screen.getByTestId("pc-channel-enabled") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(screen.getByTestId("pc-channel-needs-reason")).toHaveTextContent(C.channel.needsReason);
  });
  it("with a reason it turns on, and the hint goes", () => {
    mount({ reasons: [reason("r1", 1)] });
    const box = screen.getByTestId("pc-channel-enabled") as HTMLInputElement;
    expect(box.disabled).toBe(false);
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    expect(screen.queryByTestId("pc-channel-needs-reason")).toBeNull();
  });
  it("an enabled channel with no reasons left can still be turned off", () => {
    render(wrap(
      <ChannelSettings professionalId="doc1" hasRow onRowCreated={() => {}}
        initial={{ ...DEFAULT_SETTINGS, enabled: true }} reasons={[]} faq={[]} brandHref="/pt-BR/dashboard/settings#brand" />,
    ));
    const box = screen.getByTestId("pc-channel-enabled") as HTMLInputElement;
    expect(box.disabled).toBe(false);
    fireEvent.click(box);
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(true);
  });
});
