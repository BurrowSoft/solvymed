import { describe, expect, it } from "vitest";
import { handleAssistant, type Deps } from "@/lib/assistant/server/handle";
import { fakeModelClient, type ModelClient } from "@/lib/assistant/server/model";
import { cachedSystem } from "@/lib/assistant/server/knowledge";
import type { AnswerChunk } from "@/lib/assistant/types";

// /api/assistant's logic (docs/assistant-api.md §3) with a fake model and
// fake database clients: the checks in order, the stream, and the usage
// report / refund going through the service client for the caller only.

type Call = { fn: string; args?: Record<string, unknown> };
function rpcClient(answers: Record<string, { data: unknown; error: { message: string } | null }>) {
  const calls: Call[] = [];
  return {
    calls,
    rpc(fn: string, args?: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve(answers[fn] ?? { data: null, error: null });
    },
  };
}

const ALLOWED = { allowed: true, used: 3, limit: 20, resets_at: "2026-09-30T03:00:00Z", actions: false };
const ask = (text: string, extra: Record<string, unknown> = {}) => ({
  messages: [{ role: "user", text }], screen: "schedule", locale: "pt-BR", conversationTurns: 0, ...extra,
});

function deps(over: Partial<Deps> & { consume?: unknown; budget?: unknown } = {}) {
  const db = rpcClient({
    assistant_consume_message: { data: over.consume ?? ALLOWED, error: null },
    assistant_budget_state: { data: over.budget ?? { configured: false, over_80: false, over_budget: false }, error: null },
  });
  const service = rpcClient({});
  const model = (over.model === undefined ? fakeModelClient(() => "Toque em **Bloquear horário** na Agenda.\n[[open:A3]]") : over.model) as ModelClient | null;
  return { db, service, model, d: { enabled: over.enabled ?? true, userId: over.userId === undefined ? "doc-1" : over.userId, db, service, model, client: over.client ?? "web" } as Deps };
}

async function collect(stream: AsyncIterable<AnswerChunk>) {
  const out: AnswerChunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

describe("/api/assistant: the checks, in the contract's order", () => {
  it("SolvyAI switched off (the server-only switch): 404 before anything, nothing counted, no model call", async () => {
    const model = fakeModelClient(() => "x");
    const t = deps({ enabled: false, model });
    expect(await handleAssistant(ask("oi"), t.d)).toEqual({ status: 404, json: { error: "not_found" } });
    // Even without a user: the route doesn't exist.
    expect(await handleAssistant(ask("oi"), deps({ enabled: false, userId: null }).d)).toEqual({ status: 404, json: { error: "not_found" } });
    expect(t.db.calls).toEqual([]);
    expect(t.service.calls).toEqual([]);
    expect(model.calls).toEqual([]);
  });

  it("the switch is server-only: only SOLVYAI_API_ENABLED=1 turns it on", async () => {
    const { assistantApiEnabled } = await import("@/lib/assistant/server/caller");
    const before = process.env.SOLVYAI_API_ENABLED;
    process.env.SOLVYAI_API_ENABLED = "";
    process.env.NEXT_PUBLIC_SOLVYAI_ENABLED = "1";
    expect(assistantApiEnabled()).toBe(false);
    process.env.SOLVYAI_API_ENABLED = "1";
    expect(assistantApiEnabled()).toBe(true);
    process.env.SOLVYAI_API_ENABLED = before;
    delete process.env.NEXT_PUBLIC_SOLVYAI_ENABLED;
  });

  it("no user → 401; malformed → 400; limits → 400", async () => {
    expect(await handleAssistant(ask("oi"), deps({ userId: null }).d)).toEqual({ status: 401, json: { error: "unauthorized" } });
    expect((await handleAssistant({ messages: [] }, deps().d)).status).toBe(400);
    expect(await handleAssistant({ messages: [{ role: "assistant", text: "x" }] }, deps().d)).toMatchObject({ json: { error: "bad_request" } });
    expect(await handleAssistant(ask("x".repeat(501)), deps().d)).toMatchObject({ status: 400, json: { error: "too_long" } });
    expect(await handleAssistant(ask("oi", { conversationTurns: 12 }), deps().d)).toMatchObject({ status: 400, json: { error: "too_many_turns" } });
  });

  it("no model (no key yet) → 503, and nothing is counted", async () => {
    const t = deps({ model: null });
    expect(await handleAssistant(ask("oi"), t.d)).toEqual({ status: 503, json: { error: "model_unavailable" } });
    expect(t.db.calls).toEqual([]);
  });

  it("before migration 115 (the RPC is missing) it refuses rather than answer uncounted", async () => {
    const t = deps();
    t.db.rpc = (fn: string) => Promise.resolve(fn === "assistant_consume_message" ? { data: null, error: { message: "Could not find the function" } } : { data: null, error: null });
    expect(await handleAssistant(ask("oi"), t.d)).toEqual({ status: 503, json: { error: "model_unavailable" } });
  });

  it("the database's answers: not a doctor, inactive, quota, rate limit", async () => {
    expect(await handleAssistant(ask("oi"), deps({ consume: { allowed: false, reason: "not_doctor" } }).d)).toMatchObject({ status: 403, json: { error: "not_doctor" } });
    expect(await handleAssistant(ask("oi"), deps({ consume: { allowed: false, reason: "inactive" } }).d)).toMatchObject({ status: 403, json: { error: "inactive" } });
    expect(await handleAssistant(ask("oi"), deps({ consume: { allowed: false, reason: "quota_exhausted", used: 20, limit: 20, resets_at: "R" } }).d))
      .toEqual({ status: 429, json: { error: "quota_exhausted", usage: { used: 20, limit: 20, extra: 0, resetsAt: "R" } } });
    expect(await handleAssistant(ask("oi"), deps({ consume: { allowed: false, reason: "rate_limited", retry_after_s: 2 } }).d))
      .toEqual({ status: 429, json: { error: "rate_limited", retryAfterS: 2 } });
  });
});

describe("/api/assistant: a help answer", () => {
  it("streams meta, the text (markers removed), an Open screen button, feedback, usage, done", async () => {
    const t = deps();
    const out = await handleAssistant(ask("Como bloqueio a sexta à tarde?"), t.d);
    if (!("stream" in out)) throw new Error("no stream");
    const chunks = await collect(out.stream);
    expect(chunks[0]).toEqual({ kind: "meta", mode: "help" });
    const text = chunks.filter((c) => c.kind === "delta").map((c) => (c.kind === "delta" ? c.text : "")).join("");
    expect(text).toBe("Toque em **Bloquear horário** na Agenda.\n");
    const open = chunks.find((c) => c.kind === "block" && c.block.type === "open");
    expect(open).toEqual({ kind: "block", block: { type: "open", label: "Abrir tela", href: "/pt-BR/dashboard/schedule", target: { screen: "schedule" } } });
    expect(chunks.slice(-3).map((c) => c.kind === "block" ? c.block.type : c.kind)).toEqual(["feedback", "usage", "done"]);
    expect(chunks.at(-2)).toEqual({ kind: "usage", used: 3, limit: 20, extra: 0, resetsAt: "2026-09-30T03:00:00Z" });
  });

  it("the usage report goes through the service client, for the caller it counted (never the user's own client)", async () => {
    const t = deps();
    const out = await handleAssistant(ask("oi"), t.d);
    if ("stream" in out) await collect(out.stream);
    expect(t.service.calls).toEqual([{ fn: "assistant_record_usage", args: { p_professional_id: "doc-1", p_input: 1000, p_output: 50, p_cache_read: 9000, p_cache_write: 0 } }]);
    expect(t.db.calls.map((c) => c.fn)).toEqual(["assistant_consume_message", "assistant_budget_state"]);
  });

  it("everything is re-masked before the model sees it; the prompt carries the Help and the rules", async () => {
    const model = fakeModelClient(() => "ok");
    const t = deps({ model });
    const out = await handleAssistant({ ...ask("CPF 123.456.789-09, tel (11) 91234-5678"), messages: [
      { role: "user", text: "meu email ana@x.com" }, { role: "assistant", text: "ok" }, { role: "user", text: "CPF 123.456.789-09, tel (11) 91234-5678" },
    ] }, t.d);
    if ("stream" in out) await collect(out.stream);
    const req = model.calls[0];
    expect(req.messages).toEqual([
      { role: "user", content: "meu email [email]" }, { role: "assistant", content: "ok" }, { role: "user", content: "CPF [cpf], tel [phone]" },
    ]);
    expect(req.cachedSystem).toContain("## A3.");
    expect(req.cachedSystem).toContain("# SolvyMed App Map");
    expect(req.system).toMatch(/RULE 1: when in doubt, stop and ask/);
    expect(req.system).toContain("Não posso ajudar com questões clínicas.");
  });

  it("the knowledge never carries held text (conditions), and the app gets the app's view", () => {
    expect(cachedSystem("en", "web")).not.toContain("Outside your working hours");
    expect(cachedSystem("en", "web")).toContain("On the website:");
    expect(cachedSystem("en", "app")).not.toContain("On the website:");
  });

  it("an unknown article marker, or a web-less screen, gives no button", async () => {
    const t = deps({ model: fakeModelClient(() => "Veja.\n[[open:Z9]] e [[evil]]") });
    const out = await handleAssistant(ask("oi"), t.d);
    if (!("stream" in out)) throw new Error("no stream");
    const chunks = await collect(out.stream);
    expect(chunks.some((c) => c.kind === "block" && c.block.type === "open")).toBe(false);
    expect(chunks.filter((c) => c.kind === "delta").map((c) => (c.kind === "delta" ? c.text : "")).join("")).toBe("Veja.\n e ");
  });

  it("a failed model call isn't spent: the refund goes through the service client", async () => {
    const broken: ModelClient = { async *stream() { throw new Error("overloaded"); } };
    const t = deps({ model: broken });
    const out = await handleAssistant(ask("oi"), t.d);
    if (!("stream" in out)) throw new Error("no stream");
    const chunks = await collect(out.stream);
    expect(chunks.at(-1)).toEqual({ kind: "error", code: "model_failed" });
    expect(t.service.calls).toEqual([{ fn: "assistant_release_message", args: { p_professional_id: "doc-1" } }]);
  });

  it("a client that goes away mid-answer: the message is refunded, never left pending", async () => {
    const t = deps({ model: fakeModelClient(() => "Uma resposta bem longa que ainda está chegando.") });
    const out = await handleAssistant(ask("oi"), t.d);
    if (!("stream" in out)) throw new Error("no stream");
    const it = out.stream[Symbol.asyncIterator]();
    await it.next(); // meta
    await it.next(); // the first piece of text
    await it.return?.(undefined); // the route's cancel()
    expect(t.service.calls).toEqual([{ fn: "assistant_release_message", args: { p_professional_id: "doc-1" } }]);
  });

  it("a cancel before the stream even started still refunds (settle), once", async () => {
    const t = deps();
    const out = await handleAssistant(ask("oi"), t.d);
    if (!("stream" in out)) throw new Error("no stream");
    await out.settle?.();
    await out.settle?.();
    expect(t.service.calls).toEqual([{ fn: "assistant_release_message", args: { p_professional_id: "doc-1" } }]);
  });

  it("the testing model (SOLVYAI_FAKE_MODEL=1) answers from Help, and never on Production", async () => {
    const { modelFromEnv } = await import("@/lib/assistant/server/model");
    const env = { ...process.env };
    delete process.env.ANTHROPIC_API_KEY;
    process.env.SOLVYAI_FAKE_MODEL = "1";
    process.env.VERCEL_ENV = "production";
    expect(modelFromEnv()).toBeNull();
    process.env.VERCEL_ENV = "preview";
    const model = modelFromEnv();
    expect(model).not.toBeNull();
    const t = deps({ model });
    const out = await handleAssistant(ask("Como bloquear horário na agenda?"), t.d);
    if (!("stream" in out)) throw new Error("no stream");
    const chunks = await collect(out.stream);
    expect(chunks.filter((c) => c.kind === "delta").map((c) => (c.kind === "delta" ? c.text : "")).join("")).toContain("resposta de teste");
    expect(chunks.some((c) => c.kind === "block" && c.block.type === "open")).toBe(true);
    // It records zero usage (a Preview on the real database stays clean).
    expect(t.service.calls).toEqual([{ fn: "assistant_record_usage", args: { p_professional_id: "doc-1", p_input: 0, p_output: 0, p_cache_read: 0, p_cache_write: 0 } }]);
    process.env = env;
  });

  it("a finished answer is settled once (recorded), never refunded too", async () => {
    const t = deps();
    const out = await handleAssistant(ask("oi"), t.d);
    if ("stream" in out) await collect(out.stream);
    expect(t.service.calls.map((c) => c.fn)).toEqual(["assistant_record_usage"]);
  });

  it("over the monthly budget: no model call, not spent, a plain line (never 'budget')", async () => {
    const model = fakeModelClient(() => "should not be called");
    const t = deps({ model, budget: { configured: true, over_80: true, over_budget: true } });
    const out = await handleAssistant(ask("Como bloquear horário?"), t.d);
    if (!("stream" in out)) throw new Error("no stream");
    const chunks = await collect(out.stream);
    expect(model.calls).toEqual([]);
    expect(t.service.calls).toEqual([{ fn: "assistant_release_message", args: { p_professional_id: "doc-1" } }]);
    const text = chunks.filter((c) => c.kind === "delta").map((c) => (c.kind === "delta" ? c.text : "")).join("");
    // The Help Center isn't published yet: no article links, the "try later" line.
    expect(text).toBe("O SolvyAI está temporariamente indisponível. Tente novamente mais tarde.");
    expect(text).not.toMatch(/orçamento|budget/i);
    expect(chunks.at(-2)).toMatchObject({ kind: "usage", used: 2 });
  });
});
