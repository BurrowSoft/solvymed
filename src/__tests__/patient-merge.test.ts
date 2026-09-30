import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeChoices, mergeDiff, type MergeRow } from "@/lib/patientMerge";
import { mergeSupported, resetMergeProbe } from "@/lib/mergeProbe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mesclar pacientes on the website (133; the app's lib/patient-merge.ts and
// its tests' cases).

const row = (o: Partial<MergeRow>): MergeRow => ({
  id: "x", full_name: "", cpf: null, th_national_id: null, passport_number: null, birth_date: null, sex: null, phone: null,
  emergency_phone: null, email: null, rg: null, profession: null, convenio_type: null, photo_url: null, archived_at: null, booking_blocked: false, ...o,
});
const A = row({ id: "a", full_name: "Bia Souza", cpf: "529.982.247-25", email: "a@x.invalid" });
const B = row({ id: "b", full_name: "bia souza", email: "b@x.invalid", phone: "+5511955550133" });

describe("mergeDiff / mergeChoices (the app's cases)", () => {
  it("lists only the fields that differ (names compared ignoring case); counts the equal filled ones", () => {
    const d = mergeDiff(A, B);
    expect(d.differing).toEqual(["cpf", "phone", "email"]);
    expect(d.same).toBe(1);
  });
  it("sends only the fields picked from the removed record, and only when they differ", () => {
    expect(mergeChoices(A, B, { email: "merged", full_name: "merged", cpf: "kept" })).toEqual({ email: "merged", phone: "merged" });
  });
  it("an empty kept value takes the other one by default; a picked \"kept\" wins over that", () => {
    expect(mergeChoices(A, B, {})).toEqual({ phone: "merged" });
    expect(mergeChoices(A, B, { phone: "kept" })).toEqual({});
  });
});

describe("mergeSupported: Mesclar hidden until 133 is on the database", () => {
  beforeEach(() => resetMergeProbe());
  const db = (...replies: (() => Promise<unknown>)[]) => {
    let n = 0;
    return { rpc: vi.fn(() => replies[n++]()) } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
  };
  it("missing (PGRST202) → false; refusing the probe ids → true, cached", async () => {
    expect(await mergeSupported(db(async () => ({ error: { code: "PGRST202", message: "Could not find the function" } })))).toBe(false);
    resetMergeProbe();
    const d = db(async () => ({ error: { code: "P0001", message: "not_found" } }));
    expect(await mergeSupported(d)).toBe(true);
    expect(await mergeSupported(d)).toBe(true);
    expect(d.rpc).toHaveBeenCalledTimes(1);
  });
  it("a network failure (no code, or a throw) → false now, probed again next time", async () => {
    const d = db(async () => ({ error: { message: "fetch failed" } }), async () => { throw new Error("offline"); }, async () => ({ error: { code: "P0001", message: "not_found" } }));
    expect(await mergeSupported(d)).toBe(false);
    expect(await mergeSupported(d)).toBe(false);
    expect(await mergeSupported(d)).toBe(true);
  });
});

// The action (client choices re-validated; refusals mapped).
const h = vi.hoisted(() => ({ rpcs: [] as { fn: string; args: unknown }[], reply: { data: { kept_id: "a" } as unknown, error: null as unknown }, locked: false }));
vi.mock("@/lib/activeAccess", () => ({ isLockedOut: async () => h.locked, getActiveProfId: async () => (h.locked ? null : "doc-1"), isActiveProfessional: async () => !h.locked }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    rpc: async (fn: string, args: unknown) => { h.rpcs.push({ fn, args }); return h.reply; },
  }),
}));

describe("mergePatientsAction", async () => {
  const { mergePatientsAction } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/actions");
  const K = "0f3b9c2e-1111-4222-8333-444455556666", M = "1f3b9c2e-1111-4222-8333-444455556666";
  beforeEach(() => { h.rpcs = []; h.reply = { data: { kept_id: K }, error: null }; h.locked = false; });

  it("a locked-out practice (the paywall) merges nothing", async () => {
    h.locked = true;
    expect(await mergePatientsAction(K, M, { email: "merged" }, true)).toEqual({ ok: false, code: "not_allowed" });
    expect(h.rpcs).toEqual([]);
  });

  it("sends kept / merged / choices / the app confirmation; returns the kept id", async () => {
    expect(await mergePatientsAction(K, M, { email: "merged" }, true)).toEqual({ ok: true, keptId: K });
    expect(h.rpcs).toEqual([{ fn: "merge_patients", args: { p_kept_id: K, p_merged_id: M, p_choices: { email: "merged" }, p_app_account_confirmed: true } }]);
  });
  it("refuses unknown fields, values or ids before calling (client data)", async () => {
    for (const [k, m, c] of [[K, M, { password: "merged" }], [K, M, { email: "kept" }], [K, K, {}], ["x;drop", M, {}]] as const) {
      expect(await mergePatientsAction(k, m, c as Record<string, string>, false)).toEqual({ ok: false, code: "invalid" });
    }
    expect(h.rpcs).toEqual([]);
  });
  it("maps each refusal to its code; anything else is generic", async () => {
    for (const code of ["both_have_app_accounts", "app_account_confirmation_required", "kept_patient_archived", "merged_patient_deceased", "not_found"]) {
      h.reply = { data: null, error: { message: code } };
      expect(await mergePatientsAction(K, M, {}, false)).toEqual({ ok: false, code });
    }
    h.reply = { data: null, error: { message: "boom" } };
    expect(await mergePatientsAction(K, M, {}, false)).toEqual({ ok: false, code: "generic" });
  });
});

