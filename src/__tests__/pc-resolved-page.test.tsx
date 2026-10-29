import { describe, expect, it, vi } from "vitest";

// Item 43's /dashboard/patient-channel/resolved (01, 10-29): the doctor and a secretary with
// "sees all" get the report; a secretary without it goes back to the inbox (no empty shell).
const h = vi.hoisted(() => ({ isSecretary: false, seesAll: false as boolean | null, live: true }));
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
vi.mock("@/lib/patientChannel/resolvedReport", async (orig) => ({ ...(await orig<typeof import("@/lib/patientChannel/resolvedReport")>()), resolvedReportLive: () => h.live }));
vi.mock("@/lib/patientChannel/staff", () => ({
  staffContext: async () => ({
    prefix: "/pt-BR",
    profId: "doc1",
    isSecretary: h.isSecretary,
    supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.seesAll === null ? null : { secretary_sees_all: h.seesAll } }) }) }) }) },
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); },
}));
const { default: Page } = await import("@/app/[locale]/(site)/dashboard/(gated)/patient-channel/resolved/page");
const open = () => Page({ params: Promise.resolve({ locale: "pt-BR" }) });

describe("/dashboard/patient-channel/resolved", () => {
  it("the doctor: the report", async () => {
    h.isSecretary = false;
    await expect(open()).resolves.toBeTruthy();
  });
  it("a secretary without 'sees all' (or no settings row): back to the inbox", async () => {
    h.isSecretary = true;
    h.seesAll = false;
    await expect(open()).rejects.toThrow("NEXT_REDIRECT /pt-BR/dashboard/patient-channel");
    h.seesAll = null;
    await expect(open()).rejects.toThrow("NEXT_REDIRECT /pt-BR/dashboard/patient-channel");
  });
  it("a secretary with 'sees all': the report", async () => {
    h.isSecretary = true;
    h.seesAll = true;
    await expect(open()).resolves.toBeTruthy();
  });
  it("dark: not found", async () => {
    h.live = false;
    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
    h.live = true;
  });
});
