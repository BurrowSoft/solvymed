import { describe, expect, it, vi } from "vitest";

// 53's Preview probes (5 Oct): with 800 tokens, thinking used the whole
// budget; with thinking off, book/cancel skipped tool calls (c6). The request
// keeps adaptive thinking at LOW effort with a budget for thinking + answer,
// and the response's own content (thinking blocks included) is handed back.

const h = vi.hoisted(() => ({ params: null as Record<string, unknown> | null }));
const content = [{ type: "thinking", thinking: "…", signature: "sig" }, { type: "text", text: "ok" }, { type: "tool_use", id: "tu1", name: "find_patients", input: { query: "Maria" } }];
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      stream: (params: Record<string, unknown>) => {
        h.params = params;
        return {
          async *[Symbol.asyncIterator]() { /* no events */ },
          finalMessage: async () => ({ content, usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "tool_use" }),
        };
      },
    };
  },
}));

import { anthropicModelClient } from "@/lib/assistant/server/model";

describe("the model request", () => {
  it("low effort, adaptive thinking (never disabled), the caller's budget; the raw content comes back", async () => {
    const client = anthropicModelClient("test-key");
    const events: { type: string }[] = [];
    for await (const ev of client.stream({ cachedSystem: "c", system: "s", messages: [{ role: "user", content: "oi" }], maxTokens: 4000 })) events.push(ev);
    expect(h.params).toMatchObject({ output_config: { effort: "low" }, max_tokens: 4000 });
    expect(h.params).not.toHaveProperty("thinking");
    expect(events.find((e) => e.type === "raw")).toEqual({ type: "raw", content });
    expect(events.find((e) => e.type === "stop")).toMatchObject({ blocks: ["thinking", "text", "tool_use:find_patients"] });
  });
});
