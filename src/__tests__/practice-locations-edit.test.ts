// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

// 1.8.0 F: editing a location sends only what changed, so a name or phone
// edit never rewrites the address and its pin (53: on prod a doctor's
// address update trips migration 120's pin trigger).

const h = vi.hoisted(() => ({ updates: [] as Record<string, unknown>[] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activeAccess", () => ({ isActiveProfessional: async () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: { name: "Centro", address: "Rua A, 1", city: "Recife", state: "PE", phone: "81 9999-0000", country: "BR" }, error: null }),
        update: (row: Record<string, unknown>) => {
          h.updates.push(row);
          const u = { eq: () => u, select: async () => ({ data: [{ id: "c1" }], error: null }) };
          return u;
        },
      };
      return chain;
    },
  }),
}));
// No network in tests: the address lookup finds nothing.
vi.stubGlobal("fetch", async () => ({ json: async () => [] }));

import { updateClinic } from "@/app/[locale]/(site)/dashboard/(gated)/clinics/actions";

const form = (over: Record<string, string>) => {
  const fd = new FormData();
  const base = { name: "Centro", address: "Rua A, 1", city: "Recife", state: "PE", phone: "81 9999-0000", ...over };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
};

beforeEach(() => { h.updates = []; });

describe("editing a location", () => {
  it("a phone-only edit sends only the phone", async () => {
    expect(await updateClinic("c1", form({ phone: "81 3333-0000" }))).toEqual({ success: true });
    expect(h.updates).toEqual([{ phone: "81 3333-0000" }]);
  });

  it("nothing changed: nothing sent", async () => {
    expect(await updateClinic("c1", form({}))).toEqual({ success: true });
    expect(h.updates).toEqual([]);
  });

  it("a new address sends the address with a fresh pin (none found: cleared)", async () => {
    await updateClinic("c1", form({ address: "Rua B, 2" }));
    expect(h.updates).toEqual([{ address: "Rua B, 2", city: "Recife", lat: null, lng: null }]);
  });
});
