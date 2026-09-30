import { beforeEach, describe, expect, it, vi } from "vitest";

// SolvyAI's Confirmar / Desfazer on the website run the screens' own server
// actions, every field re-validated (the action is client data).

const h = vi.hoisted(() => {
  const calls: { fn: string; args: unknown[] }[] = [];
  // authId: the patient's SolvyMed account (get_patient_auth_id); null = none.
  const state: { row: Record<string, unknown> | null; authId: string | null; rpcError: unknown; apptCount: number | null; countError: unknown; preview: unknown; previewError: unknown } =
    { row: null, authId: null, rpcError: null, apptCount: 0, countError: null, preview: { has_clinical_history: false, upcoming_appointments: 0 }, previewError: null };
  const rec = (fn: string, result: unknown) => (...args: unknown[]) => { calls.push({ fn, args }); return Promise.resolve(result); };
  return { calls, state, rec };
});
const { calls } = h;

vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/actions", () => ({
  createAppointment: (...a: unknown[]) => h.rec("createAppointment", { success: true, id: "new-appt" })(...a),
  blockTime: (...a: unknown[]) => h.rec("blockTime", { success: true, id: "new-block" })(...a),
  updateAppointmentStatus: (...a: unknown[]) => h.rec("updateAppointmentStatus", { success: true })(...a),
  deleteAppointment: (...a: unknown[]) => h.rec("deleteAppointment", { success: true })(...a),
  moveAppointment: (...a: unknown[]) => h.rec("moveAppointment", { success: true, id: "moved" })(...a),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions", () => ({
  confirmBookingAndAddPatient: (...a: unknown[]) => h.rec("confirmBookingAndAddPatient", { error: null })(...a),
  rejectBooking: (...a: unknown[]) => h.rec("rejectBooking", { error: null })(...a),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => ({
  createPatient: (...a: unknown[]) => h.rec("createPatient", { success: true, id: "new-patient" })(...a),
  deletePatient: (...a: unknown[]) => h.rec("deletePatient", { success: true })(...a),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/payments/actions", () => ({ markPaid: h.rec("markPaid", { success: true }), markUnpaid: h.rec("markUnpaid", { success: true }) }));
vi.mock("@/lib/effectiveProfId", () => ({ getEffectiveProfId: async () => "doc-1" }));
vi.mock("@/lib/practiceCountry", () => ({ lookupPracticeCountry: async () => ({ ok: true, country: "TH" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const q: Record<string, unknown> = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: h.state.row, error: null }) };
    // A head count (the add_patient undo's "any appointment?").
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ count: h.state.apptCount, error: h.state.countError }).then(res);
    return {
      auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
      from: () => q,
      rpc: async (fn: string, args: unknown) => {
        if (fn === "get_patient_archive_preview") return { data: h.state.preview, error: h.state.previewError };
        h.calls.push({ fn, args: [args] }); return { data: h.state.authId, error: h.state.rpcError };
      },
    };
  },
}));

import { executeSolvyAiAction, undoSolvyAiAction } from "@/app/[locale]/(site)/dashboard/solvyai-actions";

const ID = "0f3b9c2e-1111-4222-8333-444455556666";
beforeEach(() => {
  calls.length = 0; h.state.row = null; h.state.authId = null; h.state.rpcError = null;
  h.state.apptCount = 0; h.state.countError = null; h.state.preview = { has_clinical_history: false, upcoming_appointments: 0 }; h.state.previewError = null;
});

describe("Desfazer only when nothing reached the patient (UX 36)", () => {
  const P = "9a9b9c9d-1111-4222-8333-444455556666";
  const appt = { status: "scheduled", date: "2026-10-05", start_time: "09:00:00", end_time: "09:30:00", patient_name: "M", payment_status: "pending", patient_id: P };
  const book = { kind: "book_appointment", args: { patientId: P, date: "2026-10-05", start: "09:00", durationMin: 30 } } as const;

  it("a patient without a SolvyMed account: book / move / cancel keep Desfazer", async () => {
    expect(await executeSolvyAiAction(book, false)).toEqual({ ok: true, id: "new-appt" });
    h.state.row = appt;
    expect(await executeSolvyAiAction({ kind: "cancel_appointment", args: { appointmentId: ID } }, false)).toEqual({ ok: true, id: ID, prev: "scheduled" });
    // Only a live appointment (the app's executor, #141).
    for (const status of ["completed", "absent", "cancelled", "tentative"]) {
      h.state.row = { ...appt, status };
      expect(await executeSolvyAiAction({ kind: "cancel_appointment", args: { appointmentId: ID } }, false)).toEqual({ ok: false, code: "appointment_not_cancellable" });
    }
    h.state.row = appt;
    expect(await executeSolvyAiAction({ kind: "move_appointment", args: { appointmentId: ID, date: "2026-10-06", start: "10:00" } }, false)).toMatchObject({ ok: true, id: ID, prev: expect.any(String) });
    expect(calls.filter((c) => c.fn === "get_patient_auth_id").map((c) => c.args[0])).toEqual([{ p_patient_id: P }, { p_patient_id: P }, { p_patient_id: P }]);
  });

  it("a patient with an account (app push or LINE): no Desfazer, and nothing to restore", async () => {
    h.state.authId = "user-9";
    expect(await executeSolvyAiAction(book, false)).toEqual({ ok: true, id: "new-appt", noUndo: true });
    h.state.row = appt;
    expect(await executeSolvyAiAction({ kind: "cancel_appointment", args: { appointmentId: ID } }, false)).toEqual({ ok: true, id: ID, noUndo: true });
    expect(await executeSolvyAiAction({ kind: "move_appointment", args: { appointmentId: ID, date: "2026-10-06", start: "10:00" } }, false)).toEqual({ ok: true, id: ID, noUndo: true });
  });

  it("unsure (the lookup failed) counts as told: no Desfazer", async () => {
    h.state.rpcError = { message: "boom" };
    expect(await executeSolvyAiAction(book, false)).toEqual({ ok: true, id: "new-appt", noUndo: true });
  });

  it("a payment keeps Desfazer whoever the patient is (nothing is sent)", async () => {
    h.state.authId = "user-9";
    h.state.row = appt;
    expect(await executeSolvyAiAction({ kind: "mark_paid", args: { appointmentId: ID, paid: true } }, false)).toEqual({ ok: true, id: ID, prev: "pending" });
  });
});

describe("Confirmar (part 2)", () => {
  it("unblock: only a block; Desfazer re-creates it as it was", async () => {
    h.state.row = { status: "blocked", date: "2026-10-02", start_time: "12:00:00", end_time: "13:30:00", patient_name: "Almoço", payment_status: null };
    const r = await executeSolvyAiAction({ kind: "unblock_time", args: { blockId: ID } }, false);
    expect(r).toMatchObject({ ok: true, id: ID });
    expect(calls.map((c) => c.fn)).toEqual(["deleteAppointment"]);
    calls.length = 0;
    await undoSolvyAiAction({ kind: "unblock_time", args: { blockId: ID } }, ID, (r as { prev?: string }).prev);
    const f = calls[0].args[0] as FormData;
    expect([calls[0].fn, f.get("date"), f.get("start_time"), f.get("duration_minutes"), f.get("reason")]).toEqual(["blockTime", "2026-10-02", "12:00", "90", "Almoço"]);
    // An appointment is never deleted this way.
    h.state.row = { status: "scheduled", date: "2026-10-02", start_time: "12:00:00", end_time: "13:00:00", patient_name: "X", payment_status: null };
    calls.length = 0;
    expect(await executeSolvyAiAction({ kind: "unblock_time", args: { blockId: ID } }, false)).toEqual({ ok: false, code: "generic" });
    expect(calls).toEqual([]);
  });

  it("booking decision: still a request; a proposal can only be declined; no Desfazer", async () => {
    h.state.row = { status: "tentative", date: "2026-10-01", start_time: "09:00:00", end_time: "09:30:00", patient_name: "M", payment_status: null };
    expect(await executeSolvyAiAction({ kind: "booking_decision", args: { appointmentId: ID, decision: "confirm", note: " Traga os exames " } }, false))
      .toEqual({ ok: true, id: ID, noUndo: true });
    expect(calls[0]).toEqual({ fn: "confirmBookingAndAddPatient", args: [ID, "Traga os exames"] });
    h.state.row = { ...h.state.row, status: "proposal" };
    calls.length = 0;
    expect(await executeSolvyAiAction({ kind: "booking_decision", args: { appointmentId: ID, decision: "confirm" } }, false)).toEqual({ ok: false, code: "generic" });
    expect(await executeSolvyAiAction({ kind: "booking_decision", args: { appointmentId: ID, decision: "reject" } }, false)).toMatchObject({ ok: true });
    h.state.row = { ...h.state.row, status: "scheduled" };
    expect(await executeSolvyAiAction({ kind: "booking_decision", args: { appointmentId: ID, decision: "reject" } }, false)).toEqual({ ok: false, code: "generic" });
    expect(calls.map((c) => c.fn)).toEqual(["rejectBooking"]);
  });

  it("add patient: the form's fields for the practice's country; create-anyway only when the card said so; Desfazer deletes it", async () => {
    const r = await executeSolvyAiAction({ kind: "add_patient", args: { fullName: " Ana  Nova ", birthDate: "1990-02-03", phone: "081 234 5678" } }, false);
    // (A phone in the action is ignored: SolvyAI never saves contact details.)
    expect(r).toEqual({ ok: true, id: "new-patient" });
    const f = calls[0].args[0] as FormData;
    expect(Object.fromEntries(f.entries())).toEqual({ full_name: "Ana Nova", id_kind: "TH", birth_date: "1990-02-03" });
    calls.length = 0;
    await executeSolvyAiAction({ kind: "add_patient", args: { fullName: "Maria Silva", createAnyway: true } }, false);
    expect((calls[0].args[0] as FormData).get("force")).toBe("1");
    expect(await executeSolvyAiAction({ kind: "add_patient", args: { fullName: "X", birthDate: "03/02/1990" } }, false)).toEqual({ ok: false, code: "generic" });
    // A mask placeholder anywhere: nothing saved.
    calls.length = 0;
    expect(await executeSolvyAiAction({ kind: "add_patient", args: { fullName: "[phone]" } }, false)).toEqual({ ok: false, code: "generic" });
    expect(await executeSolvyAiAction({ kind: "add_patient", args: { fullName: "Ana", email: "[email]" } }, false)).toEqual({ ok: false, code: "generic" });
    expect(calls).toEqual([]);
    calls.length = 0;
    await undoSolvyAiAction({ kind: "add_patient", args: {} }, ID);
    expect(calls).toEqual([{ fn: "deletePatient", args: [ID] }]);
  });

  it("Desfazer of a new patient deletes it only while nothing uses it; a failed check refuses (app parity)", async () => {
    const undo = () => undoSolvyAiAction({ kind: "add_patient", args: {} }, ID);
    expect(await undo()).toEqual({ ok: true, id: ID });
    // An appointment booked meanwhile (another tab, the next card).
    calls.length = 0; h.state.apptCount = 1;
    expect(await undo()).toEqual({ ok: false, code: "generic" });
    expect(calls).toEqual([]);
    // Clinical history.
    h.state.apptCount = 0; h.state.preview = { has_clinical_history: true, upcoming_appointments: 0 };
    expect(await undo()).toEqual({ ok: false, code: "generic" });
    // Either check failing counts as in use.
    h.state.preview = { has_clinical_history: false, upcoming_appointments: 0 }; h.state.countError = { message: "boom" };
    expect(await undo()).toEqual({ ok: false, code: "generic" });
    h.state.countError = null; h.state.apptCount = null;
    expect(await undo()).toEqual({ ok: false, code: "generic" });
    h.state.apptCount = 0; h.state.previewError = { message: "boom" };
    expect(await undo()).toEqual({ ok: false, code: "generic" });
    h.state.previewError = null; h.state.preview = null;
    expect(await undo()).toEqual({ ok: false, code: "generic" });
    expect(calls).toEqual([]);
  });

  it("move: runs Remarcar (the second question's answer carried), only while movable; Desfazer moves it back", async () => {
    h.state.row = { status: "confirmed", date: "2026-10-01", start_time: "09:00:00", end_time: "09:30:00", patient_name: "M", payment_status: null };
    const move = { kind: "move_appointment" as const, args: { appointmentId: ID, date: "2026-10-02", start: "10:00", durationMin: 30 } };
    const r = await executeSolvyAiAction(move, true);
    expect(r).toMatchObject({ ok: true, id: ID });
    expect(Object.fromEntries((calls[0].args[0] as FormData).entries())).toEqual({ id: ID, date: "2026-10-02", start_time: "10:00", confirm_warnings: "1" });
    calls.length = 0;
    await undoSolvyAiAction(move, ID, (r as { prev?: string }).prev);
    expect(Object.fromEntries((calls[0].args[0] as FormData).entries())).toEqual({ id: ID, date: "2026-10-01", start_time: "09:00", confirm_warnings: "1" });
    // A no-show isn't moved.
    h.state.row = { ...h.state.row, status: "absent" };
    calls.length = 0;
    expect(await executeSolvyAiAction(move, false)).toEqual({ ok: false, code: "generic" });
    expect(calls).toEqual([]);
  });

  it("a series: the website's recurrence fields, re-validated; no Desfazer", async () => {
    const ok = await executeSolvyAiAction({ kind: "book_appointment", args: { patientId: ID, date: "2026-10-07", start: "14:00", durationMin: 30, repeat: { every: "2weeks", count: 4 } } }, false);
    expect(ok).toEqual({ ok: true, id: "new-appt", noUndo: true });
    const f = calls[0].args[0] as FormData;
    expect([f.get("recurrence"), f.get("occurrences")]).toEqual(["biweekly", "4"]);
    calls.length = 0;
    expect(await executeSolvyAiAction({ kind: "book_appointment", args: { patientId: ID, date: "2026-10-07", start: "14:00", repeat: { every: "day", count: 4 } } }, false)).toEqual({ ok: false, code: "generic" });
    expect(calls).toEqual([]);
  });

  it("send Pix isn't run on the website (app-only)", async () => {
    expect(await executeSolvyAiAction({ kind: "send_pix", args: { appointmentId: ID } }, false)).toEqual({ ok: false, code: "generic" });
    expect(calls).toEqual([]);
  });
});
