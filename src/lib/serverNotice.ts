import * as Sentry from "@sentry/nextjs";

// Every push is sent by our server (migration 171, the push service; c6's
// security finding: clients never read anyone's push tokens). The website
// only says WHAT happened to WHICH appointment; the database checks the
// caller may announce it (staff for their practice, the patient for their
// own appointment), that the appointment is in that state and changed in
// the last 10 minutes, dedupes and rate-limits it, then the server writes
// the text in each reader's language, the dates in the practice's calendar,
// and sends it. A failure never blocks the action that caused it.

type Db = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null }> };

// To the patient, by the clinic (staff, acting for the practice).
export type RequestNoticeKind =
  | "confirmed" | "rejected" | "proposed" | "reschedule_declined" | "reschedule_accepted"
  | "request_cancelled_by_clinic" | "scheduled_by_doctor";
// To the clinic (the doctor + secretaries, minus 166's mutes), by the patient.
export type ClinicNoticeKind = "booking_requested" | "request_cancelled" | "proposal_accepted" | "proposal_declined" | "reschedule_requested";

async function queue(db: Db, fn: string, kind: string, appointmentId: string): Promise<void> {
  try {
    const { error } = await db.rpc(fn, { p_kind: kind, p_appointment_id: appointmentId });
    // The code only (not_allowed, outbox_not_live, too_many_notices, …), never ids.
    if (error) Sentry.captureMessage("server_notice_failed", { level: "warning", tags: { fn, kind, code: (error.message ?? "").slice(0, 40) } });
  } catch {
    Sentry.captureMessage("server_notice_failed", { level: "warning", tags: { fn, kind, code: "exception" } });
  }
}

export function queueRequestNotice(db: Db, kind: RequestNoticeKind, appointmentId: string): Promise<void> {
  return queue(db, "enqueue_request_notice", kind, appointmentId);
}

export function queueClinicNotice(db: Db, kind: ClinicNoticeKind, appointmentId: string): Promise<void> {
  return queue(db, "enqueue_clinic_notice", kind, appointmentId);
}
