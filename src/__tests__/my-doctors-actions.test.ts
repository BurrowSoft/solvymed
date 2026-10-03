import { describe, expect, it, vi, beforeEach } from "vitest";

// The "My doctors" server actions (1.5.0, 164): public endpoints, so they
// refuse while the flag is off; Desconectar reads the clinic's push targets
// BEFORE disconnect_doctor (afterwards there are none) and pushes
// "Pedido cancelado" once per returned request (9a).

const h = vi.hoisted(() => ({
  flag: true,
  calls: [] as string[],
  rpc: vi.fn(),
  targets: vi.fn(),
  send: vi.fn(),
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
vi.mock("@/lib/pushRecipient", () => ({
  clinicPushTargets: async (...a: unknown[]) => { h.calls.push("targets"); return h.targets(...a); },
}));
vi.mock("@/lib/push", () => ({ sendExpoPush: (...a: unknown[]) => h.send(...a) }));

import { connectDoctor, disconnectDoctor } from "@/app/[locale]/(site)/my-appointments/doctor-actions";

beforeEach(() => {
  h.flag = true;
  h.calls = [];
  h.rpc.mockReset();
  h.targets.mockReset().mockResolvedValue([{ locale: "pt-BR", tokens: ["tok-1"] }]);
  h.send.mockReset();
});

describe("disconnectDoctor", () => {
  it("reads the clinic's targets BEFORE disconnect_doctor, then pushes once per cancelled request", async () => {
    h.rpc.mockResolvedValue({ data: [
      { appointment_id: "a1", date: "2026-10-20", start_time: "09:00:00" },
      { appointment_id: "a2", date: "2026-10-21", start_time: "10:00:00" },
    ], error: null });
    expect(await disconnectDoctor("doc-2")).toEqual({ ok: true });
    expect(h.calls.slice(0, 2)).toEqual(["targets", "rpc:disconnect_doctor"]);
    expect(h.targets).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send.mock.calls[0][0]).toEqual(["tok-1"]);
    expect(String(h.send.mock.calls[0][2])).toContain("Maria Silva");
  });

  it("has_future_visits → refused, nothing pushed", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "has_future_visits" } });
    expect(await disconnectDoctor("doc-2")).toEqual({ ok: false, code: "has_future_visits" });
    expect(h.send).not.toHaveBeenCalled();
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
