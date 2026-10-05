import { describe, expect, it, vi } from "vitest";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";

// Migration 181 (mobile #365): a secretary serves doctors of ONE practice
// country; accept_secretary_invite refuses with different_country, and the
// website says so with the app's words (cf), not a generic error.

const h = vi.hoisted(() => ({ rpcError: null as null | { message: string } }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "sec-1" } } }) },
    rpc: async () => ({ data: null, error: h.rpcError }),
  }),
}));

import { acceptSecretaryInvite } from "@/app/[locale]/(site)/join/secretary/[code]/actions";

describe("joining a doctor in another country", () => {
  it("the action maps the RPC's different_country", async () => {
    h.rpcError = { message: "different_country" };
    expect(await acceptSecretaryInvite("SEC-ABCD-1234")).toEqual({ ok: false, code: "different_country" });
    h.rpcError = { message: "something else" };
    expect(await acceptSecretaryInvite("SEC-ABCD-1234")).toEqual({ ok: false, code: "generic" });
  });

  it("the app's message in en / pt-BR / th", () => {
    expect(en.secretary.differentCountry).toBe("You can only join doctors in the same country as your practice.");
    expect(pt.secretary.differentCountry).toBe("Você só pode entrar na equipe de médicos do mesmo país do seu consultório.");
    expect(th.secretary.differentCountry).toBe("คุณเข้าร่วมได้เฉพาะทีมแพทย์ที่อยู่ในประเทศเดียวกับคลินิกของคุณ");
  });
});

