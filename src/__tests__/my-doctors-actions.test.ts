import { describe, expect, it, vi, beforeEach } from "vitest";

// The "My doctors" server actions (1.5.0, 164): public endpoints, so they
// refuse while the flag is off; Desconectar only calls disconnect_doctor:
// the SERVER tells the clinic "Pedido cancelado" once per cancelled request
// (171), the website reads no push tokens and sends nothing.

const h = vi.hoisted(() => ({
  flag: true,
  calls: [] as string[],
  rpc: vi.fn(),
}));
vi.mock("@/lib/liveFeatures", async (orig) => {
  const real = await orig<typeof import("@/lib/liveFeatures")>();
  return { ...real, get liveFeatures() { return { ...real.liveFeatures, multiDoctor: h.flag }; } };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "pat-1", user_metadata: { full_name: "Maria Silva" } } } }) },
    rpc: (fn: string, args: unknown) => { h.calls.push(`rpc:${fn}`); return h.rpc(fn, args); },
  }),
}));

import { connectDoctor, disconnectDoctor } from "@/app/[locale]/(site)/my-appointments/doctor-actions";

beforeEach(() => {
  h.flag = true;
  h.calls = [];
  h.rpc.mockReset();
});

describe("disconnectDoctor", () => {
  it("only disconnect_doctor: the server tells the clinic (no token read, nothing sent from here)", async () => {
    h.rpc.mockResolvedValue({ data: [
      { appointment_id: "a1", date: "2026-10-20", start_time: "09:00:00" },
      { appointment_id: "a2", date: "2026-10-21", start_time: "10:00:00" },
    ], error: null });
    expect(await disconnectDoctor("doc-2")).toEqual({ ok: true });
    expect(h.calls).toEqual(["rpc:disconnect_doctor"]);
  });

  it("has_future_visits → refused", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "has_future_visits" } });
    expect(await disconnectDoctor("doc-2")).toEqual({ ok: false, code: "has_future_visits" });
  });

  it("flag off: refused without touching the database", async () => {
    h.flag = false;
    expect(await disconnectDoctor("doc-2")).toEqual({ ok: false, code: "error" });
    expect(h.calls).toEqual([]);
  });
});

describe("connectDoctor", () => {
  it("flag off: refused without touching the database", async () => {
    h.flag = false;
    expect(await connectDoctor("AB12CD")).toEqual({ outcome: "error" });
    expect(h.calls).toEqual([]);
  });

  it("connected: the doctor's name from get_my_doctors", async () => {
    h.rpc.mockImplementation(async (fn: string) =>
      fn === "connect_doctor_with_code"
        ? { data: [{ outcome: "connected", professional_id: "doc-2" }], error: null }
        : { data: [{ professional_id: "doc-2", title: "Dr.", display_name: "Paulo Lima", specialty: null, accent_color: null, logo_square_path: null, photo_path: null, is_primary: false, accepts_bookings: true }], error: null });
    const r = await connectDoctor("ab-12cd");
    expect(r).toEqual({ outcome: "connected", doctor: "Dr. Paulo Lima", doctorId: "doc-2" });
    expect(h.rpc).toHaveBeenCalledWith("connect_doctor_with_code", { p_code: "AB12CD" });
  });
});
