import { describe, expect, it, vi } from "vitest";

// 53's Preview probe (5 Oct): a long question spent the whole 800-token
// budget on "thinking" and left 0–388 chars of answer. The request turns
// thinking off, so the budget is the answer's.

const h = vi.hoisted(() => ({ params: null as Record<string, unknown> | null }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      stream: (params: Record<string, unknown>) => {
        h.params = params;
        return {
          async *[Symbol.asyncIterator]() { /* no events */ },
          finalMessage: async () => ({ content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" }),
        };
      },
    };
  },
}));

import { anthropicModelClient } from "@/lib/assistant/server/model";

describe("the model request", () => {
  it("has thinking disabled and the round's token budget", async () => {
    const client = anthropicModelClient("test-key");
    for await (const _ev of client.stream({ cachedSystem: "c", system: "s", messages: [{ role: "user", content: "oi" }], maxTokens: 800 })) { /* drain */ }
    expect(h.params).toMatchObject({ thinking: { type: "disabled" }, max_tokens: 800 });
  });
});
