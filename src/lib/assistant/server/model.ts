import Anthropic from "@anthropic-ai/sdk";

// The model behind /api/assistant, injected so the route is testable and
// runs without a key (docs/assistant-api.md §1). The real client is the
// official Anthropic TypeScript SDK with claude-sonnet-5 (Vitor,
// 2026-09-28), streaming, the long prefix (Help articles + App Map) marked
// for prompt caching, and tools with strict schemas (actions mode).

export const MODEL = "claude-sonnet-5";

export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type ModelMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };
export type ModelRequest = {
  // The long, stable part (cached) and the short per-request part.
  cachedSystem: string;
  system: string;
  messages: ModelMessage[];
  tools?: ToolDef[];
  maxTokens: number;
};
export type ModelUsage = { input: number; output: number; cacheRead: number; cacheWrite: number };
export type ModelEvent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "usage"; usage: ModelUsage }
  | { type: "stop"; reason: string };

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
        messages: req.messages as Anthropic.MessageParam[],
        ...(req.tools?.length ? { tools: req.tools.map((t) => ({ ...t, strict: true })) as unknown as Anthropic.Tool[] } : {}),
      });
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield { type: "text", text: ev.delta.text };
      }
      const final = await stream.finalMessage();
      for (const block of final.content) {
        if (block.type === "tool_use") yield { type: "tool_use", id: block.id, name: block.name, input: block.input as Record<string, unknown> };
      }
      yield {
        type: "usage",
        usage: {
          input: final.usage.input_tokens ?? 0,
          output: final.usage.output_tokens ?? 0,
          cacheRead: final.usage.cache_read_input_tokens ?? 0,
          cacheWrite: final.usage.cache_creation_input_tokens ?? 0,
        },
      };
      yield { type: "stop", reason: final.stop_reason ?? "end_turn" };
    },
  };
}

// The model for this deployment: the real one when the key exists (Vitor
// adds ANTHROPIC_API_KEY to Vercel), else none (the route answers 503).
export function modelFromEnv(): ModelClient | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? anthropicModelClient(key) : null;
}

// For tests: each call answers with `reply(request, round)`: text (streamed
// in pieces) and/or tool calls; then usage and the stop reason.
export type FakeTurn = string | { text?: string; tools?: { name: string; input: Record<string, unknown> }[] };
export function fakeModelClient(
  reply: (req: ModelRequest, round: number) => FakeTurn,
  usage: ModelUsage = { input: 1000, output: 50, cacheRead: 9000, cacheWrite: 0 },
): ModelClient & { calls: ModelRequest[] } {
  const calls: ModelRequest[] = [];
  return {
    calls,
    async *stream(req) {
      const round = calls.length;
      calls.push(structuredClone(req));
      const turn = reply(req, round);
      const text = typeof turn === "string" ? turn : turn.text ?? "";
      for (let i = 0; i < text.length; i += 7) yield { type: "text", text: text.slice(i, i + 7) };
      const tools = typeof turn === "string" ? [] : turn.tools ?? [];
      for (const [i, t] of tools.entries()) yield { type: "tool_use", id: `tu_${round}_${i}`, name: t.name, input: t.input };
      yield { type: "usage", usage };
      yield { type: "stop", reason: tools.length ? "tool_use" : "end_turn" };
    },
  };
}
