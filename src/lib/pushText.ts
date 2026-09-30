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
  | "apptBookedByClinic" | "apptBookedSeriesByClinic" | "apptCancelledByClinic" | "apptMovedByClinic" | "newBookingRequest";

type Text = { title: string; body: string };
type Table = Record<PushKind, Text> & { note: string };

// {when} = "29/09/2026 14:00" in the recipient's format; {name} = the patient.
const T: Record<PushLocale, Table> = {
  "pt-BR": {
    newBookingRequest: { title: "Novo pedido de consulta", body: "{name} pediu uma consulta para {when}." },
    apptConfirmed: { title: "Consulta confirmada", body: "Sua consulta foi confirmada." },
    bookingNotAvailable: { title: "Pedido não aceito", body: "Não foi possível aceitar o seu pedido de consulta." },
    newTimeProposed: { title: "Novo horário proposto", body: "Foi proposto um novo horário: {when}." },
    proposalAccepted: { title: "Proposta aceita", body: "{name} aceitou o novo horário: {when}." },
    proposalDeclined: { title: "Proposta recusada", body: "{name} recusou o horário proposto. O pedido foi cancelado." },
    rescheduleRequested: { title: "Pedido de remarcação", body: "{name} pediu para remarcar para {when}." },
    rescheduleConfirmed: { title: "Remarcação confirmada", body: "Sua consulta foi remarcada para {when}." },
    rescheduleConfirmedNoTime: { title: "Remarcação confirmada", body: "Seu pedido de remarcação foi confirmado." },
    rescheduleDeclined: { title: "Remarcação não aceita", body: "Não foi possível remarcar. O horário original continua confirmado." },
    apptBookedByClinic: { title: "Nova consulta", body: "{clinic} marcou uma consulta para você em {date} às {time}." },
    apptBookedSeriesByClinic: { title: "Nova consulta", body: "{clinic} marcou {n} consultas para você. A primeira é em {date} às {time}." },

    apptCancelledByClinic: { title: "Consulta cancelada", body: "{clinic} cancelou sua consulta de {date} às {time}. Para marcar outra, abra o app." },

    apptMovedByClinic: { title: "Consulta remarcada", body: "{clinic} mudou sua consulta de {oldDate} às {oldTime} para {date} às {time}." },
    note: "Observação: {note}",
  },
  en: {
    newBookingRequest: { title: "New booking request", body: "{name} requested an appointment on {when}." },
    apptConfirmed: { title: "Appointment confirmed", body: "Your appointment has been confirmed." },
    bookingNotAvailable: { title: "Request not accepted", body: "Your booking request couldn't be accepted." },
    newTimeProposed: { title: "New time proposed", body: "A new time was proposed: {when}." },
    proposalAccepted: { title: "Proposal accepted", body: "{name} accepted the new time: {when}." },
    proposalDeclined: { title: "Proposal declined", body: "{name} declined the proposed time. The request was cancelled." },
    rescheduleRequested: { title: "Reschedule requested", body: "{name} asked to reschedule to {when}." },
    rescheduleConfirmed: { title: "Reschedule confirmed", body: "Your appointment has been moved to {when}." },
    rescheduleConfirmedNoTime: { title: "Reschedule confirmed", body: "Your reschedule request has been confirmed." },
    rescheduleDeclined: { title: "Reschedule not accepted", body: "The appointment couldn't be moved. Your original time is still confirmed." },
    apptBookedByClinic: { title: "New appointment", body: "{clinic} booked an appointment for you on {date} at {time}." },
    apptBookedSeriesByClinic: { title: "New appointment", body: "{clinic} booked {n} appointments for you. The first is on {date} at {time}." },

    apptCancelledByClinic: { title: "Appointment cancelled", body: "{clinic} cancelled your appointment on {date} at {time}. To book another, open the app." },

    apptMovedByClinic: { title: "Appointment moved", body: "{clinic} moved your appointment from {oldDate} at {oldTime} to {date} at {time}." },
    note: "Note: {note}",
  },
  es: {
    newBookingRequest: { title: "Nueva solicitud de cita", body: "{name} pidió una cita para el {when}." },
    apptConfirmed: { title: "Cita confirmada", body: "Tu cita ha sido confirmada." },
    bookingNotAvailable: { title: "Solicitud no aceptada", body: "No se pudo aceptar tu solicitud de cita." },
    newTimeProposed: { title: "Nuevo horario propuesto", body: "Se propuso un nuevo horario: {when}." },
    proposalAccepted: { title: "Propuesta aceptada", body: "{name} aceptó el nuevo horario: {when}." },
    proposalDeclined: { title: "Propuesta rechazada", body: "{name} rechazó el horario propuesto. La solicitud fue cancelada." },
    rescheduleRequested: { title: "Solicitud de cambio", body: "{name} pidió cambiar la cita a {when}." },
    rescheduleConfirmed: { title: "Cambio confirmado", body: "Tu cita se cambió a {when}." },
    rescheduleConfirmedNoTime: { title: "Cambio confirmado", body: "Tu solicitud de cambio fue confirmada." },
    rescheduleDeclined: { title: "Cambio no aceptado", body: "No se pudo cambiar la cita. Tu horario original sigue confirmado." },
    apptBookedByClinic: { title: "Nueva cita", body: "{clinic} reservó una cita para ti el {date} a las {time}." },
    apptBookedSeriesByClinic: { title: "Nueva cita", body: "{clinic} reservó {n} citas para ti. La primera es el {date} a las {time}." },

    apptCancelledByClinic: { title: "Cita cancelada", body: "{clinic} canceló tu cita del {date} a las {time}. Para reservar otra, abre la app." },

    apptMovedByClinic: { title: "Cita cambiada", body: "{clinic} cambió tu cita del {oldDate} a las {oldTime} al {date} a las {time}." },
    note: "Nota: {note}",
  },
  fr: {
    newBookingRequest: { title: "Nouvelle demande de rendez-vous", body: "{name} a demandé un rendez-vous le {when}." },
    apptConfirmed: { title: "Rendez-vous confirmé", body: "Votre rendez-vous a été confirmé." },
    bookingNotAvailable: { title: "Demande non acceptée", body: "Votre demande de rendez-vous n’a pas pu être acceptée." },
    newTimeProposed: { title: "Nouvel horaire proposé", body: "Un nouvel horaire a été proposé : {when}." },
    proposalAccepted: { title: "Proposition acceptée", body: "{name} a accepté le nouvel horaire : {when}." },
    proposalDeclined: { title: "Proposition refusée", body: "{name} a refusé l’horaire proposé. La demande a été annulée." },
    rescheduleRequested: { title: "Demande de report", body: "{name} a demandé à reporter au {when}." },
    rescheduleConfirmed: { title: "Report confirmé", body: "Votre rendez-vous a été déplacé au {when}." },
    rescheduleConfirmedNoTime: { title: "Report confirmé", body: "Votre demande de report a été confirmée." },
    rescheduleDeclined: { title: "Report non accepté", body: "Le rendez-vous n’a pas pu être déplacé. L’horaire initial reste confirmé." },
    apptBookedByClinic: { title: "Nouveau rendez-vous", body: "{clinic} vous a pris un rendez-vous le {date} à {time}." },
    apptBookedSeriesByClinic: { title: "Nouveau rendez-vous", body: "{clinic} vous a pris {n} rendez-vous. Le premier est le {date} à {time}." },

    apptCancelledByClinic: { title: "Rendez-vous annulé", body: "{clinic} a annulé votre rendez-vous du {date} à {time}. Pour en prendre un autre, ouvrez l'app." },

    apptMovedByClinic: { title: "Rendez-vous déplacé", body: "{clinic} a déplacé votre rendez-vous du {oldDate} à {oldTime} au {date} à {time}." },
    note: "Remarque : {note}",
  },
  de: {
    newBookingRequest: { title: "Neue Terminanfrage", body: "{name} hat einen Termin am {when} angefragt." },
    apptConfirmed: { title: "Termin bestätigt", body: "Ihr Termin wurde bestätigt." },
    bookingNotAvailable: { title: "Anfrage nicht angenommen", body: "Ihre Terminanfrage konnte nicht angenommen werden." },
    newTimeProposed: { title: "Neue Zeit vorgeschlagen", body: "Eine neue Zeit wurde vorgeschlagen: {when}." },
    proposalAccepted: { title: "Vorschlag angenommen", body: "{name} hat die neue Zeit angenommen: {when}." },
    proposalDeclined: { title: "Vorschlag abgelehnt", body: "{name} hat die vorgeschlagene Zeit abgelehnt. Die Anfrage wurde storniert." },
    rescheduleRequested: { title: "Verschiebung angefragt", body: "{name} möchte den Termin auf {when} verschieben." },
    rescheduleConfirmed: { title: "Verschiebung bestätigt", body: "Ihr Termin wurde auf {when} verschoben." },
    rescheduleConfirmedNoTime: { title: "Verschiebung bestätigt", body: "Ihre Verschiebungsanfrage wurde bestätigt." },
    rescheduleDeclined: { title: "Verschiebung nicht angenommen", body: "Der Termin konnte nicht verschoben werden. Die ursprüngliche Zeit bleibt bestätigt." },
    apptBookedByClinic: { title: "Neuer Termin", body: "{clinic} hat für Sie einen Termin am {date} um {time} gebucht." },
    apptBookedSeriesByClinic: { title: "Neuer Termin", body: "{clinic} hat für Sie {n} Termine gebucht. Der erste ist am {date} um {time}." },

    apptCancelledByClinic: { title: "Termin abgesagt", body: "{clinic} hat Ihren Termin am {date} um {time} abgesagt. Für einen neuen Termin öffnen Sie die App." },

    apptMovedByClinic: { title: "Termin verschoben", body: "{clinic} hat Ihren Termin vom {oldDate} um {oldTime} auf den {date} um {time} verschoben." },
    note: "Hinweis: {note}",
  },
  it: {
    newBookingRequest: { title: "Nuova richiesta di appuntamento", body: "{name} ha chiesto un appuntamento per il {when}." },
    apptConfirmed: { title: "Appuntamento confermato", body: "Il tuo appuntamento è stato confermato." },
    bookingNotAvailable: { title: "Richiesta non accettata", body: "Non è stato possibile accettare la tua richiesta di appuntamento." },
    newTimeProposed: { title: "Nuovo orario proposto", body: "È stato proposto un nuovo orario: {when}." },
    proposalAccepted: { title: "Proposta accettata", body: "{name} ha accettato il nuovo orario: {when}." },
    proposalDeclined: { title: "Proposta rifiutata", body: "{name} ha rifiutato l’orario proposto. La richiesta è stata annullata." },
    rescheduleRequested: { title: "Richiesta di spostamento", body: "{name} ha chiesto di spostare a {when}." },
    rescheduleConfirmed: { title: "Spostamento confermato", body: "Il tuo appuntamento è stato spostato a {when}." },
    rescheduleConfirmedNoTime: { title: "Spostamento confermato", body: "La tua richiesta di spostamento è stata confermata." },
    rescheduleDeclined: { title: "Spostamento non accettato", body: "Non è stato possibile spostare l’appuntamento. L’orario originale resta confermato." },
    apptBookedByClinic: { title: "Nuovo appuntamento", body: "{clinic} ha prenotato un appuntamento per te il {date} alle {time}." },
    apptBookedSeriesByClinic: { title: "Nuovo appuntamento", body: "{clinic} ha prenotato {n} appuntamenti per te. Il primo è il {date} alle {time}." },

    apptCancelledByClinic: { title: "Appuntamento annullato", body: "{clinic} ha annullato il tuo appuntamento del {date} alle {time}. Per prenotarne un altro, apri l'app." },

    apptMovedByClinic: { title: "Appuntamento spostato", body: "{clinic} ha spostato il tuo appuntamento dal {oldDate} alle {oldTime} al {date} alle {time}." },
    note: "Nota: {note}",
  },
  th: {
    newBookingRequest: { title: "คำขอนัดหมายใหม่", body: "{name} ขอนัดหมายวันที่ {when}" },
    apptConfirmed: { title: "ยืนยันนัดหมายแล้ว", body: "นัดหมายของคุณได้รับการยืนยันแล้ว" },
    bookingNotAvailable: { title: "ไม่สามารถรับคำขอได้", body: "ไม่สามารถรับคำขอนัดหมายของคุณได้" },
    newTimeProposed: { title: "เสนอเวลาใหม่", body: "มีการเสนอเวลาใหม่: {when}" },
    proposalAccepted: { title: "ยอมรับข้อเสนอแล้ว", body: "{name} ยอมรับเวลาใหม่: {when}" },
    proposalDeclined: { title: "ปฏิเสธข้อเสนอ", body: "{name} ปฏิเสธเวลาที่เสนอ คำขอถูกยกเลิกแล้ว" },
    rescheduleRequested: { title: "ขอเลื่อนนัด", body: "{name} ขอเลื่อนนัดเป็น {when}" },
    rescheduleConfirmed: { title: "ยืนยันการเลื่อนนัดแล้ว", body: "นัดหมายของคุณถูกเลื่อนเป็น {when}" },
    rescheduleConfirmedNoTime: { title: "ยืนยันการเลื่อนนัดแล้ว", body: "คำขอเลื่อนนัดของคุณได้รับการยืนยันแล้ว" },
    rescheduleDeclined: { title: "ไม่สามารถเลื่อนนัดได้", body: "ไม่สามารถเลื่อนนัดได้ เวลาเดิมยังคงได้รับการยืนยัน" },
    apptBookedByClinic: { title: "นัดหมายใหม่", body: "{clinic} ได้นัดหมายให้คุณในวันที่ {date} เวลา {time}" },
    apptBookedSeriesByClinic: { title: "นัดหมายใหม่", body: "{clinic} ได้นัดหมายให้คุณ {n} ครั้ง ครั้งแรกวันที่ {date} เวลา {time}" },

    apptCancelledByClinic: { title: "นัดหมายถูกยกเลิก", body: "นัดหมายของคุณวันที่ {date} เวลา {time} ถูกยกเลิกโดย {clinic} หากต้องการนัดใหม่ กรุณาเปิดแอป" },

    apptMovedByClinic: { title: "เลื่อนนัดหมาย", body: "{clinic} ได้เลื่อนนัดหมายของคุณจากวันที่ {oldDate} เวลา {oldTime} เป็นวันที่ {date} เวลา {time}" },
    note: "หมายเหตุ: {note}",
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
  params: { name?: string; when?: string; note?: string | null; clinic?: string; date?: string; time?: string; oldDate?: string; oldTime?: string; n?: number } = {},
): Text {
  const t = T[locale];
  // Replacer functions: names are user text, and "$&" in a replacement
  // string would be read as a pattern.
  const fill = (s: string) => s
    .replace("{name}", () => params.name ?? "").replace("{when}", () => params.when ?? "")
    .replace("{clinic}", () => params.clinic ?? "").replace("{date}", () => params.date ?? "").replace("{time}", () => params.time ?? "")
    .replace("{oldDate}", () => params.oldDate ?? "").replace("{oldTime}", () => params.oldTime ?? "")
    .replace("{n}", () => String(params.n ?? ""));
  const body = fill(t[kind].body);
  return {
    title: t[kind].title,
    body: params.note ? `${body} ${t.note.replace("{note}", () => params.note ?? "")}` : body,
  };
}
