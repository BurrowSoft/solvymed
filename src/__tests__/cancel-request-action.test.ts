import { beforeEach, describe, expect, it, vi } from "vitest";

// cancelMyRequest: cancel_my_booking returns the row it cancelled ([] when
// the request isn't the patient's pending one any more); only then does the
// clinic get "Pedido cancelado".

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
  pushes: [] as { title: string; body: string }[],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activeAccess", () => ({ getActiveProfId: async () => null, isLockedOut: async () => false }));
vi.mock("@/lib/myAppointments", () => ({
  myAppointment: async () => ({ id: "a-1", professional_id: "doc-1", patient_name: "Ana", date: "2030-01-10", start_time: "09:00:00" }),
}));
vi.mock("@/lib/pushRecipient", () => ({
  patientPushTargets: async () => [],
  clinicPushTargets: async () => [{ locale: "pt-BR", tokens: ["ExponentPushToken[x]"] }],
}));
vi.mock("@/lib/push", () => ({ sendExpoPush: async (_t: string[], title: string, body: string) => { h.pushes.push({ title, body }); } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "pat-1" } } }) },
    rpc: async (name: string) => (name === "cancel_my_booking" ? { data: h.rows, error: h.error } : { data: null, error: null }),
  }),
}));

import { cancelMyRequest } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions";

beforeEach(() => { h.rows = []; h.error = null; h.pushes = []; });

describe("cancelMyRequest", () => {
  it("cancelled → the clinic is told, with the patient and the time", async () => {
    h.rows = [{ professional_id: "doc-1", patient_name: "Ana" }];
    expect(await cancelMyRequest("a-1")).toEqual({ error: null });
    expect(h.pushes).toHaveLength(1);
    expect(h.pushes[0].title).toBe("Pedido cancelado");
    expect(h.pushes[0].body).toMatch(/^Ana cancelou o pedido de .*09:00\.$/);
  });

  it("nothing cancelled ([] or an error) → not_cancellable, no push", async () => {
    expect(await cancelMyRequest("a-1")).toEqual({ error: "not_cancellable" });
    h.error = { message: "boom" };
    expect(await cancelMyRequest("a-1")).toEqual({ error: "not_cancellable" });
    expect(h.pushes).toEqual([]);
  });
});
