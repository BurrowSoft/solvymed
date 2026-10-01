import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { routeAfterAuth } from "@/lib/authRouting";

// Patients after an auth link (3e, #275): both codes link at once since
// 145, so both land on the welcome; a removed patient (no link, no invite,
// 147) gets the plain "connect to a doctor" form (e7).

type Row = { role: string; invited_by_professional_id: string | null; linked_patient_id: string | null } | null;

function fakeDb(opts: { before: Row; after?: Row; personal?: boolean; publicProf?: string | null }) {
  let reads = 0;
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: reads++ === 0 ? opts.before : opts.after ?? opts.before, error: null }),
        }),
      }),
    }),
    rpc: async (fn: string) =>
      fn === "link_patient_by_invite_code" ? { data: !!opts.personal, error: null }
        : fn === "link_by_professional_public_code" ? { data: opts.publicProf ?? null, error: null }
        : { data: null, error: null },
  } as unknown as SupabaseClient;
}

const now = new Date().toISOString();
const patient = (meta: Record<string, unknown> = {}, confirmed = now) => ({
  id: "u-1", user_metadata: { role: "patient", ...meta }, confirmed_at: confirmed, email_confirmed_at: confirmed,
});
const linked: Row = { role: "patient", invited_by_professional_id: "doc-1", linked_patient_id: "p-1" };

describe("routeAfterAuth: patients", () => {
  it("a public code that links at once lands on the welcome, not pending", async () => {
    const db = fakeDb({ before: null, after: linked, publicProf: "doc-1" });
    expect(await routeAfterAuth(db, patient({ invite_code: "PUB123" }), "/pt-BR", "signup")).toBe("/pt-BR/auth/patient-welcome");
  });

  it("a public code that's only pending (not linked) still goes to pending", async () => {
    const db = fakeDb({ before: null, after: { role: "patient", invited_by_professional_id: "doc-1", linked_patient_id: null }, publicProf: "doc-1" });
    expect(await routeAfterAuth(db, patient({ invite_code: "PUB123" }), "", "signup")).toBe("/auth/pending-confirmation");
  });

  it("already linked at signup: the welcome on the confirming link, the appointments later", async () => {
    expect(await routeAfterAuth(fakeDb({ before: linked }), patient(), "/th", "signup")).toBe("/th/auth/patient-welcome");
    const old = new Date(Date.now() - 86_400_000).toISOString();
    expect(await routeAfterAuth(fakeDb({ before: linked }), patient({}, old), "/th", "magiclink")).toBe("/th/my-appointments");
  });

  it("a removed patient (no link, no invite) gets the connect form", async () => {
    const removed: Row = { role: "patient", invited_by_professional_id: null, linked_patient_id: null };
    expect(await routeAfterAuth(fakeDb({ before: removed }), patient(), "", "magiclink")).toBe("/auth/invite-required");
  });
});
