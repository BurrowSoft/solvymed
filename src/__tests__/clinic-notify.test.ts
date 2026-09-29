import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { tokens: string[]; title: string; body: string }[] = [];
vi.mock("@/lib/push", () => ({ sendExpoPush: async (tokens: string[], title: string, body: string) => { sent.push({ tokens, title, body }); } }));

import { patientFacingClinicName, tellPatient } from "@/lib/clinicNotify";
import type { SupabaseClient } from "@supabase/supabase-js";

// The website tells a patient what the clinic did (08's texts, the app's
// #111): booked / cancelled, only with an app account, in their language,
// the clinic named as patients see it; never blocked time or the past.

// Tuesday 2026-09-29, 10:00 in São Paulo.
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-29T13:00:00Z")); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => { sent.length = 0; });

type Opts = { profRow?: Record<string, unknown> | null; clinics?: { name: string }[]; locale?: string | null; authId?: string | null; tokens?: string[]; publicName?: string };
function db(o: Opts = {}) {
  const rpcCalls: string[] = [];
  const table = (name: string) => {
    const result = () => {
      if (name === "professionals") return o.profRow === undefined ? { time_zone: "America/Sao_Paulo", clinic_name: "Clínica Sol", full_name: "Dra. Ana" } : o.profRow;
      if (name === "patient_profiles") return o.locale === undefined ? { locale: "pt-BR" } : o.locale === null ? null : { locale: o.locale };
      return null;
    };
    const q = {
      select: () => q, eq: () => q, order: () => q,
      limit: async () => ({ data: name === "clinics" ? o.clinics ?? [] : [], error: null }),
      maybeSingle: async () => ({ data: result(), error: null }),
    };
    return q;
  };
  return {
    rpcCalls,
    client: {
      from: table,
      rpc: async (fn: string) => {
        rpcCalls.push(fn);
        if (fn === "get_patient_auth_id") return { data: o.authId === undefined ? "auth-1" : o.authId, error: null };
        if (fn === "get_patient_push_tokens") return { data: (o.tokens ?? ["tok"]).map((token) => ({ token })), error: null };
        if (fn === "get_professional_public_info") return { data: [{ clinic_name: o.publicName ?? "Clínica Pública", full_name: "Dr. Público", country: "BR" }], error: null };
        return { data: null, error: null };
      },
    } as unknown as SupabaseClient,
  };
}

const future = { practiceId: "doc-1", date: "2026-09-30", startTime: "14:00:00" };

describe("tellPatient", () => {
  it("booked: 08's text, the clinic's profile name, the date in the reader's format", async () => {
    await tellPatient(db().client, { kind: "booked", patientId: "p-1", ...future });
    expect(sent).toEqual([{ tokens: ["tok"], title: "Nova consulta", body: "Clínica Sol marcou uma consulta para você em 30/09/2026 às 14:00." }]);
  });

  it("cancelled, in the patient's saved language; the appointment's own account first", async () => {
    const d = db({ locale: "en" });
    await tellPatient(d.client, { kind: "cancelled", patientAuthId: "auth-9", patientId: "p-1", status: "scheduled", ...future });
    expect(sent[0].body).toBe("Clínica Sol cancelled your appointment on 09/30/2026 at 14:00. To book another, open the app.");
    expect(d.rpcCalls).not.toContain("get_patient_auth_id");
  });

  it("never for the past (the clinic's clock), blocked time, no app account, or no device", async () => {
    await tellPatient(db().client, { kind: "cancelled", patientId: "p-1", practiceId: "doc-1", date: "2026-09-29", startTime: "09:30" });
    await tellPatient(db().client, { kind: "cancelled", patientId: "p-1", practiceId: "doc-1", date: "2026-09-28", startTime: "18:00" });
    await tellPatient(db().client, { kind: "cancelled", status: "blocked", patientId: "p-1", ...future });
    await tellPatient(db({ authId: null }).client, { kind: "booked", patientId: "p-1", ...future });
    await tellPatient(db({ tokens: [] }).client, { kind: "booked", patientId: "p-1", ...future });
    await tellPatient(db().client, { kind: "booked", patientId: null, ...future });
    expect(sent).toEqual([]);
    // Later today is still ahead.
    await tellPatient(db().client, { kind: "booked", patientId: "p-1", practiceId: "doc-1", date: "2026-09-29", startTime: "10:30" });
    expect(sent).toHaveLength(1);
  });

  it("the clinic's name: profile → first location → doctor (a secretary: the practice public info, 110s rule)", async () => {
    expect(patientFacingClinicName("  ", "Unidade Centro", "Dra. Ana")).toBe("Unidade Centro");
    expect(patientFacingClinicName(null, null, "Dra. Ana")).toBe("Dra. Ana");
    expect(patientFacingClinicName(null, null, null)).toBe("SolvyMed");
    await tellPatient(db({ profRow: { clinic_name: null, full_name: "Dra. Ana" }, clinics: [{ name: "Unidade Centro" }] }).client, { kind: "booked", patientId: "p-1", ...future });
    await tellPatient(db({ profRow: null, clinics: [] }).client, { kind: "booked", patientId: "p-1", isSecretary: true, ...future });
    expect(sent.map((s) => s.body.split(" marcou")[0])).toEqual(["Unidade Centro", "Clínica Pública"]);
    // A secretary, a practice with a profile name and two locations: the profile name (the RPC applies the rule).
    await tellPatient(db({ profRow: null, clinics: [{ name: "A Unidade" }, { name: "B Unidade" }], publicName: "Clínica Sol" }).client, { kind: "booked", patientId: "p-1", isSecretary: true, ...future });
    expect(sent[2].body.split(" marcou")[0]).toBe("Clínica Sol");
    sent.splice(2, 1);
    // The practice has no clinic name at all: the doctor, from the public info.
    await tellPatient(db({ profRow: null, clinics: [], publicName: "" }).client, { kind: "booked", patientId: "p-1", isSecretary: true, ...future });
    expect(sent[2].body.split(" marcou")[0]).toBe("Dr. Público");
  });

  it("a series: only its FUTURE dates are announced, one push naming the first (UX 36)", async () => {
    // Weekly from last week at 14:00: 22/09 is past; 29/09 14:00 and 06/10 are ahead (now: 29/09 10:00).
    await tellPatient(db().client, { kind: "booked", patientId: "p-1", practiceId: "doc-1", date: "2026-09-22", startTime: "14:00", dates: ["2026-09-22", "2026-09-29", "2026-10-06"] });
    expect(sent[0].body).toBe("Clínica Sol marcou 2 consultas para você. A primeira é em 29/09/2026 às 14:00.");
    // At 09:30 today is past too: one future date → the single-booking text.
    await tellPatient(db().client, { kind: "booked", patientId: "p-1", practiceId: "doc-1", date: "2026-09-22", startTime: "09:30", dates: ["2026-09-22", "2026-09-29", "2026-10-06"] });
    expect(sent[1].body).toBe("Clínica Sol marcou uma consulta para você em 06/10/2026 às 09:30.");
    // All past: no push.
    await tellPatient(db().client, { kind: "booked", patientId: "p-1", practiceId: "doc-1", date: "2026-09-08", startTime: "14:00", dates: ["2026-09-08", "2026-09-15", "2026-09-22"] });
    expect(sent).toHaveLength(2);
  });

  it("never throws: a failing read is swallowed", async () => {
    const broken = { from: () => { throw new Error("x"); }, rpc: async () => { throw new Error("y"); } } as unknown as SupabaseClient;
    await expect(tellPatient(broken, { kind: "booked", patientId: "p-1", ...future })).resolves.toEqual({ queued: false });
  });
});

describe("the notice outbox (135)", async () => {
  const { resetNoticeOutboxProbe } = await import("@/lib/patientNotice");
  beforeEach(() => resetNoticeOutboxProbe());
  const outboxDb = (reply: () => { data: unknown; error: { code?: string; message?: string } | null }) => {
    const d = db();
    const calls: { fn: string; args: unknown }[] = [];
    const base = d.client.rpc.bind(d.client) as unknown as (fn: string) => Promise<unknown>;
    (d.client as unknown as { rpc: unknown }).rpc = async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return fn === "enqueue_patient_notice" ? reply() : base(fn);
    };
    return { client: d.client, calls };
  };

  it("queued: the ids (a series in one call; a move with where it was); nothing pushed from here", async () => {
    const d = outboxDb(() => ({ data: 42, error: null }));
    expect(await tellPatient(d.client, { kind: "booked", patientId: "p-1", ...future, appointmentIds: ["a1", "a2"] })).toEqual({ queued: true, noticeId: 42 });
    expect(await tellPatient(d.client, { kind: "moved", patientId: "p-1", ...future, from: { date: "2026-09-29", startTime: "09:00:00" }, appointmentIds: ["a1"] })).toEqual({ queued: true, noticeId: 42 });
    expect(d.calls.map((c) => c.args)).toEqual([
      { p_kind: "booked", p_appointment_ids: ["a1", "a2"], p_from_date: null, p_from_time: null },
      { p_kind: "moved", p_appointment_ids: ["a1"], p_from_date: "2026-09-29", p_from_time: "09:00" },
    ]);
    expect(sent).toEqual([]);
    // null: nobody to tell (the server's own rules).
    const none = outboxDb(() => ({ data: null, error: null }));
    expect(await tellPatient(none.client, { kind: "cancelled", patientId: "p-1", ...future, appointmentIds: ["a1"] })).toEqual({ queued: true, noticeId: null });
    expect(sent).toEqual([]);
  });

  it("not live yet: sent directly as before, and asked again next time", async () => {
    const d = outboxDb(() => ({ data: null, error: { code: "55000", message: "outbox_not_live" } }));
    expect(await tellPatient(d.client, { kind: "booked", patientId: "p-1", ...future, appointmentIds: ["a1"] })).toEqual({ queued: false });
    await tellPatient(d.client, { kind: "booked", patientId: "p-1", ...future, appointmentIds: ["a1"] });
    expect(sent.length).toBe(2);
    expect(d.calls.filter((c) => c.fn === "enqueue_patient_notice").length).toBe(2);
  });

  it("an older database (no function): direct, and not asked again", async () => {
    const d = outboxDb(() => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }));
    await tellPatient(d.client, { kind: "booked", patientId: "p-1", ...future, appointmentIds: ["a1"] });
    await tellPatient(d.client, { kind: "booked", patientId: "p-1", ...future, appointmentIds: ["a1"] });
    expect(sent.length).toBe(2);
    expect(d.calls.filter((c) => c.fn === "enqueue_patient_notice").length).toBe(1);
  });
});
