// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// WT1's TH rehearsal (01, 10-28): the reply notice's e-mail link opened while signed out
// goes to sign-in with the channel page as ?next= (lib/authReturn), not to a bare sign-in.

vi.mock("server-only", () => ({}));
const nav = vi.hoisted(() => ({ to: "" }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    nav.to = to;
    throw new Error("NEXT_REDIRECT");
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

const PRO = "0b6f3c1e-1d2a-4c8e-9f00-123456789abc";
const { default: Page } = await import("@/app/[locale]/(site)/my-appointments/channel/[professionalId]/page");
const open = (locale: string, professionalId: string) =>
  Page({ params: Promise.resolve({ locale, professionalId }), searchParams: Promise.resolve({}) }).catch(() => null);

describe("the patient's channel page, signed out", () => {
  it("sign-in, then back to this page, in the link's language", async () => {
    await open("th", PRO);
    expect(nav.to).toBe(`/th/auth/login?next=${encodeURIComponent(`/th/my-appointments/channel/${PRO}`)}`);
    await open("en", PRO);
    expect(nav.to).toBe(`/auth/login?next=${encodeURIComponent(`/my-appointments/channel/${PRO}`)}`);
  });

  it("an id that isn't a doctor's: a plain sign-in, nothing carried", async () => {
    await open("pt-BR", "not-a-uuid");
    expect(nav.to).toBe("/pt-BR/auth/login");
  });
});
