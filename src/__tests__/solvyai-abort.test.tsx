import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { AnswerChunk } from "@/lib/assistant/types";

// "Nova conversa" while an answer streams stops it (its request too): the
// old answer never lands in the new conversation, and typing works again.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/pt-BR/dashboard/schedule" }));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, v?: Record<string, unknown>) => `${ns}.${key}${v ? JSON.stringify(v) : ""}`,
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

const h = vi.hoisted(() => ({
  signals: [] as (AbortSignal | undefined)[],
  release: () => {},
}));
vi.mock("@/lib/assistant/mockBackend", async (orig) => {
  const real = await orig<typeof import("@/lib/assistant/mockBackend")>();
  return {
    ...real,
    createMockBackend: (opts: Parameters<typeof real.createMockBackend>[0]) => ({
      ...real.createMockBackend(opts),
      // One delta, then held until the test releases it.
      ask: (_req: unknown, signal?: AbortSignal) => {
        h.signals.push(signal);
        return (async function* (): AsyncIterable<AnswerChunk> {
          yield { kind: "delta", text: "OLD ANSWER" };
          await new Promise<void>((r) => { h.release = r; });
          yield { kind: "delta", text: " STILL OLD" };
          yield { kind: "block", block: { type: "text", text: "" } };
        })();
      },
    }),
  };
});

import { SolvyAi } from "@/components/solvyai/SolvyAi";

describe("SolvyAI: stopping a streamed answer", () => {
  it("Nova conversa aborts the stream; nothing of it comes back", async () => {
    render(<SolvyAi locale="pt-BR" prefix="/pt-BR" dailyLimit={20} />);
    fireEvent.click(screen.getByLabelText("assistant.open"));
    fireEvent.change(screen.getByLabelText("assistant.placeholder"), { target: { value: "Como marco uma consulta?" } });
    fireEvent.click(screen.getByText("assistant.send"));
    await waitFor(() => expect(screen.getByText(/OLD ANSWER/)).toBeInTheDocument());
    expect(h.signals[0]?.aborted).toBe(false);

    fireEvent.click(screen.getAllByText("assistant.newConversation")[0]);
    expect(h.signals[0]?.aborted).toBe(true);
    await act(async () => { h.release(); await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByText(/OLD ANSWER|STILL OLD/)).toBeNull();
    expect(screen.getByLabelText("assistant.placeholder")).not.toBeDisabled();
  });
});
