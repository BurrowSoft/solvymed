import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// The Desfazer toast (UX 36 / 7f): claimed once (a second tap while it runs
// does nothing), a failure says so with "Abrir", and a save that may have
// reached the patient offers "Abrir" instead of Desfazer.

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/pt-BR/dashboard/schedule" }));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, v?: Record<string, unknown>) => `${ns}.${key}${v ? JSON.stringify(v) : ""}`,
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

const h = vi.hoisted(() => ({
  undo: vi.fn(),
  noUndo: false,
}));
vi.mock("@/lib/assistant/mockBackend", async (orig) => {
  const real = await orig<typeof import("@/lib/assistant/mockBackend")>();
  return {
    ...real,
    createMockBackend: (opts: Parameters<typeof real.createMockBackend>[0]) => {
      const b = real.createMockBackend(opts);
      return {
        ...b,
        execute: async (...a: Parameters<typeof b.execute>) => {
          const r = await b.execute(...a);
          return r.ok && h.noUndo ? { ...r, noUndo: true } : r;
        },
        undo: (...a: unknown[]) => h.undo(...a),
      };
    },
  };
});

import { SolvyAi } from "@/components/solvyai/SolvyAi";

vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  push.mockClear();
  h.undo.mockReset();
  h.noUndo = false;
  try { localStorage.clear(); } catch { /* none */ }
});

async function saveOne() {
  render(<SolvyAi locale="pt-BR" prefix="/pt-BR" dailyLimit={20} />);
  fireEvent.click(screen.getByLabelText("assistant.open"));
  fireEvent.change(screen.getByLabelText("assistant.placeholder"), { target: { value: "Marca a Maria Silva amanhã às 14h" } });
  fireEvent.click(screen.getByText("assistant.send"));
  await waitFor(() => expect(screen.getByText("assistant.confirm")).toBeInTheDocument(), { timeout: 12000 });
  fireEvent.click(screen.getByText("assistant.confirm"));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("assistant.saved"));
}

describe("Desfazer toast", () => {
  it("runs once: a second tap while it's pending does nothing", async () => {
    let finish: (v: boolean) => void = () => {};
    h.undo.mockImplementation(() => new Promise<boolean>((r) => { finish = r; }));
    await saveOne();
    // Desfazer shows "…" until the move to the screen settles (#370): wait for it (as #373).
    const btn = await screen.findByText(/assistant\.undo/);
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole("status").querySelector("button[aria-busy='true']")).not.toBeNull());
    fireEvent.click(screen.getByRole("status").querySelector("button")!);
    expect(h.undo).toHaveBeenCalledTimes(1);
    finish(true);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("assistant.undone"));
    expect(h.undo).toHaveBeenCalledTimes(1);
  });

  it("a failed Desfazer says so and offers Abrir", async () => {
    h.undo.mockResolvedValue(false);
    await saveOne();
    push.mockClear();
    fireEvent.click(await screen.findByText(/assistant\.undo/));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("assistant.undoFailed"));
    fireEvent.click(screen.getByText("assistant.openItem"));
    expect(push).toHaveBeenCalledWith("/pt-BR/dashboard/schedule?date=2026-09-29&highlight=demo-1");
  });

  it("when the patient may have been told: no Desfazer, Abrir instead", async () => {
    h.noUndo = true;
    await saveOne();
    expect(screen.queryByText(/assistant\.undo/)).toBeNull();
    expect(screen.getByText("assistant.openItem")).toBeInTheDocument();
  });
});
