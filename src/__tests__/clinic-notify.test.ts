import { beforeEach, describe, expect, it } from "vitest";
import { patientFacingClinicName, tellPatient } from "@/lib/clinicNotify";
import type { SupabaseClient } from "@supabase/supabase-js";

// The website tells a patient what the clinic did (booked / moved /
// cancelled) ONLY through the server's notice outbox (135; sent by the
// server, 171): it never reads push tokens or sends a push itself (c6's
// security finding). The texts, the language, the practice's calendar, the
// "never the past / blocked / no account" rules are the server's (mobile
// patient-notify's tests).

const future = { practiceId: "doc-1", date: "2026-09-30", startTime: "14:00:00" };

const outboxDb = (reply: () => { data: unknown; error: { code?: string; message?: string } | null }) => {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return fn === "enqueue_patient_notice" ? reply() : { data: null, error: null };
    },
    from: () => { throw new Error("no table reads"); },
  } as unknown as SupabaseClient;
  return { client, calls };
};

describe("the clinic's patient-facing name", () => {
  it("profile → first location → doctor → SolvyMed", () => {
    expect(patientFacingClinicName("  ", "Unidade Centro", "Dra. Ana")).toBe("Unidade Centro");
    expect(patientFacingClinicName(null, null, "Dra. Ana")).toBe("Dra. Ana");
    expect(patientFacingClinicName(null, null, null)).toBe("SolvyMed");
  });
});

describe("tellPatient: the notice outbox only", async () => {
  const { resetNoticeOutboxProbe } = await import("@/lib/patientNotice");
  beforeEach(() => resetNoticeOutboxProbe());

  it("queued: the ids (a series in one call; a move with where it was)", async () => {
    const d = outboxDb(() => ({ data: 42, error: null }));
    expect(await tellPatient(d.client, { kind: "booked", patientId: "p-1", ...future, appointmentIds: ["a1", "a2"] })).toBe(42);
    expect(await tellPatient(d.client, { kind: "moved", patientId: "p-1", ...future, from: { date: "2026-09-29", startTime: "09:00:00" }, appointmentIds: ["a1"] })).toBe(42);
    expect(d.calls.map((c) => c.args)).toEqual([
      { p_kind: "booked", p_appointment_ids: ["a1", "a2"], p_from_date: null, p_from_time: null },
      { p_kind: "moved", p_appointment_ids: ["a1"], p_from_date: "2026-09-29", p_from_time: "09:00" },
    ]);
    // null: nobody to tell (the server's own rules).
    const none = outboxDb(() => ({ data: null, error: null }));
    expect(await tellPatient(none.client, { kind: "cancelled", patientId: "p-1", ...future, appointmentIds: ["a1"] })).toBeNull();
  });

  it("a lost response once the outbox works: asked once more", async () => {
    let n = 0;
    const d = outboxDb(() => (++n === 2 ? { data: null, error: { message: "fetch failed" } } : { data: 7, error: null }));
    expect(await tellPatient(d.client, { kind: "booked", patientId: "p-1", ...future, appointmentIds: ["a1"] })).toBe(7);
    expect(await tellPatient(d.client, { kind: "booked", patientId: "p-1", ...future, appointmentIds: ["a1"] })).toBe(7);
    expect(d.calls.filter((c) => c.fn === "enqueue_patient_notice").length).toBe(3);
  });

  it("not live / an older database / no ids: nobody is told, and nothing is read or sent from here", async () => {
    for (const error of [{ code: "55000", message: "outbox_not_live" }, { code: "PGRST202", message: "Could not find the function" }]) {
      resetNoticeOutboxProbe();
      const d = outboxDb(() => ({ data: null, error }));
      expect(await tellPatient(d.client, { kind: "booked", patientId: "p-1", ...future, appointmentIds: ["a1"] })).toBeNull();
      expect(d.calls.every((c) => c.fn === "enqueue_patient_notice")).toBe(true);
    }
    const d = outboxDb(() => ({ data: 1, error: null }));
    expect(await tellPatient(d.client, { kind: "booked", patientId: "p-1", ...future })).toBeNull();
    expect(d.calls).toEqual([]);
  });

  it("never throws", async () => {
    const broken = { rpc: async () => { throw new Error("y"); } } as unknown as SupabaseClient;
    await expect(tellPatient(broken, { kind: "booked", patientId: "p-1", ...future, appointmentIds: ["a1"] })).resolves.toBeNull();
  });
});
