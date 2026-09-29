import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleAssistant, type Deps } from "@/lib/assistant/server/handle";
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
      "find_patients", "list_appointments", "find_free_slots",
      "propose_book_appointment", "propose_cancel_appointment", "propose_block_time", "propose_mark_paid",
      "propose_unblock_time", "propose_booking_decision", "propose_add_patient",
    ]);
    expect(t.model.calls[0].system).toContain("Today at the clinic: Tuesday 2026-09-29, 10:00 (America/Sao_Paulo)");
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

  it("cancel: a card; a booking request is a hard stop (it's declined on the request)", async () => {
    let t = setup(listThen("2026-09-30", { name: "propose_cancel_appointment", input: { appointmentId: "a-joao" } }));
    let card = cardOf((await run(t, ask("Cancela o Mario"))).blocks)!;
    expect(card.action).toEqual({ kind: "cancel_appointment", args: { appointmentId: "a-joao" } });
    expect(card.after).toEqual({ screen: "schedule", date: "2026-09-30", highlight: { kind: "appointment", id: "a-joao" } });
    t = setup(listThen("2026-10-01", { name: "propose_cancel_appointment", input: { appointmentId: "a-req" } }));
    card = cardOf((await run(t, ask("Cancela a Maria"))).blocks)!;
    expect(card.stop?.code).toBe("not_allowed");
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
    // Maria Silva exists: back to the model, no card, until the user says it's someone else.
    t = setup((_r, round) => (round === 0 ? { tools: [{ name: "propose_add_patient", input: { fullName: "Maria Silva" } }] } : "ok"));
    expect(cardOf((await run(t, ask("Cadastra a Maria Silva"))).blocks)).toBeUndefined();
    expect(resultsIn(t.model.calls[1])[0]).toMatchObject({ is_error: true });
    t = setup((_r, round) => (round === 0 ? { tools: [{ name: "propose_add_patient", input: { fullName: "Maria Silva", createAnyway: true } }] } : "ok"));
    card = cardOf((await run(t, ask("É outra pessoa"))).blocks)!;
    expect(card.fields.find((f) => f.label === "Parecidos já cadastrados")!.value).toBe("Maria Silva (02/05/1980)");
    expect(card.action.args.createAnyway).toBe(true);
    // A birth date outside 1900..today, or a Buddhist-era year: asked again.
    t = setup((_r, round) => (round === 0 ? { tools: [{ name: "propose_add_patient", input: { fullName: "Ana Nova", birthDate: "2569-01-01" } }] } : "ok"));
    expect(cardOf((await run(t, ask("…"))).blocks)).toBeUndefined();
  });

  it("on the website, moving and sending Pix are app-only for now (said, with the Help link)", async () => {
    const t = setup(() => "ok");
    await run(t, ask("Remarca a Maria para sexta"));
    expect(t.model.calls[0].system).toContain("can't move an appointment or send Pix by WhatsApp yet");
    expect(t.model.calls[0].tools!.map((x) => x.name)).not.toContain("propose_move_appointment");
  });
});
