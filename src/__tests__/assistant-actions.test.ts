import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleAssistant, type Deps } from "@/lib/assistant/server/handle";
import { loadTexts } from "@/lib/assistant/server/texts";
import { fakeModelClient, type FakeTurn, type ModelRequest } from "@/lib/assistant/server/model";
import type { AnswerBlock, AnswerChunk, ConfirmationCard, SlotChoice } from "@/lib/assistant/types";

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

// SolvyAI's actions mode (docs/assistant-api.md §5, §5a) with a fake model
// and an in-memory database: the tool loop, the server-built cards and their
// checks, ids only from this request's reads, and confirm_failed without
// the model.

// Tuesday 2026-09-29, 10:00 in São Paulo.
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-29T13:00:00Z")); });
afterAll(() => { vi.useRealTimers(); });

type Row = Record<string, unknown>;
const HOURS = Object.fromEntries(
  ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, { enabled: d !== "sun" && d !== "sat", start: "08:00", end: "18:00" }]),
);

function world() {
  const tables: Record<string, Row[]> = {
    professionals: [{ id: "doc-1", time_zone: "America/Sao_Paulo", country: "BR" }],
    // The default is the first active one by name (the booking form's).
    procedures: [
      { id: "pr-ret", professional_id: "doc-1", name: "Retorno", duration_minutes: 20, price: null, payment_type: "private", active: true },
      { id: "pr-con", professional_id: "doc-1", name: "Consulta", duration_minutes: 50, price: 250, payment_type: "private", active: true },
      { id: "pr-old", professional_id: "doc-1", name: "Avaliação", duration_minutes: 90, price: 400, payment_type: "private", active: false },
    ],
    patients: [
      { id: "p-maria", professional_id: "doc-1", full_name: "Maria Silva", birth_date: "1980-05-02", archived_at: null },
      { id: "p-mario", professional_id: "doc-1", full_name: "Mario Souza", birth_date: null, archived_at: null },
      { id: "p-other", professional_id: "doc-2", full_name: "Maria Outra", birth_date: null, archived_at: null },
      { id: "p-arch", professional_id: "doc-1", full_name: "Ana Antiga", birth_date: null, archived_at: "2026-01-01" },
    ],
    appointments: [
      { id: "a-joao", professional_id: "doc-1", patient_id: "p-mario", patient_name: "Mario Souza", date: "2026-09-30", start_time: "10:00:00", end_time: "10:30:00", status: "scheduled", payment_status: "pending", payment_amount: 200 },
      { id: "b-lunch", professional_id: "doc-1", patient_id: null, patient_name: null, date: "2026-09-30", start_time: "12:00:00", end_time: "13:00:00", status: "blocked", payment_status: null, payment_amount: null },
      { id: "a-req", professional_id: "doc-1", patient_id: "p-maria", patient_name: "Maria Silva", date: "2026-10-01", start_time: "09:00:00", end_time: "09:30:00", status: "tentative", payment_status: "pending", payment_amount: null },
      { id: "a-arch", professional_id: "doc-1", patient_id: "p-arch", patient_name: "Ana Antiga", date: "2026-10-01", start_time: "11:00:00", end_time: "11:30:00", status: "scheduled", payment_status: "pending", payment_amount: null },
      { id: "a-done", professional_id: "doc-1", patient_id: "p-mario", patient_name: "Mario Souza", date: "2026-10-03", start_time: "08:00:00", end_time: "08:30:00", status: "completed", payment_status: "paid", payment_amount: 200 },
      { id: "a-prop", professional_id: "doc-1", patient_id: null, patient_name: "Rui Novo", date: "2026-10-01", start_time: "15:00:00", end_time: "15:30:00", status: "proposal", payment_status: "pending", payment_amount: null },
    ],
  };
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  function query(table: string) {
    let rows = [...(tables[table] ?? [])];
    let single = false;
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
      is: (c: string, v: unknown) => { rows = rows.filter((r) => (r[c] ?? null) === v); return q; },
      in: (c: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[c])); return q; },
      gte: (c: string, v: string) => { rows = rows.filter((r) => String(r[c]) >= v); return q; },
      lte: (c: string, v: string) => { rows = rows.filter((r) => String(r[c]) <= v); return q; },
      not: (c: string, _op: string, list: string) => { const vs = list.slice(1, -1).split(","); rows = rows.filter((r) => !vs.includes(String(r[c]))); return q; },
      or: (f: string) => {
        const m = f.match(/full_name\.ilike\."\*(.*?)\*"/);
        if (m) rows = rows.filter((r) => String(r.full_name).toLowerCase().includes(m[1].toLowerCase()));
        return q;
      },
      order: (c: string) => { rows.sort((x, y) => String(x[c]).localeCompare(String(y[c]))); return q; },
      limit: (n: number) => { rows = rows.slice(0, n); return q; },
      maybeSingle: () => { single = true; return q; },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(res, rej),
    };
    return q;
  }
  const rpcs: Record<string, (args?: Record<string, unknown>) => unknown> = {
    assistant_consume_message: () => ({ allowed: true, used: 3, limit: 20, resets_at: "2026-09-30T03:00:00Z", actions: true }),
    assistant_budget_state: () => ({ configured: true, over_80: false, over_budget: false }),
    get_professional_working_hours: () => HOURS,
    find_similar_patients: (a) => tables.patients.filter((p) => p.professional_id === "doc-1" && String(p.full_name).toLowerCase() === String(a?.p_name).toLowerCase()).map((p) => ({ id: p.id, full_name: p.full_name, birth_date: p.birth_date, archived_at: p.archived_at })),
    get_busy_slots: (a) => tables.appointments
      .filter((r) => r.date === a?.p_date && !["cancelled", "rejected"].includes(String(r.status)))
      .map((r) => ({ slot_start: r.start_time, slot_end: r.end_time })),
  };
  const db = {
    calls,
    rpcs,
    from: (t: string) => query(t),
    rpc(fn: string, args?: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve({ data: rpcs[fn] ? rpcs[fn](args) : null, error: null });
    },
  };
  const service = {
    calls: [] as { fn: string; args?: Record<string, unknown> }[],
    rpc(fn: string, args?: Record<string, unknown>) { this.calls.push({ fn, args }); return Promise.resolve({ data: null, error: null }); },
  };
  return { db, service, tables };
}

function setup(reply: (req: ModelRequest, round: number) => FakeTurn) {
  const w = world();
  const model = fakeModelClient(reply);
  const d = { enabled: true, userId: "doc-1", db: w.db, service: w.service, model, client: "web" } as unknown as Deps;
  return { ...w, model, d };
}

const ask = (text: string) => ({ messages: [{ role: "user", text }], screen: "schedule", locale: "pt-BR", conversationTurns: 0 });

async function run(t: ReturnType<typeof setup>, body: unknown) {
  const out = await handleAssistant(body as Parameters<typeof handleAssistant>[0], t.d);
  if (!("stream" in out)) return { status: out.status, json: out.json, chunks: [] as AnswerChunk[], blocks: [] as AnswerBlock[] };
  const chunks: AnswerChunk[] = [];
  for await (const c of out.stream) chunks.push(c);
  const blocks = chunks.flatMap((c) => (c.kind === "block" && c.block.type !== "text" ? [c.block] : []));
  return { status: 200, json: null, chunks, blocks };
}
const textOf = (chunks: AnswerChunk[]) => chunks.filter((c) => c.kind === "delta").map((c) => (c.kind === "delta" ? c.text : "")).join("");
const cardOf = (blocks: AnswerBlock[]) => (blocks.find((b) => b.type === "card") as { card: ConfirmationCard } | undefined)?.card;
const choiceOf = (blocks: AnswerBlock[]) => blocks.find((b) => b.type === "slot_choice") as SlotChoice | undefined;
// The tool results the model got back in round n.
const resultsIn = (req: ModelRequest) => {
  const last = req.messages[req.messages.length - 1];
  return Array.isArray(last.content) ? last.content.filter((b) => b.type === "tool_result") : [];
};

// Find Maria, then run `then` with her id, then a closing line.
const withMaria = (then: (id: string) => { name: string; input: Record<string, unknown> }) => (req: ModelRequest, round: number): FakeTurn => {
  if (round === 0) return { tools: [{ name: "find_patients", input: { query: "Maria Silva" } }] };
  if (round === 1) {
    const found = JSON.parse(String((resultsIn(req)[0] as { content: string }).content)) as { id: string }[];
    return { tools: [then(found[0].id)] };
  }
  return "Confira e toque em Confirmar.";
};

describe("SolvyAI actions mode: the mode", () => {
  it("without the opt-in (the database says actions: false) the model gets no tools", async () => {
    const t = setup(() => "Na Agenda, toque em +.");
    t.db.rpcs.assistant_consume_message = () => ({ allowed: true, used: 1, limit: 20, resets_at: "x", actions: false });
    const r = await run(t, ask("Marca a Maria amanhã às 14h"));
    expect(r.chunks[0]).toEqual({ kind: "meta", mode: "help" });
    expect(t.model.calls[0].tools).toBeUndefined();
  });

  it("with the opt-in: the tools, and today's date in the clinic's zone", async () => {
    const t = setup(() => "Para quem?");
    const r = await run(t, ask("Marca uma consulta"));
    expect(r.chunks[0]).toEqual({ kind: "meta", mode: "actions" });
    expect(t.model.calls[0].tools?.map((x) => x.name)).toEqual([
      "find_patients", "list_appointments", "choose_date", "find_free_slots",
      "propose_book_appointment", "propose_move_appointment", "propose_cancel_appointment", "propose_block_time", "propose_mark_paid",
      "propose_unblock_time", "propose_booking_decision", "propose_add_patient",
    ]);
    expect(t.model.calls[0].system).toContain("Today at the clinic: Tuesday 2026-09-29, 10:00 (America/Sao_Paulo)");
  });
});

describe("SolvyAI actions mode: round-1 fixes (UX, 3e's tests)", () => {
  it("text from rounds that call tools is never shown; after a card, only the pointer line (no restated or wrong details)", async () => {
    const t = setup((_r, round) =>
      round === 0 ? { text: "Só um instante, deixa eu conferir a data.", tools: [{ name: "find_patients", input: { query: "Maria Silva" } }] }
      : round === 1 ? { text: "Encontrei:", tools: [{ name: "propose_book_appointment", input: { patientId: "p-maria", date: "2026-09-30", start: "14:00" } }] }
      : "Prontinho! Marquei a Ana Costa em 31/09 às 10h, é só Salvar Consulta.");
    const r = await run(t, ask("Marca a Maria Silva amanhã às 14h"));
    expect(cardOf(r.blocks)).toBeDefined();
    expect(textOf(r.chunks)).toBe("Confira os detalhes e toque em Confirmar.");
  });

  it("with no card or list, the last round's text is shown alone (no joined rounds)", async () => {
    const t = setup((_r, round) =>
      round === 0 ? { text: "Vou olhar a agenda:", tools: [{ name: "list_appointments", input: { from: "2026-09-30", to: "2026-09-30" } }] }
      : "Amanhã você tem 1 consulta e 1 horário bloqueado.");
    expect(textOf((await run(t, ask("O que tenho amanhã?"))).chunks)).toBe("Amanhã você tem 1 consulta e 1 horário bloqueado.");
  });

  it("several patients match: a list to tap, and the model gets no ids to guess with", async () => {
    const t = setup((_r, round) =>
      round === 0 ? { tools: [{ name: "find_patients", input: { query: "Mari" } }] }
      : round === 1 ? { tools: [{ name: "propose_book_appointment", input: { patientId: "p-maria", date: "2026-09-30", start: "14:00" } }] }
      : "ok");
    const r = await run(t, ask("Marca a Mari amanhã às 14h"));
    expect(r.blocks.find((b) => b.type === "pick")).toEqual({
      type: "pick", question: "Qual paciente?",
      options: [{ id: "p-maria", title: "Maria Silva · nasc. 02/05/1980", detail: "" }, { id: "p-mario", title: "Mario Souza", detail: "" }],
    });
    const found = resultsIn(t.model.calls[1])[0] as { content: string };
    expect(found.content).not.toContain("p-maria");
    // A guessed id is refused: no card.
    expect(cardOf(r.blocks)).toBeUndefined();
    expect(textOf(r.chunks)).toBe("");
  });

  it("two patients with the same name: the tapped option comes back verbatim and matches exactly one (pt and th, no date conversion)", async () => {
    for (const [locale, tappedTitle] of [["pt-BR", "Maria Silva · nasc. 02/05/1980"], ["th", null]] as const) {
      const first = setup((_r, round) => (round === 0 ? { tools: [{ name: "find_patients", input: { query: "Maria Silva" } }] } : "ok"));
      first.tables.patients.push({ id: "p-maria2", professional_id: "doc-1", full_name: "Maria Silva", birth_date: "1991-07-01", archived_at: null });
      const listed = await run(first, { ...ask("Marca a Maria Silva"), locale });
      const options = (listed.blocks.find((b) => b.type === "pick") as { options: { id: string; title: string }[] }).options;
      expect(options.map((o) => o.id).sort()).toEqual(["p-maria", "p-maria2"]);
      // The user taps the first; the model passes the text back as tapped.
      const tapped = tappedTitle ?? options.find((o) => o.id === "p-maria")!.title;
      if (tappedTitle) expect(options.find((o) => o.id === "p-maria")!.title).toBe(tappedTitle);
      const again = setup((_r, round) => (round === 0 ? { tools: [{ name: "find_patients", input: { query: "Maria Silva", tapped } }] } : "ok"));
      again.tables.patients.push({ id: "p-maria2", professional_id: "doc-1", full_name: "Maria Silva", birth_date: "1991-07-01", archived_at: null });
      const r = await run(again, { ...ask(tapped), locale });
      expect(r.blocks.find((b) => b.type === "pick")).toBeUndefined();
      const found = JSON.parse((resultsIn(again.model.calls[1])[0] as { content: string }).content) as { id: string }[];
      expect(found.map((p) => p.id)).toEqual(["p-maria"]);
    }
  });

  it("a tapped appointment comes back verbatim: exactly that one", async () => {
    const extra = { id: "a-maria10", professional_id: "doc-1", patient_id: "p-maria", patient_name: "Maria Silva", date: "2026-09-30", start_time: "10:00:00", end_time: "10:30:00", status: "scheduled", payment_status: "pending", payment_amount: null };
    const t = setup((_r, round) => (round === 0 ? { tools: [{ name: "list_appointments", input: { from: "2026-09-30", to: "2026-09-30", start: "10:00", tapped: "Quarta-feira, 30/09/2026 · 10:00 · Maria Silva" } }] } : "ok"));
    t.tables.appointments.push(extra);
    const r = await run(t, ask("Quarta-feira, 30/09/2026 · 10:00 · Maria Silva"));
    expect(r.blocks.find((b) => b.type === "pick")).toBeUndefined();
    const found = JSON.parse((resultsIn(t.model.calls[1])[0] as { content: string }).content) as { id: string }[];
    expect(found.map((a) => a.id)).toEqual(["a-maria10"]);
  });

  it("several appointments at the time given: a list with date · time · patient, never a guess", async () => {
    const t = setup((_r, round) => (round === 0 ? { tools: [{ name: "list_appointments", input: { from: "2026-09-30", to: "2026-09-30", start: "10:00" } }] } : "Qual delas? 1) Mario 2) Maria"));
    t.tables.appointments.push({ id: "a-maria10", professional_id: "doc-1", patient_id: "p-maria", patient_name: "Maria Silva", date: "2026-09-30", start_time: "10:00:00", end_time: "10:30:00", status: "scheduled", payment_status: "pending", payment_amount: null });
    const r = await run(t, ask("Cancela a das 10 amanhã"));
    const pick = r.blocks.find((b) => b.type === "pick") as { question: string; options: { title: string }[] };
    expect(pick.question).toBe("Qual consulta?");
    expect(pick.options.map((o) => o.title).sort()).toEqual(["Quarta-feira, 30/09/2026 · 10:00 · Maria Silva", "Quarta-feira, 30/09/2026 · 10:00 · Mario Souza"]);
    expect(textOf(r.chunks)).toBe("");
  });

  it("an ambiguous date: choose_date shows real days to tap; an impossible or past day is refused", async () => {
    let t = setup((_r, round) => (round === 0 ? { tools: [{ name: "choose_date", input: { dates: ["2026-10-09", "2026-10-02"] } }] } : "ok"));
    let r = await run(t, ask("Marca a Maria na próxima sexta"));
    expect(r.blocks.find((b) => b.type === "pick")).toEqual({
      type: "pick", question: "Qual data?",
      options: [{ id: "2026-10-02", title: "Sexta-feira, 02/10/2026", detail: "" }, { id: "2026-10-09", title: "Sexta-feira, 09/10/2026", detail: "" }],
    });
    t = setup((_r, round) => (round === 0 ? { tools: [{ name: "choose_date", input: { dates: ["2026-09-31", "2026-09-01", "2026-10-02"] } }] } : "ok"));
    r = await run(t, ask("…"));
    expect(r.blocks.find((b) => b.type === "pick")).toBeUndefined();
    expect(resultsIn(t.model.calls[1])[0]).toMatchObject({ is_error: true });
  });

  it("dates are real calendar days: 2026-09-31 is refused, never rolled over to 1 October", async () => {
    const t = setup((_r, round) => (round === 0 ? { tools: [{ name: "list_appointments", input: { from: "2026-09-31", to: "2026-09-31" } }] } : "ok"));
    await run(t, ask("…"));
    expect(resultsIn(t.model.calls[1])[0]).toMatchObject({ is_error: true });
  });

  it("mark paid: filtered by patient, the lookup reaches 90 days back and 30 ahead; unfiltered stays at 14 days", async () => {
    let t = setup((_r, round) => (round === 0 ? { tools: [{ name: "list_appointments", input: { from: "2026-07-01", to: "2026-10-29", patient: "Mario" } }] } : "ok"));
    const r = await run(t, ask("Marca como pago o Mario"));
    // Both of Mario's appointments in the window (today's week and the next): the user taps one.
    const pick = r.blocks.find((b) => b.type === "pick") as { options: { id: string }[] };
    expect(pick.options.map((o) => o.id).sort()).toEqual(["a-done", "a-joao"]);
    t = setup((_r, round) => (round === 0 ? { tools: [{ name: "list_appointments", input: { from: "2026-07-01", to: "2026-10-29" } }] } : "ok"));
    await run(t, ask("…"));
    expect(resultsIn(t.model.calls[1])[0]).toMatchObject({ is_error: true });
  });

  // Round 2 (3e's ❌, UX/9a): "a das 10" names no day.
  const tens = [
    { id: "t-today", date: "2026-09-29", name: "Ana Um" },
    { id: "t-plus2", date: "2026-10-01", name: "Bia Dois" },
    { id: "t-plus7", date: "2026-10-06", name: "Caio Tres" },
  ].map((x) => ({ id: x.id, professional_id: "doc-1", patient_id: null, patient_name: x.name, date: x.date, start_time: "16:00:00", end_time: "16:30:00", status: "scheduled", payment_status: "pending", payment_amount: null }));

  it("a time with no day: the server searches the next two weeks itself, three 16:00s → a list (the model assumed today)", async () => {
    const t = setup((_r, round) => (round === 0 ? { tools: [{ name: "list_appointments", input: { from: "2026-09-29", to: "2026-09-29", start: "16:00" } }] } : "ok"));
    t.tables.appointments.push(...tens);
    const r = await run(t, ask("Cancela a das 16"));
    const pick = r.blocks.find((b) => b.type === "pick") as { options: { id: string }[] };
    expect(pick.options.map((o) => o.id).sort()).toEqual(["t-plus2", "t-plus7", "t-today"]);
  });

  it("the guard: even with an id in hand, no card for a partial reference with several matches; a named day gets its card", async () => {
    // The model listed today's agenda (so it has t-today's id) and proposes it.
    const guess = (text: string) => {
      const t = setup((_r, round) =>
        round === 0 ? { tools: [{ name: "list_appointments", input: { from: "2026-09-29", to: "2026-09-29" } }] }
        : round === 1 ? { tools: [{ name: "propose_cancel_appointment", input: { appointmentId: "t-today" } }] }
        : "ok");
      t.tables.appointments.push(...tens);
      return run(t, ask(text));
    };
    let r = await guess("Cancela a das 16");
    expect(cardOf(r.blocks)).toBeUndefined();
    expect((r.blocks.find((b) => b.type === "pick") as { options: unknown[] }).options).toHaveLength(3);
    r = await guess("Cancela a das 16 de hoje");
    expect(cardOf(r.blocks)?.action).toEqual({ kind: "cancel_appointment", args: { appointmentId: "t-today" } });
    r = await guess("Cancel today's 4 pm");
    expect(cardOf(r.blocks)).toBeDefined();
  });

  it("a move named only by patient, with two upcoming: the list first; the new day in the message doesn't count", async () => {
    const t = setup((_r, round) =>
      round === 0 ? { tools: [{ name: "list_appointments", input: { from: "2026-09-29", to: "2026-10-12" } }] }
      : round === 1 ? { tools: [{ name: "propose_move_appointment", input: { appointmentId: "a-joao", date: "2026-10-01", start: "15:00" } }] }
      : "ok");
    t.tables.appointments.push({ id: "a-joao2", professional_id: "doc-1", patient_id: "p-mario", patient_name: "Mario Souza", date: "2026-10-05", start_time: "09:00:00", end_time: "09:30:00", status: "scheduled", payment_status: "pending", payment_amount: null });
    const r = await run(t, ask("Muda a consulta do Mario para quinta às 15h"));
    expect(cardOf(r.blocks)).toBeUndefined();
    expect((r.blocks.find((b) => b.type === "pick") as { options: { id: string }[] }).options.map((o) => o.id).sort()).toEqual(["a-joao", "a-joao2"]);
  });

  it("one question at a time: a second list in the same answer waits", async () => {
    const t = setup((_r, round) =>
      round === 0 ? { tools: [{ name: "find_patients", input: { query: "Mari" } }, { name: "choose_date", input: { dates: ["2026-10-01", "2026-10-08"] } }] } : "ok");
    const r = await run(t, ask("Muda a da Mari para quinta"));
    expect(r.blocks.filter((b) => b.type === "pick")).toHaveLength(1);
    expect((resultsIn(t.model.calls[1])[1] as { content: string }).content).toContain("Not shown");
  });

  it("a card after a list in the same answer waits too (d7: the model chose from its own list)", async () => {
    const t = setup((_r, round) =>
      round === 0 ? { tools: [{ name: "find_patients", input: { query: "Maria Silva" } }, { name: "choose_date", input: { dates: ["2026-10-01", "2026-10-08"] } }] }
      : round === 1 ? { tools: [{ name: "propose_book_appointment", input: { patientId: "p-maria", date: "2026-10-01", start: "10:00" } }] }
      : "ok");
    const r = await run(t, ask("Marca a Maria Silva quinta às 10h"));
    expect(r.blocks.filter((b) => b.type === "pick")).toHaveLength(1);
    expect(cardOf(r.blocks)).toBeUndefined();
    expect((resultsIn(t.model.calls[2])[0] as { content: string }).content).toContain("Not shown");
  });

  it("after a time choice (its own question), no pointer text at all", async () => {
    const t = setup((_r, round) => (round === 0 ? { tools: [{ name: "find_patients", input: { query: "Maria Silva" } }] } : round === 1 ? { tools: [{ name: "propose_book_appointment", input: { patientId: "p-maria", date: "2026-09-30", start: "10:00" } }] } : "Escolha um horário acima."));
    const r = await run(t, ask("Marca a Maria Silva amanhã às 10h"));
    expect(choiceOf(r.blocks)?.reason).toBe("conflict");
    expect(textOf(r.chunks)).toBe("");
  });

  it("the prompt carries a real calendar to look dates up in, and the actions rules", async () => {
    const t = setup(() => "ok");
    await run(t, ask("Marca uma consulta"));
    const system = t.model.calls[0].system;
    expect(system).toContain("Tue 2026-09-29 (today)");
    expect(system).toContain("Fri 2026-10-02");
    expect(system).not.toContain("2026-09-31");
    expect(system).toContain("ACTIONS RULE A");
    expect(system).toContain("\"Confirmar\", \"Desfazer\", \"Abrir\"");
    expect(system).toContain("Reply in Brazilian Portuguese");
  });

  it("a Thai UI gets Thai: the card, the pointer with the real button, and the model's language (e7)", async () => {
    const t = setup(withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2026-10-07", start: "14:00", durationMin: 30 } })));
    const r = await run(t, { ...ask("นัดคุณมาเรียวันพุธ 14:00"), locale: "th" });
    const card = cardOf(r.blocks)!;
    expect(card.title).toBe("นัดหมายใหม่");
    expect(card.fields.map((f) => f.label)).toContain("ผู้ป่วย");
    expect(textOf(r.chunks)).toBe("ตรวจสอบรายละเอียดแล้วแตะ ยืนยัน");
    const system = t.model.calls[0].system;
    expect(system).toContain("Reply in Thai");
    expect(system).toContain("\"ยืนยัน\"");
    expect(system).not.toContain("\"Confirmar\"");
  });

  it("English names the real button (d7: never \"tap Confirmar\")", async () => {
    const t = setup(withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2026-10-07", start: "14:00", durationMin: 30 } })));
    const r = await run(t, { ...ask("Book Maria on Wednesday at 2pm"), locale: "en" });
    expect(textOf(r.chunks)).toBe("Check the details and tap Confirm.");
    expect(cardOf(r.blocks)!.title).toBe("New appointment");
  });
});

describe("SolvyAI actions mode: booking", () => {
  it("find → propose: a server-built card, usage summed over the rounds, nothing written", async () => {
    const t = setup(withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2026-09-30", start: "14:00" } })));
    const r = await run(t, ask("Marca a Maria Silva amanhã às 14h"));
    const card = cardOf(r.blocks)!;
    expect(card.title).toBe("Nova consulta");
    expect(card.fields).toEqual([
      { label: "Paciente", value: "Maria Silva (02/05/1980)" },
      { label: "Quando", value: "Quarta-feira, 30/09/2026, 14:00–14:50" },
      { label: "Procedimento", value: "Consulta", isDefault: true },
      { label: "Valor", value: expect.stringMatching(/^R\$\s250,00$/), isDefault: true },
      { label: "Tipo", value: "Presencial", isDefault: true },
      { label: "Duração", value: "50 min", isDefault: true },
    ]);
    expect(card.warnings).toEqual([]);
    expect(card.hardStop).toBe(false);
    expect(card.action).toEqual({ kind: "book_appointment", args: { patientId: "p-maria", date: "2026-09-30", start: "14:00", durationMin: 50, procedureId: "pr-con" } });
    expect(card.after).toEqual({ screen: "schedule", date: "2026-09-30", highlight: { kind: "appointment" } });
    expect(card.viewHref.startsWith("/pt-BR/dashboard/schedule")).toBe(true);
    expect(Date.parse(card.expiresAt) - Date.now()).toBe(15 * 60_000);
    // The other clinic's Maria never reached the model.
    expect(JSON.stringify(t.model.calls[1].messages)).not.toContain("p-other");
    expect(t.model.calls).toHaveLength(3);
    expect(t.service.calls).toEqual([{ fn: "assistant_record_usage", args: { p_professional_id: "doc-1", p_input: 3000, p_output: 150, p_cache_read: 27000, p_cache_write: 0 } }]);
    expect(r.chunks[r.chunks.length - 1]).toEqual({ kind: "done" });
  });

  it("no procedures set up: no procedure or value on the card, 30 min, nothing else invented", async () => {
    const t = setup(withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2026-09-30", start: "14:00" } })));
    t.tables.procedures = [];
    const card = cardOf((await run(t, ask("…"))).blocks)!;
    expect(card.fields.map((f) => f.label)).toEqual(["Paciente", "Quando", "Tipo", "Duração"]);
    expect(card.action.args).toEqual({ patientId: "p-maria", date: "2026-09-30", start: "14:00", durationMin: 30 });
  });

  it("an id the model didn't get from a read in THIS request is refused, never a card", async () => {
    const t = setup((req, round) => (round === 0 ? { tools: [{ name: "propose_book_appointment", input: { patientId: "p-maria", date: "2026-09-30", start: "14:00" } }] } : "Qual paciente?"));
    const r = await run(t, ask("Marca a p-maria"));
    expect(cardOf(r.blocks)).toBeUndefined();
    expect(resultsIn(t.model.calls[1])[0]).toMatchObject({ is_error: true });
  });

  it("another appointment at that time: time chips (nearest free), never a card", async () => {
    const t = setup(withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2026-09-30", start: "10:00", durationMin: 30 } })));
    const r = await run(t, ask("Marca a Maria Silva amanhã às 10h"));
    expect(cardOf(r.blocks)).toBeUndefined();
    const choice = choiceOf(r.blocks)!;
    expect(choice.reason).toBe("conflict");
    expect(choice.text).toContain("já tem Mario Souza (10:00–10:30)");
    expect(choice.alternatives).toEqual([
      { date: "2026-09-30", start: "09:00" },
      { date: "2026-09-30", start: "09:30" },
      { date: "2026-09-30", start: "10:30" },
    ]);
  });

  it("blocked time: a card with the warning and the second question", async () => {
    const t = setup(withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2026-09-30", start: "12:00" } })));
    const card = cardOf((await run(t, ask("… às 12h"))).blocks)!;
    expect(card.warnings.map((w) => w.code)).toEqual(["blocked"]);
    expect(card.secondConfirm).toEqual({ question: "Este horário está bloqueado (12:00–13:00). Agendar mesmo assim?", confirmLabel: "Agendar" });
  });

  it("outside the working hours, and a day off: asked twice", async () => {
    let t = setup(withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2026-09-30", start: "19:00" } })));
    let card = cardOf((await run(t, ask("… às 19h"))).blocks)!;
    expect(card.warnings.map((w) => w.code)).toEqual(["outside_hours"]);
    expect(card.secondConfirm?.question).toBe("Este horário está fora do horário de atendimento (08:00–18:00). Agendar mesmo assim?");
    t = setup(withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2026-10-03", start: "10:00" } })));
    card = cardOf((await run(t, ask("… sábado"))).blocks)!;
    expect(card.secondConfirm?.question).toBe("Sábado não é dia de atendimento. Agendar mesmo assim?");
  });

  it("a time that has passed is a hard stop; so is an archived patient", async () => {
    let t = setup(withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2026-09-29", start: "08:00" } })));
    let card = cardOf((await run(t, ask("… hoje às 8h"))).blocks)!;
    expect(card.hardStop).toBe(true);
    expect(card.stop?.code).toBe("past_time");
    // The archived patient is only reachable through the schedule.
    t = setup((req, round) =>
      round === 0 ? { tools: [{ name: "list_appointments", input: { from: "2026-10-01", to: "2026-10-01" } }] }
        : round === 1 ? { tools: [{ name: "propose_book_appointment", input: { patientId: "p-arch", date: "2026-10-02", start: "10:00" } }] }
          : "ok");
    card = cardOf((await run(t, ask("… a Ana"))).blocks)!;
    expect(card.stop?.code).toBe("patient_archived");
  });

  it("ending exactly at midnight is refused like the save (no card that would fail at Confirmar; 7f)", async () => {
    const t = setup(withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2026-09-30", start: "23:30", durationMin: 30 } })));
    expect(cardOf((await run(t, ask("…"))).blocks)).toBeUndefined();
    expect(resultsIn(t.model.calls[2])[0]).toMatchObject({ is_error: true });
  });

  it("a Buddhist-era or malformed date is sent back to the model, never a card", async () => {
    const t = setup(withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2569-09-30", start: "14:00" } })));
    const r = await run(t, ask("…"));
    expect(cardOf(r.blocks)).toBeUndefined();
    expect(resultsIn(t.model.calls[2])[0]).toMatchObject({ is_error: true });
  });
});

describe("SolvyAI actions mode: other proposals", () => {
  const listThen = (from: string, tool: { name: string; input: Record<string, unknown> }) => (_req: ModelRequest, round: number): FakeTurn =>
    round === 0 ? { tools: [{ name: "list_appointments", input: { from, to: from } }] } : round === 1 ? { tools: [tool] } : "ok";

  it("list_appointments: no clinical data, blocks without a patient", async () => {
    const t = setup(listThen("2026-09-30", { name: "find_free_slots", input: { date: "2026-09-30", durationMin: 30 } }));
    await run(t, ask("Agenda de amanhã"));
    const listed = JSON.parse(String((resultsIn(t.model.calls[1])[0] as { content: string }).content)) as Row[];
    expect(listed.map((r) => r.id)).toEqual(["a-joao", "b-lunch"]);
    expect(listed[1]).not.toHaveProperty("patient");
    const free = JSON.parse(String((resultsIn(t.model.calls[2])[0] as { content: string }).content)) as { free: string[] };
    expect(free.free).not.toContain("10:00");
    expect(free.free).not.toContain("12:00");
    expect(free.free[0]).toBe("08:00");
  });

  it("free times never ask for a length: the default procedure's (UX), said in the answer", async () => {
    const t = setup(listThen("2026-09-30", { name: "find_free_slots", input: { date: "2026-09-30" } }));
    await run(t, ask("Tenho horário livre amanhã?"));
    const free = JSON.parse(String((resultsIn(t.model.calls[2])[0] as { content: string }).content)) as { durationMin: number; free: string[]; note: string };
    expect(free.durationMin).toBe(50);
    expect(free.free.length).toBeGreaterThan(0);
    expect(free.note).toContain("durationMin");
  });

  it("cancel: a card; a booking request is a hard stop (it's declined on the request)", async () => {
    let t = setup(listThen("2026-09-30", { name: "propose_cancel_appointment", input: { appointmentId: "a-joao" } }));
    let card = cardOf((await run(t, ask("Cancela o Mario"))).blocks)!;
    expect(card.action).toEqual({ kind: "cancel_appointment", args: { appointmentId: "a-joao" } });
    expect(card.after).toEqual({ screen: "schedule", date: "2026-09-30", highlight: { kind: "appointment", id: "a-joao" } });
    t = setup(listThen("2026-10-01", { name: "propose_cancel_appointment", input: { appointmentId: "a-req" } }));
    card = cardOf((await run(t, ask("Cancela a Maria"))).blocks)!;
    expect(card.stop?.code).toBe("not_allowed");
    // Completed: no card; the model is told only live ones can be cancelled.
    t = setup(listThen("2026-10-03", { name: "propose_cancel_appointment", input: { appointmentId: "a-done" } }));
    const r = await run(t, ask("Cancela a do Mario"));
    expect(cardOf(r.blocks)).toBeUndefined();
    expect(JSON.stringify(t.model.calls.at(-1))).toContain("Only scheduled, confirmed or late appointments can be cancelled");
  });

  it("block time: refused over appointments, a card otherwise", async () => {
    let t = setup((_r, round) => (round === 0 ? { tools: [{ name: "propose_block_time", input: { date: "2026-09-30", start: "09:00", end: "11:00" } }] } : "ok"));
    let r = await run(t, ask("Bloqueia 9 às 11"));
    expect(cardOf(r.blocks)).toBeUndefined();
    expect(resultsIn(t.model.calls[1])[0]).toMatchObject({ is_error: true });
    t = setup((_r, round) => (round === 0 ? { tools: [{ name: "propose_block_time", input: { date: "2026-09-30", start: "15:00", end: "16:00", reason: "Curso" } }] } : "ok"));
    r = await run(t, ask("Bloqueia 15 às 16"));
    expect(cardOf(r.blocks)!.action).toEqual({ kind: "block_time", args: { date: "2026-09-30", start: "15:00", end: "16:00", reason: "Curso" } });
  });

  it("mark paid: needs a value; with one, a card to Payments", async () => {
    let t = setup(listThen("2026-10-01", { name: "propose_mark_paid", input: { appointmentId: "a-arch", paid: true } }));
    let r = await run(t, ask("A Ana pagou"));
    expect(cardOf(r.blocks)).toBeUndefined();
    t = setup(listThen("2026-09-30", { name: "propose_mark_paid", input: { appointmentId: "a-joao", paid: true } }));
    r = await run(t, ask("O Mario pagou"));
    expect(cardOf(r.blocks)!.after).toEqual({ screen: "payments", highlight: { kind: "appointment", id: "a-joao" } });
    // The value in the practice's currency (Sprint TH rule 1).
    expect(cardOf(r.blocks)!.fields.find((f) => f.label === "Valor")!.value).toMatch(/^R\$\s200,00$/);
    t = setup(listThen("2026-09-30", { name: "propose_mark_paid", input: { appointmentId: "a-joao", paid: true } }));
    t.tables.professionals[0].country = "TH";
    r = await run(t, ask("O Mario pagou"));
    expect(cardOf(r.blocks)!.fields.find((f) => f.label === "Valor")!.value).toBe("฿200.00");
    const listed = JSON.parse(String((resultsIn(t.model.calls[1])[0] as { content: string }).content)) as Row[];
    expect(listed[0].value).toBe("฿200.00");
  });

  it("at most 4 model calls per answer", async () => {
    const t = setup(() => ({ tools: [{ name: "find_patients", input: { query: "Maria" } }] }));
    const r = await run(t, ask("…"));
    expect(t.model.calls).toHaveLength(4);
    // Nothing shown by then: a plain line, not an error; the usage counts.
    expect(r.chunks.some((c) => c.kind === "delta" && c.text.startsWith("Não consegui concluir"))).toBe(true);
    expect(r.chunks[r.chunks.length - 1]).toEqual({ kind: "done" });
    expect(t.service.calls.map((c) => c.fn)).toEqual(["assistant_record_usage"]);
  });
});

describe("SolvyAI actions mode: Confirmar failed", () => {
  const failed = (action: unknown) => ({ event: { type: "confirm_failed", code: "slot_taken", action }, screen: "schedule", locale: "pt-BR" });

  it("fresh times without the model; rate-limited like a message, then not counted", async () => {
    const t = setup(() => "never");
    const r = await run(t, failed({ kind: "book_appointment", args: { patientId: "whatever", date: "2026-09-30", start: "10:00", durationMin: 30 } }));
    expect(t.model.calls).toEqual([]);
    expect(t.db.calls[0].fn).toBe("assistant_consume_message");
    expect(t.service.calls).toEqual([{ fn: "assistant_release_message", args: { p_professional_id: "doc-1" } }]);
    const choice = choiceOf(r.blocks)!;
    expect(choice.reason).toBe("confirm_failed");
    expect(choice.text).toBe("Esse horário acabou de ser ocupado. Nada foi salvo. Qual destes horários?");
    expect(choice.alternatives.map((a) => a.start)).toEqual(["09:00", "09:30", "10:30"]);
  });

  it("a cancel that's no longer allowed: a fixed line, no model", async () => {
    const t = setup(() => "never");
    const r = await run(t, { event: { type: "confirm_failed", code: "appointment_not_cancellable", action: { kind: "cancel_appointment", args: { appointmentId: "a-done" } } }, screen: "schedule", locale: "pt-BR" });
    expect(t.model.calls).toEqual([]);
    expect(r.chunks.filter((c) => c.kind === "block")).toEqual([{ kind: "block", block: { type: "text", text: "Só é possível cancelar consultas agendadas, confirmadas ou atrasadas. Nada foi salvo." } }]);
  });

  it("refused: a bad action, help mode, and the anti-spam limit", async () => {
    let t = setup(() => "never");
    expect((await run(t, failed({ args: { date: "30/09/2026", start: "10:00" } }))).status).toBe(400);
    expect((await run(t, { event: { type: "other" } })).status).toBe(400);
    t = setup(() => "never");
    t.db.rpcs.assistant_consume_message = () => ({ allowed: true, used: 1, limit: 20, resets_at: "x", actions: false });
    expect((await run(t, failed({ args: { date: "2026-09-30", start: "10:00" } }))).status).toBe(400);
    t = setup(() => "never");
    t.db.rpcs.assistant_consume_message = () => ({ allowed: false, reason: "rate_limited", retry_after_s: 2 });
    expect(await run(t, failed({ args: { date: "2026-09-30", start: "10:00" } }))).toMatchObject({ status: 429, json: { error: "rate_limited", retryAfterS: 2 } });
    expect(t.service.calls).toEqual([]);
  });
});

describe("SolvyAI actions mode: part 2 (unblock, booking decision, add patient)", () => {
  const listThen = (from: string, tool: { name: string; input: Record<string, unknown> }) => (_req: ModelRequest, round: number): FakeTurn =>
    round === 0 ? { tools: [{ name: "list_appointments", input: { from, to: from } }] } : round === 1 ? { tools: [tool] } : "ok";

  it("unblock: a card for a block only, never an appointment", async () => {
    let t = setup(listThen("2026-09-30", { name: "propose_unblock_time", input: { blockId: "b-lunch" } }));
    const card = cardOf((await run(t, ask("Desbloqueia o almoço"))).blocks)!;
    expect(card.title).toBe("Desbloquear horário");
    expect(card.fields[0]).toEqual({ label: "Período", value: "Quarta-feira, 30/09/2026, 12:00–13:00" });
    expect(card.action).toEqual({ kind: "unblock_time", args: { blockId: "b-lunch" } });
    t = setup(listThen("2026-09-30", { name: "propose_unblock_time", input: { blockId: "a-joao" } }));
    expect(cardOf((await run(t, ask("…"))).blocks)).toBeUndefined();
  });

  it("booking decision: confirm / reject a request; a proposal can only be declined", async () => {
    let t = setup(listThen("2026-10-01", { name: "propose_booking_decision", input: { appointmentId: "a-req", decision: "confirm", note: "Traga os exames" } }));
    let card = cardOf((await run(t, ask("Confirma o pedido da Maria"))).blocks)!;
    expect(card.title).toBe("Confirmar pedido");
    expect(card.fields.map((f) => f.label)).toEqual(["Paciente", "Quando", "Decisão", "Observação"]);
    expect(card.action).toEqual({ kind: "booking_decision", args: { appointmentId: "a-req", decision: "confirm", note: "Traga os exames" } });
    expect(card.hardStop).toBe(false);
    t = setup(listThen("2026-10-01", { name: "propose_booking_decision", input: { appointmentId: "a-prop", decision: "confirm" } }));
    card = cardOf((await run(t, ask("…"))).blocks)!;
    expect(card.stop?.code).toBe("not_allowed");
    t = setup(listThen("2026-10-01", { name: "propose_booking_decision", input: { appointmentId: "a-prop", decision: "reject" } }));
    expect(cardOf((await run(t, ask("…"))).blocks)!.hardStop).toBe(false);
    // Not a request: no card.
    t = setup(listThen("2026-10-01", { name: "propose_booking_decision", input: { appointmentId: "a-arch", decision: "reject" } }));
    expect(cardOf((await run(t, ask("…"))).blocks)).toBeUndefined();
  });

  it("add patient: a card with only what was said; similar patients are asked about first", async () => {
    let t = setup((_r, round) => (round === 0 ? { tools: [{ name: "propose_add_patient", input: { fullName: "João  Pedro", birthDate: "1990-02-03" } }] } : "ok"));
    let card = cardOf((await run(t, ask("Cadastra o João Pedro"))).blocks)!;
    expect(card.fields).toEqual([
      { label: "Nome", value: "João Pedro" },
      { label: "Nascimento", value: "03/02/1990" },
    ]);
    expect(card.action).toEqual({ kind: "add_patient", args: { fullName: "João Pedro", birthDate: "1990-02-03" } });
    // The chat masks identifiers: a placeholder is never taken as a name (7f).
    t = setup((_r, round) => (round === 0 ? { tools: [{ name: "propose_add_patient", input: { fullName: "[phone]" } }] } : "ok"));
    expect(cardOf((await run(t, ask("Cadastra (11) 99999-0000"))).blocks)).toBeUndefined();
    expect(resultsIn(t.model.calls[1])[0]).toMatchObject({ is_error: true });
    // Phone / email / IDs aren't tool inputs at all.
    const addTool = t.model.calls[0].tools!.find((x) => x.name === "propose_add_patient")!;
    expect(Object.keys((addTool.input_schema as { properties: object }).properties)).toEqual(["fullName", "birthDate", "createAnyway"]);
    expect(card.after).toEqual({ screen: "patient", highlight: { kind: "patient" } });
    // Maria Silva exists: no card; the user taps the existing one or "É outra
    // pessoa" (UX: a list, never a text list), and the text only points to it.
    t = setup((_r, round) => (round === 0 ? { tools: [{ name: "propose_add_patient", input: { fullName: "Maria Silva" } }] } : "A Maria Silva (02/05/1980) já existe."));
    const dup = await run(t, ask("Cadastra a Maria Silva"));
    expect(cardOf(dup.blocks)).toBeUndefined();
    expect(dup.blocks.find((b) => b.type === "pick")).toEqual({
      type: "pick", question: "Já existe um cadastro parecido. É a mesma pessoa?",
      options: [{ id: "p-maria", title: "Maria Silva · nasc. 02/05/1980", detail: "" }, { id: "new", title: "É outra pessoa", detail: "" }],
    });
    expect(textOf(dup.chunks)).toBe("");
    t = setup((_r, round) => (round === 0 ? { tools: [{ name: "propose_add_patient", input: { fullName: "Maria Silva", createAnyway: true } }] } : "ok"));
    card = cardOf((await run(t, ask("É outra pessoa"))).blocks)!;
    expect(card.fields.find((f) => f.label === "Parecidos já cadastrados")!.value).toBe("Maria Silva (02/05/1980)");
    expect(card.action.args.createAnyway).toBe(true);
    // A birth date outside 1900..today, or a Buddhist-era year: asked again.
    t = setup((_r, round) => (round === 0 ? { tools: [{ name: "propose_add_patient", input: { fullName: "Ana Nova", birthDate: "2569-01-01" } }] } : "ok"));
    expect(cardOf((await run(t, ask("…"))).blocks)).toBeUndefined();
  });

  it("on the website, sending Pix is app-only (said, with the Help link)", async () => {
    const t = setup(() => "ok");
    await run(t, ask("Manda o Pix para a Maria"));
    expect(t.model.calls[0].system).toContain("can't send Pix by WhatsApp");
    expect(t.model.calls[0].system).not.toContain("can't move");
  });

  it("move: a before → after card with the same duration; the same checks as booking", async () => {
    let t = setup(listThen("2026-09-30", { name: "propose_move_appointment", input: { appointmentId: "a-joao", date: "2026-10-01", start: "14:00" } }));
    let card = cardOf((await run(t, ask("Remarca o Mario para quinta às 14h"))).blocks)!;
    expect(card.title).toBe("Remarcar consulta");
    expect(card.fields.slice(1)).toEqual([
      { label: "De", value: "Quarta-feira, 30/09/2026, 10:00–10:30" },
      { label: "Para", value: "Quinta-feira, 01/10/2026, 14:00–14:30" },
    ]);
    expect(card.action).toEqual({ kind: "move_appointment", args: { appointmentId: "a-joao", date: "2026-10-01", start: "14:00", durationMin: 30 } });
    expect(card.after).toEqual({ screen: "schedule", date: "2026-10-01", highlight: { kind: "appointment", id: "a-joao" } });
    // Onto its own old slot's neighbour: itself doesn't clash.
    t = setup(listThen("2026-09-30", { name: "propose_move_appointment", input: { appointmentId: "a-joao", date: "2026-09-30", start: "10:15" } }));
    expect(cardOf((await run(t, ask("…"))).blocks)).toBeDefined();
    // Onto blocked time: the second question, in Remarcar's words.
    t = setup(listThen("2026-09-30", { name: "propose_move_appointment", input: { appointmentId: "a-joao", date: "2026-09-30", start: "12:00" } }));
    card = cardOf((await run(t, ask("…"))).blocks)!;
    expect(card.secondConfirm).toEqual({ question: "Este horário está bloqueado (12:00–13:00). Remarcar mesmo assim?", confirmLabel: "Remarcar" });
    // Onto another appointment: time chips, no card.
    t = setup(listThen("2026-10-01", { name: "propose_move_appointment", input: { appointmentId: "a-arch", date: "2026-10-01", start: "09:00" } }));
    const r = await run(t, ask("…"));
    expect(cardOf(r.blocks)).toBeUndefined();
    expect(choiceOf(r.blocks)!.reason).toBe("conflict");
  });

  it("move: a no-show or a request isn't moved (back to the model)", async () => {
    let t = setup(listThen("2026-10-01", { name: "propose_move_appointment", input: { appointmentId: "a-req", date: "2026-10-02", start: "10:00" } }));
    expect(cardOf((await run(t, ask("…"))).blocks)).toBeUndefined();
    expect(resultsIn(t.model.calls[2])[0]).toMatchObject({ is_error: true });
    t = setup(listThen("2026-10-01", { name: "propose_move_appointment", input: { appointmentId: "a-arch", date: "2026-10-02", start: "10:00" } }));
    t.tables.appointments.find((x) => x.id === "a-arch")!.status = "absent";
    expect(cardOf((await run(t, ask("…"))).blocks)).toBeUndefined();
    expect(String((resultsIn(t.model.calls[2])[0] as { content: string }).content)).toContain("no-show");
  });
});

describe("SolvyAI actions mode: a recurring series (the website's Repetir)", () => {
  const series = (repeat: unknown, date = "2026-10-07", start = "14:00") =>
    withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date, start, durationMin: 30, repeat } }));

  it("a card with Repetir and every date's check; the action carries repeat", async () => {
    const t = setup(series({ every: "week", count: 3 }));
    const card = cardOf((await run(t, ask("Marca a Maria toda quarta às 14h, 3 vezes"))).blocks)!;
    expect(card.fields.find((f) => f.label === "Repetir")!.value).toBe("Semanal, 3 consultas (até 21/10/2026)");
    expect(card.action.args.repeat).toEqual({ every: "week", count: 3 });
  });

  it("a taken date in the series: at once, the series card without it (\"pulando 14/10\") and free times on 14/10 for a separate appointment; no round trip", async () => {
    const rui = { id: "a-x", professional_id: "doc-1", patient_id: null, patient_name: "Rui", date: "2026-10-14", start_time: "14:00:00", end_time: "14:30:00", status: "scheduled", payment_status: "pending", payment_amount: null };
    const t = setup(series({ every: "week", count: 3 }));
    t.tables.appointments.push(rui);
    const r = await run(t, ask("Marca a Maria toda quarta às 14h, 3 vezes"));
    const card = cardOf(r.blocks)!;
    expect(card.fields.find((f) => f.label === "Repetir")!.value).toBe("Semanal, 2 consultas (até 21/10/2026)");
    expect(card.fields.find((f) => f.label === "Fica de fora")!.value).toBe("14/10 (horário ocupado)");
    expect(card.action.args.repeat).toEqual({ every: "week", count: 3, skip: ["2026-10-14"] });
    const free = choiceOf(r.blocks)!;
    expect(free.text).toBe("Outro horário para 14/10:");
    expect(free.alternatives.length).toBeGreaterThan(0);
    expect(free.alternatives.every((a) => a.date === "2026-10-14" && a.start !== "14:00")).toBe(true);
    expect(textOf(r.chunks)).toBe("Confira os detalhes e toque em Confirmar.");
  });

  it("a tapped time chip is ONE appointment: the server drops a replayed series (3e: the double booking)", async () => {
    // The model replays the earlier "toda quarta, 3 vezes" at the chip's time.
    const replay = () => withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2026-10-07", start: "09:00", durationMin: 30, repeat: { every: "week", count: 3 } } }));
    const t = setup(replay());
    const card = cardOf((await run(t, ask("quarta-feira, 07/10/2026 às 09:00"))).blocks)!;
    expect(card.fields.find((f) => f.label === "Repetir")).toBeUndefined();
    expect(card.fields.find((f) => f.label === "Quando")!.value).toBe("Quarta-feira, 07/10/2026, 09:00–09:30");
    expect(card.action.args).not.toHaveProperty("repeat");
    // A typed series request is still a series.
    const s = setup(replay());
    expect(cardOf((await run(s, ask("Marca a Maria toda quarta às 9h, 3 vezes"))).blocks)!.action.args).toHaveProperty("repeat");
    // Typed with a full date and a time at the end: not a chip (9a).
    const typed = setup(replay());
    expect(cardOf((await run(typed, ask("toda quarta, começando 07/10/2026 às 09:00"))).blocks)!.action.args).toHaveProperty("repeat");
    // The chip for another time than the proposal's isn't this one.
    const other = setup(replay());
    expect(cardOf((await run(other, ask("quarta-feira, 07/10/2026 às 10:00"))).blocks)!.action.args).toHaveProperty("repeat");
  });

  it("rule 10a: \"next Friday\" in any language shows the two Fridays, never a card", async () => {
    for (const [locale, text] of [["pt-BR", "Marca a Maria Silva próxima sexta às 10h"], ["pt-BR", "Marca a Maria Silva sexta que vem às 10h"], ["en", "Book Maria Silva next Friday at 10"], ["th", "นัดมาเรีย ซิลวา ศุกร์หน้า 10 โมง"]]) {
      const t = setup(withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2026-10-02", start: "10:00", durationMin: 30 } })));
      const r = await run(t, { ...ask(text), locale });
      expect(cardOf(r.blocks), text).toBeUndefined();
      expect((r.blocks.find((b) => b.type === "pick") as { options: { id: string }[] }).options.map((o) => o.id)).toEqual(["2026-10-02", "2026-10-09"]);
    }
    // A bare weekday is the coming one: a card.
    const bare = setup(withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2026-10-02", start: "10:00", durationMin: 30 } })));
    expect(cardOf((await run(bare, ask("Marca a Maria Silva sexta às 10h"))).blocks)).toBeDefined();
  });

  it("the chip is matched in the UI's language (en)", async () => {
    const chip = (await loadTexts("en")).chipAt("2026-10-07", "09:00");
    const t = setup(withMaria((id) => ({ name: "propose_book_appointment", input: { patientId: id, date: "2026-10-07", start: "09:00", durationMin: 30, repeat: { every: "week", count: 3 } } })));
    const card = cardOf((await run(t, { ...ask(chip), locale: "en" })).blocks)!;
    expect(card.action.args).not.toHaveProperty("repeat");
  });

  it("the series' FIRST date taken (9a: the loop): the card starts on the next date, never re-finding the skipped one", async () => {
    const t = setup(series({ every: "week", count: 3 }));
    t.tables.appointments.push({ id: "a-first", professional_id: "doc-1", patient_id: null, patient_name: "Rui", date: "2026-10-07", start_time: "14:00:00", end_time: "14:30:00", status: "scheduled", payment_status: "pending", payment_amount: null });
    const r = await run(t, ask("…"));
    const card = cardOf(r.blocks)!;
    expect(card.fields.find((f) => f.label === "Quando")!.value).toBe("Quarta-feira, 14/10/2026, 14:00–14:30");
    expect(card.fields.find((f) => f.label === "Repetir")!.value).toBe("Semanal, 2 consultas (até 21/10/2026)");
    expect(card.fields.find((f) => f.label === "Fica de fora")!.value).toBe("07/10 (horário ocupado)");
    // The series stays anchored on 07/10 with the skip: the save expands it the same way.
    expect(card.action.args).toMatchObject({ date: "2026-10-07", repeat: { every: "week", count: 3, skip: ["2026-10-07"] } });
    expect(choiceOf(r.blocks)!.alternatives.every((a) => a.date === "2026-10-07")).toBe(true);
  });

  it("blocked time on a later date: the second question names that date", async () => {
    const t3 = setup(series({ every: "week", count: 2 }, "2026-10-07", "12:00"));
    t3.tables.appointments.push({ id: "b-x", professional_id: "doc-1", patient_id: null, patient_name: null, date: "2026-10-14", start_time: "12:00:00", end_time: "13:00:00", status: "blocked", payment_status: null, payment_amount: null });
    const card = cardOf((await run(t3, ask("…"))).blocks)!;
    expect(card.secondConfirm?.question).toBe("14/10/2026: Este horário está bloqueado (12:00–13:00). Agendar mesmo assim?");
  });

  it("the patient already booked on a later date: the warning names that date (7f)", async () => {
    const t = setup(series({ every: "week", count: 3 }));
    t.tables.appointments.push({ id: "m-x", professional_id: "doc-1", patient_id: "p-maria", patient_name: "Maria Silva", date: "2026-10-21", start_time: "09:00:00", end_time: "09:30:00", status: "scheduled", payment_status: "pending", payment_amount: null });
    const card = cardOf((await run(t, ask("…"))).blocks)!;
    expect(card.warnings).toContainEqual({ code: "same_patient_day", text: "21/10/2026: ⚠ Maria Silva já tem consulta nesse dia às 09:00" });
  });

  it("a bad repeat goes back to the model", async () => {
    const t = setup(series({ every: "day", count: 3 }));
    expect(cardOf((await run(t, ask("…"))).blocks)).toBeUndefined();
    expect(resultsIn(t.model.calls[2])[0]).toMatchObject({ is_error: true });
  });
});

describe("SolvyAI actions mode: send Pix (app only; Brazil only; Thai practices get the PromptPay answer)", () => {
  // Read the day, then propose sending Pix for Mario's appointment.
  const pix = (req: ModelRequest, round: number): FakeTurn => {
    if (round === 0) return { tools: [{ name: "list_appointments", input: { from: "2026-09-30", to: "2026-09-30" } }] };
    if (round === 1) return { tools: [{ name: "propose_send_pix", input: { appointmentId: "a-joao" } }] };
    return "Confira.";
  };
  const inApp = (t: ReturnType<typeof setup>) => {
    (t.d as { client: string }).client = "app";
    t.tables.professionals[0].pix_key = "pix@clinica.com";
    t.tables.patients.find((p) => p.id === "p-mario")!.phone = "+55 11 99999-0000";
    return t;
  };

  it("the website never gets the tool", async () => {
    const t = setup(pix);
    await run(t, ask("Manda o Pix do Mario"));
    expect(t.model.calls[0].tools?.map((d) => d.name)).not.toContain("propose_send_pix");
  });

  it("app, Brazil: a card (patient, appointment, value, Pix key) that opens WhatsApp, then Payments", async () => {
    const t = inApp(setup(pix));
    expect(t.model.calls.length).toBe(0);
    const r = await run(t, ask("Manda o Pix do Mario"));
    expect(t.model.calls[0].tools?.map((d) => d.name)).toContain("propose_send_pix");
    const card = cardOf(r.blocks)!;
    expect(card.action).toEqual({ kind: "send_pix", args: { appointmentId: "a-joao" } });
    expect(card.fields.map((f) => f.label)).toEqual(["Paciente", "Consulta", "Valor", "Chave Pix"]);
    expect(card.fields[3].value).toBe("pix@clinica.com");
    expect(card.after).toEqual({ screen: "whatsapp", highlight: { kind: "appointment", id: "a-joao" }, then: { screen: "payments" } });
  });

  it("app, Thailand: no card, the PromptPay answer and an Open QR link to the appointment's sheet", async () => {
    const t = inApp(setup(pix));
    t.tables.professionals[0].country = "TH";
    const r = await run(t, ask("Manda o Pix do Mario"));
    expect(cardOf(r.blocks)).toBeUndefined();
    const texts = r.chunks.flatMap((c) => (c.kind === "block" && c.block.type === "text" ? [c.block.text] : []));
    expect(texts).toContain("Em clínicas na Tailândia, o paciente paga escaneando o QR PromptPay da consulta.");
    const open = r.blocks.find((b) => b.type === "open") as Extract<AnswerBlock, { type: "open" }>;
    expect(open.label).toBe("Abrir QR");
    expect(open.target).toEqual({ screen: "schedule", date: "2026-09-30", id: "a-joao", params: { sheet: "1" } });
    expect(open.href).toContain("sheet=1");
  });

  it("app, Brazil: no Pix key, no phone, or already paid → back to the model, no card", async () => {
    let t = inApp(setup(pix));
    t.tables.professionals[0].pix_key = null;
    expect(cardOf((await run(t, ask("…"))).blocks)).toBeUndefined();
    expect(resultsIn(t.model.calls[2])[0]).toMatchObject({ is_error: true });
    t = inApp(setup(pix));
    t.tables.patients.find((p) => p.id === "p-mario")!.phone = null;
    expect(cardOf((await run(t, ask("…"))).blocks)).toBeUndefined();
    t = inApp(setup(pix));
    t.tables.appointments.find((a) => a.id === "a-joao")!.payment_status = "paid";
    expect(cardOf((await run(t, ask("…"))).blocks)).toBeUndefined();
  });

  it("an unknown practice country: no card at all (never a guessed Pix path)", async () => {
    const t = inApp(setup(pix));
    t.tables.professionals[0].id = "someone-else";
    const r = await run(t, ask("Manda o Pix do Mario"));
    expect(cardOf(r.blocks)).toBeUndefined();
    expect(resultsIn(t.model.calls[2])[0]).toMatchObject({ is_error: true });
  });
});
