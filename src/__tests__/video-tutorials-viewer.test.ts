// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Help Center card's playlist: a doctor or secretary gets their practice
// country's; a patient or a visitor the site language's; a failed lookup
// falls back to the language's, never another country's.

vi.mock("server-only", () => ({}));
const s = vi.hoisted(() => ({ user: null as null | { id: string }, role: null as null | { role: string; invited_by_professional_id: string | null }, country: { ok: true, country: "TH" } as { ok: boolean; country?: string; code?: string } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: s.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: s.role }) }) }) }),
  }),
}));
const lookup = vi.hoisted(() => vi.fn());
vi.mock("@/lib/practiceCountry", () => ({ lookupPracticeCountry: lookup }));

import { viewerVideoTutorialsUrl } from "@/lib/videoTutorialsServer";

const BR = "https://www.youtube.com/playlist?list=PLGStjTQLFN3M";
const TH = "https://www.youtube.com/playlist?list=PLI6329of7MSY";

beforeEach(() => {
  s.user = null; s.role = null;
  lookup.mockReset();
  lookup.mockImplementation(async () => s.country);
  s.country = { ok: true, country: "TH" };
});

describe("viewerVideoTutorialsUrl", () => {
  it("a visitor: the site language's", async () => {
    expect(await viewerVideoTutorialsUrl("pt-BR")).toBe(BR);
    expect(await viewerVideoTutorialsUrl("en")).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("a doctor: the practice country's, whatever the language", async () => {
    s.user = { id: "doc" }; s.role = { role: "professional", invited_by_professional_id: null };
    expect(await viewerVideoTutorialsUrl("pt-BR")).toBe(TH);
    expect(lookup).toHaveBeenCalledWith(expect.anything(), "doc", "doc");
  });

  it("a secretary: her doctor's practice country", async () => {
    s.user = { id: "sec" }; s.role = { role: "secretary", invited_by_professional_id: "doc" };
    expect(await viewerVideoTutorialsUrl("en")).toBe(TH);
    expect(lookup).toHaveBeenCalledWith(expect.anything(), "sec", "doc");
  });

  it("a patient: the site language's (not a practice's)", async () => {
    s.user = { id: "pat" }; s.role = { role: "patient", invited_by_professional_id: "doc" };
    expect(await viewerVideoTutorialsUrl("th")).toBe(TH);
    expect(await viewerVideoTutorialsUrl("en")).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("a failed lookup: the language's, never a guessed country", async () => {
    s.user = { id: "doc" }; s.role = { role: "professional", invited_by_professional_id: null };
    s.country = { ok: false, code: "network" };
    expect(await viewerVideoTutorialsUrl("en")).toBeNull();
    expect(await viewerVideoTutorialsUrl("pt-BR")).toBe(BR);
  });
});
