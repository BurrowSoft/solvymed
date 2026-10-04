import Anthropic from "@anthropic-ai/sdk";
import { rankHelp } from "@/lib/help";

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
// RawBlock: an assistant turn sent back exactly as the model returned it
// (thinking blocks included).
export type RawBlock = { type: string; [key: string]: unknown };
export type ModelMessage = { role: "user" | "assistant"; content: string | (ContentBlock | RawBlock)[] };
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
  // blocks: the response's content block types, in order (Preview probes).
  | { type: "stop"; reason: string; blocks?: string[] }
  // The response's content blocks, as returned (thinking + text + tool_use),
  // to send back as the assistant turn before the tool results.
  | { type: "raw"; content: RawBlock[] };

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
        // Adaptive thinking (the model's default) at LOW effort (c6, 53's
        // probes): with 800 tokens, thinking used the whole budget (no answer);
        // with thinking off, book/cancel sometimes skipped the tool call or
        // wrote a fake card as text. max_tokens (the caller's) now covers
        // thinking + the answer; the answer's length comes from the prompt.
        // (Sonnet 5.5 rejects thinking {type:"disabled"} with a 400; never
        // switch to it.)
        output_config: { effort: "low" },
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
      yield { type: "raw", content: final.content as unknown as RawBlock[] };
      yield { type: "stop", reason: final.stop_reason ?? "end_turn", blocks: final.content.map((b) => (b.type === "tool_use" ? `tool_use:${b.name}` : b.type)) };
    },
  };
}

// The model for this deployment: the real one when the key exists (Vitor
// adds ANTHROPIC_API_KEY to Vercel), else none (the route answers 503).
export function modelFromEnv(): ModelClient | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) return anthropicModelClient(key);
  // For testing without a key (a local run or a Preview): SOLVYAI_FAKE_MODEL=1
  // answers from the best-matching Help article. Never on Production.
  if (process.env.SOLVYAI_FAKE_MODEL === "1" && process.env.VERCEL_ENV !== "production") return helpEchoModel();
  return null;
}

// The testing stand-in: the best Help article's first lines + its marker,
// or the off-topic line. No network, no cost.
function helpEchoModel(): ModelClient {
  return fakeModelClient((req) => {
    const last = req.messages[req.messages.length - 1];
    const q = typeof last?.content === "string" ? last.content : "";
    const lang = /Brazilian Portuguese/.test(req.system) ? "pt" : "en";
    const [top] = rankHelp(q, lang, false, 1);
    if (!top) return lang === "pt" ? "Só posso ajudar com o SolvyMed." : "I can only help with SolvyMed.";
    const first = top.body[lang].map((b) => (b.type === "ol" ? b.items.map((s, i) => `${i + 1}. ${s}`).join("\n") : b.text)).slice(0, 2).join("\n");
    return `(${lang === "pt" ? "resposta de teste" : "test answer"}) ${top.title[lang]}\n${first}\n[[open:${top.id}]]`;
    // Zero usage: a Preview on the real database records nothing (a9).
  }, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
}

// For tests: each call answers with `reply(request, round)`: text (streamed
// in pieces) and/or tool calls; then usage and the stop reason.
// stop: force a stop reason ("max_tokens"); raw: the content to hand back.
export type FakeTurn = string | { text?: string; tools?: { name: string; input: Record<string, unknown> }[]; stop?: string; raw?: RawBlock[] };
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
      if (typeof turn !== "string" && turn.raw) yield { type: "raw", content: turn.raw };
      yield { type: "stop", reason: (typeof turn !== "string" && turn.stop) || (tools.length ? "tool_use" : "end_turn") };
    },
  };
}
