// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { NextRequest } from "next/server";
import pt from "@/messages/pt-BR.json";

// Patient Channel M7 on the doctor's side: the Confirmar / Desfazer route (as the caller; the
// RPCs refuse anyone but the doctor), the inbox's AI section in every state, and the settings
// switch (its own one-column save; a refused save goes back).

const h = vi.hoisted(() => ({
  user: { id: "doc1" } as { id: string } | null,
  readable: true,
  rpcResult: true as unknown,
  rpcError: null as null | { message: string },
  calls: [] as { fn: string; args: unknown }[],
  refresh: vi.fn(),
  updateError: null as null | { message: string },
  updates: [] as unknown[],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: h.refresh, replace: vi.fn() }),
  usePathname: () => "/pt-BR/dashboard",
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: async (fn: string, args: unknown) => { h.updates.push({ fn, args }); return h.updateError ? { data: null, error: h.updateError } : { data: true, error: null }; },
  }),
}));
vi.mock("@/lib/patientChannel/server", async (orig) => ({
  ...(await orig<typeof import("@/lib/patientChannel/server")>()),
  pcCaller: async () => ({
    user: h.user,
    db: {
      from: () => {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: h.readable ? { professional_id: "doc1" } : null, error: null }) };
        return chain;
      },
      rpc: async (fn: string, args: unknown) => {
        h.calls.push({ fn, args });
        return h.rpcError ? { data: null, error: h.rpcError } : { data: h.rpcResult, error: null };
      },
    },
  }),
}));

const { POST } = await import("@/app/api/patient-channel/requests/[id]/ai/route");
const { AiPanel } = await import("@/app/[locale]/(site)/dashboard/(gated)/patient-channel/[requestId]/AiPanel");
const { AiMappingCard } = await import("@/app/[locale]/(site)/dashboard/settings/patient-channel/AiMappingCard");

const ID = "11111111-1111-1111-1111-111111111111";
const post = (body: unknown, id = ID) =>
  POST(new NextRequest(`http://x/api/patient-channel/requests/${id}/ai`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id }) });
const wrap = (node: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{node}</NextIntlClientProvider>;
const ai = pt.patientChannel.detail.ai;

beforeEach(() => {
  Object.assign(h, { user: { id: "doc1" }, readable: true, rpcResult: true, rpcError: null, calls: [], updateError: null, updates: [] });
  h.refresh.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/patient-channel/requests/[id]/ai", () => {
  it("confirm and undo call the doctor's RPCs as the caller", async () => {
    expect((await post({ action: "confirm" })).status).toBe(200);
    expect((await post({ action: "undo" })).status).toBe(200);
    expect(h.calls).toEqual([{ fn: "pc_ai_confirm", args: { p_request_id: ID } }, { fn: "pc_ai_undo", args: { p_request_id: ID } }]);
  });
  it("not a finished reading (false): 409 ai_not_done", async () => {
    h.rpcResult = false;
    const res = await post({ action: "confirm" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "ai_not_done" });
  });
  it("a secretary, another practice or an unknown id (42501 'forbidden'): 403; anything else: 500", async () => {
    h.rpcError = { message: "forbidden", code: "42501" } as { message: string };
    expect((await post({ action: "undo" })).status).toBe(403);
    h.rpcError = { message: "boom" };
    expect((await post({ action: "undo" })).status).toBe(500);
  });
  it("signed out 401; a bad id or action 400; a request the caller can't read 404 (no RPC)", async () => {
    expect((await post({ action: "nope" })).status).toBe(400);
    expect((await post({ action: "confirm" }, "x")).status).toBe(400);
    h.readable = false;
    expect((await post({ action: "confirm" })).status).toBe(404);
    h.user = null;
    expect((await post({ action: "confirm" })).status).toBe(401);
    expect(h.calls).toEqual([]);
  });
});

const lines = [{ symptomId: "s7", name: "Dor no peito ou desmaio", quote: "aperto forte no peito", points: 14 }];

describe("the inbox's AI section", () => {
  it("none: nothing; pending, unavailable (no credits, failed, stale) and undone: one line each", () => {
    const { container, rerender } = render(wrap(<AiPanel requestId={ID} status="none" lines={[]} confirmedAt={null} canAct />));
    expect(container.textContent).toBe("");
    rerender(wrap(<AiPanel requestId={ID} status="pending" lines={[]} confirmedAt={null} canAct />));
    expect(screen.getByTestId("pc-ai-pending").textContent).toBe(ai.pending);
    for (const s of ["no_credits", "failed", "stale"] as const) {
      rerender(wrap(<AiPanel requestId={ID} status={s} lines={[]} confirmedAt={null} canAct />));
      expect(screen.getByTestId("pc-ai-unavailable").textContent).toBe("Leitura por IA indisponível nesta mensagem: só palavras-chave.");
    }
    rerender(wrap(<AiPanel requestId={ID} status="undone" lines={[]} confirmedAt={null} canAct />));
    expect(screen.getByTestId("pc-ai-undone").textContent).toBe(ai.undone);
  });

  it("done: each line with IA, the symptom, the quote and its points; nothing found says so", () => {
    const { rerender } = render(wrap(<AiPanel requestId={ID} status="done" lines={lines} confirmedAt={null} canAct />));
    const line = screen.getByTestId("pc-ai-line");
    expect(line.textContent).toContain("IA");
    expect(line.textContent).toContain("Dor no peito ou desmaio");
    expect(line.textContent).toContain("“aperto forte no peito”");
    expect(line.textContent).toContain("+14");
    rerender(wrap(<AiPanel requestId={ID} status="done" lines={[]} confirmedAt={null} canAct />));
    expect(screen.getByTestId("pc-ai-none").textContent).toBe(ai.none);
    expect(screen.queryByTestId("pc-ai-confirm")).toBeNull();
  });

  it("a secretary reads the lines, never the buttons", () => {
    render(wrap(<AiPanel requestId={ID} status="done" lines={lines} confirmedAt={null} canAct={false} />));
    expect(screen.getByTestId("pc-ai-line")).toBeTruthy();
    expect(screen.queryByTestId("pc-ai-confirm")).toBeNull();
    expect(screen.queryByTestId("pc-ai-undo")).toBeNull();
  });

  it("Confirmar posts and reloads; once confirmed only Desfazer stays, with the date", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(wrap(<AiPanel requestId={ID} status="done" lines={lines} confirmedAt={null} canAct />));
    await act(async () => { fireEvent.click(screen.getByTestId("pc-ai-confirm")); });
    expect(fetchMock).toHaveBeenCalledWith(`/api/patient-channel/requests/${ID}/ai`, expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "confirm" }) }));
    expect(h.refresh).toHaveBeenCalled();
    rerender(wrap(<AiPanel requestId={ID} status="done" lines={lines} confirmedAt="27/10 10:00" canAct />));
    expect(screen.getByTestId("pc-ai-confirmed").textContent).toBe("Confirmado em 27/10 10:00");
    expect(screen.queryByTestId("pc-ai-confirm")).toBeNull();
    expect(screen.getByTestId("pc-ai-undo")).toBeTruthy();
  });

  it("Desfazer asks first; Cancelar leaves it; a failed undo shows the error BELOW the buttons", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    render(wrap(<AiPanel requestId={ID} status="done" lines={lines} confirmedAt={null} canAct />));
    fireEvent.click(screen.getByTestId("pc-ai-undo"));
    expect(screen.getByTestId("pc-ai-undo-ask").textContent).toContain(ai.undoConfirm);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("pc-ai-undo-no"));
    expect(screen.queryByTestId("pc-ai-undo-ask")).toBeNull();
    fireEvent.click(screen.getByTestId("pc-ai-undo"));
    await act(async () => { fireEvent.click(screen.getByTestId("pc-ai-undo-yes")); });
    expect(fetchMock).toHaveBeenCalledWith(`/api/patient-channel/requests/${ID}/ai`, expect.objectContaining({ body: JSON.stringify({ action: "undo" }) }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(ai.error);
    const ask = screen.getByTestId("pc-ai-undo-ask");
    const yes = screen.getByTestId("pc-ai-undo-yes");
    // The alert comes after the buttons in the document (destructive confirms: no shift).
    expect(yes.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ask.lastElementChild).toBe(alert);
  });

  it("409 (done elsewhere meanwhile): reloads, no error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 409 })));
    render(wrap(<AiPanel requestId={ID} status="done" lines={lines} confirmedAt={null} canAct />));
    await act(async () => { fireEvent.click(screen.getByTestId("pc-ai-confirm")); });
    expect(h.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("the settings switch", () => {
  it("goes through pc_set_ai_mapping; a refused change (outside the testers phase) goes back, with the error", async () => {
    render(wrap(<AiMappingCard initialOn={false} />));
    expect(screen.getByText(pt.patientChannel.channel.aiMapping)).toBeTruthy();
    expect(screen.getByText(pt.patientChannel.channel.aiMappingHelp)).toBeTruthy();
    h.updateError = { message: "ai_not_available" };
    const box = screen.getByTestId("pc-ai-mapping-toggle") as HTMLInputElement;
    await act(async () => { fireEvent.click(box); });
    await waitFor(() => expect(box.checked).toBe(false));
    expect(screen.getByRole("alert").textContent).toBe(ai.error);
    expect(h.updates[0]).toEqual({ fn: "pc_set_ai_mapping", args: { p_on: true } });
    h.updateError = null;
    await act(async () => { fireEvent.click(box); });
    await waitFor(() => expect(box.checked).toBe(true));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
