import { beforeEach, describe, expect, it, vi } from "vitest";
import { pushText } from "@/lib/pushText";

// Build 25 item 6 (e7, app #287): when a patient ASKS to move a visit, the
// clinic is told it's a request, from the old time to the new one. Since the
// push service (171) the SERVER writes and sends it (its catalogue: cf's
// FINAL wording, the practice's calendar); the website only queues
// "reschedule_requested" for that appointment, with no text and no tokens.

const h = vi.hoisted(() => ({ notices: [] as unknown[] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activeAccess", () => ({ getActiveProfId: async () => null, isLockedOut: async () => false }));
vi.mock("@/lib/myAppointments", () => ({
  myAppointment: async () => ({ id: "a-1", professional_id: "doc-1", patient_name: "Ana", date: "2026-10-05", start_time: "09:00:00", end_time: "09:30:00" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "pat-1" } } }) },
    rpc: async (fn: string, args: unknown) => { if (fn.startsWith("enqueue_")) h.notices.push({ fn, args }); return { data: null, error: null }; },
  }),
}));

import { requestReschedule } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions";

beforeEach(() => { h.notices = []; });

describe("the reschedule-request notice to the clinic", () => {
  it("queued for the server: the kind and the appointment only", async () => {
    expect(await requestReschedule("a-1", "2026-10-07", "14:00", "14:30")).toEqual({ error: null });
    expect(h.notices).toEqual([{ fn: "enqueue_clinic_notice", args: { p_kind: "reschedule_requested", p_appointment_id: "a-1" } }]);
  });

  it("no push says Booking any more (en; the texts kept for account close)", () => {
    expect(pushText("en", "newBookingRequest", { name: "Ana", when: "x" }).title).toBe("New Appointment Request");
    expect(pushText("en", "bookingNotAvailable", { doctor: "Dra. Ana", date: "05/10/2026", time: "09:00" }))
      .toEqual({ title: "Request not accepted", body: "Dra. Ana couldn't accept your appointment request for 05/10/2026 at 09:00." });
  });
});
