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
import type { RepeatEvery, ServerTexts } from "./texts";

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
  locale: string;
  // The fixed texts in the user's UI language (./texts).
  t: ServerTexts;
  prefix: string;
  // The clinic's "now": its local date (YYYY-MM-DD) and time (HH:MM).
  today: string;
  nowTime: string;
  seen: Set<string>;
  // The practice country, read once per request (IDs and currency key off it).
  country?: string;
  // Who asked: the website or the app (sending Pix by WhatsApp is app-only).
  client: "web" | "app";
  // The user's last message (masked): the server reads from it whether a day
  // was named, so a partial reference can't become a guessed card (UX).
  userText?: string;
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
const MAX_PATIENT_DAYS = 121;
const CARD_MINUTES = 15;

const obj = (properties: Record<string, unknown>, required: string[]) =>
  ({ type: "object", properties, required, additionalProperties: false });

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "find_patients",
    description: "Search this clinic's patients by name (or ID / phone digits). Use it before any action that needs a patient; never guess an id. If several match, the USER gets a list to choose from and you get nothing to pick: wait for their choice. When the user's message is an option they tapped from such a list, pass that message verbatim as tapped (and the name as query).",
    input_schema: obj({ query: { type: "string" }, tapped: { type: "string" } }, ["query"]),
  },
  {
    name: "list_appointments",
    description: "The clinic's appointments and blocked times between two dates (YYYY-MM-DD, the clinic's time zone, at most 14 days; up to 121 days when filtered by patient). To act on ONE appointment, always pass what the user said (patient and/or start HH:MM): if several match, the USER gets a list to choose from; never pick one yourself. When the user's message is an option they tapped from such a list, pass that message verbatim as tapped (with the same from/to/patient/start as before). Returns ids, patient, date, times, status and payment.",
    input_schema: obj({ from: { type: "string" }, to: { type: "string" }, patient: { type: "string" }, start: { type: "string" }, tapped: { type: "string" } }, ["from", "to"]),
  },
  {
    name: "choose_date",
    description: "When a date the user gave could mean more than one day (e.g. \"próxima sexta\" / \"next Friday\"), show them the candidate dates (2 to 4, YYYY-MM-DD from the Calendar) to tap. Never pick one yourself.",
    input_schema: obj({ dates: { type: "array", items: { type: "string" } } }, ["dates"]),
  },
  {
    name: "find_free_slots",
    description: "Free start times on a date (YYYY-MM-DD), by the clinic's working hours and existing appointments/blocks. Pass durationMin only if the user said a length; otherwise the clinic's default appointment length is used: never ask for one. Say the length in the answer.",
    input_schema: obj({ date: { type: "string" }, durationMin: { type: "integer" } }, ["date"]),
  },
  {
    name: "propose_book_appointment",
    description: "Propose booking an appointment. Shows the user a card to confirm; nothing is saved. patientId must come from find_patients. Ask for anything missing (never invent a time or a patient). A series with taken dates comes back as a card without them plus free times on the (first) taken date; don't propose it again.",
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


const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// A real calendar day: "2026-09-31" is refused (Date.parse would roll it
// over to 1 October; UX: "31/09" must be impossible).
const isDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !DATE.test(v) || looksBuddhistEra(v)) return false;
  const t = Date.parse(`${v}T12:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
};
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

// A patient as the user taps it in a list: the name and the birth date, so
// the tapped text names one person when it comes back as the next message.
const patientOption = (ctx: ToolContext, p: { id: string; full_name: string; birth_date: string | null }) => ({
  id: p.id,
  title: p.birth_date ? `${p.full_name} · ${ctx.t.born(formatShortDate(ctx.locale, p.birth_date))}` : p.full_name,
  detail: "",
});
// Whether the user's message names a day (UX: "a das 10" names none, so
// several 10:00s in the next days mean a list, never today's by default).
// Deliberately broad: a false "named" only keeps the model's own lookup.
const DAY_WORDS = [
  // pt / es / fr / de / it / en: relative days and weekdays
  "hoje", "amanh[ãa]", "ontem", "anteontem", "segunda", "ter[çc]a", "quarta", "quinta", "sexta", "s[áa]bado", "domingo",
  "hoy", "ma[ñn]ana", "ayer", "lunes", "martes", "mi[ée]rcoles", "jueves", "viernes",
  "aujourd", "demain", "hier", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
  "heute", "morgen", "gestern", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag",
  "oggi", "domani", "ieri", "luned[ìi]", "marted[ìi]", "mercoled[ìi]", "gioved[ìi]", "venerd[ìi]",
  "today", "tomorrow", "yesterday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "\\bseg\\b", "\\bter\\b", "\\bqua\\b", "\\bqui\\b", "\\bsex\\b", "\\bs[áa]b\\b", "\\bdom\\b", "\\bmon\\b", "\\btue\\b", "\\bwed\\b", "\\bthu\\b", "\\bfri\\b", "\\bsat\\b", "\\bsun\\b",
  "\\bdia \\d{1,2}\\b", "\\bday \\d{1,2}\\b",
];
const DAY_RE = new RegExp(`${DAY_WORDS.join("|")}|\\b\\d{1,2}/\\d{1,2}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|วันนี้|พรุ่งนี้|มะรืน|เมื่อวาน|วันจันทร์|วันอังคาร|วันพุธ|วันพฤหัส|วันศุกร์|วันเสาร์|วันอาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์`, "i");
export const namesDay = (text: string | undefined) => !!text && DAY_RE.test(text);
// The hours the message mentions ("10", "10h", "às 10:30", "10 am").
const hoursIn = (text: string) => [...text.matchAll(/\b([01]?\d|2[0-3])(?:[:h.](\d{2}))?\b/g)].map((m) => ({ h: Number(m[1]), m: m[2] ? Number(m[2]) : null }));
const mentionsTime = (text: string, start: string) => {
  const [h, m] = start.split(":").map(Number);
  return hoursIn(text).some((x) => (x.h === h || x.h + 12 === h) && (x.m === null || x.m === m));
};
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const mentionsName = (text: string, name: string | null) => {
  const first = fold((name ?? "").trim().split(/\s+/)[0] ?? "");
  return first.length >= 2 && new RegExp(`(^|[^\\p{L}])${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "u").test(fold(text));
};

// The guard before any card for ONE existing appointment (UX, a launch
// blocker): when the user named no day and referred to it only by time
// and/or patient, and more than one live appointment in the window fits
// that, no card: the list to tap. The model can't bypass it.
// eligible: only appointments the action could apply to count (a completed
// one isn't cancelled or moved; an already-paid one isn't "paid" again).
async function ambiguousTarget(ctx: ToolContext, a: ApptRow, from: string, to: string, eligible: (r: ApptRow) => boolean): Promise<ToolOutcome | null> {
  const text = ctx.userText ?? "";
  if (!text || namesDay(text)) return null;
  const byTime = mentionsTime(text, hhmm(a.start_time));
  const byName = mentionsName(text, a.patient_name);
  if (!byTime && !byName) return null;
  const { data } = await ctx.db
    .from("appointments")
    .select(APPT_COLS)
    .eq("professional_id", ctx.profId)
    .gte("date", from)
    .lte("date", to)
    .not("status", "in", "(cancelled,rejected)")
    .order("date")
    .order("start_time")
    .limit(400);
  const fits = ((data ?? []) as ApptRow[]).filter((r) =>
    r.status !== "blocked"
    && (r.id === a.id || eligible(r))
    && (!byTime || hhmm(r.start_time) === hhmm(a.start_time))
    && (!byName || r.patient_id === a.patient_id));
  if (fits.length < 2 || !fits.some((r) => r.id === a.id)) return null;
  return {
    forModel: `${fits.length} appointments fit what the user said (no day was named), so no card was built. ${CHOOSE_NOTE}`,
    block: { type: "pick", question: ctx.t.pickAppointment, options: fits.slice(0, 8).map((r) => ({ id: r.id, title: appointmentTitle(ctx, r), detail: "" })) },
  };
}
// The user's message is exactly a time chip for this date and time, as the
// client sends it when tapped (texts.chipAt: "quarta-feira, 07/10/2026 às
// 10:00"); anything typed around it is not a chip.
export const isChipTap = (ctx: Pick<ToolContext, "t" | "userText">, date: string, time: string) =>
  !!ctx.userText && ctx.userText.trim() === ctx.t.chipAt(date, time);

// For a move, the part that says WHERE TO ("… para quinta às 15") doesn't
// identify the appointment being moved: only what's before it counts.
const stripNewWhen = (text: string | undefined) => (text ?? "").split(/\b(?:para|pra|to|al|au|auf|nach|ไป|เป็น)\b/i)[0];
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// An appointment as the user taps it: "Quarta-feira, 30/09/2026 · 10:00 · Maria Silva".
const appointmentTitle = (ctx: ToolContext, r: { date: string; start_time: string; status: string; patient_name: string | null }) =>
  `${whenLabel(ctx, r.date)} · ${hhmm(r.start_time)} · ${r.status === "blocked" ? "—" : r.patient_name ?? "—"}`;
const CHOOSE_NOTE ="The user was shown a list to choose from. Don't list the options, don't pick one and don't repeat any detail; wait for their choice.";

async function findPatients(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const q = cleanSearchText(String(input.query ?? "").replace(/·.*$/, ""));
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
  let rows = (data ?? []) as { id: string; full_name: string; birth_date: string | null }[];
  // A tapped option comes back verbatim: matched against the titles built
  // here by the same formatter, so no date is ever converted (a Buddhist-era
  // Thai date included) and the list never loops (9a).
  const tapped = typeof input.tapped === "string" ? input.tapped.trim() : "";
  if (tapped) {
    const hit = rows.filter((r) => patientOption(ctx, r).title === tapped);
    if (hit.length === 1) rows = hit;
  }
  // Several: the user chooses (UX: always a list, never a guess or a text list).
  if (rows.length > 1) {
    return { forModel: `${rows.length} patients match. ${CHOOSE_NOTE}`, block: { type: "pick", question: ctx.t.pickPatient, options: rows.map((r) => patientOption(ctx, r)) } };
  }
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
  // Filters for acting on ONE appointment: the patient's name (a tapped
  // list option carries "· nasc. …", ignored here) and/or the start time.
  const patient = typeof input.patient === "string" ? cleanSearchText(input.patient.replace(/·.*$/, "")).toLowerCase() : "";
  const start = isTime(input.start) ? input.start : null;
  if (input.start !== undefined && !start) return err("The start must be HH:MM (24 h).");
  // Filtered by patient, a longer window (UX: marking one paid looks from
  // 90 days back to 30 ahead).
  const maxDays = patient ? MAX_PATIENT_DAYS : MAX_LIST_DAYS;
  if (daysBetween(from, to) > maxDays - 1) return err(`At most ${maxDays} days at a time${patient ? "" : ` (up to ${MAX_PATIENT_DAYS} when you pass the patient)`}.`);
  // Looking for one with no day named ("a das 10"): the server searches the
  // next two weeks itself, whatever window the model assumed (9a/UX).
  let lo = from;
  let hi = to;
  if ((patient || start) && !namesDay(ctx.userText)) {
    lo = from < ctx.today ? from : ctx.today;
    hi = to > addDays(ctx.today, 13) ? to : addDays(ctx.today, 13);
    if (daysBetween(lo, hi) > maxDays - 1) lo = ctx.today;
  }
  const { data, error } = await ctx.db
    .from("appointments")
    .select(APPT_COLS)
    .eq("professional_id", ctx.profId)
    .gte("date", lo)
    .lte("date", hi)
    .not("status", "in", "(cancelled,rejected)")
    .order("date")
    .order("start_time")
    .limit(patient ? 400 : 80);
  if (error) return err("The schedule couldn't be read; say so and suggest the Schedule screen.");
  let rows = (data ?? []) as ApptRow[];
  if (patient) rows = rows.filter((r) => r.status !== "blocked" && (r.patient_name ?? "").toLowerCase().includes(patient));
  if (start) rows = rows.filter((r) => hhmm(r.start_time) === start);
  // A tapped option comes back verbatim: the one whose title it is (9a).
  const tapped = typeof input.tapped === "string" ? input.tapped.trim() : "";
  if (tapped) {
    const hit = rows.filter((r) => appointmentTitle(ctx, r) === tapped);
    if (hit.length === 1) rows = hit;
  }
  // Looking for one and several match: the user chooses (UX: a list with
  // date · time · patient, never a guess or a text list).
  if ((patient || start) && rows.length > 1) {
    return {
      forModel: `${rows.length} appointments match. ${CHOOSE_NOTE}`,
      block: {
        type: "pick",
        question: ctx.t.pickAppointment,
        options: rows.slice(0, 8).map((r) => ({ id: r.id, title: appointmentTitle(ctx, r), detail: "" })),
      },
    };
  }
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

// A date that could mean more than one day: the user taps one (UX, spec
// rule 10a). Only real days from today on; each shown as "Sexta-feira,
// 02/10/2026", which comes back as the next message.
async function chooseDate(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const dates = Array.isArray(input.dates) ? [...new Set(input.dates.filter((d): d is string => isDate(d) && d >= ctx.today))].sort() : [];
  if (dates.length < 2 || dates.length > 4) return err("Give 2 to 4 real dates from the Calendar (today or later), YYYY-MM-DD.");
  return {
    forModel: `Dates shown. ${CHOOSE_NOTE}`,
    block: { type: "pick", question: ctx.t.pickDate, options: dates.map((d) => ({ id: d, title: whenLabel(ctx, d), detail: "" })) },
  };
}

async function findFreeSlots(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const { date } = input;
  // Read-only, so no question about the length (UX): the default
  // procedure's, else 30 min, said in the answer.
  const given = input.durationMin !== undefined && input.durationMin !== null;
  const dur = given ? Number(input.durationMin) : (await defaultProcedure(ctx))?.duration_minutes ?? 30;
  if (!isDate(date)) return err("The date must be YYYY-MM-DD (Gregorian).");
  if (!Number.isInteger(dur) || dur < 5 || dur > 480) return err("The duration is 5–480 minutes.");
  const free = await freeStarts(ctx, date, dur);
  return { forModel: JSON.stringify({ when: whenLabel(ctx, date), durationMin: dur, free: free.slice(0, 24), note: "Say these are free times for an appointment of durationMin minutes." }) };
}

// ── Proposals ────────────────────────────────────────────────────────────

async function proposeBook(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const t = ctx.t;
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
  // A tapped time chip is ONE appointment (3e: the "Outro horário" chip was
  // turned back into the original series and double-booked): when the
  // user's message is just a chip, any repeat from the model is dropped.
  const repeat = isChipTap(ctx, date, start) ? null : parseRepeat(input.repeat);
  if (repeat === "invalid") return err(`Repeat is { every: "week" | "2weeks" | "month", count: ${MIN_OCCURRENCES}–${MAX_OCCURRENCES} }; ask the user.`);
  const seriesDates = repeat ? recurrenceDates(date, REPEAT_TO_RECURRENCE[repeat.every], repeat.count) : [date];
  let dates = seriesDates;
  // Dates the series skips (UX: "Pular 08/10 e marcar as outras"), set only
  // by the server from the taken dates below, never taken from the model.
  let skip: string[] = [];

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
  const overlaps = (r: ApptRow) => toMinutes(hhmm(r.start_time)) < endMin && toMinutes(start) < toMinutes(hhmm(r.end_time));
  const extra: AnswerBlock[] = [];
  if (repeat) {
    // Taken dates in the series (UX's two options, 3e's round 3): both are
    // shown at once, with no tap round trip that the model would have to
    // rebuild the series from: the series card WITHOUT the taken dates
    // ("Pular {data} e marcar as outras": Confirmar saves the rest) and, for
    // "Outro horário para {data}", the free times on that date as a separate
    // single appointment.
    const clashes = all.filter((r) => r.status !== "blocked" && overlaps(r)).sort((a, b) => a.date.localeCompare(b.date));
    if (clashes.length) {
      skip = [...new Set(clashes.map((r) => r.date))];
      dates = seriesDates.filter((d) => !skip.includes(d));
      if (!dates.length) return err("Every date of the series is taken; ask the user for another time.");
      const alternatives = await nearestFree(ctx, skip[0], start, dur, 4);
      extra.push({ type: "slot_choice", reason: "conflict", text: t.seriesOther(formatShortDate(ctx.locale, skip[0]).slice(0, 5)) + ":", conflicts: [], alternatives, other: false });
    }
  }
  // Everything below is about the dates that will be saved: after a skip,
  // the first one left, never the skipped first date (9a: re-checking the
  // skipped date re-found the same conflict, which looped).
  const first = dates[0];
  const saved = all.filter((r) => dates.includes(r.date));
  const clash = saved.find((r) => r.date === first && r.status !== "blocked" && overlaps(r));
  if (clash) {
    const alternatives = await nearestFree(ctx, first, start, dur);
    const s = hhmm(clash.start_time);
    const e = hhmm(clash.end_time);
    const what = clash.patient_name ?? "—";
    return {
      forModel: `Conflict: ${first} ${s}–${e} is taken (${what}). The user was shown the nearest free times as choices; ask which one (never pick).`,
      block: {
        type: "slot_choice",
        reason: "conflict",
        text: (alternatives.length ? t.conflict : t.conflictNone)(whenLabel(ctx, first), what, s, e),
        conflicts: [{ date: first, start: s, end: e, what }],
        alternatives,
        other: true,
      },
    };
  }

  const warnings: CardWarning[] = [];
  const asks: string[] = [];
  // In a series, the first date with a block / outside the hours, named.
  const onDate = (d: string) => (repeat ? `${formatShortDate(ctx.locale, d)}: ` : "");
  const block = saved.filter((r) => r.status === "blocked" && overlaps(r)).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (block) {
    warnings.push({ code: "blocked", text: onDate(block.date) + t.blockedWarn(hhmm(block.start_time), hhmm(block.end_time)) });
    asks.push(onDate(block.date) + t.blockedAsk(hhmm(block.start_time), hhmm(block.end_time)));
  }
  const wh = await workingHours(ctx);
  let hours: ReturnType<typeof hoursWarning> = null;
  let hoursDate = first;
  for (const d of dates) { hours = hoursWarning(d, start, end, wh); if (hours) { hoursDate = d; break; } }
  if (hours?.kind === "outside") {
    warnings.push({ code: "outside_hours", text: onDate(hoursDate) + t.outsideWarn(hours.start, hours.end) });
    asks.push(onDate(hoursDate) + t.outsideAsk(hours.start, hours.end));
  } else if (hours?.kind === "day_off") {
    warnings.push({ code: "outside_hours", text: onDate(hoursDate) + t.dayOffWarn(weekdayName(ctx, hoursDate)) });
    asks.push(onDate(hoursDate) + t.dayOffAsk(weekdayName(ctx, hoursDate)));
  }
  // The patient already booked on a (series) date: the first such date,
  // named like the block / hours warnings (7f).
  const already = all
    .filter((r) => r.patient_id === patientId && r.status !== "blocked" && dates.includes(r.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))[0];
  if (already) warnings.push({ code: "same_patient_day", text: onDate(already.date) + t.samePatientWarn(patient.full_name, hhmm(already.start_time)) });

  const past = first < ctx.today || (first === ctx.today && start <= ctx.nowTime);
  const stop = past
    ? { code: "past_time" as const, text: t.pastStop }
    : patient.archived_at
      ? { code: "patient_archived" as const, text: t.archivedStop }
      : undefined;

  const view: ScreenTarget = { screen: "schedule", date: first };
  const c = card(ctx, {
    icon: "calendar",
    title: t.newAppt,
    fields: [
      { label: t.patient, value: personLabel(ctx, patient.full_name, patient.birth_date) },
      { label: t.when, value: `${whenLabel(ctx, first)}, ${start}–${end}` },
      ...(proc ? [{ label: t.procedure, value: proc.name, isDefault: true }] : []),
      ...(proc?.price ? [{ label: t.value, value: money(proc.price, await practiceCountry(ctx)), isDefault: true }] : []),
      { label: t.type, value: t.inPerson, isDefault: true },
      { label: t.duration, value: t.minutes(dur), ...(durGiven ? {} : { isDefault: true }) },
      ...(repeat ? [{
        label: t.repeatLabel,
        value: t.repeatValue(repeat.every, dates.length, formatShortDate(ctx.locale, dates[dates.length - 1])),
      }] : []),
      // The skipped dates in their own row, not buried in Repetir (UX):
      // Confirmar books the others and leaves these out.
      ...(skip.length ? [{ label: t.skippedLabel, value: t.skippedValue(skip.map((d) => formatShortDate(ctx.locale, d).slice(0, 5)).join(", ")) }] : []),
    ],
    warnings,
    ...(asks.length ? { secondConfirm: { question: `${asks.join(" ")} ${t.bookAnyway}`, confirmLabel: t.bookLabel } } : {}),
    hardStop: !!stop,
    ...(stop ? { stop } : {}),
    editTarget: { screen: "schedule", date: first, params: { new: "1", start } },
    viewTarget: view,
    after: { screen: "schedule", date: first, highlight: { kind: "appointment" } },
    // The series stays anchored on its first date (recurrenceDates), with
    // the skipped dates listed; the save leaves them out.
    action: { kind: "book_appointment", args: { patientId, date, start, durationMin: dur, ...(proc ? { procedureId: proc.id } : {}), ...(repeat ? { repeat: { ...repeat, ...(skip.length ? { skip } : {}) } } : {}) } },
  });
  return {
    forModel: `Card shown (${c.id}${stop ? `, blocked: ${stop.code}` : ""}${warnings.length ? `, warnings: ${warnings.map((w) => w.code).join(",")}` : ""}${extra.length ? "; free times for the skipped date shown: a time tapped there is a separate single appointment, proposed after this one is saved" : ""}). Tell the user to check it and tap Confirmar; don't repeat the details.`,
    blocks: [{ type: "card", card: c }, ...extra],
  };
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
  const t = ctx.t;
  const a = await readAppointment(ctx, input.appointmentId);
  if (!a || a.status === "blocked") return unseen("appointment");
  if (a.status === "absent") return err("A no-show isn't moved (it stays on record): offer to book this patient again instead (find_patients, then propose_book_appointment).");
  if (a.status === "tentative" || a.status === "proposal") return err("That's a booking request: it's answered on the request (propose_booking_decision), not moved.");
  if (!MOVABLE_STATUSES.includes(a.status)) return err(`A ${a.status} appointment can't be moved; tell the user.`);
  // Which appointment: guarded on what identifies IT (the new day in the
  // message doesn't say which one to move), so only a named current day or
  // date counts; a weekday for the new date doesn't.
  const ambiguous = await ambiguousTarget({ ...ctx, userText: stripNewWhen(ctx.userText) }, a, ctx.today, addDays(ctx.today, 13), (r) => MOVABLE_STATUSES.includes(r.status));
  if (ambiguous) return ambiguous;
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
  const t = ctx.t;
  const a = await readAppointment(ctx, input.appointmentId);
  if (!a || a.status === "blocked") return unseen("appointment");
  if (a.status === "cancelled" || a.status === "rejected") return err("That appointment isn't active; tell the user.");
  const isRequest = a.status === "tentative" || a.status === "proposal";
  // Completed / absent (and anything else not live): the same rule as the
  // app's executor (only scheduled, confirmed or late).
  if (!isRequest && !MOVABLE_STATUSES.includes(a.status)) return err("Only scheduled, confirmed or late appointments can be cancelled; this one is " + a.status + ". Tell the user.");
  const ambiguous = await ambiguousTarget(ctx, a, ctx.today, addDays(ctx.today, 13), (r) => MOVABLE_STATUSES.includes(r.status));
  if (ambiguous) return ambiguous;
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
  const t = ctx.t;
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
  const t = ctx.t;
  const a = await readAppointment(ctx, input.appointmentId);
  if (!a || a.status === "blocked") return unseen("appointment");
  if (typeof input.paid !== "boolean") return err("Say whether it's paid or unpaid.");
  const paid = input.paid;
  const amount = input.amount === undefined || input.amount === null ? null : Number(input.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000)) return err("The amount must be a positive number.");
  if ((a.payment_status === "paid") === paid) return err(`It's already marked ${paid ? "paid" : "unpaid"}; tell the user.`);
  const ambiguous = await ambiguousTarget(ctx, a, addDays(ctx.today, -90), addDays(ctx.today, 30), (r) => (r.payment_status === "paid") !== paid && !["tentative", "proposal"].includes(r.status));
  if (ambiguous) return ambiguous;
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
  const t = ctx.t;
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
  const t = ctx.t;
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
  const t = ctx.t;
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
  const listed = matches.slice(0, 5).map((m) => `${personLabel(ctx, m.full_name, m.birth_date)}${m.archived_at ? ` (${ctx.t.archived})` : ""}`).join("; ");
  if (matches.length && input.createAnyway !== true) {
    // The user sees the similar patients and "É outra pessoa" to tap (UX:
    // a list, never a text list).
    return {
      forModel: `Possible duplicates were shown with an "it's someone else" option. ${CHOOSE_NOTE} If they choose an existing patient, don't add; only if they say it's someone else, propose again with createAnyway=true.`,
      block: {
        type: "pick",
        question: t.pickSimilar,
        options: [...matches.slice(0, 5).map((m) => patientOption(ctx, m)), { id: "new", title: t.someoneElse, detail: "" }],
      },
    };
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
// scans the appointment's PromptPay QR; "Open QR" opens that appointment.

async function proposeSendPix(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  if (ctx.client !== "app") return err("On the website Pix isn't sent by WhatsApp: say it's only in the app and point to Help G4.");
  const t = ctx.t;
  const a = await readAppointment(ctx, input.appointmentId);
  if (!a || a.status === "blocked") return unseen("appointment");
  // No payment request at all on a paid appointment, in any country (UX,
  // the app's B7 / #214): UX's fixed line, never a card or a QR link.
  if (a.payment_status === "paid") {
    return { forModel: "Already paid: the user was told so. Don't propose any payment request for it; add nothing.", block: { type: "text", text: t.alreadyPaid } };
  }
  const country = await practiceCountry(ctx);
  const { paymentQr } = countryProfile(country);
  if (paymentQr === "promptpay") {
    // Never a Pix card for a Thai practice: the answer and the way to the QR.
    const [text, label] = [t.promptPayText, t.promptPayOpen];
    const target: ScreenTarget = { screen: "schedule", date: a.date, id: a.id, params: { sheet: "1" } };
    const href = webPath(ctx.prefix, target, a.id);
    return {
      forModel: "Thai practice: no Pix. The user was shown that the patient pays with the appointment's PromptPay QR, with an Open QR link. Don't propose it again; add nothing.",
      blocks: [{ type: "text", text }, ...(href ? [{ type: "open" as const, label, href, target }] : [])],
    };
  }
  if (paymentQr !== "pix") return err("Pix is only for practices in Brazil; say so (there's no payment message to send for this practice).");
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
  choose_date: chooseDate,
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

// Rule 10a (UX, one rule for every language): "next Friday" / "próxima
// sexta" / "sexta que vem" / "ศุกร์หน้า" could be the coming Friday or the
// one after; a bare weekday said on that same weekday could be today or
// next week. Unless the message writes a date, the two days are shown to
// tap. Weekdays from Sunday (0), as getUTCDay.
const WEEKDAYS = [
  "sunday|domingo|dimanche|sonntag|domenica|อาทิตย์",
  "monday|segunda|lunes|lundi|montag|luned[ìi]|จันทร์",
  "tuesday|ter[çc]a|martes|mardi|dienstag|marted[ìi]|อังคาร",
  "wednesday|quarta|mi[ée]rcoles|mercredi|mittwoch|mercoled[ìi]|พุธ",
  "thursday|quinta|jueves|jeudi|donnerstag|gioved[ìi]|พฤหัส(?:บดี)?",
  "friday|sexta|viernes|vendredi|freitag|venerd[ìi]|ศุกร์",
  "saturday|s[áa]bado|samedi|samstag|sabato|เสาร์",
];
const nextFormOf = (w: string) => new RegExp(
  `\\bnext (?:${w})|pr[óo]xim[oa] (?:${w})|(?:${w})(?:-feira)? que (?:vem|viene)|(?:${w}) prochain|n[äa]chste[nrs]? (?:${w})|prossim[oa] (?:${w})|(?:${w}) prossim[oa]|(?:วัน)?(?:${w})หน้า`,
);
const WRITTEN_DATE = /\b\d{1,2}[/.]\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b/;
const TODAY_WORD = /\b(?:today|hoje|hoy|aujourd|heute|oggi)|วันนี้/;
// "this Wednesday" / "nesta quarta" / "พุธนี้" = the one of this week (UX):
// no chips, and said on a Wednesday it is today.
const thisFormOf = (w: string) => new RegExp(
  `\\bthis (?:${w})|\\bn?est[ae] (?:${w})|\\beste (?:${w})|\\bce (?:${w})|\\bdiese[nm]? (?:${w})|\\bquest[oa] (?:${w})|(?:${w})นี้`,
);
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export function ambiguousDays(text: string | undefined, today: string): [string, string] | null {
  const s = (text ?? "").toLowerCase();
  if (!s || WRITTEN_DATE.test(s)) return null;
  const now = weekdayOf(today);
  for (let w = 0; w < 7; w++) {
    if (nextFormOf(WEEKDAYS[w]).test(s)) {
      const first = addDays(today, ((w - now + 7) % 7) || 7);
      return [first, addDays(first, 7)];
    }
  }
  if (WEEKDAYS.some((w) => thisFormOf(w).test(s))) return null;
  if (!TODAY_WORD.test(s) && new RegExp(`(?:${WEEKDAYS[now]})`).test(s)) return [today, addDays(today, 7)];
  return null;
}
const DATED_TOOLS = new Set(["find_free_slots", "propose_book_appointment", "propose_move_appointment", "propose_block_time"]);

export async function runTool(ctx: ToolContext, name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
  const run = RUN[name];
  if (!run) return err(`There's no tool "${name}". Explain the steps on the screen instead.`);
  const days = DATED_TOOLS.has(name) && typeof input?.date === "string" ? ambiguousDays(ctx.userText, ctx.today) : null;
  if (days && days.includes(input.date as string)) {
    const shown = await chooseDate(ctx, { dates: days });
    return { ...shown, forModel: `The day the user said could be either of two dates; they were shown both to tap. ${CHOOSE_NOTE}` };
  }
  try {
    return await run(ctx, input ?? {});
  } catch {
    return err("That didn't work; say so and suggest doing it on the screen.");
  }
}

// A save the normal path refused: the slot was just taken → fresh times;
// a cancel of an appointment that's no longer live → a fixed line. No
// model call (§5a). Only the date and time of the client's action are
// used, re-validated (a9: the rest is untrusted).
export async function confirmFailedBlock(ctx: ToolContext, action: unknown, code = "slot_taken"): Promise<AnswerBlock | null> {
  if (code === "appointment_not_cancellable") return { type: "text", text: ctx.t.notCancellable };
  // Paid between the card and Confirmar (the app's send_pix, #214).
  if (code === "already_paid") return { type: "text", text: ctx.t.alreadyPaid };
  const args = (action as { args?: Record<string, unknown> } | null)?.args ?? {};
  const { date, start } = args;
  if (!isDate(date) || !isTime(start)) return null;
  const dur = Number.isInteger(args.durationMin) && (args.durationMin as number) >= 5 && (args.durationMin as number) <= 480 ? (args.durationMin as number) : 30;
  const alternatives = await nearestFree(ctx, date, start, dur);
  const t = ctx.t;
  return {
    type: "slot_choice",
    reason: "confirm_failed",
    text: alternatives.length ? t.slotTaken : t.slotTakenNone,
    conflicts: [{ date, start, end: fromMinutes(Math.min(toMinutes(start) + dur, 24 * 60 - 1)), what: "—" }],
    alternatives,
    other: true,
  };
}
