import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const push = vi.fn();
let pathname = "/dashboard/schedule";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => pathname }));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, v?: Record<string, unknown>) => `${ns}.${key}${v ? JSON.stringify(v) : ""}`,
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

// A test can end while an answer is still streaming (it waits only for what
// it checks); the panel's play() then called setTurns after jsdom was torn
// down ("window is not defined", CI flake on #320). Every backend call is
// tracked here; afterEach stops the answers still streaming (each ends at
// its next chunk) and lets play() finish inside act, before the next test.
const h = vi.hoisted(() => ({ inFlight: new Set<Promise<unknown>>(), stop: false }));
const inFlight = h.inFlight;
vi.mock("@/lib/assistant/mockBackend", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/assistant/mockBackend")>();
  const track = <T,>(p: Promise<T>) => { h.inFlight.add(p); p.finally(() => h.inFlight.delete(p)).catch(() => {}); return p; };
  return {
    ...real,
    createMockBackend: (...args: Parameters<typeof real.createMockBackend>) => {
      const backend = real.createMockBackend(...args);
      return new Proxy(backend, {
        get(target, key) {
          const value = Reflect.get(target, key);
          if (typeof value !== "function") return value;
          return (...a: unknown[]) => {
            const out = value.apply(target, a);
            if (out instanceof Promise) return track(out);
            if (out && typeof out[Symbol.asyncIterator] === "function") {
              // Pending from the first read until the end (or a failure);
              // a stream nobody reads is never waited for.
              return (async function* () {
                let done!: () => void;
                track(new Promise<void>((r) => { done = r; }));
                try {
                  for await (const chunk of out as AsyncIterable<unknown>) {
                    if (h.stop) return;
                    yield chunk;
                  }
                } finally { done(); }
              })();
            }
            return out;
          };
        },
      });
    },
  };
});

beforeEach(() => { h.stop = false; });
afterEach(async () => {
  h.stop = true;
  // Until nothing is pending (play() asks usage() after its stream ends).
  for (let i = 0; i < 50 && inFlight.size > 0; i++) {
    await act(async () => {
      await Promise.allSettled([...inFlight]);
      await new Promise((r) => setTimeout(r, 0));
    });
  }
});

import { SolvyAi, cardIsSafe, screenOf } from "@/components/solvyai/SolvyAi";

// The mock streams word by word with real delays; under a full parallel run
// 5 s is too tight for the longer answers.
vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 });
import { mockAnswer } from "@/lib/assistant/mockBackend";
import type { ConfirmationCard } from "@/lib/assistant/types";

beforeEach(() => {
  push.mockClear();
  pathname = "/dashboard/schedule";
  try { localStorage.clear(); } catch { /* none */ }
});

function openPanel(props: Partial<Parameters<typeof SolvyAi>[0]> = {}) {
  render(<SolvyAi locale="pt-BR" prefix="/pt-BR" dailyLimit={20} {...props} />);
  fireEvent.click(screen.getByLabelText("assistant.open"));
}

describe("SolvyAI panel (specs/assistant.md §2)", () => {
  it("the ✦ button is the tour's spotlight target and opens the panel with this screen's chips", async () => {
    pathname = "/pt-BR/dashboard/schedule";
    render(<SolvyAi locale="pt-BR" prefix="/pt-BR" dailyLimit={20} />);
    expect(screen.getByLabelText("assistant.open")).toHaveAttribute("data-tour", "solvyai");
    fireEvent.click(screen.getByLabelText("assistant.open"));
    expect(screen.getByText("assistant.chips.schedule.a")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("assistant.usageToday").length).toBeGreaterThan(0));
    expect(screen.getByText("assistant.noPatientData")).toBeInTheDocument();
  });

  it("the payments / settings chips name the PRACTICE country's QR: Pix (BR), PromptPay (TH), none elsewhere", () => {
    for (const [qr, key] of [["pix", "b"], ["promptpay", "bPromptPay"], [null, "bNone"]] as const) {
      for (const scr of ["payments", "settings"]) {
        pathname = `/pt-BR/dashboard/${scr}`;
        const { unmount } = render(<SolvyAi locale="pt-BR" prefix="/pt-BR" dailyLimit={20} paymentQr={qr} />);
        fireEvent.click(screen.getByLabelText("assistant.open"));
        expect(screen.getByText(`assistant.chips.${scr}.${key}`)).toBeInTheDocument();
        unmount();
      }
    }
    // Other screens keep their own "b" chip.
    pathname = "/pt-BR/dashboard/schedule";
    render(<SolvyAi locale="pt-BR" prefix="/pt-BR" dailyLimit={20} paymentQr="promptpay" />);
    fireEvent.click(screen.getByLabelText("assistant.open"));
    expect(screen.getByText("assistant.chips.schedule.b")).toBeInTheDocument();
  });

  it("a help question streams an answer from the Help articles with steps and feedback", async () => {
    openPanel();
    fireEvent.change(screen.getByLabelText("assistant.placeholder"), { target: { value: "Como bloquear horário na agenda?" } });
    fireEvent.click(screen.getByText("assistant.send"));
    await waitFor(() => expect(screen.getByLabelText("assistant.helpful")).toBeInTheDocument(), { timeout: 12000 });
    expect(screen.getByText(/Bloquear horários/)).toBeInTheDocument();
  });

  it("personal data is masked before it's sent (and shown)", async () => {
    openPanel();
    fireEvent.change(screen.getByLabelText("assistant.placeholder"), { target: { value: "paciente CPF 123.456.789-09 não aparece" } });
    fireEvent.click(screen.getByText("assistant.send"));
    await waitFor(() => expect(screen.getByText("paciente CPF [cpf] não aparece")).toBeInTheDocument());
  });

  it("the tour's Experimentar agora opens the panel and asks; closing tells the tour", async () => {
    const { OPEN_EVENT, CLOSED_EVENT } = await import("@/components/solvyai/SolvyAiSettings");
    render(<SolvyAi locale="pt-BR" prefix="/pt-BR" dailyLimit={20} />);
    act(() => { window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { text: "O que o SolvyAI pode fazer?" } })); });
    await waitFor(() => expect(screen.getByText("O que o SolvyAI pode fazer?")).toBeInTheDocument());
    const closed = vi.fn();
    window.addEventListener(CLOSED_EVENT, closed);
    fireEvent.click(screen.getByLabelText("assistant.close"));
    expect(closed).toHaveBeenCalledTimes(1);
    window.removeEventListener(CLOSED_EVENT, closed);
  });

  it("\"Meet SolvyAI\" → Try it now: the panel opens with its question as the FIRST chip, not sent", async () => {
    const { OPEN_EVENT } = await import("@/components/solvyai/SolvyAiSettings");
    render(<SolvyAi locale="pt-BR" prefix="/pt-BR" dailyLimit={20} />);
    act(() => { window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { chip: "O que o SolvyAI pode fazer?" } })); });
    const chip = await screen.findByRole("button", { name: "O que o SolvyAI pode fazer?" });
    const chips = chip.parentElement!.querySelectorAll("button");
    expect(chips[0]).toBe(chip);
    expect(chips.length).toBe(4);
  });

  async function ask(text: string) {
    fireEvent.change(screen.getByLabelText("assistant.placeholder"), { target: { value: text } });
    fireEvent.click(screen.getByText("assistant.send"));
  }

  it("after a confirmed save: the panel minimises, goes to the day with the item highlighted, and offers Desfazer", async () => {
    openPanel();
    await ask("Marca a Maria Silva amanhã às 14h");
    await waitFor(() => expect(screen.getByText("assistant.confirm")).toBeInTheDocument(), { timeout: 12000 });
    expect(screen.getAllByText("(assistant.default)").length).toBe(4);
    fireEvent.click(screen.getByText("assistant.confirm"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pt-BR/dashboard/schedule?date=2026-09-29&highlight=demo-1"));
    // Minimised to the pill, with the toast.
    expect(screen.queryByLabelText("assistant.placeholder")).not.toBeInTheDocument();
    expect(screen.getByText("SolvyAI ✦")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("assistant.saved (assistant.simulated)");
    // Desfazer shows "…" until the move to the screen settles (#370): wait for it.
    fireEvent.click(await screen.findByText(/assistant\.undo/));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("assistant.undone"));
  });

  it("a saved card can't be confirmed again after the panel is minimised and reopened (tester's finding)", async () => {
    openPanel();
    await ask("Marca a Maria Silva amanhã às 14h");
    await waitFor(() => expect(screen.getByText("assistant.confirm")).toBeInTheDocument(), { timeout: 12000 });
    fireEvent.click(screen.getByText("assistant.confirm"));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    // Reopen from the pill: the card shows it was saved, with no Confirmar.
    fireEvent.click(screen.getByText("SolvyAI ✦"));
    expect(screen.queryByText("assistant.confirm")).not.toBeInTheDocument();
    expect(screen.getAllByText("assistant.saved").length).toBeGreaterThan(0);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("blocked time asks the card's second question; Cancelar saves nothing", async () => {
    openPanel();
    await ask("Marca a Maria Silva amanhã às 12h");
    await waitFor(() => expect(screen.getByText("assistant.confirm")).toBeInTheDocument(), { timeout: 12000 });
    fireEvent.click(screen.getByText("assistant.confirm"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Este horário está bloqueado (12:00–13:00). Agendar mesmo assim?");
    fireEvent.click(screen.getByText("assistant.cancel"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    // Asked again, then Agendar saves.
    fireEvent.click(screen.getByText("assistant.confirm"));
    fireEvent.click(screen.getByText("Agendar"));
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it("a conflict gets time chips, never a card; a chip is sent as the doctor's own choice", async () => {
    openPanel();
    await ask("Marca a Maria Silva amanhã às 10h");
    await waitFor(() => expect(screen.getByText("10:30")).toBeInTheDocument(), { timeout: 12000 });
    expect(screen.queryByText("assistant.confirm")).not.toBeInTheDocument();
    expect(screen.getByText("assistant.otherTime")).toBeInTheDocument();
  });

  it("a slot taken between the card and Confirmar: nothing saved, fresh times in the conversation", async () => {
    openPanel();
    await ask("Marca a Maria Silva amanhã às 16h");
    await waitFor(() => expect(screen.getByText("assistant.confirm")).toBeInTheDocument(), { timeout: 12000 });
    fireEvent.click(screen.getByText("assistant.confirm"));
    await waitFor(() => expect(screen.getByText("16:30")).toBeInTheDocument(), { timeout: 12000 });
    expect(screen.getByText("assistant.failed")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("at the daily limit the input is replaced by the limit message", async () => {
    openPanel({ dailyLimit: 1 });
    fireEvent.change(screen.getByLabelText("assistant.placeholder"), { target: { value: "Qual a dose?" } });
    fireEvent.click(screen.getByText("assistant.send"));
    await waitFor(() => expect(screen.getByText(/assistant\.limitReached/)).toBeInTheDocument(), { timeout: 12000 });
    expect(screen.queryByLabelText("assistant.placeholder")).not.toBeInTheDocument();
  });

  it("messages are capped at 500 characters", () => {
    openPanel();
    const box = screen.getByLabelText("assistant.placeholder") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "x".repeat(600) } });
    expect(box.value.length).toBe(500);
    expect(screen.getByText("500/500")).toBeInTheDocument();
  });

  it("fails closed: a blocked / outside-hours card without its second question is never shown", () => {
    const b = mockAnswer("Marca a Maria Silva amanhã às 12h", "pt", "").find((x) => x.type === "card");
    if (!b || b.type !== "card") throw new Error("no card");
    expect(cardIsSafe(b.card)).toBe(true);
    const bad: ConfirmationCard = { ...b.card, secondConfirm: undefined };
    expect(cardIsSafe(bad)).toBe(false);
    expect(cardIsSafe({ ...bad, warnings: [{ code: "outside_hours", text: "x" }] })).toBe(false);
    // Warnings that don't ask twice are fine without one.
    expect(cardIsSafe({ ...bad, warnings: [{ code: "same_patient_day", text: "x" }] })).toBe(true);
  });

  it("Configurações › SolvyAI can hide the ✦ button in this browser, and show it again", async () => {
    render(<SolvyAi locale="pt-BR" prefix="/pt-BR" dailyLimit={20} />);
    expect(screen.getByLabelText("assistant.open")).toBeInTheDocument();
    act(() => { window.dispatchEvent(new CustomEvent("solvyai-button", { detail: { hidden: true } })); });
    expect(screen.queryByLabelText("assistant.open")).not.toBeInTheDocument();
    act(() => { window.dispatchEvent(new CustomEvent("solvyai-button", { detail: { hidden: false } })); });
    expect(screen.getByLabelText("assistant.open")).toBeInTheDocument();
  });

  it("a whole text block with no deltas shows its text (confirm_failed's fixed line); streamed text isn't doubled", async () => {
    const ndjson = (chunks: unknown[]) => new Response(chunks.map((c) => JSON.stringify(c)).join("\n") + "\n", { headers: { "Content-Type": "application/x-ndjson" } });
    const replies = [
      ndjson([{ kind: "meta", mode: "actions" }, { kind: "block", block: { type: "text", text: "Só é possível cancelar consultas agendadas, confirmadas ou atrasadas. Nada foi salvo." } }, { kind: "done" }]),
      ndjson([{ kind: "meta", mode: "help" }, { kind: "delta", text: "Olá " }, { kind: "delta", text: "doutora" }, { kind: "block", block: { type: "text", text: "Olá doutora" } }, { kind: "done" }]),
    ];
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string) => {
      if (String(url).endsWith("/usage")) return new Response(JSON.stringify({ used: 1, limit: 20, extra: 0, resetsAt: "" }));
      return replies.shift()!;
    }) as unknown as typeof fetch;
    try {
      render(<SolvyAi locale="pt-BR" prefix="/pt-BR" dailyLimit={20} remote />);
      fireEvent.click(screen.getByLabelText("assistant.open"));
      await ask("primeira");
      await waitFor(() => expect(screen.getByText("Só é possível cancelar consultas agendadas, confirmadas ou atrasadas. Nada foi salvo.")).toBeInTheDocument());
      await new Promise((r) => setTimeout(r, 3100));
      await ask("segunda");
      await waitFor(() => expect(screen.getByText("Olá doutora")).toBeInTheDocument());
      expect(screen.queryByText("Olá doutoraOlá doutora")).not.toBeInTheDocument();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("on the real route: no Prévia label, the route's error states, and a failed turn isn't sent back", async () => {
    const bodies: { messages: { role: string; text: string }[] }[] = [];
    const replies = [
      new Response(JSON.stringify({ error: "inactive" }), { status: 403 }),
      new Response(JSON.stringify({ error: "model_unavailable" }), { status: 503 }),
    ];
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/usage")) return new Response(JSON.stringify({ used: 1, limit: 20, extra: 0, resetsAt: "" }));
      bodies.push(JSON.parse(String(init?.body)));
      return replies.shift()!;
    }) as unknown as typeof fetch;
    try {
      render(<SolvyAi locale="pt-BR" prefix="/pt-BR" dailyLimit={20} remote />);
      fireEvent.click(screen.getByLabelText("assistant.open"));
      expect(screen.queryByText("assistant.preview")).not.toBeInTheDocument();
      await ask("primeira");
      await waitFor(() => expect(screen.getByText("assistant.notForAccount")).toBeInTheDocument());
      // The anti-spam wait, then a second question.
      await new Promise((r) => setTimeout(r, 3100));
      await ask("segunda");
      await waitFor(() => expect(screen.getByText("assistant.unavailable")).toBeInTheDocument());
      expect(bodies[1].messages).toEqual([{ role: "user", text: "segunda" }]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("maps the page to its screen", () => {
    expect(screenOf("/pt-BR/dashboard", "/pt-BR")).toBe("home");
    expect(screenOf("/dashboard/patients/abc", "")).toBe("patients");
    expect(screenOf("/pt-BR/dashboard/clinics", "/pt-BR")).toBe("other");
  });
});
