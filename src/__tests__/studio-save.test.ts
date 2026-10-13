// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DESIGN, type Design } from "@/lib/studio/design";
import { forEditing } from "@/lib/studio/starters";

// Document Studio PR3: saving through save_my_design with the version the
// editor opened at. A stale version is "conflict" (never an overwrite); an
// invalid design never reaches the server; only a doctor, only once live.

const rpc = vi.fn();
let live = true;
let isDoctor: boolean | null = true;
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/studio/live", () => ({ studioEnabled: async () => live }));
vi.mock("@/lib/effectiveProfId", () => ({ isProfessionalRole: async () => isDoctor }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, rpc }),
}));

const { saveMyDesign } = await import("@/app/[locale]/(site)/dashboard/settings/studio-actions");
const design = (): Design => forEditing(structuredClone(DEFAULT_DESIGN));

beforeEach(() => { rpc.mockReset(); live = true; isDoctor = true; });

describe("saveMyDesign", () => {
  it("saves with the expected version and returns the new one", async () => {
    rpc.mockResolvedValue({ data: 4, error: null });
    expect(await saveMyDesign(design(), 3)).toEqual({ ok: true, version: 4 });
    expect(rpc).toHaveBeenCalledWith("save_my_design", { p_design: design(), p_expected_version: 3 });
  });

  it("a stale version is a conflict, not an overwrite", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "conflict", code: "40001" } });
    expect(await saveMyDesign(design(), 1)).toEqual({ ok: false, code: "conflict" });
  });

  it("maps the server's refusals", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "invalid_design", code: "22023" } });
    expect(await saveMyDesign(design(), 0)).toEqual({ ok: false, code: "invalid" });
    rpc.mockResolvedValue({ data: null, error: { message: "not_allowed", code: "42501" } });
    expect(await saveMyDesign(design(), 0)).toEqual({ ok: false, code: "not_allowed" });
    rpc.mockResolvedValue({ data: null, error: { message: "boom", code: "XX000" } });
    expect(await saveMyDesign(design(), 0)).toEqual({ ok: false, code: "generic" });
  });

  it("an invalid design or version never reaches the server", async () => {
    expect(await saveMyDesign({ ...design(), font: "comic" } as unknown as Design, 0)).toEqual({ ok: false, code: "invalid" });
    expect(await saveMyDesign(design(), -1)).toEqual({ ok: false, code: "invalid" });
    expect(await saveMyDesign(design(), 1.5)).toEqual({ ok: false, code: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("nothing while the document_studio flag is off, nothing for a non-doctor", async () => {
    live = false;
    expect(await saveMyDesign(design(), 0)).toEqual({ ok: false, code: "not_allowed" });
    live = true; isDoctor = false;
    expect(await saveMyDesign(design(), 0)).toEqual({ ok: false, code: "not_allowed" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
