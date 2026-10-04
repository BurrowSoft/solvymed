import { beforeEach, describe, expect, it, vi } from "vitest";

// cancelMyRequest: cancel_my_booking returns the row it cancelled ([] when
// the request isn't the patient's pending one any more); only then is the
// clinic's "Pedido cancelado" queued for the server to send (171: no tokens,
// no text from the website).

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
  notices: [] as unknown[],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activeAccess", () => ({ getActiveProfId: async () => null, isLockedOut: async () => false }));
vi.mock("@/lib/myAppointments", () => ({
  myAppointment: async () => ({ id: "a-1", professional_id: "doc-1", patient_name: "Ana", date: "2030-01-10", start_time: "09:00:00" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "pat-1" } } }) },
    rpc: async (name: string, args: unknown) => {
      if (name === "cancel_my_booking") return { data: h.rows, error: h.error };
      if (name.startsWith("enqueue_")) h.notices.push({ name, args });
      return { data: null, error: null };
    },
  }),
}));

import { cancelMyRequest } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions";

beforeEach(() => { h.rows = []; h.error = null; h.notices = []; });

describe("cancelMyRequest", () => {
  it("cancelled → the clinic's notice is queued for that appointment", async () => {
    h.rows = [{ professional_id: "doc-1", patient_name: "Ana" }];
    expect(await cancelMyRequest("a-1")).toEqual({ error: null });
    expect(h.notices).toEqual([{ name: "enqueue_clinic_notice", args: { p_kind: "request_cancelled", p_appointment_id: "a-1" } }]);
  });

  it("nothing cancelled ([] or an error) → not_cancellable, nothing queued", async () => {
    expect(await cancelMyRequest("a-1")).toEqual({ error: "not_cancellable" });
    h.error = { message: "boom" };
    expect(await cancelMyRequest("a-1")).toEqual({ error: "not_cancellable" });
    expect(h.notices).toEqual([]);
  });
});
