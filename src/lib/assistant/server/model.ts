import Anthropic from "@anthropic-ai/sdk";
import { rankHelp } from "@/lib/help";

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
  });
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
