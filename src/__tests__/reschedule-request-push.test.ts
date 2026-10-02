import { beforeEach, describe, expect, it, vi } from "vitest";
import { pushText } from "@/lib/pushText";

// Build 25 item 6 (e7, app #287 verbatim): the clinic's push when a patient
// ASKS to move a visit says it's a request and names the old and new time
// (dd/mm/yyyy in the reader's language, HH:MM); "Booking" is gone.

const h = vi.hoisted(() => ({ pushes: [] as { title: string; body: string }[], locale: "pt-BR" as string }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activeAccess", () => ({ getActiveProfId: async () => null, isLockedOut: async () => false }));
vi.mock("@/lib/myAppointments", () => ({
  myAppointment: async () => ({ id: "a-1", professional_id: "doc-1", patient_name: "Ana", date: "2026-10-05", start_time: "09:00:00", end_time: "09:30:00" }),
}));
vi.mock("@/lib/pushRecipient", () => ({ patientPushTargets: async () => [], clinicPushTargets: async () => [{ locale: h.locale, tokens: ["x"] }] }));
vi.mock("@/lib/push", () => ({ sendExpoPush: async (_t: string[], title: string, body: string) => { h.pushes.push({ title, body }); } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "pat-1" } } }) },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

import { requestReschedule } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions";

beforeEach(() => { h.pushes = []; });

describe("the reschedule-request push to the clinic", () => {
  it("pt: Pedido de remarcação, from the old time to the new one", async () => {
    h.locale = "pt-BR";
    expect(await requestReschedule("a-1", "2026-10-07", "14:00", "14:30")).toEqual({ error: null });
    expect(h.pushes).toEqual([{ title: "Pedido de remarcação", body: "Ana pediu para remarcar a consulta de 05/10/2026 09:00 para 07/10/2026 14:00." }]);
  });

  it("en (day first) and th (Buddhist year)", async () => {
    h.locale = "en";
    await requestReschedule("a-1", "2026-10-07", "14:00", "14:30");
    h.locale = "th";
    await requestReschedule("a-1", "2026-10-07", "14:00", "14:30");
    expect(h.pushes[0]).toEqual({ title: "Reschedule request", body: "Ana asked to move their appointment on 05/10/2026 09:00 to 07/10/2026 14:00." });
    expect(h.pushes[1]).toEqual({ title: "คำขอเลื่อนนัด", body: "Ana ขอเลื่อนนัดจาก 05/10/2569 09:00 เป็น 07/10/2569 14:00" });
  });

  it("no push says Booking any more (en)", () => {
    expect(pushText("en", "newBookingRequest", { name: "Ana", when: "x" }).title).toBe("New Appointment Request");
    expect(pushText("en", "bookingNotAvailable")).toEqual({ title: "Appointment Not Available", body: "The doctor could not accept your appointment request." });
  });
});
