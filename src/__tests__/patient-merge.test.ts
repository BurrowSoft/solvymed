import { beforeEach, describe, expect, it, vi } from "vitest";
import { distinguishingMarks, mergeChoices, mergeDiff, recordMarks, swapPicks, type MergeRow } from "@/lib/patientMerge";
import { mergeSupported, resetMergeProbe } from "@/lib/mergeProbe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mesclar pacientes on the website (133; the app's lib/patient-merge.ts and
// its tests' cases).

const row = (o: Partial<MergeRow>): MergeRow => ({
  id: "x", full_name: "", cpf: null, th_national_id: null, passport_number: null, birth_date: null, sex: null, phone: null,
  emergency_phone: null, email: null, rg: null, profession: null, convenio_type: null, photo_url: null, archived_at: null, booking_blocked: false,
  created_at: null, import_id: null, ...o,
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

describe("swapPicks / recordMarks / distinguishingMarks (the app's #181)", () => {
  it("swapping the record that stays keeps each chosen value chosen; 'both' stays", () => {
    expect(swapPicks({ email: "merged", phone: "kept", notes_admin: "both" })).toEqual({ email: "kept", phone: "merged", notes_admin: "both" });
    // The value follows: B's email picked while A stays = B's email once B stays.
    expect(mergeChoices(B, A, swapPicks({ email: "merged" }))).not.toHaveProperty("email");
  });

  it("marks: birth date, the phone's last 4 digits, then imported or added (the local day)", () => {
    const local = new Date(2026, 8, 20, 23, 30).toISOString();
    expect(recordMarks(row({ birth_date: "1980-03-12", phone: "+55 (11) 95555-0133", created_at: local }))).toEqual([
      { kind: "birth", date: "1980-03-12" }, { kind: "phone", last4: "0133" }, { kind: "created", date: "2026-09-20" },
    ]);
    expect(recordMarks(row({ phone: "123", created_at: local, import_id: "imp-1" }))).toEqual([{ kind: "imported", date: "2026-09-20" }]);
    expect(recordMarks(row({}))).toEqual([]);
  });

  it("same names: the first differing mark names each record; else the added date; different names: none", () => {
    const d1 = new Date(2026, 0, 5, 10).toISOString(), d2 = new Date(2026, 5, 7, 10).toISOString();
    const a = row({ full_name: "Maria Silva", birth_date: "1980-03-12", phone: "11 90000-1111", created_at: d1 });
    const b = row({ full_name: "maria silva ", birth_date: "1980-03-12", phone: "11 90000-2222", created_at: d2 });
    expect(distinguishingMarks(a, b)).toEqual([{ kind: "phone", last4: "1111" }, { kind: "phone", last4: "2222" }]);
    // Imported vs added the same day still tells them apart.
    const c = row({ full_name: "Maria Silva", created_at: d1, import_id: "imp" });
    const e = row({ full_name: "Maria Silva", created_at: d1 });
    expect(distinguishingMarks(c, e)).toEqual([{ kind: "imported", date: "2026-01-05" }, { kind: "created", date: "2026-01-05" }]);
    // Nothing differs: the added dates.
    expect(distinguishingMarks(row({ full_name: "Ana", created_at: d1 }), row({ full_name: "Ana", created_at: d1 }))).toEqual([{ kind: "created", date: "2026-01-05" }, { kind: "created", date: "2026-01-05" }]);
    expect(distinguishingMarks(a, row({ full_name: "Maria Souza", birth_date: "1990-01-01" }))).toBeNull();
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
const h = vi.hoisted(() => ({ rpcs: [] as { fn: string; args: unknown }[], reply: { data: { kept_id: "a" } as unknown, error: null as unknown } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    rpc: async (fn: string, args: unknown) => { h.rpcs.push({ fn, args }); return h.reply; },
  }),
}));

describe("mergePatientsAction", async () => {
  const { mergePatientsAction } = await import("@/app/[locale]/(site)/dashboard/patients/actions");
  const K = "0f3b9c2e-1111-4222-8333-444455556666", M = "1f3b9c2e-1111-4222-8333-444455556666";
  beforeEach(() => { h.rpcs = []; h.reply = { data: { kept_id: K }, error: null }; });

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

