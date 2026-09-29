// The App Map (specs/assistant.md §4, Vitor 2026-09-28): one structured
// source of truth for what SolvyMed can do and the rules behind it. It goes
// into SolvyAI's cached prefix next to the Help articles, so the model knows
// the screens and the rules. It only INFORMS the model: the server and the
// normal save paths still enforce every rule.
//
// Drafted from the code (web + the app, the app's rules confirmed by the
// mobile dev on 2026-09-29); UX & PM reviews every rule in plain language.
// Standing rule (Vitor): any user-facing change (a new action, a changed
// rule, a renamed label) updates this map and content/help in the SAME PR.
// src/__tests__/app-map.test.ts keeps it in step with the contract's tools
// and the code it names.

import type { ActionKind, TargetScreen } from "@/lib/assistant/types";
import conditions from "../../../content/help/conditions.json";
import { HELP } from "@/lib/help";

export type Role = "doctor" | "secretary";
// The conditions shared with the Help build (content/help/conditions.json):
// one registry says what's true yet, for both.
export type ConditionId = keyof typeof conditions;
export function isMet(id: ConditionId): boolean {
  return conditions[id].met === true;
}
// A rule the code enforces today, or one that becomes true when its
// conditions are met (an app build released, a migration applied). Pending
// rules stay out of the model's text until then, so the map never claims
// more than the product does (a9); they go live when conditions.json flips.
export type Rule = string | { text: string; pending: ConditionId[] };
export const ruleIsLive = (r: Rule) => typeof r === "string" || r.pending.every(isMet);
export const ruleText = (r: Rule) => (typeof r === "string" ? r : r.text);
export type Label = { pt: string; en: string };

export type AppMapAction = {
  kind: ActionKind;
  // The SolvyAI tool that proposes it (docs/assistant-api.md §5).
  tool: `propose_${string}`;
  what: string;
  // Where people do it by hand, named as on screen.
  screen: { app: Label; web: Label | null };
  // Who may do it on the screens. SolvyAI itself is for doctors only.
  roles: Role[];
  inputs: { required: string[]; optional: string[]; defaults: string[] };
  // The business rules, in plain words (what the server checks).
  rules: Rule[];
  // What the confirmation card shows, in order.
  card: string[];
  // Where the UI goes after Confirmar (the card's `after`).
  after: TargetScreen;
  help: string;
  // What Confirmar runs on each platform: a web server action (module +
  // exported function) and/or database RPCs; null = not on that platform.
  runs: { web: { module: string; fn: string } | null; rpcs: string[]; app: string };
  // Whose code the rules were read from.
  source: "web+app" | "app" | "web";
};

export const ACTIONS: AppMapAction[] = [
  {
    kind: "book_appointment",
    tool: "propose_book_appointment",
    what: "Book an appointment for a patient of the practice.",
    screen: { app: { pt: "Agenda › +", en: "Schedule › +" }, web: { pt: "Agenda › Nova consulta", en: "Schedule › New appointment" } },
    roles: ["doctor", "secretary"],
    inputs: {
      required: ["patient", "date", "start time"],
      optional: ["duration", "procedure", "type (in person / online)", "value", "notes", "repeat (weekly / every 2 weeks / monthly, 2–52 appointments)"],
      defaults: ["the default procedure (the first active one by name) with its price as the value and its payment type", "duration: the default procedure's, else 30 min", "in person", "payment pending"],
    },
    rules: [
      "The patient must belong to this practice: search only within it, never another clinic's patients.",
      "Another appointment at that time is a hard stop: nothing is saved; say who is there and offer the nearest free times (cancelled, rejected and blocked entries don't count).",
      "Blocked time is allowed but asked twice: 'Este horário está bloqueado (…). Agendar mesmo assim?'.",
      "On the website, outside the working hours or on a day the doctor doesn't work is allowed but asked twice; when blocked too, ONE question lists both. Hours never set up: no question.",
      { text: "In the app too: outside the working hours or on a day off is asked twice.", pending: ["mobile#91"] },
      "An archived patient can't get new appointments (restore them first).",
      "The appointment can't run past midnight. Duration is 1–480 minutes.",
      "Dates are Gregorian; a year of 2400 or more is never saved or converted.",
      "Recurring (app and website): weekly, every 2 weeks or monthly, 2–52 appointments; every date is checked; if any conflicts, none are saved and the conflicting date is named; blocked time on any date is asked once, naming the date. A monthly series keeps the day number (the 31st rolls over into the next month).",
      "On the website a recurring series is also checked against the working hours: outside them or a day off on any date is asked once, naming the date.",
      { text: "In the app too: a series outside the working hours or on a day off is asked once, naming the date.", pending: ["mobile#91"] },
      "It's saved as scheduled, with payment pending; the value is the chosen procedure's price (none when it has no price).",
      "Every field that will be saved is on the card; defaults are marked (padrão).",
      { text: "Booked on the website: a patient linked to a SolvyMed account is notified, named by the clinic; never for the past.", pending: ["linked-bookings"] },
      { text: "Booked in the app (single or series): a patient linked to a SolvyMed account is notified, named by the clinic; never for blocked time or the past.", pending: ["mobile#111", "linked-bookings"] },
    ],
    card: ["patient (full name + birth date)", "when (weekday, date, start–end)", "procedure (padrão)", "value (padrão, in the practice currency)", "type (padrão)", "duration (padrão unless said)"],
    after: "schedule",
    help: "A1",
    runs: { web: { module: "src/app/[locale]/(site)/dashboard/schedule/actions.ts", fn: "createAppointment" }, rpcs: [], app: "createAppointment / createRecurringAppointments (lib/services)" },
    source: "web+app",
  },
  {
    kind: "move_appointment",
    tool: "propose_move_appointment",
    what: "Move an appointment to another date or time.",
    screen: { app: { pt: "Agenda › consulta › Editar", en: "Schedule › appointment › Edit" }, web: { pt: "Agenda › ícone Remarcar", en: "Schedule › Reschedule icon" } },
    roles: ["doctor", "secretary"],
    inputs: { required: ["which appointment", "new date", "new start time"], optional: ["new duration (app only)"], defaults: ["the same duration"] },
    rules: [
      "Another appointment at the new time is a hard stop (the database refuses the overlap).",
      { text: "Moving onto blocked time or outside the working hours is asked twice, like booking.", pending: ["mobile#91"] },
      "An edit that doesn't move it (same date, start and duration) isn't asked again.",
      "The card shows before → after.",
      "On the website a no-show (absent) isn't moved: it stays on record (history, 'to receive'); book again with the 'New appointment (same patient)' icon next to it (same patient, procedure and duration).",
      { text: "In the app too: only scheduled, confirmed or late appointments change date or time; others (a no-show included) show the date read-only, and an absent one has 'Nova consulta' pre-filled.", pending: ["mobile#116"] },
      "On the website (Remarcar): only the date and start change (same duration and details), for scheduled, confirmed or late appointments; blocked time or outside the working hours is asked once (one question listing both).",
      { text: "Moved on the website: a patient linked to a SolvyMed account is notified (old and new time), never for the past.", pending: ["linked-bookings"] },
      "Patients' own reschedule requests are a separate flow (the doctor accepts or declines them).",
      { text: "A patient linked to a SolvyMed account is notified of the move (old and new time); never for the past.", pending: ["mobile#111", "linked-bookings"] },
    ],
    card: ["patient", "from (weekday, date, time)", "to (weekday, date, time)"],
    after: "schedule",
    help: "A4",
    runs: { web: { module: "src/app/[locale]/(site)/dashboard/schedule/actions.ts", fn: "moveAppointment" }, rpcs: [], app: "updateAppointment (lib/services)" },
    source: "web+app",
  },
  {
    kind: "cancel_appointment",
    tool: "propose_cancel_appointment",
    what: "Cancel an appointment (its status becomes cancelled; the row stays).",
    screen: { app: { pt: "Agenda › consulta › Status", en: "Schedule › appointment › Status" }, web: { pt: "Agenda › Status", en: "Schedule › Status" } },
    roles: ["doctor", "secretary"],
    inputs: { required: ["which appointment"], optional: [], defaults: [] },
    rules: [
      "Booking requests (tentative / proposal) are never cancelled this way: they're rejected on the request card.",
      "A cancelled appointment no longer counts as 'to receive' and frees the time.",
      "Deleting an appointment is a different action and never done by SolvyAI.",
      "Archiving a patient on the website cancels their upcoming appointments.",
      { text: "Cancelled on the website (Schedule, or by archiving the patient): a patient linked to a SolvyMed account is notified, named by the clinic; never for blocked time or the past.", pending: ["linked-bookings"] },
      { text: "Cancelled in the app (Schedule, or by archiving the patient): a patient linked to a SolvyMed account is notified; never for the past.", pending: ["mobile#111", "linked-bookings"] },
    ],
    card: ["patient", "when (weekday, date, time)"],
    after: "schedule",
    help: "A4",
    runs: { web: { module: "src/app/[locale]/(site)/dashboard/schedule/actions.ts", fn: "updateAppointmentStatus" }, rpcs: [], app: "updateAppointmentStatus('cancelled') (lib/services)" },
    source: "web+app",
  },
  {
    kind: "block_time",
    tool: "propose_block_time",
    what: "Block a period in the schedule (lunch, a day off, a course).",
    screen: { app: { pt: "Agenda › Bloquear horário", en: "Schedule › Block time" }, web: { pt: "Agenda › Bloquear horário", en: "Schedule › Block time" } },
    roles: ["doctor", "secretary"],
    inputs: { required: ["date", "start time", "end (or duration)"], optional: ["reason"], defaults: [] },
    rules: [
      "The booking pages don't offer blocked times to patients (a screen rule; the database itself doesn't refuse them).",
      "The practice can still book over a block, after the second question.",
      "SolvyAI never blocks over existing appointments: it names them and asks what to do.",
      "A year of 2400 or more is never saved.",
    ],
    card: ["period (weekday, date, start–end)", "reason"],
    after: "schedule",
    help: "A3",
    runs: { web: { module: "src/app/[locale]/(site)/dashboard/schedule/actions.ts", fn: "blockTime" }, rpcs: [], app: "BlockTimeModal insert (status 'blocked')" },
    source: "web+app",
  },
  {
    kind: "unblock_time",
    tool: "propose_unblock_time",
    what: "Remove a block from the schedule.",
    screen: { app: { pt: "Agenda › o bloqueio › excluir", en: "Schedule › the block › delete" }, web: { pt: "Agenda › o bloqueio › ícone da lixeira", en: "Schedule › the block › trash icon" } },
    roles: ["doctor", "secretary"],
    inputs: { required: ["which block"], optional: [], defaults: [] },
    rules: ["Only blocks are removed this way, never appointments."],
    card: ["period (weekday, date, start–end)"],
    after: "schedule",
    help: "A3",
    runs: { web: { module: "src/app/[locale]/(site)/dashboard/schedule/actions.ts", fn: "deleteAppointment" }, rpcs: [], app: "delete of the block row" },
    source: "web+app",
  },
  {
    kind: "booking_decision",
    tool: "propose_booking_decision",
    what: "Confirm or reject a patient's booking request.",
    screen: { app: { pt: "Início › Pedidos de consulta", en: "Home › Booking requests" }, web: { pt: "Agenda › Pedidos de consulta", en: "Schedule › Booking requests" } },
    roles: ["doctor", "secretary"],
    inputs: { required: ["which request", "confirm or reject"], optional: ["a note to the patient"], defaults: [] },
    rules: [
      "Confirming also adds (or links) the patient to the practice in the same step and notifies them.",
      "Rejecting only works while it's still a request (tentative or proposal) and notifies the patient.",
      "Proposing another time is done on the request card, not by SolvyAI.",
      "A decision made through SolvyAI has no Desfazer: the patient is notified at once.",
    ],
    card: ["patient", "when (weekday, date, time)", "confirm or reject", "note"],
    after: "schedule",
    help: "A6",
    runs: {
      web: { module: "src/app/[locale]/(site)/dashboard/schedule/booking-actions.ts", fn: "confirmBookingAndAddPatient" },
      rpcs: ["confirm_and_link_patient"],
      app: "confirm_and_link_patient / status 'rejected'",
    },
    source: "web+app",
  },
  {
    kind: "add_patient",
    tool: "propose_add_patient",
    what: "Add a patient to the practice.",
    screen: { app: { pt: "Pacientes › +", en: "Patients › +" }, web: { pt: "Pacientes › Novo paciente", en: "Patients › New patient" } },
    roles: ["doctor", "secretary"],
    inputs: {
      required: ["full name"],
      optional: ["birth date", "phone", "email", "the practice country's ID (CPF in Brazil; Thai ID or passport in Thailand)", "sex", "insurance"],
      defaults: [],
    },
    rules: [
      "A possible duplicate (same ID, same phone, or same name + birth date) is shown first, archived ones marked, with 'open existing' or 'create anyway'.",
      "The same CPF / Thai ID / passport can't be registered twice in one practice.",
      "A Thai ID must pass its checksum.",
      "A birth-date year of 2400 or more is never saved or converted.",
      { text: "The birth date must be between 1900 and today.", pending: ["mobile#95", "migration-116"] },
      "Only the ID fields of the practice's country are used.",
      "Through SolvyAI only the name and birth date are taken (the chat masks phone, email and ID numbers); those are added on the patient's page after saving.",
    ],
    card: ["full name", "birth date", "phone", "email", "ID"],
    after: "patient",
    help: "P1",
    runs: { web: { module: "src/app/[locale]/(site)/dashboard/patients/actions.ts", fn: "createPatient" }, rpcs: ["find_similar_patients"], app: "patients insert (after find_similar_patients)" },
    source: "web+app",
  },
  {
    kind: "mark_paid",
    tool: "propose_mark_paid",
    what: "Mark an appointment as paid or unpaid.",
    screen: { app: { pt: "Pagamentos (ou a consulta)", en: "Payments (or the appointment)" }, web: { pt: "Pagamentos", en: "Payments" } },
    roles: ["doctor", "secretary"],
    inputs: { required: ["which appointment", "paid or unpaid"], optional: ["amount"], defaults: [] },
    rules: [
      "'To receive' counts unpaid appointments that are scheduled, confirmed, completed or late; requests, cancelled, rejected, absent and blocked never count.",
      "If the appointment has no value, the amount is required to mark it paid.",
      "Marking an appointment UNPAID again asks for a confirmation first (both platforms).",
    ],
    card: ["patient", "appointment (weekday, date, time)", "value", "paid / unpaid"],
    after: "payments",
    help: "G1",
    runs: { web: { module: "src/app/[locale]/(site)/dashboard/payments/actions.ts", fn: "markPaid" }, rpcs: [], app: "updatePaymentStatus('paid' | 'pending')" },
    source: "web+app",
  },
  {
    kind: "send_pix",
    tool: "propose_send_pix",
    what: "Send the patient the payment details: Pix by WhatsApp (Brazil).",
    screen: { app: { pt: "Consulta › Enviar Pix por WhatsApp", en: "Appointment › Send Pix on WhatsApp" }, web: null },
    roles: ["doctor", "secretary"],
    inputs: { required: ["which appointment"], optional: [], defaults: [] },
    rules: [
      "Only for Brazilian practices with a Pix key; it opens WhatsApp with the patient's number and the Pix message.",
      "It needs the patient's phone number; without one, say so and offer the QR / Pix Copia e Cola on the appointment instead.",
      "On the website SolvyAI doesn't send it: it's only in the app for now (say so, with the Help link).",
      "Thai practices show a PromptPay QR on the appointment instead; there's no WhatsApp PromptPay message.",
      "The payment method always follows the PRACTICE's country.",
    ],
    card: ["patient", "appointment", "value", "Pix key"],
    after: "whatsapp",
    help: "G4",
    runs: { web: null, rpcs: [], app: "wa.me link from the appointment sheet" },
    source: "app",
  },
];

// Rules about SolvyAI itself (not one action).
export const GENERAL: { rule: Rule; help: string }[] = [
  { rule: "SolvyAI is for doctors only; secretaries and patients don't have it.", help: "C9" },
  {
    rule: {
      text: "SolvyAI's actions need the clinic's opt-in (Settings → SolvyAI → \"Permitir que o SolvyAI faça ações\" / \"Let SolvyAI take actions\", off by default); without it, SolvyAI only answers questions about using SolvyMed.",
      pending: ["migration-115", "mobile#99", "solvyai-live"],
    },
    help: "C9",
  },
  {
    rule: { text: "\"Mostrar botão do assistente\" / \"Show the assistant button\" (Settings → SolvyAI; per phone in the app, per browser on the website) hides or shows the ✦ button.", pending: ["mobile#99", "solvyai-live"] },
    help: "C9",
  },
];

// Things SolvyAI never does, not even with confirmation (spec §3 "Never"):
// it explains where to do them instead.
export const NEVER: { what: string; help: string }[] = [
  { what: "Medical records: reading, writing or correcting them (a record locks 24 h after it's written; after that it can only be corrected, never deleted).", help: "P4" },
  { what: "Prescriptions.", help: "P6" },
  { what: "Exams and files (photos or PDFs; the doctor adds them in the patient's Exams or Files tab, in the app or on the website; within 24 h of upload a file can be deleted, after that only hidden with a reason).", help: "P7" },
  { what: "Deleting or archiving a patient.", help: "P3" },
  { what: "Closing the account.", help: "K4" },
  { what: "Changing the password (Settings → Change password, on the app and the website; the other devices are signed out).", help: "K2" },
  { what: "Payment and Pix / PromptPay settings.", help: "G3" },
  { what: "The subscription and plan.", help: "K1" },
  { what: "Team members (inviting or removing a secretary).", help: "C4" },
  { what: "The clinic's country.", help: "C1" },
];

// Status labels are the EXACT ones on screen, the same on web and app
// (web #117, mobile #96; UX 2026-09-29): pt-BR / en.
export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: "scheduled: \"Agendado\" / \"Scheduled\"", meaning: "Booked by the practice." },
  { term: "confirmed: \"Confirmado\" / \"Confirmed\"", meaning: "Confirmed with the patient." },
  { term: "completed: \"Concluído\" / \"Completed\"", meaning: "The appointment happened." },
  { term: "late: \"Atrasado\" / \"Late\"", meaning: "The patient is late." },
  { term: "absent: \"Ausente\" / \"Absent\"", meaning: "The patient didn't come; it doesn't count as 'to receive'." },
  { term: "cancelled: \"Cancelado\" / \"Cancelled\"", meaning: "Cancelled; frees the time." },
  { term: "blocked: \"Bloqueado\" / \"Blocked\"", meaning: "A blocked period, not an appointment." },
  { term: "tentative: \"Solicitado\" / \"Requested\"", meaning: "A patient's booking request waiting for the practice." },
  { term: "proposal: \"Novo horário proposto\" / \"New time proposed\"", meaning: "A new time proposed on a request, waiting for the other side." },
  { term: "rejected: \"Rejeitado\" / \"Rejected\"", meaning: "A request the practice didn't accept." },
  { term: "request flow", meaning: "The patient asks → the practice confirms, rejects or proposes a new time → the patient accepts or declines a proposal." },
  { term: "trial / plan", meaning: "A free trial, then a paid plan; SolvyAI's daily message limit (10 in the trial, 20 on a paid plan) arrives with the SolvyAI backend." },
  { term: "roles", meaning: "Doctor (the practice's owner), secretary (schedule, patients and payments, never clinical data; no SolvyAI) and patient (books through the app or the website; no SolvyAI)." },
  { term: "practice country", meaning: "Decides the currency, the patient ID fields (CPF / Thai ID / passport) and the payment QR (Pix / PromptPay)." },
];

// The map as text for the model's cached prefix.
export function appMapText(): string {
  const lines: string[] = ["# SolvyMed App Map", "", "## Actions"];
  for (const a of ACTIONS) {
    lines.push(`### ${a.kind} (${a.tool})`, a.what);
    lines.push(`Screen: app "${a.screen.app.en}"${a.screen.web ? `, web "${a.screen.web.en}"` : " (app only)"}. Roles: ${a.roles.join(", ")}.`);
    lines.push(`Required: ${a.inputs.required.join(", ")}.${a.inputs.optional.length ? ` Optional: ${a.inputs.optional.join(", ")}.` : ""}${a.inputs.defaults.length ? ` Defaults (shown as "(padrão)"): ${a.inputs.defaults.join(", ")}.` : ""}`);
    for (const r of a.rules) if (ruleIsLive(r)) lines.push(`- ${ruleText(r)}`);
    lines.push(`Card: ${a.card.join("; ")}. After saving: ${a.after}. Help: ${a.help}.`, "");
  }
  lines.push("## About SolvyAI");
  // A held article (not built yet) isn't pointed to.
  const built = new Set(HELP.flatMap((c) => c.articles.map((a) => a.id)));
  for (const g of GENERAL) if (ruleIsLive(g.rule)) lines.push(`- ${ruleText(g.rule)}${built.has(g.help) ? ` (Help ${g.help})` : ""}`);
  lines.push("", "## Never via SolvyAI");
  for (const n of NEVER) lines.push(`- ${n.what} (Help ${n.help})`);
  lines.push("", "## Glossary");
  for (const g of GLOSSARY) lines.push(`- ${g.term}: ${g.meaning}`);
  return lines.join("\n");
}
