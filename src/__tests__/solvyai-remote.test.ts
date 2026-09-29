import { afterEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const undo = vi.fn();
vi.mock("@/app/[locale]/(site)/dashboard/solvyai-actions", () => ({
  executeSolvyAiAction: (...a: unknown[]) => execute(...a),
  undoSolvyAiAction: (...a: unknown[]) => undo(...a),
}));

import { createRemoteBackend, toWireMessages } from "@/lib/assistant/remoteBackend";
import type { AnswerChunk, CardAction } from "@/lib/assistant/types";

// The panel's backend on the real route (docs/assistant-api.md §3–4): the
// history it sends, the NDJSON it reads, the route's errors, and Confirmar /
// Desfazer through the screens' server actions.

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; execute.mockReset(); undo.mockReset(); });

function ndjson(lines: unknown[], split = 5): Response {
  const text = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  // Arbitrary chunk boundaries, mid-line and mid-character.
  const body = new ReadableStream<Uint8Array>({
    pull(c) { if (i >= bytes.length) c.close(); else { c.enqueue(bytes.slice(i, i + split)); i += split; } },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

async function all(it: AsyncIterable<AnswerChunk>) {
  const out: AnswerChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

describe("toWireMessages: the history the route accepts", () => {
  it("drops an unanswered user turn (keeps the newer), keeps 6, starts with the user", () => {
    expect(toWireMessages([
      { role: "user", text: "a" }, { role: "assistant", text: "A" },
      { role: "user", text: "b (failed)" }, { role: "user", text: "c" },
    ])).toEqual([{ role: "user", text: "a" }, { role: "assistant", text: "A" }, { role: "user", text: "c" }]);
    const long = Array.from({ length: 9 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", text: String(i) }));
    const w = toWireMessages(long);
    expect(w[0].role).toBe("user");
    expect(w.length).toBeLessThanOrEqual(6);
    expect(w[w.length - 1]).toEqual({ role: "user", text: "8" });
    // Empty answers (a card-only turn) don't count as turns.
    expect(toWireMessages([{ role: "user", text: "x" }, { role: "assistant", text: " " }, { role: "user", text: "y" }])).toEqual([{ role: "user", text: "y" }]);
  });
});

describe("the remote backend", () => {
  it("posts the question and streams the NDJSON answer, whatever the chunking", async () => {
    const answer = [{ kind: "meta", mode: "help" }, { kind: "delta", text: "Olá — ção" }, { kind: "block", block: { type: "feedback" } }, { kind: "done" }];
    const fetchMock = vi.fn(async () => ndjson(answer, 3));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const chunks = await all(createRemoteBackend({ limit: 20 }).ask({ messages: [{ role: "user", text: "oi" }], screen: "schedule", locale: "pt-BR", turns: 2 }));
    expect(chunks).toEqual(answer);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/assistant");
    expect(JSON.parse(String(init.body))).toEqual({ messages: [{ role: "user", text: "oi" }], screen: "schedule", locale: "pt-BR", conversationTurns: 2 });
  });

  it("the route's errors become one error chunk with its code (and the quota's usage)", async () => {
    const usage = { used: 20, limit: 20, extra: 0, resetsAt: "2026-09-30T03:00:00Z" };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "quota_exhausted", usage }), { status: 429 })) as unknown as typeof fetch;
    expect(await all(createRemoteBackend({ limit: 20 }).ask({ messages: [{ role: "user", text: "oi" }], screen: "home", locale: "en" }))).toEqual([{ kind: "error", code: "quota_exhausted", usage }]);
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "rate_limited", retryAfterS: 3 }), { status: 429 })) as unknown as typeof fetch;
    expect(await all(createRemoteBackend({ limit: 20 }).ask({ messages: [{ role: "user", text: "oi" }], screen: "home", locale: "en" }))).toEqual([{ kind: "error", code: "rate_limited", retryAfterS: 3 }]);
    // SolvyAI off (404 without a body) and the network failing.
    globalThis.fetch = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await all(createRemoteBackend({ limit: 20 }).ask({ messages: [{ role: "user", text: "oi" }], screen: "home", locale: "en" }))).toEqual([{ kind: "error", code: "not_found" }]);
    globalThis.fetch = vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    expect(await all(createRemoteBackend({ limit: 20 }).ask({ messages: [{ role: "user", text: "oi" }], screen: "home", locale: "en" }))).toEqual([{ kind: "error", code: "model_unavailable" }]);
  });

  it("usage: the route's numbers; the plan's limit until it answers", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ used: 4, limit: 20, extra: 0, resetsAt: "r", mode: "help" }))) as unknown as typeof fetch;
    expect(await createRemoteBackend({ limit: 10 }).usage()).toEqual({ used: 4, limit: 20, extra: 0, resetsAt: "r" });
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
    expect(await createRemoteBackend({ limit: 10 }).usage()).toEqual({ used: 0, limit: 10, extra: 0, resetsAt: "" });
  });

  it("confirm_failed goes to the route as an event", async () => {
    const fetchMock = vi.fn(async () => ndjson([{ kind: "meta", mode: "actions" }, { kind: "done" }]));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const action: CardAction = { kind: "book_appointment", args: { date: "2026-09-30", start: "10:00" } };
    await all(createRemoteBackend({ limit: 20 }).reportConfirmFailed("slot_taken", action, "pt-BR"));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ event: { type: "confirm_failed", code: "slot_taken", action }, locale: "pt-BR" });
  });

  it("Confirmar runs the server action (with the second question's answer); Desfazer restores what it replaced", async () => {
    const b = createRemoteBackend({ limit: 20 });
    const cancel: CardAction = { kind: "cancel_appointment", args: { appointmentId: "a-1" } };
    execute.mockResolvedValueOnce({ ok: true, id: "a-1", prev: "confirmed" });
    expect(await b.execute(cancel, { warningsAsked: true })).toEqual({ ok: true, id: "a-1" });
    expect(execute).toHaveBeenCalledWith(cancel, true);
    await b.undo(cancel, "a-1");
    expect(undo).toHaveBeenCalledWith(cancel, "a-1", "confirmed");
    execute.mockResolvedValueOnce({ ok: false, code: "slot_taken" });
    expect(await b.execute(cancel)).toEqual({ ok: false, code: "slot_taken" });
    expect(execute).toHaveBeenLastCalledWith(cancel, false);
    execute.mockRejectedValueOnce(new Error("network"));
    expect(await b.execute(cancel)).toEqual({ ok: false, code: "generic" });
  });
});
