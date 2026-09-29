import { HELP, articleTitle, helpLang, rankHelp, webScreen } from "@/lib/help";
import { liveFeatures } from "@/lib/liveFeatures";
import { routing } from "@/i18n/routing";
import { maskPersonalData, MAX_MESSAGE_CHARS, MAX_TURNS } from "@/lib/assistant/mask";
import { isInternalHref, webPath } from "@/lib/assistant/targets";
import type { AnswerChunk, AssistantScreen, TargetScreen } from "@/lib/assistant/types";
import { clinicDate, clinicTime, getClinicTimeZone } from "@/lib/clinicTime";
import { formatDateLabel } from "@/lib/dateLabels";
import { cachedSystem, rules, type Client } from "./knowledge";
import type { ContentBlock, ModelClient, ModelMessage, ModelUsage } from "./model";
import { confirmFailedBlock, runTool, toolDefsFor, type ToolContext } from "./tools";

// POST /api/assistant, without the HTTP (docs/assistant-api.md §3): the
// checks in the contract's order, then the streamed answer. Everything it
// touches is injected: the caller's database client (RLS as the user), a
// service client ONLY for the usage report / refund of the message it just
// counted for this caller (a9), and the model. In actions mode (the
// doctor's opt-in, decided by the database per request) the model gets the
// tools (./tools.ts): reads, and proposals that only ever become cards.

type Rpc = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
// enabled: the server-only switch (SOLVYAI_API_ENABLED), checked before
// anything else: until SolvyAI is live (the privacy policy names Anthropic,
// 115 applied), nothing can reach the model, even by calling the route
// directly (a9).
export type Deps = { enabled: boolean; userId: string | null; db: Rpc; service: Rpc; model: ModelClient | null; client: Client };
export type Outcome =
  | { status: number; json: Record<string, unknown> }
  // settle(): refunds the counted message unless the answer already settled
  // it; the route calls it on cancel, which may come before the stream
  // started (a9).
  | { status: 200; stream: AsyncIterable<AnswerChunk>; settle?: () => Promise<void> };

const SCREENS: AssistantScreen[] = ["home", "schedule", "patients", "payments", "settings", "other"];
const KEEP_MESSAGES = 6;
const MAX_TOKENS = 800;
// Model calls per answer in actions mode (reads, then a proposal or text).
const MAX_ROUNDS = 4;

type Body = {
  messages?: { role?: unknown; text?: unknown }[];
  screen?: unknown;
  locale?: unknown;
  conversationTurns?: unknown;
  event?: unknown;
};

const localeOf = (v: unknown) => (typeof v === "string" && (routing.locales as readonly string[]).includes(v) ? v : routing.defaultLocale);
const prefixOf = (locale: string) => (locale === routing.defaultLocale ? "" : `/${locale}`);

// The clinic's "now" and the tool context for one request.
async function toolContext(db: unknown, profId: string, locale: string, client: Client): Promise<ToolContext & { tz: string }> {
  const tz = await getClinicTimeZone(db, { professionalId: profId, isSecretary: false });
  const now = new Date();
  return {
    db: db as ToolContext["db"],
    profId,
    lang: helpLang(locale),
    locale,
    prefix: prefixOf(locale),
    today: clinicDate(now, tz),
    nowTime: clinicTime(now, tz),
    seen: new Set(),
    client,
    tz,
  };
}

// The Help Center links only lead somewhere once it's published.
const helpPublished = () => (liveFeatures.helpCenter as boolean) === true;

function fail(status: number, error: string, extra: Record<string, unknown> = {}): Outcome {
  return { status, json: { error, ...extra } };
}

// The request, checked (contract §3 step 4); null = bad_request.
function parse(body: Body): { messages: { role: "user" | "assistant"; text: string }[]; screen: AssistantScreen; locale: string; turns: number } | "too_long" | "too_many_turns" | null {
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 2 * MAX_TURNS) return null;
  const messages: { role: "user" | "assistant"; text: string }[] = [];
  for (const m of body.messages) {
    if ((m.role !== "user" && m.role !== "assistant") || typeof m.text !== "string") return null;
    messages.push({ role: m.role, text: m.text });
  }
  if (messages[messages.length - 1].role !== "user") return null;
  for (let i = 1; i < messages.length; i++) if (messages[i].role === messages[i - 1].role) return null;
  const last = messages[messages.length - 1].text.trim();
  if (!last) return null;
  if (last.length > MAX_MESSAGE_CHARS) return "too_long";
  const turns = typeof body.conversationTurns === "number" ? body.conversationTurns : 0;
  if (turns >= MAX_TURNS) return "too_many_turns";
  const screen = SCREENS.includes(body.screen as AssistantScreen) ? (body.screen as AssistantScreen) : "other";
  const locale = typeof body.locale === "string" && (routing.locales as readonly string[]).includes(body.locale) ? body.locale : routing.defaultLocale;
  return { messages, screen, locale, turns };
}

// A Help article's screen, for the app (web paths mean nothing there).
function targetOf(path: string): TargetScreen {
  const m = path.match(/^\/dashboard\/(schedule|patients|payments|settings)/);
  return (m?.[1] as TargetScreen | undefined) ?? "home";
}

// The model ends a help answer with [[open:A1]]: an "Open screen" button to
// that article's screen, built here from the Help data (never from model
// text). Unknown ids, and screens the website doesn't have, are dropped.
function openBlock(id: string, locale: string, client: Client): AnswerChunk | null {
  const article = HELP.flatMap((c) => c.articles).find((a) => a.id === id);
  if (!article) return null;
  const path = client === "web" && article.webUnavailable ? null : webScreen(article.open);
  if (!path) return null;
  const href = `${locale === routing.defaultLocale ? "" : `/${locale}`}${path}`;
  if (!isInternalHref(href)) return null;
  const lang = helpLang(locale);
  return { kind: "block", block: { type: "open", label: lang === "pt" ? "Abrir tela" : "Open screen", href, target: { screen: targetOf(path) } } };
}

// Streams the model's text while holding back anything from "[[" until its
// "]]", so markers never reach the user; returns the marker ids seen.
async function* filterMarkers(texts: AsyncIterable<string>, seen: string[]): AsyncIterable<string> {
  let held = "";
  for await (const t of texts) {
    held += t;
    for (;;) {
      const start = held.indexOf("[[");
      if (start < 0) {
        // Keep a trailing "[" in case the next piece completes "[[".
        const keep = held.endsWith("[") ? 1 : 0;
        if (held.length > keep) yield held.slice(0, held.length - keep);
        held = held.slice(held.length - keep);
        break;
      }
      if (start > 0) { yield held.slice(0, start); held = held.slice(start); continue; }
      const end = held.indexOf("]]");
      if (end < 0) break; // wait for the rest of the marker
      const m = held.slice(0, end + 2).match(/^\[\[open:([A-Z]\d{1,2})\]\]$/);
      if (m) seen.push(m[1]);
      held = held.slice(end + 2);
    }
  }
  // An unfinished marker at the end is dropped; plain text is kept.
  if (held && !held.startsWith("[[")) yield held;
}

// The client's Confirmar failed (the slot was just taken): a fixed text and
// fresh times, no model call, so it's free and can't be used for free
// answers. Rate-limited like a message (consumed), then not counted
// (released). Only the action's date, time and duration are used, all
// re-validated; nothing else in it is trusted (a9).
async function confirmFailed(body: Body, deps: Deps, userId: string): Promise<Outcome> {
  const ev = body.event as { type?: unknown; code?: unknown; action?: unknown } | null;
  if (!ev || typeof ev !== "object" || ev.type !== "confirm_failed" || typeof ev.code !== "string") return fail(400, "bad_request");
  const { data: consumed, error } = await deps.db.rpc("assistant_consume_message");
  if (error || !consumed || typeof consumed !== "object") return fail(503, "model_unavailable");
  const c = consumed as { allowed: boolean; reason?: string; retry_after_s?: number; actions?: boolean };
  if (!c.allowed) {
    if (c.reason === "not_doctor") return fail(403, "not_doctor");
    if (c.reason === "inactive") return fail(403, "inactive");
    if (c.reason === "rate_limited") return fail(429, "rate_limited", { retryAfterS: c.retry_after_s ?? 3 });
    // Out of messages today: this one was free anyway, so it's still answered.
    if (c.reason !== "quota_exhausted") return fail(503, "model_unavailable");
  } else {
    await deps.service.rpc("assistant_release_message", { p_professional_id: userId });
  }
  // Cards only exist in actions mode; a help-mode doctor can't have one.
  if (c.allowed && c.actions !== true) return fail(400, "bad_request");
  const locale = localeOf(body.locale);
  const ctx = await toolContext(deps.db, userId, locale, deps.client);
  const block = await confirmFailedBlock(ctx, ev.action, ev.code);
  if (!block) return fail(400, "bad_request");
  async function* stream(): AsyncIterable<AnswerChunk> {
    yield { kind: "meta", mode: "actions" };
    yield { kind: "block", block: block! };
    yield { kind: "done" };
  }
  return { status: 200, stream: stream() };
}

export async function handleAssistant(body: Body, deps: Deps): Promise<Outcome> {
  // 0. SolvyAI off: the route doesn't exist.
  if (!deps.enabled) return fail(404, "not_found");
  // 1. Who is asking (RLS as them from here on).
  if (!deps.userId) return fail(401, "unauthorized");
  // A Confirmar the database refused: answered without the model (§5a).
  if (body && body.event !== undefined) return confirmFailed(body, deps, deps.userId);
  // 2–4. The request itself.
  const parsed = parse(body);
  if (parsed === null) return fail(400, "bad_request");
  if (parsed === "too_long" || parsed === "too_many_turns") return fail(400, parsed);
  const req = parsed;
  // No model (no key yet): nothing is counted.
  if (!deps.model) return fail(503, "model_unavailable");

  // 5. Re-mask everything; the client masks too, but it isn't trusted.
  const messages = req.messages.slice(-KEEP_MESSAGES).map((m) => ({ role: m.role, content: maskPersonalData(m.text) }));

  // 6. Doctors only, an active plan, the day's quota and the anti-spam
  // limits, decided by the database (migration 115). Before 115 exists the
  // route refuses rather than answer uncounted.
  const { data: consumed, error: consumeError } = await deps.db.rpc("assistant_consume_message");
  if (consumeError || !consumed || typeof consumed !== "object") return fail(503, "model_unavailable");
  const c = consumed as { allowed: boolean; reason?: string; used?: number; limit?: number; resets_at?: string; retry_after_s?: number; actions?: boolean };
  if (!c.allowed) {
    if (c.reason === "not_doctor") return fail(403, "not_doctor");
    if (c.reason === "inactive") return fail(403, "inactive");
    if (c.reason === "quota_exhausted") return fail(429, "quota_exhausted", { usage: { used: c.used, limit: c.limit, extra: 0, resetsAt: c.resets_at } });
    if (c.reason === "rate_limited") return fail(429, "rate_limited", { retryAfterS: c.retry_after_s ?? 3 });
    return fail(503, "model_unavailable");
  }

  // The mode (contract §2): actions only with the doctor's opt-in, which
  // the database reports per request (115); never from the client.
  const mode: "help" | "actions" = c.actions === true ? "actions" : "help";
  const lang = helpLang(req.locale);
  const model = deps.model;
  const userId = deps.userId;

  // The monthly budget guard (spec §4.8): at 100 %, no model call and the
  // message isn't spent; never an error, never the word "budget" (UX). The
  // plain Help search answers instead, while the Help Center is published.
  const { data: budget } = await deps.db.rpc("assistant_budget_state");
  if ((budget as { over_budget?: boolean } | null)?.over_budget === true) {
    await deps.service.rpc("assistant_release_message", { p_professional_id: userId });
    const question = maskPersonalData(req.messages[req.messages.length - 1].text);
    const found = helpPublished() ? rankHelp(question, lang, deps.client === "app", 3) : [];
    const prefix = req.locale === routing.defaultLocale ? "" : `/${req.locale}`;
    async function* unavailable(): AsyncIterable<AnswerChunk> {
      yield { kind: "meta", mode: "help" };
      yield {
        kind: "delta",
        text: found.length
          ? (lang === "pt" ? "O SolvyAI está temporariamente indisponível. Estes artigos podem ajudar:" : "SolvyAI is temporarily unavailable. These articles may help:")
          : (lang === "pt" ? "O SolvyAI está temporariamente indisponível. Tente novamente mais tarde." : "SolvyAI is temporarily unavailable. Please try again later."),
      };
      yield { kind: "block", block: { type: "text", text: "" } };
      for (const a of found) {
        const target = { screen: "help" as const, id: a.id.toLowerCase() };
        const href = webPath(prefix, target);
        if (href && isInternalHref(href)) yield { kind: "block", block: { type: "open", label: articleTitle(a, lang, deps.client === "app"), href, target } };
      }
      yield { kind: "usage", used: Math.max(0, (c.used ?? 1) - 1), limit: c.limit ?? 0, extra: 0, resetsAt: c.resets_at ?? "" };
      yield { kind: "done" };
    }
    return { status: 200, stream: unavailable() };
  }

  // Every counted message ends settled exactly once: its usage recorded,
  // or refunded (a model failure, no answer, or the client going away
  // mid-answer: the route cancels the stream and this finally runs; a9).
  let settled = false;
  const refund = async () => {
    if (settled) return;
    settled = true;
    await deps.service.rpc("assistant_release_message", { p_professional_id: userId });
  };
  async function* stream(): AsyncIterable<AnswerChunk> {
    try {
      yield { kind: "meta", mode };
      const seen: string[] = [];
      const usage: ModelUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      let answered = false;
      try {
        const ctx = mode === "actions" ? await toolContext(deps.db, userId, req.locale, deps.client) : null;
        let system = rules(lang, deps.client, req.screen, mode);
        if (ctx) system += `\nToday at the clinic: ${formatDateLabel("en-US", ctx.today, { weekday: "long" })} ${ctx.today}, ${ctx.nowTime} (${ctx.tz}). Dates for the tools are YYYY-MM-DD in this calendar.`;
        const history: ModelMessage[] = [...messages];
        for (let round = 0; round < (ctx ? MAX_ROUNDS : 1); round++) {
          let said = "";
          const calls: { id: string; name: string; input: Record<string, unknown> }[] = [];
          async function* texts(): AsyncIterable<string> {
            for await (const ev of model.stream({
              cachedSystem: cachedSystem(lang, deps.client),
              system,
              messages: history,
              ...(ctx ? { tools: toolDefsFor(deps.client) } : {}),
              maxTokens: MAX_TOKENS,
            })) {
              if (ev.type === "text") { said += ev.text; yield ev.text; }
              else if (ev.type === "tool_use") calls.push(ev);
              else if (ev.type === "usage") {
                usage.input += ev.usage.input; usage.output += ev.usage.output;
                usage.cacheRead += ev.usage.cacheRead; usage.cacheWrite += ev.usage.cacheWrite;
              }
            }
          }
          for await (const t of filterMarkers(texts(), seen)) {
            answered = true;
            yield { kind: "delta", text: t };
          }
          if (!ctx || calls.length === 0) break;
          // The tools, as the user; their blocks (a card, time chips) go
          // straight to the user, the text back to the model.
          const results: ContentBlock[] = [];
          for (const call of calls) {
            const out = await runTool(ctx, call.name, call.input);
            if (out.block) { answered = true; yield { kind: "block", block: out.block }; }
            for (const b of out.blocks ?? []) { answered = true; yield { kind: "block", block: b }; }
            results.push({ type: "tool_result", tool_use_id: call.id, content: out.forModel, ...(out.isError ? { is_error: true } : {}) });
          }
          history.push({ role: "assistant", content: [...(said ? [{ type: "text" as const, text: said }] : []), ...calls.map((t) => ({ type: "tool_use" as const, ...t }))] });
          history.push({ role: "user", content: results });
          // Out of rounds with nothing shown: a plain line, not an error
          // (the model did answer; its usage is recorded).
          if (round === MAX_ROUNDS - 1 && !answered) {
            answered = true;
            yield { kind: "delta", text: lang === "pt" ? "Não consegui concluir isso. Pode dizer de outro jeito, com o nome do paciente, a data e o horário?" : "I couldn't finish that. Could you say it another way, with the patient's name, the date and the time?" };
          }
        }
        yield { kind: "block", block: { type: "text", text: "" } };
      } catch {
        // The model failed: the message isn't spent (fair to the doctor).
        await refund();
        yield { kind: "error", code: "model_failed" };
        return;
      }
      if (!answered) {
        await refund();
        yield { kind: "error", code: "model_failed" };
        return;
      }
      // Token usage for the budget guard: for the caller it just counted,
      // with the service client, never an id from the request (a9).
      const u = usage;
      settled = true;
      await deps.service.rpc("assistant_record_usage", {
        p_professional_id: userId,
        p_input: u.input, p_output: u.output, p_cache_read: u.cacheRead, p_cache_write: u.cacheWrite,
      });
      const open = seen.length ? openBlock(seen[0], req.locale, deps.client) : null;
      if (open) yield open;
      yield { kind: "block", block: { type: "feedback" } };
      yield { kind: "usage", used: c.used ?? 0, limit: c.limit ?? 0, extra: 0, resetsAt: c.resets_at ?? "" };
      yield { kind: "done" };
    } finally {
      await refund();
    }
  }
  return { status: 200, stream: stream(), settle: refund };
}
