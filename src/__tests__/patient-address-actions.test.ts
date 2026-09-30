import { beforeEach, describe, expect, it, vi } from "vitest";

// Migration 138 in updatePatient: the address, CNS and Observações are
// written only once patient-address-live is met AND the form showed them;
// a bad CNS is refused before saving, and the server's is mapped.

const h = vi.hoisted(() => ({ live: true, updates: [] as Record<string, unknown>[], error: null as unknown, country: "BR" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/effectiveProfId", () => ({ getEffectiveProfId: async () => "doc-1", isProfessionalRole: async () => true }));
vi.mock("@/lib/activeAccess", () => ({ getActiveProfId: async () => "doc-1", isActiveProfessional: async () => true, isLockedOut: async () => false }));
vi.mock("@/lib/practiceCountry", () => ({ lookupPracticeCountry: async () => ({ ok: true, country: h.country }) }));
vi.mock("@/lib/conditions", async (orig) => {
  const real = await orig<typeof import("@/lib/conditions")>();
  return { ...real, conditionMet: (id: Parameters<typeof real.conditionMet>[0]) => (id === "patient-address-live" ? h.live : real.conditionMet(id)) };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    from: () => ({
      update: (row: Record<string, unknown>) => {
        h.updates.push(row);
        const q = { eq: () => q, then: (res: (v: unknown) => unknown) => Promise.resolve({ error: h.error }).then(res) };
        return q;
      },
    }),
  }),
}));

import { updatePatient } from "@/app/[locale]/(site)/dashboard/(gated)/patients/actions";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ full_name: "Ana", id_kind: h.country === "TH" ? "TH" : "BR", ...o })) f.set(k, v);
  return f;
};

beforeEach(() => { h.live = true; h.updates = []; h.error = null; h.country = "BR"; });

describe("updatePatient × 138", () => {
  it("writes the section when shown and live", async () => {
    expect(await updatePatient("p1", form({ address_fields: "1", address_city: " Santos ", cns: "700 0000 0000 0005", notes_admin: "Prefere manhã" }))).toEqual({ success: true });
    expect(h.updates[0]).toMatchObject({ address_city: "Santos", address_street: null, cns: "700000000000005", notes_admin: "Prefere manhã" });
  });

  it("never touches the columns before 138, or when the form didn't show them", async () => {
    h.live = false;
    await updatePatient("p1", form({ address_fields: "1", address_city: "Santos" }));
    h.live = true;
    await updatePatient("p1", form({ address_city: "Santos" }));
    for (const row of h.updates) {
      expect(Object.keys(row).some((k) => k.startsWith("address_") || k === "cns" || k === "notes_admin")).toBe(false);
    }
  });

  it("a bad CNS is refused before saving; the server's invalid_cns is mapped", async () => {
    expect(await updatePatient("p1", form({ address_fields: "1", cns: "123" }))).toEqual({ error: "invalid_cns" });
    expect(h.updates).toEqual([]);
    h.error = { message: 'new row violates check: invalid_cns' };
    expect(await updatePatient("p1", form({ address_fields: "1" }))).toEqual({ error: "invalid_cns" });
  });

  it("no CNS column for a Thai practice", async () => {
    h.country = "TH";
    await updatePatient("p1", form({ address_fields: "1", cns: "700000000000005", address_state: "น่าน" }));
    expect(h.updates[0]).toMatchObject({ address_state: "น่าน" });
    expect(h.updates[0]).not.toHaveProperty("cns");
  });
});
