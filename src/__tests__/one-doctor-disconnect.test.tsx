// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 01, 10-26: "Desconectar" on the one-doctor card (www's layout; MyDoctors has its own),
// the server action open without multiDoctor only for the caller's own primary doctor, and
// "Ver mensagens anteriores com {doctor}" on the connect page after it (?left=, own rows only).

const h = vi.hoisted(() => ({
  multi: false,
  role: { role: "patient", invited_by_professional_id: "doc1", linked_patient_id: "p1" } as Record<string, unknown> | null,
  rpcCalls: [] as { fn: string; args: unknown }[],
  rpcError: null as null | { message: string },
  myRows: [] as unknown[],
  search: "",
  action: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "pt-BR" }),
  useSearchParams: () => new URLSearchParams(h.search),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/liveFeatures", () => ({ liveFeatures: new Proxy({}, { get: (_t, k) => (k === "multiDoctor" ? h.multi : false) }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: h.role, error: null }) };
    return {
      auth: { getUser: async () => ({ data: { user: { id: "pat1" } } }) },
      from: () => chain,
      rpc: async (fn: string, args: unknown) => { h.rpcCalls.push({ fn, args }); return { data: null, error: fn === "disconnect_doctor" ? h.rpcError : null }; },
    };
  },
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: (fn: string, args: unknown) => {
      h.rpcCalls.push({ fn, args });
      const result = fn === "pc_my_requests" ? { data: h.myRows, error: null } : { data: { full_name: "Dra. Ana Lima" }, error: null };
      return { ...result, maybeSingle: async () => result, then: (r: (v: unknown) => void) => r(result) };
    },
  }),
}));

const { disconnectDoctor } = await import("@/app/[locale]/(site)/my-appointments/doctor-actions");
const { LeftDoctorMessages } = await import("@/components/patientChannel/LeftDoctorMessages");

const DOC = "11111111-1111-4111-8111-111111111111";
const wrap = (ui: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{ui}</NextIntlClientProvider>;

beforeEach(() => {
  h.multi = false;
  h.role = { role: "patient", invited_by_professional_id: "doc1", linked_patient_id: "p1" };
  h.rpcCalls = [];
  h.rpcError = null;
  h.myRows = [];
  h.search = "";
});

describe("disconnectDoctor without multiDoctor (www)", () => {
  it("the caller's own primary doctor: the RPC runs", async () => {
    expect(await disconnectDoctor("doc1")).toEqual({ ok: true });
    expect(h.rpcCalls).toEqual([{ fn: "disconnect_doctor", args: { p_professional_id: "doc1" } }]);
  });

  it("any other doctor, or not a patient: refused before the RPC", async () => {
    expect(await disconnectDoctor("someone-else")).toEqual({ ok: false, code: "error" });
    h.role = { role: "professional" };
    expect(await disconnectDoctor("doc1")).toEqual({ ok: false, code: "error" });
    expect(h.rpcCalls.filter((c) => c.fn === "disconnect_doctor")).toEqual([]);
  });

  it("a future visit: the RPC's refusal comes back as has_future_visits", async () => {
    h.rpcError = { message: "has_future_visits" };
    expect(await disconnectDoctor("doc1")).toEqual({ ok: false, code: "has_future_visits" });
  });
});

describe("the one-doctor card's link", () => {
  const original = window.location;
  const assign = vi.fn();
  beforeEach(() => {
    assign.mockReset();
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign } });
  });
  afterEach(() => Object.defineProperty(window, "location", { configurable: true, value: original }));

  it("confirm → disconnected → the connect page with ?left; a future visit → the blocked note; cancel closes", async () => {
    vi.doMock("@/app/[locale]/(site)/my-appointments/doctor-actions", () => ({ disconnectDoctor: h.action }));
    vi.resetModules();
    const { OneDoctorDisconnect } = await import("@/app/[locale]/(site)/my-appointments/OneDoctorDisconnect");
    h.action.mockResolvedValueOnce({ ok: false, code: "has_future_visits" }).mockResolvedValueOnce({ ok: true });
    render(wrap(<OneDoctorDisconnect doctorId="doc1" doctorName="Dra. Ana" />));
    fireEvent.click(screen.getByTestId("one-doctor-disconnect"));
    expect(screen.getByTestId("disconnect-confirm")).toHaveTextContent(pt.patientDoctors.disconnectTitle.replace("{doctor}", "Dra. Ana"));
    fireEvent.click(screen.getByRole("button", { name: pt.brand.cancel }));
    expect(screen.queryByTestId("disconnect-confirm")).toBeNull();
    fireEvent.click(screen.getByTestId("one-doctor-disconnect"));
    fireEvent.click(screen.getAllByRole("button", { name: pt.patientDoctors.disconnect })[0]);
    expect(await screen.findByTestId("disconnect-blocked")).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("one-doctor-disconnect"));
    fireEvent.click(screen.getAllByRole("button", { name: pt.patientDoctors.disconnect })[0]);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/pt-BR/auth/invite-required?left=doc1"));
    vi.doUnmock("@/app/[locale]/(site)/my-appointments/doctor-actions");
  });
});

describe("Ver mensagens anteriores com {doctor} (?left=)", () => {
  it("own rows there → the link (no name looked up: #636 ❌, 01), to the read-only channel", async () => {
    h.search = `left=${DOC}`;
    h.myRows = [{ id: "q1", status: "answered", reasonTitle: "R", createdAt: "t" }];
    render(wrap(<LeftDoctorMessages />));
    const link = await screen.findByTestId("pc-left-messages");
    expect(link).toHaveTextContent(pt.patientChannel.patient.earlierLink);
    expect(h.rpcCalls.some((c) => c.fn === "get_professional_public_info")).toBe(false);
    expect(link.getAttribute("href")).toBe(`/pt-BR/my-appointments/channel/${DOC}`);
  });

  it("no rows there: nothing; a bad id: nothing at all", async () => {
    h.search = `left=${DOC}`;
    const { unmount } = render(wrap(<LeftDoctorMessages />));
    await waitFor(() => expect(h.rpcCalls.some((c) => c.fn === "pc_my_requests")).toBe(true));
    expect(screen.queryByTestId("pc-left-messages")).toBeNull();
    expect(h.rpcCalls.some((c) => c.fn === "get_professional_public_info")).toBe(false);
    unmount();
    h.rpcCalls = [];
    h.search = "left=not-a-uuid";
    render(wrap(<LeftDoctorMessages />));
    expect(h.rpcCalls).toEqual([]);
  });
});
