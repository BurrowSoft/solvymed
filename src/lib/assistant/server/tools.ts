import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanSearchText, patientSearchFilter } from "@/lib/patientSearch";
import { computeSlots, fromMinutes, getDayHours, toMinutes, type WorkingHours } from "@/lib/slots";
import { MOVABLE_STATUSES, hoursWarning, keptDuration } from "@/lib/scheduleChecks";
import { MAX_OCCURRENCES, MIN_OCCURRENCES, recurrenceDates, type Recurrence } from "@/lib/recurrence";
import { formatDateLabel, formatShortDate } from "@/lib/dateLabels";
import { looksBuddhistEra } from "@/lib/buddhistEra";
import { lookupPracticeCountry } from "@/lib/practiceCountry";
import { patientIdKind } from "@/lib/patientIds";
import { countryProfile } from "@/lib/country";
import { formatMoney } from "@/lib/money";
import { webPath } from "@/lib/assistant/targets";
import type { AnswerBlock, CardWarning, ConfirmationCard, ScreenTarget } from "@/lib/assistant/types";
import type { ToolDef } from "./model";

// SolvyAI's tools in actions mode (docs/assistant-api.md §5, §5a). Read
// tools run as the user (RLS) and return only what the action needs (never
// clinical data). Proposal tools never write: they build a confirmation
// card from rows re-read here, with the same schedule checks as the screens,
// or a slot_choice when the time is taken. The model supplies ids and
// values only; an id is accepted only if a read in THIS request returned it
// (the route is stateless and the client's history can be forged; a9).

export type ToolContext = {
  db: SupabaseClient;
  profId: string;
  lang: "pt" | "en";
  locale: string;
  prefix: string;
  // The clinic's "now": its local date (YYYY-MM-DD) and time (HH:MM).
  today: string;
  nowTime: string;
  seen: Set<string>;
  // The practice country, read once per request (IDs and currency key off it).
  country?: string;
  // Who asked: the website or the app (sending Pix by WhatsApp is app-only).
  client: "web" | "app";
};

// What a tool gives back: text for the model (and whether it's an error the
// model should turn into a question), and a block for the user, if any.
// blocks: more than one for the user (e.g. an answer and an Open link).
export type ToolOutcome = { forModel: string; isError?: boolean; block?: AnswerBlock; blocks?: AnswerBlock[] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// The placeholders maskPersonalData puts in the chat (lib/assistant/mask).
export const MASK_TOKEN = /\[(?:email|cpf|phone|id)\]/i;
const MAX_LIST_DAYS = 14;
const CARD_MINUTES = 15;

const obj = (properties: Record<string, unknown>, required: string[]) =>
  ({ type: "object", properties, required, additionalProperties: false });

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "find_patients",
    description: "Search this clinic's patients by name (or ID / phone digits). Returns up to 5 with their id and birth date. Use it before any action that needs a patient; never guess an id.",
    input_schema: obj({ query: { type: "string" } }, ["query"]),
  },
  {
    name: "list_appointments",
    description: "The clinic's appointments and blocked times between two dates (YYYY-MM-DD, the clinic's time zone, at most 14 days). Returns ids, patient, date, times, status and payment.",
    input_schema: obj({ from: { type: "string" }, to: { type: "string" } }, ["from", "to"]),
  },
  {
    name: "find_free_slots",
    description: "Free start times on a date (YYYY-MM-DD) for a duration in minutes, by the clinic's working hours and existing appointments/blocks.",
    input_schema: obj({ date: { type: "string" }, durationMin: { type: "integer" } }, ["date", "durationMin"]),
  },
  {
    name: "propose_book_appointment",
    description: "Propose booking an appointment. Shows the user a card to confirm; nothing is saved. patientId must come from find_patients. Ask for anything missing (never invent a time or a patient).",
    input_schema: obj({
      patientId: { type: "string" }, date: { type: "string" }, start: { type: "string" }, durationMin: { type: "integer" },
      // A series only when the user asked for one (every week / 2 weeks / month, how many).
      repeat: obj({ every: { type: "string", enum: ["week", "2weeks", "month"] }, count: { type: "integer" } }, ["every", "count"]),
    }, ["patientId", "date", "start"]),
  },
  {
    name: "propose_move_appointment",
    description: "Propose moving an appointment (id from list_appointments; scheduled, confirmed or late) to a new date (YYYY-MM-DD) and start (HH:MM); the duration stays. A no-show (absent) is never moved: offer to book again instead. Shows a card; nothing is saved.",
    input_schema: obj({ appointmentId: { type: "string" }, date: { type: "string" }, start: { type: "string" } }, ["appointmentId", "date", "start"]),
  },
  {
    name: "propose_cancel_appointment",
    description: "Propose cancelling one appointment (id from list_appointments). Shows a card; nothing is saved. One card per appointment.",
    input_schema: obj({ appointmentId: { type: "string" } }, ["appointmentId"]),
  },
  {
    name: "propose_block_time",
    description: "Propose blocking a period (date YYYY-MM-DD, start and end HH:MM, optional reason). Shows a card; nothing is saved.",
    input_schema: obj({ date: { type: "string" }, start: { type: "string" }, end: { type: "string" }, reason: { type: "string" } }, ["date", "start", "end"]),
  },
  {
    name: "propose_mark_paid",
    description: "Propose marking an appointment (id from list_appointments) as paid (paid=true) or unpaid (paid=false). If it has no value, ask the user for the amount and pass it.",
    input_schema: obj({ appointmentId: { type: "string" }, paid: { type: "boolean" }, amount: { type: "number" } }, ["appointmentId", "paid"]),
  },
  {
    name: "propose_unblock_time",
    description: "Propose removing a blocked time (its id from list_appointments, status blocked). Never an appointment.",
    input_schema: obj({ blockId: { type: "string" } }, ["blockId"]),
  },
  {
    name: "propose_booking_decision",
    description: "Propose confirming or rejecting a patient's booking request (id from list_appointments, status tentative; a proposal can only be rejected). Optional short note to the patient.",
    input_schema: obj({ appointmentId: { type: "string" }, decision: { type: "string", enum: ["confirm", "reject"] }, note: { type: "string" } }, ["appointmentId", "decision"]),
  },
  {
    name: "propose_send_pix",
    description: "Propose sending the patient the Pix payment details by WhatsApp for one appointment (id from list_appointments). App only; Brazilian practices only (a Thai practice gets its PromptPay answer instead). Shows a card; nothing is sent until the user confirms.",
    input_schema: obj({ appointmentId: { type: "string" } }, ["appointmentId"]),
  },
  {
    name: "propose_add_patient",
    description: "Propose adding a patient: full name required; birth date (YYYY-MM-DD) only if the user said it. Phone, email and ID numbers are never taken here (the chat masks them): say they're added on the patient's page after saving. If similar patients exist you get them back: tell the user and ask; only if they say it's someone else, propose again with createAnyway=true.",
    input_schema: obj({ fullName: { type: "string" }, birthDate: { type: "string" }, createAnyway: { type: "boolean" } }, ["fullName"]),
  },
];

const T = {
  pt: {
    sendPix: "Enviar Pix por WhatsApp", pixKey: "Chave Pix",
    newAppt: "Nova consulta", cancelAppt: "Cancelar consulta", block: "Bloquear horário", paid: "Marcar como pago", unpaid: "Marcar como não pago",
    patient: "Paciente", when: "Quando", duration: "Duração", period: "Período", reason: "Motivo", appointment: "Consulta", value: "Valor",
    procedure: "Procedimento", type: "Tipo", inPerson: "Presencial",
    blockedWarn: (s: string, e: string) => `⚠ Horário bloqueado (${s}–${e})`,
    outsideWarn: (s: string, e: string) => `⚠ Fora do horário de atendimento (${s}–${e})`,
    dayOffWarn: (d: string) => `⚠ ${d} não é dia de atendimento`,
    samePatientWarn: (n: string, t: string) => `⚠ ${n} já tem consulta nesse dia às ${t}`,
    blockedAsk: (s: string, e: string) => `Este horário está bloqueado (${s}–${e}).`,
    outsideAsk: (s: string, e: string) => `Este horário está fora do horário de atendimento (${s}–${e}).`,
    dayOffAsk: (d: string) => `${d} não é dia de atendimento.`,
    bookAnyway: "Agendar mesmo assim?", bookLabel: "Agendar",
    repeatLabel: "Repetir",
    repeatValue: (every: RepeatEvery, n: number, last: string) => `${{ week: "Semanal", "2weeks": "A cada 2 semanas", month: "Mensal" }[every]}, ${n} consultas (até ${last})`,
    seriesConflict: (when: string, s: string, what: string) => `${when} às ${s} já tem ${what}. Nada foi salvo. Como prefere seguir?`,
    moveAppt: "Remarcar consulta", from: "De", to: "Para", moveAnyway: "Remarcar mesmo assim?", moveLabel: "Remarcar",
    notMovable: "Esta consulta não pode ser remarcada.",
    pastStop: "Esse horário já passou. Escolha outro horário.",
    archivedStop: "Este paciente está arquivado. Restaure o cadastro antes de agendar.",
    requestStop: "Pedidos de consulta são aceitos ou recusados no próprio pedido.",
    conflict: (when: string, what: string, s: string, e: string) => `${when} às ${s} já tem ${what} (${s}–${e}). Qual destes horários?`,
    conflictNone: (when: string, what: string, s: string, e: string) => `${when} às ${s} já tem ${what} (${s}–${e}). Qual outro horário?`,
    slotTaken: "Esse horário acabou de ser ocupado. Nada foi salvo. Qual destes horários?",
    slotTakenNone: "Esse horário acabou de ser ocupado. Nada foi salvo. Qual outro horário?",
    unblock: "Desbloquear horário", confirmReq: "Confirmar pedido", rejectReq: "Recusar pedido",
    decision: "Decisão", confirmIt: "Confirmar", rejectIt: "Recusar", note: "Observação",
    addPatient: "Novo paciente", fullName: "Nome", birth: "Nascimento",
    similar: "Parecidos já cadastrados",
    proposalConfirmStop: "Este pedido está aguardando a resposta do paciente à nova proposta; só é possível recusar.",
  },
  en: {
    sendPix: "Send Pix on WhatsApp", pixKey: "Pix key",
    newAppt: "New appointment", cancelAppt: "Cancel appointment", block: "Block time", paid: "Mark as paid", unpaid: "Mark as unpaid",
    patient: "Patient", when: "When", duration: "Duration", period: "Period", reason: "Reason", appointment: "Appointment", value: "Value",
    procedure: "Procedure", type: "Type", inPerson: "In person",
    blockedWarn: (s: string, e: string) => `⚠ Blocked time (${s}–${e})`,
    outsideWarn: (s: string, e: string) => `⚠ Outside the working hours (${s}–${e})`,
    dayOffWarn: (d: string) => `⚠ ${d} isn't a working day`,
    samePatientWarn: (n: string, t: string) => `⚠ ${n} already has an appointment that day at ${t}`,
    blockedAsk: (s: string, e: string) => `This time is blocked (${s}–${e}).`,
    outsideAsk: (s: string, e: string) => `This time is outside the working hours (${s}–${e}).`,
    dayOffAsk: (d: string) => `${d} isn't a working day.`,
    bookAnyway: "Book anyway?", bookLabel: "Book",
    repeatLabel: "Repeat",
    repeatValue: (every: RepeatEvery, n: number, last: string) => `${{ week: "Weekly", "2weeks": "Every 2 weeks", month: "Monthly" }[every]}, ${n} appointments (until ${last})`,
    seriesConflict: (when: string, s: string, what: string) => `${when} at ${s} already has ${what}. Nothing was saved. How would you like to go on?`,
    moveAppt: "Reschedule appointment", from: "From", to: "To", moveAnyway: "Reschedule anyway?", moveLabel: "Reschedule",
    notMovable: "This appointment can't be rescheduled.",
    pastStop: "That time has already passed. Choose another time.",
    archivedStop: "This patient is archived. Restore the record before booking.",
    requestStop: "Booking requests are accepted or declined on the request itself.",
    conflict: (when: string, what: string, s: string, e: string) => `${when} at ${s} already has ${what} (${s}–${e}). Which of these times?`,
    conflictNone: (when: string, what: string, s: string, e: string) => `${when} at ${s} already has ${what} (${s}–${e}). Which other time?`,
    slotTaken: "That time was just taken. Nothing was saved. Which of these times?",
    slotTakenNone: "That time was just taken. Nothing was saved. Which other time?",
    unblock: "Unblock time", confirmReq: "Confirm request", rejectReq: "Decline request",
    decision: "Decision", confirmIt: "Confirm", rejectIt: "Decline", note: "Note",
    addPatient: "New patient", fullName: "Name", birth: "Date of birth",
    similar: "Similar patients already registered",
    proposalConfirmStop: "This request is waiting for the patient's answer to the new time; it can only be declined.",
  },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !looksBuddhistEra(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
const isTime = (v: unknown): v is string => typeof v === "string" && TIME.test(v);
const hhmm = (t: string | null | undefined) => (t ?? "").slice(0, 5);
const weekdayName = (ctx: ToolContext, date: string) => cap(formatDateLabel(ctx.locale, date, { weekday: "long" }));
// "terça-feira, 29/09/2026"
const whenLabel = (ctx: ToolContext, date: string) => `${weekdayName(ctx, date)}, ${formatShortDate(ctx.locale, date)}`;
const personLabel = (ctx: ToolContext, name: string, birth: string | null) => (birth ? `${name} (${formatShortDate(ctx.locale, birth)})` : name);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

function card(ctx: ToolContext, c: Omit<ConfirmationCard, "id" | "editHref" | "viewHref" | "expiresAt" | "hardStop"> & { hardStop?: boolean }): ConfirmationCard {
  const edit = webPath(ctx.prefix, c.editTarget) ?? `${ctx.prefix}/dashboard`;
  const view = webPath(ctx.prefix, c.viewTarget) ?? `${ctx.prefix}/dashboard`;
  return {
    id: `c_${crypto.randomUUID()}`,
    ...c,
    hardStop: c.hardStop ?? false,
    editHref: edit,
    viewHref: view,
    expiresAt: new Date(Date.now() + CARD_MINUTES * 60_000).toISOString(),
  };
}

// The practice country (IDs and currency), read once per request.
// Unknown (a failed lookup) throws: runTool turns it into "that didn't
// work", so no card ever shows a guessed currency, ID or payment method (9a).
async function practiceCountry(ctx: ToolContext): Promise<string> {
  if (!ctx.country) {
    const r = await lookupPracticeCountry(ctx.db, ctx.profId, ctx.profId);
    if (!r.ok) throw new Error("practice_country_unknown");
    ctx.country = r.country;
  }
  return ctx.country;
}
const money = (amount: number, country: string) => formatMoney(amount, countryProfile(country).currency);

const err = (forModel: string): ToolOutcome => ({ forModel, isError: true });

// The contract's repeat → the website's recurrence (lib/recurrence).
type RepeatEvery = "week" | "2weeks" | "month";
const REPEAT_TO_RECURRENCE: Record<RepeatEvery, Recurrence> = { week: "weekly", "2weeks": "biweekly", month: "monthly" };
function parseRepeat(v: unknown): { every: RepeatEvery; count: number } | null | "invalid" {
  if (v === undefined || v === null) return null;
  const r = v as { every?: unknown; count?: unknown };
  const every = r.every as RepeatEvery;
  const count = Number(r.count);
  if (!(every in REPEAT_TO_RECURRENCE) || !Number.isInteger(count) || count < MIN_OCCURRENCES || count > MAX_OCCURRENCES) return "invalid";
  return { every, count };
}
const unseen = (what: string) => err(`Unknown ${what}: use a read tool first and pick from its results; never guess an id. If several could match, ask the user.`);

// ── Reads ────────────────────────────────────────────────────────────────

type Procedure = { id: string; name: string; duration_minutes: number; price: number | null; payment_type: string };
async function defaultProcedure(ctx: ToolContext): Promise<Procedure | null> {
  const { data } = await ctx.db
    .from("procedures")
    .select("id, name, duration_minutes, price, payment_type")
    .eq("professional_id", ctx.profId)
    .eq("active", true)
    .order("name")
    .limit(1);
  const p = ((data ?? []) as Procedure[])[0];
  if (!p) return null;
  const price = Number(p.price);
  return { ...p, price: Number.isFinite(price) && price > 0 ? price : null };
}

async function workingHours(ctx: ToolContext): Promise<WorkingHours | null> {
  const { data } = await ctx.db.rpc("get_professional_working_hours", { p_professional_id: ctx.profId });
  return (data ?? null) as WorkingHours | null;
}

// Free starts on a date for a duration (the booking page's rule), without
// the past ones today.
async function freeStarts(ctx: ToolContext, date: string, durationMin: number): Promise<string[]> {
  const wh = await workingHours(ctx);
  if (!wh || !getDayHours(date, wh)?.enabled) return [];
  const { data: busy } = await ctx.db.rpc("get_busy_slots", { p_professional_id: ctx.profId, p_date: date });
  const ranges = ((busy ?? []) as { slot_start: string; slot_end: string }[]).map((r) => ({ start: toMinutes(r.slot_start), end: toMinutes(r.slot_end) }));
  return computeSlots(date, durationMin, wh, ranges)
    .map((s) => s.start)
    .filter((s) => date > ctx.today || (date === ctx.today && s > ctx.nowTime));
}

// The nearest free starts around a time (the doctor picks; §5a).
async function nearestFree(ctx: ToolContext, date: string, start: string, durationMin: number, n = 3): Promise<{ date: string; start: string }[]> {
  const free = await freeStarts(ctx, date, durationMin);
  const at = toMinutes(start);
  return free
    .filter((s) => s !== start)
    .sort((a, b) => Math.abs(toMinutes(a) - at) - Math.abs(toMinutes(b) - at))
    .slice(0, n)
    .sort()
    .map((s) => ({ date, start: s }));
}

async function findPatients(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const q = cleanSearchText(String(input.query ?? ""));
  // The practice country decides which ID column is searched (the picker's rule).
  const filter = patientSearchFilter(q, patientIdKind(await practiceCountry(ctx)));
  if (!q || !filter) return err("Say who: ask the user for the patient's name.");
  const { data, error } = await ctx.db
    .from("patients")
    .select("id, full_name, birth_date")
    .eq("professional_id", ctx.profId)
    .is("archived_at", null)
    .or(filter)
    .order("full_name")
    .limit(5);
  if (error) return err("The patient search failed; say so and suggest the Patients screen.");
  const rows = (data ?? []) as { id: string; full_name: string; birth_date: string | null }[];
  rows.forEach((r) => ctx.seen.add(r.id));
  return { forModel: JSON.stringify(rows.map((r) => ({ id: r.id, name: r.full_name, birthDate: r.birth_date ? formatShortDate(ctx.locale, r.birth_date) : null }))) };
}

type ApptRow = {
  id: string; patient_id: string | null; patient_name: string | null; date: string; start_time: string; end_time: string;
  status: string; payment_status: string | null; payment_amount: number | null;
};
const APPT_COLS = "id, patient_id, patient_name, date, start_time, end_time, status, payment_status, payment_amount";

async function listAppointments(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const { from, to } = input;
  if (!isDate(from) || !isDate(to) || to < from) return err("Dates must be YYYY-MM-DD (Gregorian), from ≤ to.");
  if (daysBetween(from, to) > MAX_LIST_DAYS - 1) return err(`At most ${MAX_LIST_DAYS} days at a time.`);
  const { data, error } = await ctx.db
    .from("appointments")
    .select(APPT_COLS)
    .eq("professional_id", ctx.profId)
    .gte("date", from)
    .lte("date", to)
    .not("status", "in", "(cancelled,rejected)")
    .order("date")
    .order("start_time")
    .limit(80);
  if (error) return err("The schedule couldn't be read; say so and suggest the Schedule screen.");
  const rows = (data ?? []) as ApptRow[];
  const ids = [...new Set(rows.map((r) => r.patient_id).filter((x): x is string => !!x))];
  const births = new Map<string, string | null>();
  if (ids.length) {
    const { data: ps } = await ctx.db.from("patients").select("id, birth_date").in("id", ids);
    for (const p of (ps ?? []) as { id: string; birth_date: string | null }[]) births.set(p.id, p.birth_date);
  }
  rows.forEach((r) => { ctx.seen.add(r.id); if (r.patient_id) ctx.seen.add(r.patient_id); });
  const country = await practiceCountry(ctx);
  return {
    forModel: JSON.stringify(rows.map((r) => ({
      id: r.id,
      when: whenLabel(ctx, r.date),
      date: r.date,
      start: hhmm(r.start_time),
      end: hhmm(r.end_time),
      status: r.status,
      ...(r.status === "blocked"
        ? {}
        : {
            patient: r.patient_name,
            patientId: r.patient_id,
            birthDate: r.patient_id && births.get(r.patient_id) ? formatShortDate(ctx.locale, births.get(r.patient_id)!) : null,
            paid: r.payment_status === "paid",
            value: r.payment_amount === null ? null : money(r.payment_amount, country),
          }),
    }))),
  };
}

async function findFreeSlots(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const { date } = input;
  const dur = Number(input.durationMin);
  if (!isDate(date)) return err("The date must be YYYY-MM-DD (Gregorian).");
  if (!Number.isInteger(dur) || dur < 5 || dur > 480) return err("The duration is 5–480 minutes.");
  const free = await freeStarts(ctx, date, dur);
  return { forModel: JSON.stringify({ when: whenLabel(ctx, date), free: free.slice(0, 24) }) };
}

// ── Proposals ────────────────────────────────────────────────────────────

async function proposeBook(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const t = T[ctx.lang];
  const { patientId, date, start } = input;
  const durGiven = input.durationMin !== undefined && input.durationMin !== null;
  // The clinic's default procedure (the booking form's: the first active one
  // by name) gives the procedure, value, payment type and, unless said, the
  // duration; every field saved is on the card (UX, §2.3a.1).
  const proc = await defaultProcedure(ctx);
  const dur = durGiven ? Number(input.durationMin) : proc?.duration_minutes ?? 30;
  if (typeof patientId !== "string" || !ctx.seen.has(patientId)) return unseen("patient");
  if (!isDate(date)) return err("The date must be YYYY-MM-DD in the Gregorian calendar; ask the user if unsure.");
  if (!isTime(start)) return err("The start must be HH:MM; ask the user for the time.");
  if (!Number.isInteger(dur) || dur < 5 || dur > 480) return err("The duration is 5–480 minutes.");
  const endMin = toMinutes(start) + dur;
  // Ending at midnight or later is refused by the save (computeEndTime), so never a card.
  if (endMin >= 24 * 60) return err("That would run past midnight; ask for another time.");
  const end = fromMinutes(endMin);

  // A series (the website's Repetir): every week / 2 weeks / month, 2–52.
  const repeat = parseRepeat(input.repeat);
  if (repeat === "invalid") return err(`Repeat is { every: "week" | "2weeks" | "month", count: ${MIN_OCCURRENCES}–${MAX_OCCURRENCES} }; ask the user.`);
  const dates = repeat ? recurrenceDates(date, REPEAT_TO_RECURRENCE[repeat.every], repeat.count) : [date];

  const { data: p } = await ctx.db.from("patients").select("id, full_name, birth_date, archived_at").eq("id", patientId).eq("professional_id", ctx.profId).maybeSingle();
  const patient = p as { id: string; full_name: string; birth_date: string | null; archived_at: string | null } | null;
  if (!patient) return unseen("patient");

  // Every date is checked (§5a); another appointment there: no card.
  const { data: sameDays } = await ctx.db
    .from("appointments")
    .select(APPT_COLS)
    .eq("professional_id", ctx.profId)
    .in("date", dates)
    .not("status", "in", "(cancelled,rejected)");
  const all = (sameDays ?? []) as ApptRow[];
  const day = all.filter((r) => r.date === date);
  const overlaps = (r: ApptRow) => toMinutes(hhmm(r.start_time)) < endMin && toMinutes(start) < toMinutes(hhmm(r.end_time));
  if (repeat) {
    // The app's "none are saved": name the conflicting dates, ask how to go on.
    const clashes = all.filter((r) => r.status !== "blocked" && overlaps(r)).sort((a, b) => a.date.localeCompare(b.date));
    if (clashes.length) {
      const first = clashes[0];
      return {
        forModel: `Series conflict on ${clashes.map((r) => r.date).join(", ")} (nothing saved). The user was shown the dates; ask how to go on (another time, fewer dates, or skip) — never pick.`,
        block: {
          type: "slot_choice",
          reason: "recurring_conflict",
          text: t.seriesConflict(whenLabel(ctx, first.date), hhmm(first.start_time), first.patient_name ?? "—"),
          conflicts: clashes.slice(0, 5).map((r) => ({ date: r.date, start: hhmm(r.start_time), end: hhmm(r.end_time), what: r.patient_name ?? "—" })),
          alternatives: [],
          other: true,
        },
      };
    }
  }
  const clash = day.find((r) => r.status !== "blocked" && overlaps(r));
  if (clash) {
    const alternatives = await nearestFree(ctx, date, start, dur);
    const s = hhmm(clash.start_time);
    const e = hhmm(clash.end_time);
    const what = clash.patient_name ?? "—";
    return {
      forModel: `Conflict: ${date} ${s}–${e} is taken (${what}). The user was shown the nearest free times as choices; ask which one (never pick).`,
      block: {
        type: "slot_choice",
        reason: "conflict",
        text: (alternatives.length ? t.conflict : t.conflictNone)(whenLabel(ctx, date), what, s, e),
        conflicts: [{ date, start: s, end: e, what }],
        alternatives,
        other: true,
      },
    };
  }

  const warnings: CardWarning[] = [];
  const asks: string[] = [];
  // In a series, the first date with a block / outside the hours, named.
  const onDate = (d: string) => (repeat ? `${formatShortDate(ctx.locale, d)}: ` : "");
  const block = all.filter((r) => r.status === "blocked" && overlaps(r)).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (block) {
    warnings.push({ code: "blocked", text: onDate(block.date) + t.blockedWarn(hhmm(block.start_time), hhmm(block.end_time)) });
    asks.push(onDate(block.date) + t.blockedAsk(hhmm(block.start_time), hhmm(block.end_time)));
  }
  const wh = await workingHours(ctx);
  let hours: ReturnType<typeof hoursWarning> = null;
  let hoursDate = date;
  for (const d of dates) { hours = hoursWarning(d, start, end, wh); if (hours) { hoursDate = d; break; } }
  if (hours?.kind === "outside") {
    warnings.push({ code: "outside_hours", text: onDate(hoursDate) + t.outsideWarn(hours.start, hours.end) });
    asks.push(onDate(hoursDate) + t.outsideAsk(hours.start, hours.end));
  } else if (hours?.kind === "day_off") {
    warnings.push({ code: "outside_hours", text: onDate(hoursDate) + t.dayOffWarn(weekdayName(ctx, hoursDate)) });
    asks.push(onDate(hoursDate) + t.dayOffAsk(weekdayName(ctx, hoursDate)));
  }
  const already = day.find((r) => r.patient_id === patientId && r.status !== "blocked");
  if (already) warnings.push({ code: "same_patient_day", text: t.samePatientWarn(patient.full_name, hhmm(already.start_time)) });

  const past = date < ctx.today || (date === ctx.today && start <= ctx.nowTime);
  const stop = past
    ? { code: "past_time" as const, text: t.pastStop }
    : patient.archived_at
      ? { code: "patient_archived" as const, text: t.archivedStop }
      : undefined;

  const view: ScreenTarget = { screen: "schedule", date };
  const c = card(ctx, {
    icon: "calendar",
    title: t.newAppt,
    fields: [
      { label: t.patient, value: personLabel(ctx, patient.full_name, patient.birth_date) },
      { label: t.when, value: `${whenLabel(ctx, date)}, ${start}–${end}` },
      ...(proc ? [{ label: t.procedure, value: proc.name, isDefault: true }] : []),
      ...(proc?.price ? [{ label: t.value, value: money(proc.price, await practiceCountry(ctx)), isDefault: true }] : []),
      { label: t.type, value: t.inPerson, isDefault: true },
      { label: t.duration, value: `${dur} min`, ...(durGiven ? {} : { isDefault: true }) },
      ...(repeat ? [{ label: t.repeatLabel, value: t.repeatValue(repeat.every, repeat.count, formatShortDate(ctx.locale, dates[dates.length - 1])) }] : []),
    ],
    warnings,
    ...(asks.length ? { secondConfirm: { question: `${asks.join(" ")} ${t.bookAnyway}`, confirmLabel: t.bookLabel } } : {}),
    hardStop: !!stop,
    ...(stop ? { stop } : {}),
    editTarget: { screen: "schedule", date, params: { new: "1", start } },
    viewTarget: view,
    after: { screen: "schedule", date, highlight: { kind: "appointment" } },
    action: { kind: "book_appointment", args: { patientId, date, start, durationMin: dur, ...(proc ? { procedureId: proc.id } : {}), ...(repeat ? { repeat } : {}) } },
  });
  return { forModel: `Card shown (${c.id}${stop ? `, blocked: ${stop.code}` : ""}${warnings.length ? `, warnings: ${warnings.map((w) => w.code).join(",")}` : ""}). Tell the user to check it and tap Confirmar; don't repeat the details.`, block: { type: "card", card: c } };
}

async function readAppointment(ctx: ToolContext, id: unknown): Promise<ApptRow | null> {
  if (typeof id !== "string" || !ctx.seen.has(id)) return null;
  const { data } = await ctx.db.from("appointments").select(APPT_COLS).eq("id", id).eq("professional_id", ctx.profId).maybeSingle();
  return (data ?? null) as ApptRow | null;
}

async function birthOf(ctx: ToolContext, patientId: string | null): Promise<string | null> {
  if (!patientId) return null;
  const { data } = await ctx.db.from("patients").select("birth_date").eq("id", patientId).maybeSingle();
  return ((data ?? null) as { birth_date: string | null } | null)?.birth_date ?? null;
}

// Remarcar (the website's moveAppointment): a new date and start, the same
// duration; the same checks as booking. The card shows before → after.
async function proposeMove(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const t = T[ctx.lang];
  const a = await readAppointment(ctx, input.appointmentId);
  if (!a || a.status === "blocked") return unseen("appointment");
  if (a.status === "absent") return err("A no-show isn't moved (it stays on record): offer to book this patient again instead (find_patients, then propose_book_appointment).");
  if (a.status === "tentative" || a.status === "proposal") return err("That's a booking request: it's answered on the request (propose_booking_decision), not moved.");
  if (!MOVABLE_STATUSES.includes(a.status)) return err(`A ${a.status} appointment can't be moved; tell the user.`);
  const { date, start } = input;
  if (!isDate(date)) return err("The date must be YYYY-MM-DD in the Gregorian calendar; ask the user if unsure.");
  if (!isTime(start)) return err("The start must be HH:MM; ask the user for the time.");
  const oldStart = hhmm(a.start_time);
  if (date === a.date && start === oldStart) return err("That's where it already is; ask the user for the new date and time.");
  // The same kept duration as Remarcar (moveAppointment).
  const dur = keptDuration(a.start_time, a.end_time);
  const endMin = toMinutes(start) + dur;
  // Ending at midnight or later is refused by the save (computeEndTime), so never a card.
  if (endMin >= 24 * 60) return err("That would run past midnight; ask for another time.");
  const end = fromMinutes(endMin);

  const { data: sameDay } = await ctx.db
    .from("appointments")
    .select(APPT_COLS)
    .eq("professional_id", ctx.profId)
    .eq("date", date)
    .not("status", "in", "(cancelled,rejected)");
  const day = ((sameDay ?? []) as ApptRow[]).filter((r) => r.id !== a.id);
  const overlaps = (r: ApptRow) => toMinutes(hhmm(r.start_time)) < endMin && toMinutes(start) < toMinutes(hhmm(r.end_time));
  const clash = day.find((r) => r.status !== "blocked" && overlaps(r));
  if (clash) {
    const alternatives = await nearestFree(ctx, date, start, dur);
    const s = hhmm(clash.start_time);
    const e = hhmm(clash.end_time);
    const what = clash.patient_name ?? "—";
    return {
      forModel: `Conflict: ${date} ${s}–${e} is taken (${what}). The user was shown the nearest free times as choices; ask which one (never pick).`,
      block: { type: "slot_choice", reason: "conflict", text: (alternatives.length ? t.conflict : t.conflictNone)(whenLabel(ctx, date), what, s, e), conflicts: [{ date, start: s, end: e, what }], alternatives, other: true },
    };
  }

  const warnings: CardWarning[] = [];
  const asks: string[] = [];
  const block = day.find((r) => r.status === "blocked" && overlaps(r));
  if (block) {
    warnings.push({ code: "blocked", text: t.blockedWarn(hhmm(block.start_time), hhmm(block.end_time)) });
    asks.push(t.blockedAsk(hhmm(block.start_time), hhmm(block.end_time)));
  }
  const hours = hoursWarning(date, start, end, await workingHours(ctx));
  if (hours?.kind === "outside") {
    warnings.push({ code: "outside_hours", text: t.outsideWarn(hours.start, hours.end) });
    asks.push(t.outsideAsk(hours.start, hours.end));
  } else if (hours?.kind === "day_off") {
    warnings.push({ code: "outside_hours", text: t.dayOffWarn(weekdayName(ctx, date)) });
    asks.push(t.dayOffAsk(weekdayName(ctx, date)));
  }
  const past = date < ctx.today || (date === ctx.today && start <= ctx.nowTime);
  const c = card(ctx, {
    icon: "calendar-move",
    title: t.moveAppt,
    fields: [
      { label: t.patient, value: personLabel(ctx, a.patient_name ?? "—", await birthOf(ctx, a.patient_id)) },
      { label: t.from, value: `${whenLabel(ctx, a.date)}, ${oldStart}–${hhmm(a.end_time)}` },
      { label: t.to, value: `${whenLabel(ctx, date)}, ${start}–${end}` },
    ],
    warnings,
    ...(asks.length ? { secondConfirm: { question: `${asks.join(" ")} ${t.moveAnyway}`, confirmLabel: t.moveLabel } } : {}),
    hardStop: past,
    ...(past ? { stop: { code: "past_time" as const, text: t.pastStop } } : {}),
    editTarget: { screen: "schedule", date: a.date },
    viewTarget: { screen: "schedule", date },
    after: { screen: "schedule", date, highlight: { kind: "appointment", id: a.id } },
    // durationMin: for fresh times if the slot is taken at Confirmar (confirm_failed); not saved.
    action: { kind: "move_appointment", args: { appointmentId: a.id, date, start, durationMin: dur } },
  });
  return { forModel: `Card shown (${c.id}${past ? ", blocked: past_time" : ""}). Tell the user to check it and tap Confirmar.`, block: { type: "card", card: c } };
}

async function proposeCancel(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const t = T[ctx.lang];
  const a = await readAppointment(ctx, input.appointmentId);
  if (!a || a.status === "blocked") return unseen("appointment");
  if (a.status === "cancelled" || a.status === "rejected") return err("That appointment isn't active; tell the user.");
  const isRequest = a.status === "tentative" || a.status === "proposal";
  const c = card(ctx, {
    icon: "calendar-x",
    title: t.cancelAppt,
    fields: [
      { label: t.patient, value: personLabel(ctx, a.patient_name ?? "—", await birthOf(ctx, a.patient_id)) },
      { label: t.when, value: `${whenLabel(ctx, a.date)}, ${hhmm(a.start_time)}–${hhmm(a.end_time)}` },
    ],
    warnings: [],
    hardStop: isRequest,
    ...(isRequest ? { stop: { code: "not_allowed" as const, text: t.requestStop } } : {}),
    editTarget: { screen: "schedule", date: a.date },
    viewTarget: { screen: "schedule", date: a.date },
    after: { screen: "schedule", date: a.date, highlight: { kind: "appointment", id: a.id } },
    action: { kind: "cancel_appointment", args: { appointmentId: a.id } },
  });
  return { forModel: `Card shown (${c.id}). Tell the user to check it and tap Confirmar.`, block: { type: "card", card: c } };
}

async function proposeBlock(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const t = T[ctx.lang];
  const { date, start, end } = input;
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 120) : "";
  if (!isDate(date)) return err("The date must be YYYY-MM-DD in the Gregorian calendar; ask the user if unsure.");
  if (!isTime(start) || !isTime(end) || end <= start) return err("Start and end must be HH:MM with end after start; ask the user.");
  const { data } = await ctx.db
    .from("appointments")
    .select(APPT_COLS)
    .eq("professional_id", ctx.profId)
    .eq("date", date)
    .not("status", "in", "(cancelled,rejected,blocked)");
  const inside = ((data ?? []) as ApptRow[]).filter((r) => toMinutes(hhmm(r.start_time)) < toMinutes(end) && toMinutes(start) < toMinutes(hhmm(r.end_time)));
  if (inside.length) {
    return err(`There are appointments in that period (${inside.map((r) => `${hhmm(r.start_time)} ${r.patient_name ?? ""}`.trim()).join("; ")}). Tell the user and ask how to proceed; don't block over them.`);
  }
  const past = date < ctx.today || (date === ctx.today && end <= ctx.nowTime);
  const c = card(ctx, {
    icon: "block",
    title: t.block,
    fields: [
      { label: t.period, value: `${whenLabel(ctx, date)}, ${start}–${end}` },
      ...(reason ? [{ label: t.reason, value: reason }] : []),
    ],
    warnings: [],
    hardStop: past,
    ...(past ? { stop: { code: "past_time" as const, text: t.pastStop } } : {}),
    editTarget: { screen: "schedule", date },
    viewTarget: { screen: "schedule", date },
    after: { screen: "schedule", date, highlight: { kind: "block" } },
    action: { kind: "block_time", args: { date, start, end, ...(reason ? { reason } : {}) } },
  });
  return { forModel: `Card shown (${c.id}). Tell the user to check it and tap Confirmar.`, block: { type: "card", card: c } };
}

async function proposeMarkPaid(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const t = T[ctx.lang];
  const a = await readAppointment(ctx, input.appointmentId);
  if (!a || a.status === "blocked") return unseen("appointment");
  if (typeof input.paid !== "boolean") return err("Say whether it's paid or unpaid.");
  const paid = input.paid;
  const amount = input.amount === undefined || input.amount === null ? null : Number(input.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000)) return err("The amount must be a positive number.");
  if ((a.payment_status === "paid") === paid) return err(`It's already marked ${paid ? "paid" : "unpaid"}; tell the user.`);
  const value = amount ?? a.payment_amount;
  if (paid && !value) return err("This appointment has no value: ask the user for the amount, then propose again with it.");
  const c = card(ctx, {
    icon: "cash",
    title: paid ? t.paid : t.unpaid,
    fields: [
      { label: t.patient, value: personLabel(ctx, a.patient_name ?? "—", await birthOf(ctx, a.patient_id)) },
      { label: t.appointment, value: `${whenLabel(ctx, a.date)}, ${hhmm(a.start_time)}–${hhmm(a.end_time)}` },
      ...(value ? [{ label: t.value, value: money(value, await practiceCountry(ctx)) }] : []),
    ],
    warnings: [],
    editTarget: { screen: "payments" },
    viewTarget: { screen: "payments" },
    after: { screen: "payments", highlight: { kind: "appointment", id: a.id } },
    action: { kind: "mark_paid", args: { appointmentId: a.id, paid, ...(amount !== null ? { amount } : {}) } },
  });
  return { forModel: `Card shown (${c.id}). Tell the user to check it and tap Confirmar.`, block: { type: "card", card: c } };
}

async function proposeUnblock(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const t = T[ctx.lang];
  const b = await readAppointment(ctx, input.blockId);
  if (!b || b.status !== "blocked") return unseen("block");
  const reason = b.patient_name && b.patient_name !== "Blocked" ? b.patient_name : "";
  const c = card(ctx, {
    icon: "unlock",
    title: t.unblock,
    fields: [
      { label: t.period, value: `${whenLabel(ctx, b.date)}, ${hhmm(b.start_time)}–${hhmm(b.end_time)}` },
      ...(reason ? [{ label: t.reason, value: reason }] : []),
    ],
    warnings: [],
    editTarget: { screen: "schedule", date: b.date },
    viewTarget: { screen: "schedule", date: b.date },
    after: { screen: "schedule", date: b.date },
    action: { kind: "unblock_time", args: { blockId: b.id } },
  });
  return { forModel: `Card shown (${c.id}). Tell the user to check it and tap Confirmar.`, block: { type: "card", card: c } };
}

async function proposeBookingDecision(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const t = T[ctx.lang];
  const a = await readAppointment(ctx, input.appointmentId);
  if (!a || (a.status !== "tentative" && a.status !== "proposal")) return unseen("booking request");
  const decision = input.decision;
  if (decision !== "confirm" && decision !== "reject") return err("The decision is confirm or reject; ask the user.");
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 300) : "";
  // A proposal waits for the patient's answer: it can only be declined.
  const stop = decision === "confirm" && a.status === "proposal" ? { code: "not_allowed" as const, text: t.proposalConfirmStop } : undefined;
  const c = card(ctx, {
    icon: decision === "confirm" ? "check" : "x",
    title: decision === "confirm" ? t.confirmReq : t.rejectReq,
    fields: [
      { label: t.patient, value: personLabel(ctx, a.patient_name ?? "—", await birthOf(ctx, a.patient_id)) },
      { label: t.when, value: `${whenLabel(ctx, a.date)}, ${hhmm(a.start_time)}–${hhmm(a.end_time)}` },
      { label: t.decision, value: decision === "confirm" ? t.confirmIt : t.rejectIt },
      ...(note ? [{ label: t.note, value: note }] : []),
    ],
    warnings: [],
    hardStop: !!stop,
    ...(stop ? { stop } : {}),
    editTarget: { screen: "schedule", date: a.date },
    viewTarget: { screen: "schedule", date: a.date },
    after: { screen: "schedule", date: a.date },
    action: { kind: "booking_decision", args: { appointmentId: a.id, decision, ...(note ? { note } : {}) } },
  });
  return { forModel: `Card shown (${c.id}${stop ? ", blocked: a proposal can only be declined" : ""}). Tell the user to check it and tap Confirmar.`, block: { type: "card", card: c } };
}

async function proposeAddPatient(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const t = T[ctx.lang];
  const fullName = typeof input.fullName === "string" ? input.fullName.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (fullName.length < 2) return err("Ask the user for the patient's full name.");
  // The chat masks identifiers ([cpf], [phone], …): a placeholder is never a name.
  if (MASK_TOKEN.test(fullName)) return err("That isn't a name. Ask for the patient's full name; contact details and IDs go on the patient's page after saving.");
  const birthDate = input.birthDate === undefined || input.birthDate === null || input.birthDate === "" ? null : input.birthDate;
  if (birthDate !== null && (!isDate(birthDate) || birthDate < "1900-01-01" || birthDate > ctx.today)) {
    return err("The birth date must be YYYY-MM-DD (Gregorian), between 1900 and today; ask the user.");
  }
  // The same duplicate check as the form (find_similar_patients, as the user).
  const { data: similar } = await ctx.db.rpc("find_similar_patients", { p_name: fullName, p_phone: null, p_birth_date: birthDate });
  const matches = (Array.isArray(similar) ? similar : []) as { id: string; full_name: string; birth_date: string | null; archived_at?: string | null }[];
  matches.forEach((m) => ctx.seen.add(m.id));
  const listed = matches.slice(0, 5).map((m) => `${personLabel(ctx, m.full_name, m.birth_date)}${m.archived_at ? (ctx.lang === "pt" ? " (arquivado)" : " (archived)") : ""}`).join("; ");
  if (matches.length && input.createAnyway !== true) {
    return err(`Possible duplicates: ${JSON.stringify(matches.slice(0, 5).map((m) => ({ id: m.id, name: m.full_name, birthDate: m.birth_date ? formatShortDate(ctx.locale, m.birth_date) : null, archived: !!m.archived_at })))}. Tell the user; if one is the same person, don't add. Only if they say it's someone else, propose again with createAnyway=true.`);
  }
  const c = card(ctx, {
    icon: "user-plus",
    title: t.addPatient,
    fields: [
      { label: t.fullName, value: fullName },
      ...(birthDate ? [{ label: t.birth, value: formatShortDate(ctx.locale, birthDate) }] : []),
      ...(matches.length ? [{ label: t.similar, value: listed }] : []),
    ],
    warnings: [],
    editTarget: { screen: "patients", params: { new: "1" } },
    viewTarget: { screen: "patients" },
    after: { screen: "patient", highlight: { kind: "patient" } },
    action: { kind: "add_patient", args: { fullName, ...(birthDate ? { birthDate } : {}), ...(matches.length ? { createAnyway: true } : {}) } },
  });
  return { forModel: `Card shown (${c.id}). Tell the user to check it and tap Confirmar.`, block: { type: "card", card: c } };
}

// A Thai practice's answer to "send the Pix" (UX 36 / 38): the patient
// scans the appointment's PromptPay QR; "Abrir QR" opens that appointment.
const PROMPTPAY: Record<string, [string, string]> = {
  pt: ["Em clínicas na Tailândia, o paciente paga escaneando o QR PromptPay da consulta.", "Abrir QR"],
  en: ["For clinics in Thailand, the patient pays by scanning the appointment's PromptPay QR.", "Open QR"],
  th: ["สำหรับคลินิกในประเทศไทย ผู้ป่วยชำระเงินโดยสแกน QR พร้อมเพย์ของนัดหมาย", "เปิด QR"],
  fr: ["Dans les cliniques en Thaïlande, le patient paie en scannant le QR PromptPay du rendez-vous.", "Ouvrir le QR"],
  de: ["In Praxen in Thailand bezahlt der Patient, indem er den PromptPay-QR-Code des Termins scannt.", "QR öffnen"],
  it: ["Nelle cliniche in Thailandia, il paziente paga scansionando il QR PromptPay dell’appuntamento.", "Apri QR"],
  es: ["En las clínicas de Tailandia, el paciente paga escaneando el QR de PromptPay de la cita.", "Abrir QR"],
};
const promptPayText = (locale: string) => PROMPTPAY[locale.slice(0, 2).toLowerCase()] ?? PROMPTPAY.en;

async function proposeSendPix(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  if (ctx.client !== "app") return err("On the website Pix isn't sent by WhatsApp: say it's only in the app and point to Help G4.");
  const t = T[ctx.lang];
  const a = await readAppointment(ctx, input.appointmentId);
  if (!a || a.status === "blocked") return unseen("appointment");
  const country = await practiceCountry(ctx);
  if (country === "TH") {
    // Never a Pix card for a Thai practice: the answer and the way to the QR.
    const [text, label] = promptPayText(ctx.locale);
    const target: ScreenTarget = { screen: "schedule", date: a.date, id: a.id, params: { sheet: "1" } };
    const href = webPath(ctx.prefix, target, a.id);
    return {
      forModel: "Thai practice: no Pix. The user was shown that the patient pays with the appointment's PromptPay QR, with an Open QR link. Don't propose it again; add nothing.",
      blocks: [{ type: "text", text }, ...(href ? [{ type: "open" as const, label, href, target }] : [])],
    };
  }
  if (country !== "BR") return err("Pix is only for practices in Brazil; say so (there's no payment message to send for this practice).");
  if (a.payment_status === "paid") return err("It's already paid; tell the user.");
  if (!a.payment_amount) return err("This appointment has no value: tell the user to set it first (on the appointment), then ask again.");
  const [{ data: prof }, { data: pat }] = await Promise.all([
    ctx.db.from("professionals").select("pix_key").eq("id", ctx.profId).maybeSingle(),
    a.patient_id ? ctx.db.from("patients").select("phone").eq("id", a.patient_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const pixKey = (prof as { pix_key?: string | null } | null)?.pix_key?.trim();
  if (!pixKey) return err("The practice has no Pix key: tell the user to add it in Settings (Help G3).");
  if (!(pat as { phone?: string | null } | null)?.phone?.trim()) return err("The patient has no phone number: say so, and offer the QR / Pix Copia e Cola on the appointment instead.");
  const c = card(ctx, {
    icon: "cash",
    title: t.sendPix,
    fields: [
      { label: t.patient, value: personLabel(ctx, a.patient_name ?? "—", await birthOf(ctx, a.patient_id)) },
      { label: t.appointment, value: `${whenLabel(ctx, a.date)}, ${hhmm(a.start_time)}–${hhmm(a.end_time)}` },
      { label: t.value, value: money(a.payment_amount, country) },
      { label: t.pixKey, value: pixKey },
    ],
    warnings: [],
    editTarget: { screen: "payments" },
    viewTarget: { screen: "payments" },
    after: { screen: "whatsapp", highlight: { kind: "appointment", id: a.id }, then: { screen: "payments" } },
    action: { kind: "send_pix", args: { appointmentId: a.id } },
  });
  return { forModel: `Card shown (${c.id}). Tell the user to check it and tap Confirmar: it opens WhatsApp.`, block: { type: "card", card: c } };
}

const RUN: Record<string, (ctx: ToolContext, input: Record<string, unknown>) => Promise<ToolOutcome>> = {
  find_patients: findPatients,
  list_appointments: listAppointments,
  find_free_slots: findFreeSlots,
  propose_book_appointment: proposeBook,
  propose_move_appointment: proposeMove,
  propose_cancel_appointment: proposeCancel,
  propose_block_time: proposeBlock,
  propose_mark_paid: proposeMarkPaid,
  propose_unblock_time: proposeUnblock,
  propose_booking_decision: proposeBookingDecision,
  propose_add_patient: proposeAddPatient,
  propose_send_pix: proposeSendPix,
};

// The tools a client gets: sending Pix by WhatsApp only in the app.
export const toolDefsFor = (client: "web" | "app") => TOOL_DEFS.filter((d) => client === "app" || d.name !== "propose_send_pix");

export async function runTool(ctx: ToolContext, name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
  const run = RUN[name];
  if (!run) return err(`There's no tool "${name}". Explain the steps on the screen instead.`);
  try {
    return await run(ctx, input ?? {});
  } catch {
    return err("That didn't work; say so and suggest doing it on the screen.");
  }
}

// A save the normal path refused (the slot was just taken): fresh times,
// no model call (§5a). Only the date and time of the client's action are
// used, re-validated (a9: the rest is untrusted).
export async function confirmFailedBlock(ctx: ToolContext, action: unknown): Promise<AnswerBlock | null> {
  const args = (action as { args?: Record<string, unknown> } | null)?.args ?? {};
  const { date, start } = args;
  if (!isDate(date) || !isTime(start)) return null;
  const dur = Number.isInteger(args.durationMin) && (args.durationMin as number) >= 5 && (args.durationMin as number) <= 480 ? (args.durationMin as number) : 30;
  const alternatives = await nearestFree(ctx, date, start, dur);
  const t = T[ctx.lang];
  return {
    type: "slot_choice",
    reason: "confirm_failed",
    text: alternatives.length ? t.slotTaken : t.slotTakenNone,
    conflicts: [{ date, start, end: fromMinutes(Math.min(toMinutes(start) + dur, 24 * 60 - 1)), what: "—" }],
    alternatives,
    other: true,
  };
}
