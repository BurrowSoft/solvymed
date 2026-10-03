import { formatShortDate } from "./dateLabels";
import { countryProfile } from "./country";

// Push notifications sent by the website's server actions, in the
// RECIPIENT's language (UX 2026-09-29), with dates in that language's
// format (Thai: Buddhist year). Pushes reach the app only, so the app's
// languages are covered; anything else gets English.

export type PushLocale = "pt-BR" | "en" | "es" | "fr" | "de" | "it" | "th";
const LOCALES: PushLocale[] = ["pt-BR", "en", "es", "fr", "de", "it", "th"];

export type PushKind =
  | "apptConfirmed" | "bookingNotAvailable" | "newTimeProposed" | "proposalAccepted" | "proposalDeclined"
  | "rescheduleRequested" | "rescheduleConfirmed" | "rescheduleConfirmedNoTime" | "rescheduleDeclined"
  | "apptBookedByClinic" | "apptBookedSeriesByClinic" | "apptCancelledByClinic" | "apptMovedByClinic" | "newBookingRequest"
  | "requestCancelled";

type Text = { title: string; body: string };
type Table = Record<PushKind, Text> & { note: string; messageHint: string };

// {when} = "29/09/2026 14:00" in the recipient's format; {name} = the patient.
const T: Record<PushLocale, Table> = {
  "pt-BR": {
    newBookingRequest: { title: "Novo pedido de consulta", body: "{name} pediu uma consulta para {when}." },
    requestCancelled: { title: "Pedido cancelado", body: "{name} cancelou o pedido de {when}." },
    apptConfirmed: { title: "Consulta confirmada", body: "{doctor} confirmou sua consulta de {date} às {time}." },
    bookingNotAvailable: { title: "Pedido não aceito", body: "{doctor} não pôde aceitar seu pedido de consulta de {date} às {time}." },
    newTimeProposed: { title: "Novo horário proposto", body: "{doctor} sugeriu um novo horário: {date} às {time}." },
    proposalAccepted: { title: "Proposta aceita", body: "{name} aceitou o novo horário: {when}." },
    proposalDeclined: { title: "Proposta recusada", body: "{name} recusou o horário proposto. O pedido foi cancelado." },
    rescheduleRequested: { title: "Pedido de remarcação", body: "{name} pediu para remarcar a consulta de {oldDate} {oldTime} para {date} {time}." },
    rescheduleConfirmed: { title: "Consulta confirmada", body: "{doctor} confirmou sua consulta de {date} às {time}." },
    rescheduleConfirmedNoTime: { title: "Remarcação confirmada", body: "Seu pedido de remarcação foi confirmado." },
    rescheduleDeclined: { title: "Remarcação não aceita", body: "{doctor} não pôde remarcar. Sua consulta continua em {date} às {time}." },
    apptBookedByClinic: { title: "Consulta marcada", body: "Sua consulta com {doctor} foi marcada para {date} às {time}." },
    apptBookedSeriesByClinic: { title: "Consulta marcada", body: "Suas {n} consultas com {doctor} foram marcadas. A primeira é em {date} às {time}." },

    apptCancelledByClinic: { title: "Consulta cancelada", body: "Sua consulta com {doctor} em {date} às {time} foi cancelada pela clínica." },

    apptMovedByClinic: { title: "Consulta remarcada", body: "Sua consulta com {doctor} foi remarcada para {date} às {time}." },
    note: "Observação: {note}",
    messageHint: "(com uma mensagem da clínica)",
  },
  en: {
    newBookingRequest: { title: "New Appointment Request", body: "{name} requested an appointment on {when}." },
    requestCancelled: { title: "Request cancelled", body: "{name} cancelled their request for {when}." },
    apptConfirmed: { title: "Appointment confirmed", body: "{doctor} confirmed your appointment on {date} at {time}." },
    bookingNotAvailable: { title: "Request not accepted", body: "{doctor} couldn't accept your appointment request for {date} at {time}." },
    newTimeProposed: { title: "New time proposed", body: "{doctor} suggested a new time: {date} at {time}." },
    proposalAccepted: { title: "Proposal accepted", body: "{name} accepted the new time: {when}." },
    proposalDeclined: { title: "Proposal declined", body: "{name} declined the proposed time. The request was cancelled." },
    rescheduleRequested: { title: "Reschedule request", body: "{name} asked to move their appointment on {oldDate} {oldTime} to {date} {time}." },
    rescheduleConfirmed: { title: "Appointment confirmed", body: "{doctor} confirmed your appointment on {date} at {time}." },
    rescheduleConfirmedNoTime: { title: "Reschedule confirmed", body: "Your reschedule request has been confirmed." },
    rescheduleDeclined: { title: "Reschedule not accepted", body: "{doctor} couldn't move your appointment. It stays on {date} at {time}." },
    apptBookedByClinic: { title: "Appointment booked", body: "Your appointment with {doctor} is booked for {date} at {time}." },
    apptBookedSeriesByClinic: { title: "Appointment booked", body: "Your {n} appointments with {doctor} are booked. The first is on {date} at {time}." },

    apptCancelledByClinic: { title: "Appointment cancelled", body: "Your appointment with {doctor} on {date} at {time} was cancelled by the clinic." },

    apptMovedByClinic: { title: "Appointment moved", body: "Your appointment with {doctor} was moved to {date} at {time}." },
    note: "Note: {note}",
    messageHint: "(with a message from the clinic)",
  },
  es: {
    newBookingRequest: { title: "Nueva solicitud de cita", body: "{name} pidió una cita para el {when}." },
    requestCancelled: { title: "Solicitud cancelada", body: "{name} canceló su solicitud para el {when}." },
    apptConfirmed: { title: "Appointment confirmed", body: "{doctor} confirmed your appointment on {date} at {time}." },
    bookingNotAvailable: { title: "Request not accepted", body: "{doctor} couldn't accept your appointment request for {date} at {time}." },
    newTimeProposed: { title: "New time proposed", body: "{doctor} suggested a new time: {date} at {time}." },
    proposalAccepted: { title: "Propuesta aceptada", body: "{name} aceptó el nuevo horario: {when}." },
    proposalDeclined: { title: "Propuesta rechazada", body: "{name} rechazó el horario propuesto. La solicitud fue cancelada." },
    rescheduleRequested: { title: "Reschedule request", body: "{name} asked to move their appointment on {oldDate} {oldTime} to {date} {time}." },
    rescheduleConfirmed: { title: "Appointment confirmed", body: "{doctor} confirmed your appointment on {date} at {time}." },
    rescheduleConfirmedNoTime: { title: "Cambio confirmado", body: "Tu solicitud de cambio fue confirmada." },
    rescheduleDeclined: { title: "Reschedule not accepted", body: "{doctor} couldn't move your appointment. It stays on {date} at {time}." },
    apptBookedByClinic: { title: "Appointment booked", body: "Your appointment with {doctor} is booked for {date} at {time}." },
    apptBookedSeriesByClinic: { title: "Appointment booked", body: "Your {n} appointments with {doctor} are booked. The first is on {date} at {time}." },

    apptCancelledByClinic: { title: "Appointment cancelled", body: "Your appointment with {doctor} on {date} at {time} was cancelled by the clinic." },

    apptMovedByClinic: { title: "Appointment moved", body: "Your appointment with {doctor} was moved to {date} at {time}." },
    note: "Nota: {note}",
    messageHint: "(with a message from the clinic)",
  },
  fr: {
    newBookingRequest: { title: "Nouvelle demande de rendez-vous", body: "{name} a demandé un rendez-vous le {when}." },
    requestCancelled: { title: "Demande annulée", body: "{name} a annulé sa demande pour le {when}." },
    apptConfirmed: { title: "Appointment confirmed", body: "{doctor} confirmed your appointment on {date} at {time}." },
    bookingNotAvailable: { title: "Request not accepted", body: "{doctor} couldn't accept your appointment request for {date} at {time}." },
    newTimeProposed: { title: "New time proposed", body: "{doctor} suggested a new time: {date} at {time}." },
    proposalAccepted: { title: "Proposition acceptée", body: "{name} a accepté le nouvel horaire : {when}." },
    proposalDeclined: { title: "Proposition refusée", body: "{name} a refusé l’horaire proposé. La demande a été annulée." },
    rescheduleRequested: { title: "Reschedule request", body: "{name} asked to move their appointment on {oldDate} {oldTime} to {date} {time}." },
    rescheduleConfirmed: { title: "Appointment confirmed", body: "{doctor} confirmed your appointment on {date} at {time}." },
    rescheduleConfirmedNoTime: { title: "Report confirmé", body: "Votre demande de report a été confirmée." },
    rescheduleDeclined: { title: "Reschedule not accepted", body: "{doctor} couldn't move your appointment. It stays on {date} at {time}." },
    apptBookedByClinic: { title: "Appointment booked", body: "Your appointment with {doctor} is booked for {date} at {time}." },
    apptBookedSeriesByClinic: { title: "Appointment booked", body: "Your {n} appointments with {doctor} are booked. The first is on {date} at {time}." },

    apptCancelledByClinic: { title: "Appointment cancelled", body: "Your appointment with {doctor} on {date} at {time} was cancelled by the clinic." },

    apptMovedByClinic: { title: "Appointment moved", body: "Your appointment with {doctor} was moved to {date} at {time}." },
    note: "Remarque : {note}",
    messageHint: "(with a message from the clinic)",
  },
  de: {
    newBookingRequest: { title: "Neue Terminanfrage", body: "{name} hat einen Termin am {when} angefragt." },
    requestCancelled: { title: "Anfrage storniert", body: "{name} hat die Anfrage für {when} storniert." },
    apptConfirmed: { title: "Appointment confirmed", body: "{doctor} confirmed your appointment on {date} at {time}." },
    bookingNotAvailable: { title: "Request not accepted", body: "{doctor} couldn't accept your appointment request for {date} at {time}." },
    newTimeProposed: { title: "New time proposed", body: "{doctor} suggested a new time: {date} at {time}." },
    proposalAccepted: { title: "Vorschlag angenommen", body: "{name} hat die neue Zeit angenommen: {when}." },
    proposalDeclined: { title: "Vorschlag abgelehnt", body: "{name} hat die vorgeschlagene Zeit abgelehnt. Die Anfrage wurde storniert." },
    rescheduleRequested: { title: "Reschedule request", body: "{name} asked to move their appointment on {oldDate} {oldTime} to {date} {time}." },
    rescheduleConfirmed: { title: "Appointment confirmed", body: "{doctor} confirmed your appointment on {date} at {time}." },
    rescheduleConfirmedNoTime: { title: "Verschiebung bestätigt", body: "Ihre Verschiebungsanfrage wurde bestätigt." },
    rescheduleDeclined: { title: "Reschedule not accepted", body: "{doctor} couldn't move your appointment. It stays on {date} at {time}." },
    apptBookedByClinic: { title: "Appointment booked", body: "Your appointment with {doctor} is booked for {date} at {time}." },
    apptBookedSeriesByClinic: { title: "Appointment booked", body: "Your {n} appointments with {doctor} are booked. The first is on {date} at {time}." },

    apptCancelledByClinic: { title: "Appointment cancelled", body: "Your appointment with {doctor} on {date} at {time} was cancelled by the clinic." },

    apptMovedByClinic: { title: "Appointment moved", body: "Your appointment with {doctor} was moved to {date} at {time}." },
    note: "Hinweis: {note}",
    messageHint: "(with a message from the clinic)",
  },
  it: {
    newBookingRequest: { title: "Nuova richiesta di appuntamento", body: "{name} ha chiesto un appuntamento per il {when}." },
    requestCancelled: { title: "Richiesta annullata", body: "{name} ha annullato la richiesta per il {when}." },
    apptConfirmed: { title: "Appointment confirmed", body: "{doctor} confirmed your appointment on {date} at {time}." },
    bookingNotAvailable: { title: "Request not accepted", body: "{doctor} couldn't accept your appointment request for {date} at {time}." },
    newTimeProposed: { title: "New time proposed", body: "{doctor} suggested a new time: {date} at {time}." },
    proposalAccepted: { title: "Proposta accettata", body: "{name} ha accettato il nuovo orario: {when}." },
    proposalDeclined: { title: "Proposta rifiutata", body: "{name} ha rifiutato l’orario proposto. La richiesta è stata annullata." },
    rescheduleRequested: { title: "Reschedule request", body: "{name} asked to move their appointment on {oldDate} {oldTime} to {date} {time}." },
    rescheduleConfirmed: { title: "Appointment confirmed", body: "{doctor} confirmed your appointment on {date} at {time}." },
    rescheduleConfirmedNoTime: { title: "Spostamento confermato", body: "La tua richiesta di spostamento è stata confermata." },
    rescheduleDeclined: { title: "Reschedule not accepted", body: "{doctor} couldn't move your appointment. It stays on {date} at {time}." },
    apptBookedByClinic: { title: "Appointment booked", body: "Your appointment with {doctor} is booked for {date} at {time}." },
    apptBookedSeriesByClinic: { title: "Appointment booked", body: "Your {n} appointments with {doctor} are booked. The first is on {date} at {time}." },

    apptCancelledByClinic: { title: "Appointment cancelled", body: "Your appointment with {doctor} on {date} at {time} was cancelled by the clinic." },

    apptMovedByClinic: { title: "Appointment moved", body: "Your appointment with {doctor} was moved to {date} at {time}." },
    note: "Nota: {note}",
    messageHint: "(with a message from the clinic)",
  },
  th: {
    newBookingRequest: { title: "คำขอนัดหมายใหม่", body: "{name} ขอนัดหมายวันที่ {when}" },
    requestCancelled: { title: "ยกเลิกคำขอ", body: "{name} ยกเลิกคำขอนัดวันที่ {when}" },
    apptConfirmed: { title: "ยืนยันนัดหมายแล้ว", body: "{doctor} ยืนยันนัดหมายของคุณวันที่ {date} เวลา {time} น." },
    bookingNotAvailable: { title: "คำขอไม่ได้รับการตอบรับ", body: "{doctor} ไม่สามารถรับคำขอนัดหมายวันที่ {date} เวลา {time} น. ได้" },
    newTimeProposed: { title: "มีการเสนอเวลาใหม่", body: "{doctor} เสนอเวลาใหม่: วันที่ {date} เวลา {time} น." },
    proposalAccepted: { title: "ยอมรับข้อเสนอแล้ว", body: "{name} ยอมรับเวลาใหม่: {when}" },
    proposalDeclined: { title: "ปฏิเสธข้อเสนอ", body: "{name} ปฏิเสธเวลาที่เสนอ คำขอถูกยกเลิกแล้ว" },
    rescheduleRequested: { title: "คำขอเลื่อนนัด", body: "{name} ขอเลื่อนนัดจาก {oldDate} {oldTime} เป็น {date} {time}" },
    rescheduleConfirmed: { title: "ยืนยันนัดหมายแล้ว", body: "{doctor} ยืนยันนัดหมายของคุณวันที่ {date} เวลา {time} น." },
    rescheduleConfirmedNoTime: { title: "ยืนยันการเลื่อนนัดแล้ว", body: "คำขอเลื่อนนัดของคุณได้รับการยืนยันแล้ว" },
    rescheduleDeclined: { title: "ไม่สามารถเลื่อนนัดได้", body: "{doctor} ไม่สามารถเลื่อนนัดได้ นัดหมายของคุณยังคงเป็นวันที่ {date} เวลา {time} น." },
    apptBookedByClinic: { title: "นัดหมายแล้ว", body: "นัดหมายกับ {doctor} วันที่ {date} เวลา {time} น." },
    apptBookedSeriesByClinic: { title: "นัดหมายแล้ว", body: "นัดหมายกับ {doctor} จำนวน {n} ครั้ง ครั้งแรกวันที่ {date} เวลา {time} น." },

    apptCancelledByClinic: { title: "นัดหมายถูกยกเลิก", body: "นัดหมายกับ {doctor} วันที่ {date} เวลา {time} น. ถูกคลินิกยกเลิก" },

    apptMovedByClinic: { title: "เลื่อนนัดหมายแล้ว", body: "นัดหมายกับ {doctor} ถูกเลื่อนเป็นวันที่ {date} เวลา {time} น." },
    note: "หมายเหตุ: {note}",
    messageHint: "(พร้อมข้อความจากคลินิก)",
  },
};

// A stored locale ("pt-BR", "pt", "en-US", "th", …) → one the pushes speak.
export function pushLocale(stored: string | null | undefined): PushLocale | null {
  if (!stored) return null;
  const s = stored.trim();
  if ((LOCALES as string[]).includes(s)) return s as PushLocale;
  const base = s.split(/[-_]/)[0].toLowerCase();
  if (base === "pt") return "pt-BR";
  return (LOCALES as string[]).includes(base) ? (base as PushLocale) : null;
}

// UX's fallback when the recipient's language isn't known: the practice's.
export function practiceFallbackLocale(country: string | null | undefined): PushLocale {
  return countryProfile(country).fallbackLocale;
}

export function pushWhen(locale: PushLocale, date: string, time?: string | null): string {
  const d = formatShortDate(locale, date);
  return time ? `${d} ${time.slice(0, 5)}` : d;
}

export function pushText(
  locale: PushLocale,
  kind: PushKind,
  // clinic / date / time: the clinic's own pushes (08's texts): the
  // clinic's patient-facing name, the date in the reader's format, HH:MM.
  // hasMessage (150): the clinic left a message, shown on the patient's
  // appointment; the push only says so, never its text.
  params: { name?: string; when?: string; note?: string | null; hasMessage?: boolean; clinic?: string; doctor?: string; date?: string; time?: string; oldDate?: string; oldTime?: string; n?: number } = {},
): Text {
  const t = T[locale];
  // Replacer functions: names are user text, and "$&" in a replacement
  // string would be read as a pattern.
  const fill = (s: string) => s
    .replace("{name}", () => params.name ?? "").replace("{when}", () => params.when ?? "")
    .replace("{clinic}", () => params.clinic ?? "").replace("{doctor}", () => params.doctor ?? "").replace("{date}", () => params.date ?? "").replace("{time}", () => params.time ?? "")
    .replace("{oldDate}", () => params.oldDate ?? "").replace("{oldTime}", () => params.oldTime ?? "")
    .replace("{n}", () => String(params.n ?? ""));
  const body = fill(t[kind].body);
  return {
    title: t[kind].title,
    body: params.hasMessage
      ? `${locale === "th" ? body : body.replace(/\.$/, "")} ${t.messageHint}`
      : params.note ? `${body} ${t.note.replace("{note}", () => params.note ?? "")}` : body,
  };
}
