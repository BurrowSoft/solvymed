import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import pt from "@/messages/pt-BR.json";
import th from "@/messages/th.json";

// 155: request_appointment_reschedule refuses a visit that has started on the
// practice's clock with appointment_already_started; the patient reads e7's
// "Esta consulta já começou…" (no push to the clinic).

const h = vi.hoisted(() => ({ notices: 0 }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activeAccess", () => ({ getActiveProfId: async () => null, isLockedOut: async () => false }));
vi.mock("@/lib/myAppointments", () => ({
  myAppointment: async () => ({ id: "a-1", professional_id: "doc-1", patient_name: "Ana", date: "2030-01-10", start_time: "09:00:00" }),
}));
vi.mock("@/lib/serverNotice", () => ({ queueRequestNotice: async () => { h.notices++; }, queueClinicNotice: async () => { h.notices++; } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "pat-1" } } }) },
    rpc: async () => ({ data: null, error: { message: "appointment_already_started" } }),
  }),
}));

import { requestReschedule } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions";

describe("requestReschedule after the visit started", () => {
  it("returns the code, sends no notice", async () => {
    expect(await requestReschedule("a-1", "2030-01-12", "10:00", "10:30")).toEqual({ error: "appointment_already_started" });
    expect(h.notices).toBe(0);
  });
  it("e7's copy", () => {
    expect(pt.myAppointments.rescheduleStarted).toBe("Esta consulta já começou. Para mudanças, fale com a clínica.");
    expect(en.myAppointments.rescheduleStarted).toBe("This appointment has already started. For changes, contact the clinic.");
    expect(th.myAppointments.rescheduleStarted).toBe("นัดหมายนี้เริ่มแล้ว หากต้องการเปลี่ยนแปลง กรุณาติดต่อคลินิก");
  });
});
