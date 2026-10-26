// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// TH-1 (web tester 1, 10-26): on www (multiDoctor = a preview feature, off) a patient saw
// the one-doctor card and no "Fale com o Médico": the channel was computed only for the
// doctors list. 01: the button on the doctor card in BOTH layouts. These render the page
// (server) with the data helpers mocked and read what it passes to the client.

const h = vi.hoisted(() => ({
  multi: false,
  enabled: true,
  open: true,
  loadDoctors: vi.fn(async () => [{ id: "doc1", name: "Dra. Ana" }]),
  pageCalls: [] as string[],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const rpc = (fn: string) => {
      const result = fn === "my_country" ? { data: "BR", error: null }
        : fn === "get_professional_public_info" ? { data: { full_name: "Dra. Ana", specialty: "", clinic_name: null, country: "BR", time_zone: "America/Sao_Paulo" }, error: null }
        : { data: null, error: null };
      return { ...result, maybeSingle: async () => result, then: (r: (v: unknown) => void) => r(result) };
    };
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { role: "patient", invited_by_professional_id: "doc1", linked_patient_id: "p1" }, error: null }) };
    return {
      auth: { getUser: async () => ({ data: { user: { id: "pat1", email: "e2e-pat@example.invalid", created_at: "2026-01-01T00:00:00Z", user_metadata: {} } } }) },
      from: () => chain,
      rpc,
    };
  },
}));
vi.mock("@/lib/liveFeatures", () => ({ liveFeatures: new Proxy({}, { get: (_t, k) => (k === "multiDoctor" ? h.multi : false) }) }));
vi.mock("@/lib/myAppointments", () => ({ myAppointments: async () => [] }));
vi.mock("@/lib/setup", () => ({ getOnboardingFlags: async () => null }));
vi.mock("@/lib/myDoctors", () => ({ loadMyDoctors: h.loadDoctors, serverFlag: async () => false }));
vi.mock("@/lib/selfFields", () => ({ loadSelfFieldPrompts: async () => [] }));
vi.mock("@/lib/patientChannel/live", () => ({ patientChannelEnabled: async () => h.enabled }));
vi.mock("@/lib/patientChannel/practice", () => ({ patientPage: async (_db: unknown, id: string) => { h.pageCalls.push(id); return h.open ? { ok: true } : { ok: false, code: "channel_off" }; } }));
vi.mock("@/app/[locale]/(site)/my-appointments/document-actions", () => ({ loadMyDocumentDoctors: async () => null }));
vi.mock("@/lib/privacyNotice", () => ({ readAcceptedPrivacy: async () => null, privacyNoticeDue: () => false }));
vi.mock("@/app/[locale]/(site)/my-appointments/MyAppointmentsClient", () => ({ MyAppointmentsClient: () => null }));
vi.mock("@/components/SaveMyLocale", () => ({ SaveMyLocale: () => null }));
vi.mock("@/components/OfflineGuard", () => ({ OfflineGuard: () => null }));
vi.mock("@/components/ClockSkewGuard", () => ({ ClockSkewGuard: () => null }));

const { default: Page } = await import("@/app/[locale]/(site)/my-appointments/page");
const { MyAppointmentsClient } = await import("@/app/[locale]/(site)/my-appointments/MyAppointmentsClient");

async function clientProps(search: Record<string, string> = {}) {
  const tree = (await Page({ params: Promise.resolve({ locale: "pt-BR" }), searchParams: Promise.resolve(search) })) as ReactElement<{ children: ReactElement[] }>;
  const el = ([] as ReactElement[]).concat(tree.props.children).find((c) => c?.type === MyAppointmentsClient) as ReactElement<Record<string, unknown>>;
  return el.props;
}

const envBefore = process.env.VERCEL_ENV;
beforeEach(() => {
  h.multi = false;
  h.enabled = true;
  h.open = true;
  h.pageCalls = [];
  h.loadDoctors.mockClear();
  process.env.VERCEL_ENV = "production";
});
afterEach(() => { process.env.VERCEL_ENV = envBefore; });

describe("the Patient Channel entry on My appointments, both layouts", () => {
  it("multiDoctor OFF (www): the one doctor's card gets the channel when 237 opens it", async () => {
    const p = await clientProps();
    expect(p.doctors).toBeNull();
    expect(p.primaryChannel).toBe(true);
    expect(h.pageCalls).toEqual(["doc1"]);
    expect(h.loadDoctors).not.toHaveBeenCalled();
  });

  it("multiDoctor OFF: none when the channel is off for this patient, or the doctor's page is closed", async () => {
    h.enabled = false;
    expect((await clientProps()).primaryChannel).toBe(false);
    expect(h.pageCalls).toEqual([]);
    h.enabled = true;
    h.open = false;
    expect((await clientProps()).primaryChannel).toBe(false);
  });

  it("multiDoctor ON (previews): per doctor in the list, as before; no primary button", async () => {
    h.multi = true;
    const p = await clientProps();
    expect(p.doctors).toEqual([{ id: "doc1", name: "Dra. Ana", channel: true }]);
    expect(p.primaryChannel).toBe(false);
  });

  it("?single_doctor=1 forces the www layout on previews only, never on Production", async () => {
    h.multi = true;
    process.env.VERCEL_ENV = "preview";
    const preview = await clientProps({ single_doctor: "1" });
    expect([preview.doctors, preview.primaryChannel]).toEqual([null, true]);
    process.env.VERCEL_ENV = "production";
    const prod = await clientProps({ single_doctor: "1" });
    expect(prod.doctors).not.toBeNull();
  });
});
