import Anthropic from "@anthropic-ai/sdk";

// The model behind /api/assistant, injected so the route is testable and
// runs without a key (docs/assistant-api.md §1). The real client is the
// official Anthropic TypeScript SDK with claude-sonnet-5 (Vitor,
// 2026-09-28), streaming, the long prefix (Help articles + App Map) marked
// for prompt caching.

export const MODEL = "claude-sonnet-5";

export type ModelMessage = { role: "user" | "assistant"; content: string };
export type ModelRequest = {
  // The long, stable part (cached) and the short per-request part.
  cachedSystem: string;
  system: string;
  messages: ModelMessage[];
  maxTokens: number;
};
export type ModelUsage = { input: number; output: number; cacheRead: number; cacheWrite: number };
export type ModelEvent = { type: "text"; text: string } | { type: "usage"; usage: ModelUsage };

export interface ModelClient {
  stream(req: ModelRequest): AsyncIterable<ModelEvent>;
}

export function anthropicModelClient(apiKey: string): ModelClient {
  const client = new Anthropic({ apiKey });
  return {
    async *stream(req) {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: req.maxTokens,
        system: [
          { type: "text", text: req.cachedSystem, cache_control: { type: "ephemeral" } },
          { type: "text", text: req.system },
        ],
        messages: req.messages,
      });
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield { type: "text", text: ev.delta.text };
      }
      const final = await stream.finalMessage();
      yield {
        type: "usage",
        usage: {
          input: final.usage.input_tokens ?? 0,
          output: final.usage.output_tokens ?? 0,
          cacheRead: final.usage.cache_read_input_tokens ?? 0,
          cacheWrite: final.usage.cache_creation_input_tokens ?? 0,
        },
      };
    },
  };
}

// The model for this deployment: the real one when the key exists (Vitor
// adds ANTHROPIC_API_KEY to Vercel), else none (the route answers 503).
export function modelFromEnv(): ModelClient | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? anthropicModelClient(key) : null;
}

// For tests: answers with `reply(request)`, streamed in pieces, then usage.
export function fakeModelClient(reply: (req: ModelRequest) => string, usage: ModelUsage = { input: 1000, output: 50, cacheRead: 9000, cacheWrite: 0 }): ModelClient & { calls: ModelRequest[] } {
  const calls: ModelRequest[] = [];
  return {
    calls,
    async *stream(req) {
      calls.push(req);
      const text = reply(req);
      for (let i = 0; i < text.length; i += 7) yield { type: "text", text: text.slice(i, i + 7) };
      yield { type: "usage", usage };
    },
  };
}
