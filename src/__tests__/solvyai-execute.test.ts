import { beforeEach, describe, expect, it, vi } from "vitest";

// SolvyAI's Confirmar / Desfazer on the website run the screens' own server
// actions, every field re-validated (the action is client data).

const h = vi.hoisted(() => {
  const calls: { fn: string; args: unknown[] }[] = [];
  const state: { row: Record<string, unknown> | null } = { row: null };
  const rec = (fn: string, result: unknown) => (...args: unknown[]) => { calls.push({ fn, args }); return Promise.resolve(result); };
  return { calls, state, rec };
});
const { calls } = h;

vi.mock("@/app/[locale]/(site)/dashboard/schedule/actions", () => ({
  createAppointment: (...a: unknown[]) => h.rec("createAppointment", { success: true, id: "new-appt" })(...a),
  blockTime: (...a: unknown[]) => h.rec("blockTime", { success: true, id: "new-block" })(...a),
  updateAppointmentStatus: (...a: unknown[]) => h.rec("updateAppointmentStatus", { success: true })(...a),
  deleteAppointment: (...a: unknown[]) => h.rec("deleteAppointment", { success: true })(...a),
}));
vi.mock("@/app/[locale]/(site)/dashboard/schedule/booking-actions", () => ({
  confirmBookingAndAddPatient: (...a: unknown[]) => h.rec("confirmBookingAndAddPatient", { error: null })(...a),
  rejectBooking: (...a: unknown[]) => h.rec("rejectBooking", { error: null })(...a),
}));
vi.mock("@/app/[locale]/(site)/dashboard/patients/actions", () => ({
  createPatient: (...a: unknown[]) => h.rec("createPatient", { success: true, id: "new-patient" })(...a),
  deletePatient: (...a: unknown[]) => h.rec("deletePatient", { success: true })(...a),
}));
vi.mock("@/app/[locale]/(site)/dashboard/payments/actions", () => ({ markPaid: h.rec("markPaid", { success: true }), markUnpaid: h.rec("markUnpaid", { success: true }) }));
vi.mock("@/lib/effectiveProfId", () => ({ getEffectiveProfId: async () => "doc-1" }));
vi.mock("@/lib/practiceCountry", () => ({ lookupPracticeCountry: async () => ({ ok: true, country: "TH" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: h.state.row, error: null }) };
    return { auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) }, from: () => q };
  },
}));

import { executeSolvyAiAction, undoSolvyAiAction } from "@/app/[locale]/(site)/dashboard/solvyai-actions";

const ID = "0f3b9c2e-1111-4222-8333-444455556666";
beforeEach(() => { calls.length = 0; h.state.row = null; });

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

  it("move and send Pix aren't run on the website (app-only for now)", async () => {
    expect(await executeSolvyAiAction({ kind: "move_appointment", args: { appointmentId: ID, date: "2026-10-02", start: "10:00" } }, false)).toEqual({ ok: false, code: "generic" });
    expect(await executeSolvyAiAction({ kind: "send_pix", args: { appointmentId: ID } }, false)).toEqual({ ok: false, code: "generic" });
    expect(calls).toEqual([]);
  });
});
