import { beforeEach, describe, expect, it, vi } from "vitest";

// Delete vs Archive (UX): Delete only with no clinical history and no
// appointment at all; the server's patient_has_appointments is mapped.

const h = vi.hoisted(() => ({
  preview: { has_clinical_history: false, upcoming_appointments: 0 } as unknown,
  previewError: null as unknown,
  count: 0 as number | null,
  countError: null as unknown,
  deleteError: null as unknown,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/effectiveProfId", () => ({ getEffectiveProfId: async () => "doc-1", isProfessionalRole: async () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    rpc: () => ({ maybeSingle: async () => ({ data: h.preview, error: h.previewError }) }),
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.delete = () => q;
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ count: h.count, error: h.countError ?? h.deleteError }).then(res);
      return q;
    },
  }),
}));

import { deletePatient, getArchivePreview } from "@/app/[locale]/(site)/dashboard/(gated)/patients/actions";

beforeEach(() => {
  h.preview = { has_clinical_history: false, upcoming_appointments: 0 };
  h.previewError = null; h.count = 0; h.countError = null; h.deleteError = null;
});

describe("getArchivePreview", () => {
  it("counts every appointment (past ones too) so Delete can be hidden", async () => {
    expect(await getArchivePreview("p-1")).toEqual({ hasClinicalHistory: false, hasAppointments: false, upcomingAppointments: 0 });
    h.count = 3;
    expect(await getArchivePreview("p-1")).toMatchObject({ hasAppointments: true });
  });

  it("any failed check → null (the page then hides Delete)", async () => {
    h.countError = { message: "boom" };
    expect(await getArchivePreview("p-1")).toBeNull();
    h.countError = null; h.count = null;
    expect(await getArchivePreview("p-1")).toBeNull();
    h.count = 0; h.previewError = { message: "boom" };
    expect(await getArchivePreview("p-1")).toBeNull();
  });
});

describe("deletePatient", () => {
  it("maps the server guards to codes the page translates", async () => {
    h.deleteError = { message: 'new row violates … "patient_has_appointments"' };
    expect(await deletePatient("p-1")).toEqual({ error: "patient_has_appointments" });
    h.deleteError = { message: "patient_has_clinical_history" };
    expect(await deletePatient("p-1")).toEqual({ error: "patient_has_clinical_history" });
    h.deleteError = null;
    expect(await deletePatient("p-1")).toEqual({ success: true });
  });
});
