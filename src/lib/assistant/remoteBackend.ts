import { executeSolvyAiAction, undoSolvyAiAction } from "@/app/[locale]/(site)/dashboard/solvyai-actions";
import type { AnswerChunk, AssistantBackend, AssistantRequest, AssistantUsage, CardAction, ExecuteResult } from "./types";

// The panel's backend on the real route (docs/assistant-api.md §3–4): the
// question goes to POST /api/assistant (cookie auth, same origin) and the
// NDJSON answer is read line by line; Confirmar and Desfazer run the card's
// action through the screens' own server actions.
//
// Errors before the stream become one `error` chunk with the route's code
// (and the quota's usage when it sent one), so the panel shows the §3 table's
// message; see errorOf.

export type RemoteError = { kind: "error"; code: string; usage?: AssistantUsage; retryAfterS?: number };

const ENDPOINT = "/api/assistant";

async function* lines(res: Response): AsyncIterable<AnswerChunk> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) yield JSON.parse(line) as AnswerChunk;
      }
    }
    const rest = (buf + decoder.decode()).trim();
    if (rest) yield JSON.parse(rest) as AnswerChunk;
  } finally {
    // Leaving early (the panel closed) cancels the request: the route stops
    // the model and refunds the message.
    await reader.cancel().catch(() => {});
  }
}

async function* post(body: unknown, signal?: AbortSignal): AsyncIterable<AnswerChunk> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  } catch {
    yield { kind: "error", code: "model_unavailable" };
    return;
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; usage?: AssistantUsage; retryAfterS?: number };
    const err: RemoteError = { kind: "error", code: j.error ?? (res.status === 404 ? "not_found" : "model_unavailable") };
    if (j.usage) err.usage = j.usage;
    if (typeof j.retryAfterS === "number") err.retryAfterS = j.retryAfterS;
    yield err as AnswerChunk;
    return;
  }
  yield* lines(res);
}

// The history the route accepts: strictly alternating, starting and ending
// with the user (the route answers 400 otherwise). An unanswered user turn
// (its answer failed) is dropped and the newer one kept; the last 6.
export function toWireMessages(history: AssistantRequest["messages"]): AssistantRequest["messages"] {
  const out: AssistantRequest["messages"] = [];
  for (const m of history) {
    if (!m.text.trim()) continue;
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1] = m;
    else out.push(m);
  }
  let kept = out.slice(-6);
  while (kept.length && kept[0].role !== "user") kept = kept.slice(1);
  return kept;
}

// limit: the plan's daily limit, shown until the route reports the real one.
export function createRemoteBackend({ limit }: { limit: number }): AssistantBackend {
  // Desfazer needs what the save replaced (a cancel's old status, a
  // payment's old state), kept here by the saved row's id.
  const prevs = new Map<string, string>();
  return {
    ask(req: AssistantRequest) {
      const messages = toWireMessages(req.messages);
      return post({ messages, screen: req.screen, locale: req.locale, conversationTurns: req.turns ?? messages.filter((m) => m.role === "user").length - 1 });
    },
    async usage() {
      const res = await fetch(`${ENDPOINT}/usage`, { cache: "no-store" }).catch(() => null);
      const j = res?.ok ? ((await res.json().catch(() => null)) as Partial<AssistantUsage> | null) : null;
      // Unknown: an empty bar that doesn't block typing (the route decides).
      return { used: j?.used ?? 0, limit: j?.limit || limit, extra: j?.extra ?? 0, resetsAt: j?.resetsAt ?? "" };
    },
    async execute(action: CardAction, opts?: { warningsAsked?: boolean }): Promise<ExecuteResult> {
      let r: Awaited<ReturnType<typeof executeSolvyAiAction>>;
      try {
        r = await executeSolvyAiAction(action, opts?.warningsAsked === true);
      } catch {
        return { ok: false, code: "generic" };
      }
      if (!r.ok) return r;
      if (r.id && r.prev) prevs.set(r.id, r.prev);
      return { ok: true, id: r.id };
    },
    reportConfirmFailed(code: string, action: CardAction, locale: string) {
      return post({ event: { type: "confirm_failed", code, action }, locale });
    },
    async undo(action: CardAction, id?: string) {
      if (!id) return;
      try { await undoSolvyAiAction(action, id, prevs.get(id)); } catch { /* the toast still closes */ }
    },
  };
}
