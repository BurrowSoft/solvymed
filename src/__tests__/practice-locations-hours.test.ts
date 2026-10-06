// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// 1.8.0 F: the website's working-hours save writes a day's location only
// when the form shows the picker (2+ locations, flag on). Without the field
// the key stays out, so the database keeps the day's (200's keep trigger).

const h = vi.hoisted(() => ({ saved: null as null | Record<string, Record<string, unknown>> }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/effectiveProfId", () => ({ isProfessionalRole: async () => true, getEffectiveProfId: async () => "doc-1" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    from: () => ({ update: (row: { working_hours: Record<string, Record<string, unknown>> }) => { h.saved = row.working_hours; return { eq: async () => ({ error: null }) }; } }),
  }),
}));

import { updateWorkingHours } from "@/app/[locale]/(site)/dashboard/settings/actions";

const LOC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("the working hours' locations", () => {
  it("no picker: no location_id key at all (the database keeps each day's)", async () => {
    const fd = new FormData();
    fd.set("mon_enabled", "on");
    await updateWorkingHours(fd);
    expect(h.saved?.mon).toEqual({ enabled: true, start: "08:00", end: "18:00" });
    expect("location_id" in (h.saved?.mon ?? {})).toBe(false);
  });

  it("with the picker: the chosen id; anything else is null (the primary)", async () => {
    const fd = new FormData();
    fd.set("mon_enabled", "on");
    fd.set("mon_location", LOC);
    fd.set("tue_location", "'; drop table");
    await updateWorkingHours(fd);
    expect(h.saved?.mon.location_id).toBe(LOC);
    expect(h.saved?.tue.location_id).toBeNull();
    expect("location_id" in (h.saved?.wed ?? {})).toBe(false);
  });
});
