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
// `until`: a rule true only while a feature is hidden (e.g. "there are no
// templates"), dropped when any of those conditions is met.
export type Rule = string | { text: string; pending: ConditionId[]; until?: ConditionId[] };
export const ruleIsLive = (r: Rule) =>
  typeof r === "string" || (r.pending.every(isMet) && !(r.until ?? []).some(isMet));
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
      "On the website, outside the working hours or on a day the doctor doesn't work is allowed but asked twice; when blocked too, ONE question lists both. A practice that never saved its hours uses the default week (Monday to Friday, 08:00–18:00), so the same questions apply.",
      { text: "In the app too: outside the working hours or on a day off is asked twice.", pending: ["mobile#91"] },
      "An archived patient can't get new appointments (restore them first).",
      "The appointment can't run past midnight. Duration is 1–480 minutes.",
      "Dates are Gregorian; a year of 2400 or more is never saved or converted.",
      "Recurring (app and website): weekly, every 2 weeks or monthly, 2–52 appointments; every date is checked; if any conflicts, none are saved and the conflicting date is named; blocked time on any date is asked once, naming the date. A monthly series keeps the day number (the 31st rolls over into the next month).",
      "On the website a recurring series is also checked against the working hours: outside them or a day off on any date is asked once, naming the date.",
      "SolvyAI's card warns (⚠, not a question) when the patient already has an appointment that day; in a series it names the first such date.",
      { text: "In the app too: a series outside the working hours or on a day off is asked once, naming the date.", pending: ["mobile#91"] },
      "It's saved as scheduled, with payment pending; the value is the chosen procedure's price (none when it has no price).",
      "Every field that will be saved is on the card; defaults are marked (padrão).",
      { text: "Booked on the website: a patient linked to a SolvyMed account is notified, naming the doctor (\"Sua consulta com Dra. Ana foi marcada para …\"); never for the past.", pending: ["linked-bookings"] },
      { text: "Booked in the app (single or series): a patient linked to a SolvyMed account is notified, naming the doctor; never for blocked time or the past.", pending: ["mobile#111", "linked-bookings"] },
    ],
    card: ["patient (full name + birth date)", "when (weekday, date, start–end)", "procedure (padrão)", "value (padrão, in the practice currency)", "type (padrão)", "duration (padrão unless said)"],
    after: "schedule",
    help: "A1",
    runs: { web: { module: "src/app/[locale]/(site)/dashboard/(gated)/schedule/actions.ts", fn: "createAppointment" }, rpcs: [], app: "createAppointment / createRecurringAppointments (lib/services)" },
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
      { text: "Moved on the website: a patient linked to a SolvyMed account is notified of the new time, naming the doctor; never for the past.", pending: ["linked-bookings"] },
      "Patients' own reschedule requests are a separate flow (the doctor accepts or declines them).",
      { text: "A patient linked to a SolvyMed account is notified of the move (the new time, naming the doctor); never for the past.", pending: ["mobile#111", "linked-bookings"] },
    ],
    card: ["patient", "from (weekday, date, time)", "to (weekday, date, time)"],
    after: "schedule",
    help: "A4",
    runs: { web: { module: "src/app/[locale]/(site)/dashboard/(gated)/schedule/actions.ts", fn: "moveAppointment" }, rpcs: [], app: "updateAppointment (lib/services)" },
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
      "Appointment requests (tentative / proposal) are never cancelled this way: they're rejected on the request card.",
      "Only scheduled, confirmed or late appointments can be cancelled; completed, absent, cancelled or rejected ones can't (SolvyAI says so; nothing is saved).",
      "A cancelled appointment no longer counts as 'to receive' and frees the time.",
      "Deleting an appointment is a different action and never done by SolvyAI.",
      "Archiving a patient on the website cancels their upcoming appointments.",
      { text: "Cancelled on the website (Schedule, or by archiving the patient): a patient linked to a SolvyMed account is notified, naming the doctor; never for blocked time or the past.", pending: ["linked-bookings"] },
      { text: "Cancelled in the app (Schedule, or by archiving the patient): a patient linked to a SolvyMed account is notified; never for the past.", pending: ["mobile#111", "linked-bookings"] },
    ],
    card: ["patient", "when (weekday, date, time)"],
    after: "schedule",
    help: "A4",
    runs: { web: { module: "src/app/[locale]/(site)/dashboard/(gated)/schedule/actions.ts", fn: "updateAppointmentStatus" }, rpcs: [], app: "updateAppointmentStatus('cancelled') (lib/services)" },
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
    runs: { web: { module: "src/app/[locale]/(site)/dashboard/(gated)/schedule/actions.ts", fn: "blockTime" }, rpcs: [], app: "BlockTimeModal insert (status 'blocked')" },
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
    runs: { web: { module: "src/app/[locale]/(site)/dashboard/(gated)/schedule/actions.ts", fn: "deleteAppointment" }, rpcs: [], app: "delete of the block row" },
    source: "web+app",
  },
  {
    kind: "booking_decision",
    tool: "propose_booking_decision",
    what: "Confirm or reject a patient's appointment request.",
    screen: { app: { pt: "Início › Pedidos de consulta", en: "Home › Appointment requests" }, web: { pt: "Agenda › Pedidos de consulta", en: "Schedule › Appointment Requests" } },
    roles: ["doctor", "secretary"],
    inputs: { required: ["which request", "confirm or reject"], optional: ["a note to the patient"], defaults: [] },
    rules: [
      "Confirming also adds (or links) the patient to the practice in the same step and notifies them.",
      "Rejecting only works while it's still a request (tentative or proposal) and notifies the patient.",
      "Proposing another time is done on the request card, not by SolvyAI.",
      "On the website, the Overview shows how many requests wait for the clinic's answer (a patient's request, or a reschedule the patient proposed), with \"Ver pedidos\" to the Schedule's requests.",
      { text: "In the patient's app: a patient can cancel their own pending request, accept or decline a time the clinic proposed, and ask to reschedule a scheduled or confirmed appointment only before it starts; they can't cancel a booked appointment themselves (the app tells them to talk to the clinic).", pending: ["app-1.4.0"] },
      "On the website, a patient can cancel their own pending request in Minhas Consultas (\"Cancelar pedido\" / \"Cancel request\", after a confirm); the clinic gets \"Pedido cancelado\". Once the clinic has answered it, the patient is told \"Para cancelar, fale com a clínica.\"",
      "On the website, a patient can ask to reschedule (\"Solicitar remarcação\") a scheduled or confirmed appointment only until it starts, by the clinic's clock.",
      "A patient's reschedule request on a scheduled/confirmed visit expires by itself once its requested time passes unanswered (checked every 5 minutes): the visit stays as it was, leaves the clinic's requests, and the patient's website shows \"Seu pedido de remarcação expirou.\" / \"Your reschedule request expired.\" while the visit is ahead.",
      { text: "In the patient's app too: \"Seu pedido de remarcação expirou.\" on that visit.", pending: ["app-1.4.0"] },
      "On the website, a request or proposed time whose time has passed without an answer shows the patient \"Não confirmado\" / \"Not confirmed\" in Minhas Consultas, with no actions (no Aceitar / Recusar).",
      { text: "In the patient's app too: a request or proposed time whose time has passed shows \"Não confirmado\" / \"Not confirmed\" with no actions.", pending: ["app-1.4.0"] },
      "A decision made through SolvyAI has no Desfazer: the patient is notified at once.",
    ],
    card: ["patient", "when (weekday, date, time)", "confirm or reject", "note"],
    after: "schedule",
    help: "A6",
    runs: {
      web: { module: "src/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions.ts", fn: "confirmBookingAndAddPatient" },
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
    runs: { web: { module: "src/app/[locale]/(site)/dashboard/(gated)/patients/actions.ts", fn: "createPatient" }, rpcs: ["find_similar_patients"], app: "patients insert (after find_similar_patients)" },
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
      "An appointment without an amount (none or zero) is never marked paid without one: SolvyAI asks how much was received, then shows ONE card with that amount (in the clinic's currency) and \"Marcar como pago\"; Confirmar saves the amount and paid together. Only if the user doesn't know or won't say, SolvyAI answers that it has no amount yet (set it in the Agenda).",
      "On the website, appointments without an amount don't count in To receive / Received and aren't in the Payments lists; the Agenda shows \"Sem valor · Definir valor\".",
      { text: "In the app too, an appointment without an amount shows \"Sem valor · Definir valor\", doesn't count, and \"Marcar como pago\" asks for the amount first.", pending: ["app-1.4.0"] },
      "Marking an appointment UNPAID again asks for a confirmation first (both platforms).",
    ],
    card: ["patient", "appointment (weekday, date, time)", "value", "paid / unpaid"],
    after: "payments",
    help: "G1",
    runs: { web: { module: "src/app/[locale]/(site)/dashboard/(gated)/payments/actions.ts", fn: "markPaid" }, rpcs: [], app: "updatePaymentStatus('paid' | 'pending')" },
    source: "web+app",
  },
  {
    kind: "send_pix",
    tool: "propose_send_pix",
    what: "Send the patient the payment details: Pix by WhatsApp (Brazil).",
    screen: { app: { pt: "Consulta › Enviar Pix por WhatsApp", en: "Appointment › Send Pix on WhatsApp" }, web: { pt: "Agenda › ícone de QR da consulta › Enviar Pix por WhatsApp", en: "Schedule › the appointment's QR icon › Send Pix via WhatsApp" } },
    roles: ["doctor", "secretary"],
    inputs: { required: ["which appointment"], optional: [], defaults: [] },
    rules: [
      "Only for Brazilian practices with a Pix key; it opens WhatsApp with the patient's number and the Pix message.",
      "It needs the patient's phone number; without one, say so and offer the QR / Pix Copia e Cola on the appointment instead.",
      "On the website SolvyAI doesn't send it itself: it points to the Agenda → the appointment's QR icon → \"Enviar Pix por WhatsApp\" / \"Send Pix via WhatsApp\" (shown when the patient has a phone), which opens the clinic's WhatsApp with the app's Pix message (with the Help link).",
      "Thai practices show a PromptPay QR on the appointment instead; there's no WhatsApp PromptPay message. Asked to send it for a Thai practice, SolvyAI never proposes it: it answers \"Em clínicas na Tailândia, o paciente paga escaneando o QR PromptPay da consulta.\" with an \"Abrir QR\" link to that appointment.",
      "The payment method always follows the PRACTICE's country.",
      "Never for a paid appointment, in any country: SolvyAI answers \"Esta consulta já está paga.\".",
      "On the website, a paid appointment no longer shows the payment QR (Agenda).",
      { text: "In the app too, a paid appointment no longer shows the payment QR.", pending: ["app-1.4.0"] },
      { text: "With the doctor's card payment link saved, the Pix message adds the line \"Ou pague com cartão: {link}\" before the copy instruction, and the QR window shows \"Ou pague com cartão\" / \"Or pay by card\" with the link (Thai practices too, under the PromptPay QR). A Brazilian practice with a card link and no Pix key has \"Enviar link do cartão por WhatsApp\" / \"Send card link via WhatsApp\" instead (on the website, the card icon next to the appointment), which sends \"Olá! Para pagar sua consulta em {data} às {hora} com cartão, use este link: {link}\".", pending: ["card-payment-live"] },
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
  // 53's go-live audit (#429) and cf's facts, 6 Oct.
  { rule: { text: "When the Privacy Policy is updated, the website shows a notice once at the top of Home (and of My appointments for patients): \"Atualizamos nossa Política de Privacidade\" / \"We've updated our Privacy Policy\" with \"Ler a política\" / \"Read the policy\" and \"OK\" (closes it for good; the × only in this tab). It never blocks anything.", pending: ["privacy-notice-live"] }, help: "K5" },
  { rule: { text: "In the app too (1.8.0): the same notice at the top of Home for patients and staff; \"OK\" closes it for good, the × until the app is reopened.", pending: ["privacy-notice-live", "app-1.8.0"] }, help: "K5" },
  { rule: "Patients get NO automatic appointment reminders today: SolvyMed sends patients no WhatsApp, LINE, SMS or e-mail reminder (automatic WhatsApp messages are off, LINE isn't live). The reminders in the app's Settings → \"Notificações\" / \"Notifications\" are notifications on the doctor's or secretary's OWN phone before their appointments. To remind a patient, the clinic sends a message by hand. Never say or suggest that patients get automatic reminders, in any country or channel. (A patient linked to a SolvyMed account does get an app notification when the clinic books, moves or cancels their appointment: that's a change notice, not a reminder.)", help: "C7" },
  { rule: { text: "The doctor's card payment link (1.8.0; doctors only, for practices with a payment QR, Brazil and Thailand): the page where patients pay by card, from the doctor's own payment provider; it must start with https:// (else \"Informe um link que comece com https://\" / \"Enter a link that starts with https://\"). On the website: Settings → \"Clínica\" / \"Clinic\" → \"Link de pagamento (cartão)\" / \"Card payment link\". It is offered with the payment QR (\"Ou pague com cartão\" / \"Or pay by card\", with \"Copiar\" / \"Copy\" and \"Compartilhar link do cartão\" / \"Share card link\"). SolvyMed doesn't process card payments; SolvyAI doesn't change the link, it points to that setting.", pending: ["card-payment-live"] }, help: "G3" },
  { rule: { text: "In the app too (1.8.0): Settings → \"Financeiro\" / \"Financial\" → \"Link de pagamento (cartão)\" / \"Card payment link\"; on the appointment, \"Ou pague com cartão\" / \"Or pay by card\" with the link and \"Compartilhar link do cartão\" / \"Share card link\".", pending: ["card-payment-live", "app-1.8.0"] }, help: "G3" },
  { rule: "A Brazilian practice CAN send the payment message by WhatsApp by hand on the website too: Agenda → the appointment's QR icon → \"Enviar Pix por WhatsApp\" / \"Send Pix via WhatsApp\" (and in the app, the appointment's \"Enviar Pix por WhatsApp\"). Never say the website can't send it. Payment methods follow the practice country: Pix and the WhatsApp Pix message are Brazil only; a Thai practice uses the PromptPay QR and has no WhatsApp item at all.", help: "G4" },
  { rule: { text: "There are no record or document templates yet: a record is free text (the doctor picks its type, such as a SOAP note). Never mention templates or \"modelos\" for records or documents.", pending: [], until: ["record-templates-live"] }, help: "P4" },
  { rule: "The Founders Program (\"Programa Fundadores\" / \"Founders Program\") has a public page, /founders (website footer link): doctors who use another clinic system today apply with a short form; accepted founders get lifetime free access to the paid plan, share a TEST export of their system (test patients only, never real ones), join a 30-minute video call showing it, and later try one test import and give short feedback. Places are limited per system (a waitlist when full). SolvyAI doesn't apply or upload for them; it points to /founders.", help: "C10" },
  { rule: { text: "A patient can be connected to several doctors: in the app, \"Meus médicos\" / \"My doctors\" on Home (a card per doctor) and in Settings → \"Meus médicos\" / \"My doctors\"; on the website, Minhas consultas shows \"Meus médicos\" / \"My doctors\" (a card per doctor with \"Marcar consulta com {doctor}\" and \"Desconectar\") and a filter per doctor; \"+ Adicionar médico\" / \"+ Add a doctor\" connects another doctor with the code that doctor shared. There is no directory: a patient only sees the doctors they connected to, and each doctor sees only their own data. Disconnecting is refused while there are upcoming scheduled or confirmed appointments with that doctor (cancel them with the clinic first); pending requests are cancelled and the clinic is told; the doctor keeps the patient's record.", pending: ["multi-doctor-live"] }, help: "C5" },
  { rule: { text: "A secretary can serve several doctors (1.5.0): each doctor invites her from their own Team; \"Agenda de\" / \"Schedule for\" at the top of the dashboard picks the doctor, and the schedule, patients, payments and settings are then that doctor's (non-clinical data only, as before). Each doctor removes only their own link with her; leaving from Settings leaves the doctor she's working for. On the Schedule, \"Agenda de\" → \"Todos\" / \"Schedule for\" → \"All\" shows every doctor's appointments (each with the doctor's name and colour: a fixed colour per doctor by her list's order, the same on the chips, the switcher and Notifications per doctor; a filter chip per doctor), as \"Lista\" / \"List\", \"Dia\" / \"Day\" (a column per doctor), \"Semana\" / \"Week\" or \"Mês\" / \"Month\"; the calendar views only when the doctors shown share one time zone (otherwise the list, with \"Esses médicos estão em fusos horários diferentes. Use a lista ou escolha um médico para ver o calendário.\" / \"These doctors are in different time zones. Use the list, or pick one doctor to see the calendar.\"; across zones the list follows the real order, each time in its doctor's clock followed by the zone's city, e.g. \"17:30 (Manaus)\"); an action on an appointment applies to that appointment's doctor; in \"Todos\", a new appointment or a block asks for the \"Médico\" / \"Doctor\" first (preselected from the filter), then uses that doctor's procedures, prices and hours. Settings → \"Notificações por médico\" / \"Notifications per doctor\" (with 2+ doctors): a switch per doctor for her app notifications (all may be off); the doctor's own notifications never change.", pending: ["multi-practice-live"] }, help: "C4" },
  { rule: { text: "A secretary serving several doctors when one doctor's subscription is inactive (app and website): that doctor shows in \"Agenda de\" / \"Schedule for\" with \"· assinatura inativa\" / \"· subscription inactive\" and is left out of \"Todos\" / \"All\" with a note of how many aren't shown; on opening, an active doctor is chosen instead; picking the inactive doctor shows \"A assinatura de {doctor} está inativa. Para voltar a atender, {doctor} precisa renovar.\" with \"Trocar de médico\" / \"Switch doctor\" and Sign out. Only that doctor can renew (a secretary never pays). With one doctor, the old inactive screen is unchanged.", pending: ["multi-practice-live"] }, help: "C4" },
  { rule: { text: "In the app, a secretary joins another doctor's team herself: Configurações → \"Entrar na equipe de outro médico\" / Settings → \"Join another doctor's team\", types the \"Código de convite\" / \"Invite code\" that doctor sent and taps \"Entrar\" / \"Join\" (secretaries only). Each doctor still invites her from their own Team. On both platforms she serves doctors of ONE practice country only: joining a doctor in another country is refused with \"Você só pode entrar na equipe de médicos do mesmo país do seu consultório.\" / \"You can only join doctors in the same country as your practice.\".", pending: ["multi-practice-live", "app-365-secretary-join"] }, help: "C4" },
  { rule: { text: "On the website, a secretary already on one team joins another doctor's: Configurações → \"Entrar na equipe de outro médico\" / Settings → \"Join another doctor's team\", types the \"Código de convite\" / \"Invite code\" and clicks \"Entrar\" / \"Join\"; or she opens that doctor's invite link and clicks \"Aceitar\" / \"Accept\". She then sees \"{doctor} adicionou você à equipe.\" / \"{doctor} added you to their team.\" with a hint to pick the doctor in \"Agenda de\" / \"Schedule for\". The same one-country rule applies.", pending: ["multi-practice-live"] }, help: "C4" },
  { rule: { text: "In the app too (1.4.0): an appointment without an amount hides the Pix QR, Send/Share Pix and the PromptPay QR, and shows \"Defina o valor para gerar o QR de pagamento.\" with \"Definir valor\".", pending: ["app-1.4.0"] }, help: "G4" },
  { rule: "New appointment on the website offers a plain \"Consulta\" (no procedure) as the first choice, selected by default (a procedure is picked on purpose): no value (\"Sem valor\"), 30 minutes, the payment type as chosen; picking a procedure sets its duration, price and payment type. With no procedures yet the form still saves; a tip links to Settings to add them. Appointment types show in the reader's language (Consulta / Consultation / ตรวจทั่วไป, Retorno…), procedures by their own name.", help: "A1" },
  { rule: "On the website, New appointment, Remarcar and Propor novo horário pick the day on a month calendar (any day; days the clinic is closed are greyed but can be picked) and the time on a grid of 15-minute times within that day's working hours (08:00–18:00 when none are set). \"Mostrar fora do horário\" shows 06:00–22:00; times outside the hours, or ending after closing, are greyed but can be picked (saving asks to confirm); taken times are marked (saving warns about the overlap). \"Outro horário…\" takes any time; \"Horário escolhido: …\" shows the pick.", help: "A1" },
  { rule: "A patient's confirmed appointment on the website shows \"Solicitar remarcação\" and the line \"Para cancelar, fale com a clínica.\" (patients can only withdraw pending requests). The reschedule request offers the next 30 days on the clinic's calendar, today's remaining times included, on a month calendar with a time grid and \"Horário escolhido: …\".", help: "A6" },
  { rule: "An appointment without an amount never offers the payment QR (Pix / PromptPay) on the website: the Agenda shows \"Sem valor · Definir valor\" and \"Defina o valor para gerar o QR de pagamento.\"; once a value is set, the QR icon appears.", help: "G4" },
  { rule: "The patient always sees with whom (website): each visit in Minhas Consultas shows the doctor and the clinic (\"Dra. Ana Souza · Clínica Sol\"), a \"Seu médico\" / \"Your doctor\" card shows the doctor, specialty and clinic, the booking buttons read \"Marcar consulta com {doctor}\" / \"Book with {doctor}\", and the booking page's title names the doctor.", help: "A6" },
  { rule: "On the website's booking page the patient picks what the visit is for from a list, never typing it unless they choose Outro: \"Consulta\" (selected by default) and \"Retorno\" always, then the clinic's procedures with their length and price, then \"Outro\" with a short text (only when the clinic has procedures). The patient never picks a length: Consulta, Retorno and Outro take 30 minutes, a procedure its own.", help: "A6" },
  { rule: "On the website's booking page, the patient picks a day on a month calendar (the next 30 days, from today while today still has a time; days the clinic is closed are greyed) and a time from a grid (4 columns on phones); \"Horário escolhido: …\" shows above the button. With no working hours set, the page says \"Este profissional ainda não abriu horários para agendamento online…\"; if the times don't load (15 s), it offers Tentar novamente.", help: "A6" },
  { rule: { text: "Reasons and messages (item 12): on the website, Reject on a booking request and changing an appointment to \"Cancelado\" ask for an optional \"Motivo (opcional)\" (up to 200 characters) that the patient sees on their appointment on the website (and in the app from 1.4.0): \"Recusado pela clínica: …\" / \"Cancelado pela clínica: …\" (their own cancel shows \"Você cancelou\"); staff see it as \"Motivo: …\" in the Agenda. Confirm and Propose take an optional \"Mensagem ao paciente\", shown to the patient as \"Mensagem da clínica: …\". Pushes and emails never carry the clinic's text, only \"…com uma mensagem da clínica\". A note on SolvyAI's confirm/reject card becomes that message (confirm) or reason (reject).", pending: ["status-reason-live"] }, help: "A4" },
  { rule: { text: "In the app too (1.4.0): a request on Início has \"Mensagem ao paciente (opcional)\" for Confirmar / Propor and Recusar opens \"Motivo (opcional)\"; in the Agenda sheet, Cancelada / Recusada open the reason step; the patient's sheet shows the same lines as the website.", pending: ["status-reason-live", "app-1.4.0"] }, help: "A4" },
  { rule: { text: "In the app (1.4.0), the Agenda, Início and Pagamentos refresh by themselves (on return to the app, every minute, when a notification arrives), and on the Agenda and Pagamentos you can pull down to refresh.", pending: ["app-1.4.0"] }, help: "A1" },
  { rule: "On the website, the Agenda (with its booking requests), Patients, a patient's page and the patient's Minhas Consultas update by themselves: when the tab comes back into view and every minute while it's open. \"Atualizar\" (Refresh) next to the title updates at once.", help: "A1" },
  { rule: "On an Android phone, the website offers \"Abrir no app SolvyMed\" (Open in the SolvyMed app) after an email confirmation (the welcome pages, a secretary's first dashboard), on an expired link (\"Este link já foi usado ou expirou. Entre com seu e-mail e senha.\") and on sign-in: it opens the app if installed, else its Play page; \"Continuar no site\" hides it. Not on iPhone (no App Store build yet) or computers.", help: "K6" },
  { rule: "Patients follow their own country (Brasil or ประเทศไทย): the one they picked at signup, else their clinic's, else their language. On the website their pages stay in that country's language or English; a page in another language moves to the country's. Links the clinic shares (invite / join / secretary invite) carry the practice's country (?c=BR / ?c=TH), so the signup skips the country question.", help: "C8" },
  { rule: { text: "In the app too (1.4.0): patients have Settings → Country (País / ประเทศ) with Brasil / ประเทศไทย; changing it switches the language to that country's unless English is chosen. Doctors and secretaries have no Country setting: theirs is the practice's.", pending: ["app-1.4.0"] }, help: "C8" },
  { rule: { text: "In the app (1.4.0, Brazil and other countries; not for Thai practices): Payments' WhatsApp icon opens the clinic's own WhatsApp chat with the patient, with a payment reminder already written in the patient's language (date and, if set, the amount); the clinic sends it. Without a phone on the record it says so and offers \"Abrir perfil\". The website has no WhatsApp reminder.", pending: ["app-1.4.0"] }, help: "G2" },
  { rule: { text: "Secretary invites by email: the invite is emailed to the address entered; \"Reenviar convite\" / \"Resend invite\" emails a fresh one (once an hour, up to 10 a day; the old code stops working); the signup from the invite shows that email, locked.", pending: ["secretary-invite-email-live"] }, help: "C4" },
  { rule: "Dates are always day first, never month first, in every language (English included): on the website a date is typed as DD/MM/YYYY (DD/MM/AAAA in Portuguese, วว/ดด/ปปปป in Thai) with the slashes added automatically, and shown the same way. The year is the Gregorian one; a Buddhist-era year (2400 or later) is refused with a message, never converted. In Thai the Buddhist year is shown under a birth date.", help: "A1" },
  { rule: "A patient with appointments (any status) can't be deleted on the website: \"Excluir cadastro\" / \"Delete patient\" shows for a patient with no record, prescription or file, and when they have appointments clicking it explains why (\"Este paciente tem consultas registradas e não pode ser excluído. Você pode arquivá-lo.\") and offers \"Arquivar\".", help: "P3" },
  { rule: { text: "In the app too: a patient with appointments can't be deleted; tapping \"Excluir cadastro\" explains why and offers \"Arquivar\".", pending: ["app-1.4.0"] }, help: "P3" },
  { rule: { text: "You can't delete a patient who has appointments (any status): the server refuses it, in any app version and on the website. Archive them instead.", pending: ["migration-134"] }, help: "P3" },
  { rule: "On the website, a secretary removed from her last team stops seeing the dashboard when she returns to it (on her next page, when she comes back to the tab, or within 2 minutes): she sees \"Você não faz parte de nenhuma equipe no momento.\" / \"You're not part of any team right now.\" with \"Entrar com um código de convite\" / \"Join with an invite code\" and \"Sair\" / \"Sign out\". The doctor's removal never signs her out.", help: "C4" },
  { rule: { text: "In the app too (1.8.0): within about 2 minutes, or when she returns to the app, a secretary removed from her last team sees the same screen (\"Você não faz parte de nenhuma equipe no momento.\" / \"You're not part of any team right now.\", \"Entrar com um código de convite\" / \"Join with an invite code\", \"Sair\" / \"Sign out\"); one still serving another doctor moves to that doctor's team.", pending: ["app-1.8.0"] }, help: "C4" },
  { rule: "Messaging follows the practice country: WhatsApp in Brazil (and by default); in Thailand, LINE once it's live, none until then. A Thai practice sees no WhatsApp item: on the website, Settings → Team has no WhatsApp share button after creating an invite (Copy code / Copy link remain).", help: "C4" },
  { rule: { text: "In the app too (1.4.0), a Thai practice sees no WhatsApp item: no Send confirmation / Open WhatsApp / Send Pix via WhatsApp on the appointment, no WhatsApp reminders in the Agenda, no WhatsApp mark in Patients, no WhatsApp reminder in Payments, no Messaging (WhatsApp) in Settings → Integrations or WhatsApp in Settings → Modules.", pending: ["app-1.4.0"] }, help: "C4" },
  { rule: "A patient who signed up in the app with an invite code is connected with that code when they first sign in on the website too (if it didn't connect yet); they aren't asked for the code again. If it can't connect them (removed by the clinic, an archived record), the website asks for a code as before.", help: "C5" },
  { rule: { text: "A patient who joins with the practice's invite code becomes a patient record at once, badged \"Novo, via convite\". On the website's Overview the clinic answers each: \"Manter\" keeps it, \"Remover\" disconnects the account (the record is archived). If the patient's email was already on another record, \"Mesmo e-mail de {nome}: mesclar?\" opens the merge of the two. SolvyAI doesn't keep or remove them.", pending: ["invited-patients-live"] }, help: "C5" },
  { rule: { text: "In the app too (1.4.0), Home shows the new invited patients with Manter / Remover.", pending: ["invited-patients-live", "app-1.4.0"] }, help: "C5" },
  { rule: { text: "A patient who is already connected and enters a code: the same clinic's personal code (another record of theirs) → \"Você já está conectado a {médico}. Peça à clínica para juntar seus cadastros.\" (the clinic merges the two records with \"Mesclar com outro paciente\"); another clinic's code → \"…Para trocar, fale com o suporte.\" Website and app alike.", pending: ["invite-same-practice-live"] }, help: "C5" },
  { rule: { text: "When a patient joins with the practice's invite code (app or website), the doctor and the secretaries get the push \"Novo paciente\": \"{nome} entrou com seu código de convite\" (joined with your invite code).", pending: ["invite-joined-push-live"] }, help: "C5" },
  { rule: { text: "After \"Remover\", that patient can't rejoin the clinic with its public code (they see \"Não foi possível conectar com este código. Fale com a clínica.\") and go back to connecting to a doctor, not waiting; another clinic's code works, and to re-admit them the clinic restores the record (Pacientes › Arquivados › Restaurar) and shares its personal code (an archived record can't be linked).", pending: ["invite-connect-live"] }, help: "C5" },
  { rule: "The professional registration (shown under the doctor's name on prescriptions and documents): in the app, Settings → \"Cadastros\" / \"Registrations\"; on the website, Settings → \"Perfil\" / \"Profile\". Brazilian practices (both platforms): \"Conselho de Classe\" / \"Professional council\" with \"Número\" / \"Number\" and \"Estado\" / \"State\" (saved as \"CRM 12345/SP\"), or \"Outro conselho\" / \"Other council\" with \"Conselho\" / \"Council\" and \"Número\" / \"Number\"; a CRM from another state: choose that state there. Other practices: one free-text field (e.g. \"ว.12345\").", help: "C1" },
  { rule: "The practice country is chosen when the doctor creates the account on the website, as the signup's first step (\"Onde você está? · คุณอยู่ที่ไหน? · Where are you?\" → Brasil or ประเทศไทย, plus \"Use SolvyMed in English\"; the ← arrow goes back to it; secretary invites and patient join links skip it); it sets the currency, the plan price, the patient ID field and the payment QR, and shows in Settings → \"País do consultório\" / \"Practice country\". To change it later, the doctor contacts support@solvymed.com (SolvyAI can't change it). Patients and secretaries don't choose it.", help: "C1" },
  { rule: { text: "The app (1.4.0): the language follows the country, Portuguese or English in Brazil, Thai or English in Thailand (Settings → Language offers only those two).", pending: ["app-1.4.0"] }, help: "C8" },
  { rule: "On the website, the side menu's language selector offers the practice country's language and English only (Português / English in Brazil, ไทย / English in Thailand); a page opened in another language moves to the country's language. The public site is in English, Português (BR) and ไทย only.", help: "C8" },
  { rule: { text: "In the app too (1.4.0): the first screen asks \"Where are you?\" (Brasil / ประเทศไทย + \"Use the app in English\"); for a doctor it's the practice country.", pending: ["app-1.4.0"] }, help: "C1" },
  { rule: { text: "In the app too (1.4.0): the receipt PDF shows the doctor's council registration next to their name when on file, and in Brazil with no clinic CNPJ the Portuguese Receita Saúde note, same as the website's receipt.", pending: ["app-1.4.0"] }, help: "G5" },
  { rule: "A new practice's working hours start as Monday to Friday, 08:00–18:00 (the same default in every country) until the doctor saves their own in Settings → \"Horário de atendimento\" / \"Working hours\": the website's form shows it, and patients can request appointments in those hours. Saving it completes the setup step.", help: "C2" },
  { rule: { text: "In the app too (1.7.0): a practice that never saved its hours shows and uses the default week, Monday to Friday 08:00–18:00, in the Working hours form, the Agenda and booking.", pending: ["app-1.7.0"] }, help: "C2" },
  { rule: { text: "Practice locations (doctors only; shown only with 2+ locations, one = as before): each place the doctor sees patients is a location. The \"Principal\" / \"Primary\" one is the default and can't be deleted while others remain (make another one primary first: \"Tornar principal\" / \"Make primary\"). On the website, \"Minhas Clínicas\" / \"My Clinics\" has \"Editar\" / \"Edit\" (name, address, city, state, phone) and \"Tornar principal\" / \"Make primary\"; Settings → \"Horário de atendimento\" / \"Working hours\" has a \"Local\" / \"Location\" per day, and that day's appointments are at it (none chosen = the primary). On the Schedule each appointment shows its location; in \"Nova Consulta\" / \"New Appointment\" the day's location is preselected as a chip and another can be picked; an appointment moved to another day takes that day's location. SolvyAI's bookings get the day's location too. SolvyAI doesn't change locations; it points to these screens.", pending: ["practice-locations-live"] }, help: "C15" },
  { rule: { text: "In the app too (1.8.0): Settings → \"Minha clínica\" / \"My Clinic\" lists the locations with \"Adicionar local\" / \"Add location\", edit and \"Tornar principal\" / \"Make primary\", and Working hours has a \"Local\" / \"Location\" per day.", pending: ["practice-locations-live", "app-1.8.0"] }, help: "C15" },
  { rule: { text: "\"Tornar principal\" / \"Make primary\" asks first (app and website): working days without a chosen location will use the new primary; appointments booked at a location stay there, and those without one will show the new primary.", pending: ["practice-locations-live"] }, help: "C15" },
  { rule: { text: "Patients see where each visit is (2+ locations): on the website's booking page the chosen day shows \"Local: {name} · {address}\" / \"Location: {name} · {address}\"; in \"Minhas consultas\" / \"My appointments\" each visit shows its location.", pending: ["practice-locations-live"] }, help: "C15" },
  { rule: "Printed documents on the website (prescription, patient history, receipt) print on A4 paper.", help: "P6" },
  { rule: { text: "On the website, with 2+ practice locations, the printed prescription, receipt and patient history list every location in the footer, one line each: name · address · phone.", pending: ["practice-locations-live"] }, help: "C15" },
  { rule: { text: "On the website, with 2+ practice locations, the clinical document PDFs (certificates, declarations, exam requests) list every location in the footer too.", pending: ["practice-locations-live", "clinical-documents-live"] }, help: "C15" },
  { rule: { text: "In the app too (1.8.0): with 2+ practice locations, its PDFs (prescriptions, receipts, the patient history) list every location in the footer the same way.", pending: ["practice-locations-live", "app-1.8.0"] }, help: "C15" },
  { rule: { text: "In the app too (1.7.0): every PDF (prescription, history, receipt) is on A4 paper.", pending: ["app-1.7.0"] }, help: "P6" },
  { rule: { text: "In the app too (1.6.0): no receipt without an amount. On an appointment with no amount, the receipt action (Brazil: \"Gerar recibo em PDF\" / \"Generate invoice PDF\" / \"สร้างใบแจ้งหนี้ PDF\"; Thailand: \"Emitir recibo (ใบเสร็จรับเงิน)\" / \"Issue receipt (ใบเสร็จรับเงิน)\" / \"ออกใบเสร็จรับเงิน\", also issuing a new one after a cancel) asks \"Defina o valor da consulta antes de emitir o recibo.\" / \"Set the appointment amount before issuing a receipt.\" / \"กรุณากำหนดจำนวนเงินก่อนออกใบเสร็จ\" with \"Definir valor\" / \"Set amount\" / \"ระบุจำนวนเงิน\" (opens the amount) and Cancel. Viewing an issued receipt is never blocked.", pending: ["receipt-amount-app-live"] }, help: "G5" },
  { rule: { text: "In the app (1.4.0), an inactive subscription shows a full screen: the doctor's says \"Your SolvyMed subscription is inactive.\" with \"Questions? Write to support@solvymed.com.\" (tap to email) and Sign Out; a secretary's says \"Subscription inactive\" (access resumes once the doctor's subscription is renewed), with the same support line. No price, plan or website on either (store rules).", pending: ["app-1.4.0"] }, help: "K1" },
  { rule: { text: "While a practice's subscription is inactive, a patient trying to book with it online on the website sees \"A clínica não está recebendo pedidos de consulta online no momento.\" / \"This clinic isn't taking online appointment requests right now.\" instead of the times.", pending: ["booking-check-live"] }, help: "K1" },
  { rule: { text: "In the patient's app (1.4.0), booking with a practice whose subscription is inactive shows the same message.", pending: ["booking-check-live", "app-1.4.0"] }, help: "K1" },
  {
    rule: {
      text: "The patient import also brings the address (postal code, street, number, complement, neighbourhood, city, state) and the CNS: iClinic and Prontuário Verde map them, and our template has the columns; a CEP that lost its leading zero in Excel is completed. The previous system's own notes stay imported data (doctor only), never Observações.",
      pending: ["patient-import-live", "patient-address-live"],
    },
    help: "P13",
  },
  {
    rule: {
      text: "Patient address, CNS and Observações (website; the patient form and page): \"Endereço\" / \"Address\" (collapsed while empty; fields by the practice's country), the CNS for clinics in Brazil (15 digits, checked), and \"Observações\" / \"Notes\" for administrative information only (never clinical details: those go in the medical record). The doctor and the secretary see and edit them; the address prints on one line under the patient's name on the prescription. When merging duplicates, the address is taken as a whole from one record, and differing Observações can be kept joined (\"As duas, juntas\" / \"Both, joined\") when they fit in 2,000 characters. SolvyAI doesn't fill them in; it points to the patient's page.",
      pending: ["patient-address-live"],
    },
    help: "P1",
  },
  { rule: "SolvyAI is for doctors only; secretaries and patients don't have it.", help: "C9" },
  {
    rule: {
      text: "SolvyAI's actions need the clinic's opt-in (Settings → SolvyAI → \"Permitir que o SolvyAI faça ações\" / \"Let SolvyAI take actions\", off by default); without it, SolvyAI only answers questions about using SolvyMed.",
      pending: ["migration-115", "mobile#99", "solvyai-live"],
    },
    help: "C9",
  },
  {
    rule: {
      text: "On the website, after a SolvyAI save the toast offers \"Desfazer\" / \"Undo\" for 10 s only when nothing reached the patient yet (a new patient, a payment, a block or unblock, or a single book / move / cancel for a patient without a SolvyMed account). When the patient may already have been told (a patient with an account: app push or LINE; a booking decision; a series), it shows \"Abrir\" / \"Open\" instead. If Desfazer fails: \"Não foi possível desfazer. Abra o item para ajustar.\"",
      pending: ["solvyai-live"],
    },
    help: "C9",
  },
  {
    rule: {
      text: "In the app too (1.4.0): after a SolvyAI save the toast offers \"Desfazer\" / \"Undo\" for 10 s only when nothing reached the patient yet, and \"Abrir\" / \"Open\" when the patient may already have been told (same rule as the website).",
      pending: ["app-1.4.0", "solvyai-live"],
    },
    help: "C9",
  },
  {
    rule: {
      text: "Imported data (\"Dados importados\" / \"Imported data\"): a patient brought from another system may have extra spreadsheet columns kept as imported data. Only the doctor sees them (in the app: open the patient → Dados importados; on the website: the patient's page → \"Dados importados\" / \"Imported data\" below the tabs; both with \"Importado de … em …\" / \"Imported from … on …\"); opening it is logged in the patient's access log (app: \"Acessos\" tab; website: \"Registro de acessos\" / \"Access log\" tab; \"Abriu os dados importados\" / \"Opened the imported data\"; repeated openings within a minute count once). SolvyAI never reads them; send the doctor there.",
      pending: ["import-extras-live"],
    },
    help: "P11",
  },
  {
    rule: {
      text: "Merging duplicate patients (in the app: Pacientes → the patient's ⋯ → \"Mesclar com outro paciente…\" / \"Merge with another patient…\", doctor only): pick the other record, keep the differing values you want, choose the record that stays, confirm (a second \"São a mesma pessoa\" / \"Same person\" confirm when an app account is involved). Each record shows its birth date, the phone's last 4 digits and when it was added or imported; switching the record that stays keeps the chosen values; same-name records are named in the confirmation by what differs. Everything moves to the record that stays; it can't be undone; the Access tab shows \"Mesclou com «nome»\". SolvyAI never merges; send the doctor there.",
      pending: ["merge-patients-live"],
    },
    help: "P12",
  },
  {
    rule: {
      text: "The website has it too (doctor only): open the patient, Info tab → \"Mesclar com outro paciente…\" / \"Merge with another patient…\": the same flow (only the differing fields, \"Manter este cadastro\" / \"Keep this record\", \"Mesclar\" / \"Merge\", a second \"São a mesma pessoa\" / \"Same person\" when an app account is involved). Each record's card shows its birth date, the phone's last 4 digits and when it was added or imported; switching which record stays keeps the marked values; two same-name records are named in the confirmation by what differs (e.g. \"Maria Silva (nasc. 12/03/1980)\"). SolvyAI never merges; send the doctor there.",
      pending: ["merge-web-live"],
    },
    help: "P12",
  },
  {
    rule: {
      text: "Broadcast to patients (doctor only, never a secretary): Início / Home (app) or Visão geral / Overview (website) → \"Enviar para Pacientes\" / \"Send to Patients\": a \"Título da Notificação\" / \"Notification Title\" (up to 100 characters) and a \"Mensagem\" / \"Message\" (up to 500, never blank) → \"Enviar Notificação\" / \"Send Notification\". It goes to the patients connected to the doctor; only those with SolvyMed notifications on receive it; at most 10 per practice every 24 hours; don't include patient details. SolvyAI doesn't send broadcasts; it points to that button.",
      pending: ["broadcast-live"],
    },
    help: "P14",
  },
  {
    rule: {
      text: "Refer a colleague (doctors only, never a secretary): Settings → \"Meus colegas\" / \"My colleagues\" keeps a private list (only the doctor sees it; the colleague isn't notified), added ONLY by a colleague's exact public code with \"+ Adicionar colega\" / \"+ Add a colleague\" (no search, no doctor directory), up to 50; only a colleague who has published My brand can be added (else \"Código não encontrado. Se o código estiver certo, peça ao seu colega para publicar a marca em Minha marca.\"). \"Remover dos colegas\" / \"Remove from colleagues\" asks to confirm first (adding them back needs their public code again). On a patient's page, \"Indicar colega\" / \"Refer a colleague\" prepares a message with the colleague's public link to copy or send (website: \"Copiar mensagem\" / \"Copy message\", \"Enviar por WhatsApp\" / \"Send on WhatsApp\" when the patient has a phone and the clinic uses WhatsApp). No patient data is shared; nothing about a referral is stored. SolvyAI doesn't add colleagues or refer; it points to these screens.",
      pending: ["referrals-live"],
    },
    help: "C12",
  },
  {
    rule: {
      text: "Record templates (website, doctors only): Settings → \"Modelos de prontuário\" / \"Record templates\" → \"Criar do zero\" / \"Create from scratch\" (blank) or \"Começar por uma especialidade\" / \"Start from a specialty\" then a specialty (an editable copy of a preset, in the reader's language: Psiquiatria, Clínica geral, Cardiologia, Psicologia, Odontologia, Nutrição, Fisioterapia, Pediatria); each section has a title and an optional hint shown as the field's example; up to 50 templates of up to 30 sections. Writing a record (patient → Registros / Records → Novo Registro / New Record), \"Modelo\" / \"Template\" picks one, or \"Sem modelo\" / \"No template\" to write free text as before (the row shows only once the doctor has a template); switching never loses typed text (free text → the first section; same-title sections keep theirs, the rest → the first section, with a message saying where; back to No template joins the sections; switching straight back with no edit in between restores exactly what was there); empty sections are left out. Records already written keep their sections: editing or deleting a template changes nothing written. SolvyAI doesn't create templates or write records; it points to these screens.",
      pending: ["record-templates-live"],
    },
    help: "C13",
  },
  {
    rule: {
      text: "Patient documents (doctors only; app and website): the patient's \"Documentos\" / \"Documents\" tab replaces Exams and Files and keeps files in the doctor's folders, the same for every patient (\"Comece aqui\" / \"Start here\", \"Exames\" / \"Exams\", \"Prescrições\" / \"Prescriptions\", \"Atestados e laudos\" / \"Certificates and reports\", \"Termos\" / \"Consent terms\", \"Documentos internos\" / \"Internal documents\"). Adding a file (PDF, JPG, PNG or HEIC, up to 20 MB): a title, a folder and \"Compartilhar com o paciente\" / \"Share with the patient\". A shared document shows to the connected patient in the app; the patient's notification carries the doctor's name only, never the title. Internal documents are never shared. Per document: Open, \"Ocultar do paciente\" / \"Hide from the patient\", Rename, \"Mover para pasta\" / \"Move to folder\" (into Internal unshares), Remove (the doctor's own upload is deleted within 24 h; otherwise hidden with a reason, from the patient too; documents stay in the record). \"Enviado pelo paciente\" / \"Sent by the patient\" marks a patient's upload (into folders that allow uploads; Exams by default). Settings → \"Pastas de documentos\" / \"Document folders\": \"Visível para os pacientes\" / \"Visible to patients\" (off hides the folder's shared documents after a confirm with the count; on shows them again, no notification), \"Pacientes podem enviar documentos aqui\" / \"Patients can send documents here\", rename, reorder, add (up to 30), delete an empty custom folder; 5 GB per doctor. Secretaries never see documents. The patient (app; website: \"Minhas consultas\" / \"My appointments\" → \"Documentos\" / \"Documents\") sees each connected doctor's shared folders and documents, can \"Enviar documento\" / \"Send a document\" into folders that allow it (up to 20 MB; 10 a day and 200 MB per doctor) and can \"Remover\" / \"Remove\" their own upload until the doctor opens it (within 24 h); after disconnecting or closing the account they lose access, and the documents stay in the doctor's record. SolvyAI doesn't open, share or move documents; it points to these screens.",
      pending: ["patient-documents-live"],
    },
    help: "P15",
  },
  {
    rule: {
      text: "In the app (1.8.0), a new prescription has \"Compartilhar com o paciente\" / \"Share with the patient\" (on by default): saving it puts a PDF copy in the patient's \"Prescrições\" / \"Prescriptions\" folder; a copy without the doctor's drawn signature is marked \"Cópia sem assinatura, para consulta do paciente.\" / \"Unsigned copy, for the patient's reference.\"; a correction replaces the shared copy; with the doctor's document storage full it is saved but not shared (\"Salvo, mas não compartilhado: seu espaço de documentos está cheio.\" / \"Saved, but not shared: your document storage is full.\"). SolvyAI doesn't share prescriptions; it explains the switch.",
      pending: ["patient-documents-live", "app-1.8.0"],
    },
    help: "P15",
  },
  {
    rule: {
      text: "Clinical documents (doctors only): the patient's \"Receitas e documentos\" / \"Prescriptions & documents\" tab has \"+ Receita\" / \"+ Prescription\" and \"+ Documento\" / \"+ Document\". The types follow the practice country: Brazil \"Atestado médico\" / \"Medical certificate\", \"Declaração médica\" / \"Medical declaration\", \"Solicitação de exames\" / \"Exam request\" and \"Receita de controle especial (impressa)\" / \"Special control prescription (print)\"; Thailand the Thai medical certificate, the declaration and the exam request. \"Idioma do documento\" / \"Document language\" changes the labels, date and calendar (the doctor writes the text); the Thai medical certificate offers only Thai and English; the ICD code only with \"Incluir CID\" / \"Include ICD code\" (with the patient's consent). Dates are typed dd/mm/yyyy in the Gregorian year (a Thai UI shows the Buddhist-era year under the field; a Buddhist-era year is refused); the Thai certificate's rest end fills from the days and the start (editable); closing with unsaved changes asks \"Descartar alterações?\" / \"Discard changes?\". Editing shows \"Editar documento\" / \"Edit document\", a correction \"Corrigir documento\" / \"Correct document\". One list, newest first; \"Baixar PDF\" / \"Download PDF\". Editable or deletable by its author for 24 hours, then \"Adicionar correção\" / \"Add correction\" (the original kept). Every document ends with the signature line (plus the saved signature), the doctor's name as saved (no title added) and the registration: digits only are formatted (Brazil \"CRM 12345/SP\" with the clinic's state; Thailand the medical licence number in the document's language), anything with a letter as typed. The special control prescription is print-only: its \"Imprimir\" / \"Print\" opens the print dialog with both copies (if it doesn't open, \"Abrir PDF\" / \"Open PDF\" opens the PDF to print from; sign by hand) and needs the patient's CPF or passport. Secretaries never see documents; every PDF created is in the access log. SolvyAI doesn't write, open or print documents; it points to this tab.",
      pending: ["clinical-documents-live"],
    },
    help: "P16",
  },
  {
    rule: {
      text: "On the website's Schedule, right after a manual book, move or cancel, \"Desfazer\" / \"Undo\" shows for 10 s, while the notice to the patient hasn't gone out yet. It first checks the appointment wasn't changed again; if it was, or the notice is already on its way, it says \"Não foi possível desfazer. Abra o item para ajustar.\". A booked series is undone whole.",
      pending: ["notice-queue-on"],
    },
    help: "A4",
  },
  {
    rule: {
      text: "In the app too (1.4.0): right after a manual book, move or cancel in the Agenda, \"Desfazer\" / \"Undo\" shows for 10 s, while the notice to the patient hasn't gone out yet; undoing a series removes the whole series; if the notice already went out or the appointment changed, it's refused (\"Não foi possível desfazer. Abra o item para ajustar.\") and the doctor adjusts the item instead.",
      pending: ["app-1.4.0", "notice-queue-on"],
    },
    help: "A4",
  },
  {
    rule: {
      text: "Importing patients from another system (website only, doctor: Pacientes → \"Importar pacientes\" / \"Import patients\"): a CSV or Excel file (iClinic and Prontuário Verde recognised, or our template); columns are mapped, the sheet is checked (new / already exist / with errors, with a downloadable error list) and nothing is saved until \"Importar\"; \"Desfazer importação\" works for 24 hours on the new patients not yet edited or used (after leaving the page: Importar pacientes → \"Última importação\" / \"Last import\", the most recent import only); a CPF that lost its leading zero in Excel (9 or 10 digits) is completed when its check digits match, otherwise the doctor formats the CPF column as Text and exports again. SolvyAI never imports; send the doctor there.",
      pending: ["patient-import-live"],
    },
    help: "P13",
  },
  {
    rule: {
      text: "In the app (doctors only), patient import is a pointer, never an import: Configurações → Integrações → \"Importação\" / Settings → Integrations → \"Import\" → \"Importar pacientes\" / \"Import patients\" opens \"A importação de pacientes é feita pelo site, em um computador: solvymed.com → Pacientes → Importar pacientes.\"; an empty Patients list shows \"Vindo de outro sistema? Importe seus pacientes pelo site.\" / \"Coming from another system? Import your patients on the website.\" with the same pointer.",
      pending: ["app-361-batch"],
    },
    help: "P13",
  },
  {
    rule: {
      text: "In the app, Configurações → Integrações → \"Mensagens\" / Settings → Integrations → \"Messaging\" → \"WhatsApp API\" (the clinic's automatic WhatsApp setup) is hidden while automatic WhatsApp isn't live (a server switch, off for every practice today). SolvyAI never sends anyone there and never says automatic WhatsApp messages are available; the clinic's own WhatsApp links (Enviar confirmação, Enviar Pix por WhatsApp) are unaffected.",
      pending: ["app-361-batch"],
    },
    help: "C7",
  },
  {
    rule: { text: "\"Mostrar botão do assistente\" / \"Show the assistant button\" (Settings → SolvyAI; per phone in the app, per browser on the website) hides or shows the ✦ button.", pending: ["mobile#99", "solvyai-live"] },
    help: "C9",
  },
  {
    rule: { text: "Founders Program (accepted founders, doctors only, website only): Settings → \"Programa Fundadores\" / \"Founders Program\" has the steps to create a TEST export (fake patients only), the call link and the upload (CSV, XLSX, XLS or ZIP, up to 20 MB, 20 files; the doctor confirms before each file that it has only test patients). SolvyAI can’t upload files; it explains where to do it.", pending: ["founders-upload-live"] },
    help: "C10",
  },
  {
    rule: { text: "My brand (Settings → \"Minha marca\" / \"My brand\", doctors only): the name, title, specialty and registration line patients see, a \"Cor da marca\" / \"Brand colour\" (8 presets or a custom colour; the shade is adjusted when needed so text stays readable), \"Logo (quadrado)\" / \"Logo (square)\", \"Logo horizontal (documentos)\" / \"Wide logo (documents)\" and an optional \"Foto\" / \"Photo\", each its own PNG/JPG upload (up to 5 MB, at most 4096 px per side). On the website the image is cropped first in \"Ajustar imagem\" / \"Adjust image\" (drag and zoom, then \"Usar imagem\" / \"Use image\"): the square logo and the photo square (the photo shows round), the wide logo 3:1; a small image warns \"Imagem pequena: pode ficar sem nitidez na impressão.\" / \"Small image: it may print blurry.\" but can be used; \"Ajustar\" / \"Adjust\" redoes the crop while on the page. Empty fields use the profile's own; no logo shows the initials in the colour; no colour uses SolvyMed's blue. The brand shows on the doctor's public invite link (not on a patient's personal invite page), their booking page (to the patients connected to them) and printed documents; it isn't in emails yet. Once saved, the logo and photo are public (anyone with an image's link can open it). SolvyAI doesn't change the brand; it points to Settings → My brand.", pending: ["brand-live"] },
    help: "C11",
  },
];

// Things SolvyAI never does, not even with confirmation (spec §3 "Never"):
// it explains where to do them instead.
export const NEVER: { what: string; help: string }[] = [
  { what: "Medical records: reading, writing or correcting them (a record locks 24 h after it's written; after that it can only be corrected, never deleted).", help: "P4" },
  { what: "Prescriptions (on the website, PDF on a prescription opens a print view: \"Imprimir / Salvar PDF\" / \"Print / Save as PDF\", with a blank line to sign by hand).", help: "P6" },
  { what: "Exams and files (photos or PDFs; the doctor adds them in the patient's Exams or Files tab, in the app or on the website; within 24 h of upload a file can be deleted, after that only hidden with a reason).", help: "P7" },
  { what: "Exporting a patient's history (on the website, \"PDF do histórico\" / \"History PDF\" at the top of the patient opens a print view: \"Imprimir / Salvar PDF\").", help: "P8" },
  { what: "Deleting or archiving a patient.", help: "P3" },
  { what: "Closing the account (on the website the user is then signed out and lands on the home page with \"Sua conta foi excluída.\" / \"Your account has been deleted.\" or, when it was closed and kept, \"Sua conta foi encerrada.\" / \"Your account has been closed.\").", help: "K4" },
  { what: "Changing the password (Settings → Change password, on the app and the website; the other devices are signed out).", help: "K2" },
  { what: "Payment and Pix / PromptPay settings.", help: "G3" },
  { what: "Receipts (on the website: Payments → a received appointment → \"Recibo\" / \"Receipt\", a print view, for the doctor and the secretary; never for an appointment without an amount (the page asks to set the amount first, with \"Definir valor\" / \"Set amount\"); it shows the doctor's council registration next to their name when on file, and in Brazil with no clinic CNPJ a Portuguese note that it's proof of payment and the official income-tax receipt comes from the Receita Saúde app; a Thai practice's numbered receipts are issued in the app).", help: "G5" },
  { what: "The subscription and plan (the doctor sees the plan's status in Settings → Subscription on the website; \"Manage subscription\" opens Stripe's page for a card subscription; subscribing with more than 48 h of free trial left keeps the trial: the first charge is when it ends, and cancelling before then keeps the trial until its end; with 48 h or less, the charge is immediate).", help: "K1" },
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
  { term: "tentative: \"Solicitado\" / \"Requested\"", meaning: "A patient's appointment request waiting for the practice." },
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
