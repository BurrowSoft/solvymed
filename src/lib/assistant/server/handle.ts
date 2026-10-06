import { HELP, articleTitle, helpLang, rankHelp, webScreen } from "@/lib/help";
import { liveFeatures } from "@/lib/liveFeatures";
import { routing } from "@/i18n/routing";
import { maskPersonalData, MAX_MESSAGE_CHARS, MAX_TURNS } from "@/lib/assistant/mask";
import { isInternalHref, webPath } from "@/lib/assistant/targets";
import type { AnswerChunk, AssistantScreen, TargetScreen } from "@/lib/assistant/types";
import { clinicDate, clinicTime, getClinicTimeZone } from "@/lib/clinicTime";
import { formatDateLabel } from "@/lib/dateLabels";
import { countryProfile, messagingChannel } from "@/lib/country";
import { lookupPracticeCountry } from "@/lib/practiceCountry";
import { cachedSystem, rules, type Client } from "./knowledge";
import type { ContentBlock, ModelClient, ModelMessage, ModelUsage, RawBlock } from "./model";
import { confirmFailedBlock, runTool, toolDefsFor, type ToolContext } from "./tools";
import { loadTexts } from "./texts";

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

const SCREENS: AssistantScreen[] =["home", "schedule", "patients", "payments", "settings", "other"];
const KEEP_MESSAGES = 6;
// Thinking (low effort) + the answer (c6, 53's probes); answers stay short
// by the prompt (UX: an overview + the Help articles for broad questions).
const MAX_TOKENS = 4000;
// Model calls per answer in actions mode (reads, then a proposal or text).
const MAX_ROUNDS = 4;
// The nudge after an empty last reply (53): the answer, from the results.
const ANSWER_NOW = "Now write your answer to my question, based on the results above.";

type Body = {
  messages?: { role?: unknown; text?: unknown }[];
  screen?: unknown;
  locale?: unknown;
  conversationTurns?: unknown;
  event?: unknown;
};

const localeOf = (v: unknown) => (typeof v === "string" && (routing.locales as readonly string[]).includes(v) ? v : routing.defaultLocale);
const prefixOf = (locale: string) => (locale === routing.defaultLocale ? "" : `/${locale}`);

// The practice country's facts for every answer, Help ones too (53's go-live
// audit: Pix and a WhatsApp link named to a Thai doctor). From the country
// config, never a per-country branch.
const QR_NAMES = { pix: "Pix (a QR and Pix Copia e Cola)", promptpay: "the PromptPay QR" } as const;
export function practiceLine(country: string | undefined): string {
  if (!country) return "";
  const p = countryProfile(country);
  const parts = [`This practice's country is ${country}.`];
  if (p.paymentQr) parts.push(`Patients pay by ${QR_NAMES[p.paymentQr]}; never mention another country's payment method.`);
  if (!messagingChannel(p)) parts.push("This practice has no messaging-app items (no WhatsApp; LINE isn't live yet): never suggest sending anything by WhatsApp or LINE.");
  else if (!p.paymentShare) parts.push("There's no payment message to send by a messaging app.");
  return "\n" + parts.join(" ");
}

// The clinic's "now" and the tool context for one request.
async function toolContext(db: unknown, profId: string, locale: string, client: Client, userText = ""): Promise<ToolContext & { tz: string }> {
  const tz = await getClinicTimeZone(db, { professionalId: profId, isSecretary: false });
  const now = new Date();
  // The practice country (its calendar, IDs, currency); unknown stays unset
  // and the tools that need it fail closed (practiceCountry in ./tools).
  const pc = await lookupPracticeCountry(db as ToolContext["db"], profId, profId).catch(() => null);
  return {
    ...(pc?.ok ? { country: pc.country } : {}),
    db: db as ToolContext["db"],
    profId,
    t: await loadTexts(locale),
    locale,
    prefix: prefixOf(locale),
    today: clinicDate(now, tz),
    nowTime: clinicTime(now, tz),
    seen: new Set(),
    client,
    userText,
    tz,
  };
}

// The real dates around today, so the model looks a date up instead of
// computing it (UX: "31/09" must be impossible): a week back, three ahead.
export function calendarLine(today: string): string {
  const base = Date.parse(`${today}T12:00:00Z`);
  const days: string[] = [];
  for (let i = -7; i <= 21; i++) {
    const iso = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    days.push(`${formatDateLabel("en-US", iso, { weekday: "short" })} ${iso}${i === 0 ? " (today)" : ""}`);
  }
  return `Calendar (take every date from here; never compute one): ${days.join(", ")}.`;
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
function openBlock(id: string, locale: string, client: Client, label: string): AnswerChunk | null {
  const article = HELP.flatMap((c) => c.articles).find((a) => a.id === id);
  if (!article) return null;
  const path = client === "web" && article.webUnavailable ? null : webScreen(article.open);
  if (!path) return null;
  const href = `${locale === routing.defaultLocale ? "" : `/${locale}`}${path}`;
  if (!isInternalHref(href)) return null;
  return { kind: "block", block: { type: "open", label, href, target: { screen: targetOf(path) } } };
}

// Streams the model's text while holding back anything from "[[" until its
// "]]", so markers never reach the user; returns the marker ids seen.
// Where the last full sentence ends (after ". ", "! ", "? ", "… " or a line
// break; Thai has no full stop, so a space ends a phrase there), or 0.
// Never a "." inside a number ("R$ 1.500").
export function sentenceEnd(text: string, locale: string): number {
  let end = 0;
  for (const m of text.matchAll(/[.!?…](?=\s)|\n/g)) end = m.index! + m[0].length;
  if (locale === "th") end = Math.max(end, text.lastIndexOf(" ") + 1);
  return end;
}
// A whole text cut by the cap: up to its last full sentence + the pointer.
export function cutToSentence(text: string, locale: string, pointer: string): string {
  const end = sentenceEnd(text, locale);
  const kept = (end > 0 ? text.slice(0, end) : "").trimEnd();
  return kept ? `${kept}\n\n${pointer}` : "";
}

// The longest real marker: "[[open:A12]]".
const MARKER_MAX = 12;
// The start of a broken marker to drop: "[[open:A1]" / "[[open:" / "[[".
const brokenMarker = (s: string) => /^\[\[(?:open:[A-Z]?\d{0,2}\]?)?/.exec(s)![0];

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
      if (end < 0 || end > MARKER_MAX) {
        // A real marker closes within a few characters. Longer, it's a
        // broken one ("[[open:A1]") or plain text: drop only the broken
        // start, never the rest of the answer (53: "…(já" then nothing).
        if (end < 0 && held.length <= MARKER_MAX) break; // wait for the rest of the marker
        held = held.slice(brokenMarker(held).length);
        continue;
      }
      const m = held.slice(0, end + 2).match(/^\[\[open:([A-Z]\d{1,2})\]\]$/);
      if (m) seen.push(m[1]);
      held = held.slice(end + 2);
    }
  }
  // An unfinished marker at the end is dropped; plain text is kept.
  if (held.startsWith("[[")) held = held.slice(brokenMarker(held).length);
  if (held) yield held;
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
  const tx = await loadTexts(req.locale);
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
          ? tx.unavailableArticles
          : tx.unavailableLater,
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
      // One extra round when the answer would be empty (53): see below.
      let nudged = false;
      // Previews only: each round's stop reason, raw text length, tools and
      // output tokens, for the testers' probes (no content).
      const diag: { round: number; stop: string; chars: number; calls: string[]; output: number; blocks: string[] }[] = [];
      const debug = (): AnswerChunk[] => (process.env.VERCEL_ENV === "preview" ? [{ kind: "debug", rounds: diag }] : []);
      // What this answer has put on screen for the user to act on.
      let shown: "card" | "choice" | "slot" | null = null;
      try {
        const ctx = mode === "actions" ? await toolContext(deps.db, userId, req.locale, deps.client, messages[messages.length - 1].content) : null;
        let system = rules(lang, deps.client, req.screen, mode, tx.reply);
        const country = ctx ? ctx.country : await lookupPracticeCountry(deps.db as unknown as ToolContext["db"], userId, userId).then((r) => (r.ok ? r.country : undefined), () => undefined);
        system += practiceLine(country);
        if (ctx) system += `\nToday at the clinic: ${formatDateLabel("en-US", ctx.today, { weekday: "long" })} ${ctx.today}, ${ctx.nowTime} (${ctx.tz}). Dates for the tools are YYYY-MM-DD in this calendar.\n${calendarLine(ctx.today)}`;
        // The practice's calendar for dates written in the answer (UX 5 Oct),
        // so they match the cards; the tools always take Gregorian.
        if (ctx?.country && countryProfile(ctx.country).calendar === "buddhist") system += `\nThis practice uses the Thai Buddhist calendar: when your answer writes a date with a year, write the Buddhist year (the Gregorian year + 543, e.g. 2026 → 2569), never "BE"/"พ.ศ." after it. The tools still take YYYY-MM-DD (Gregorian).`;
        const history: ModelMessage[] = [...messages];
        for (let round = 0; round < (ctx ? MAX_ROUNDS : 1); round++) {
          let said = "";
          let stop = "";
          let blocks: string[] = [];
          let raw: RawBlock[] | null = null;
          let roundOut = 0;
          const calls: { id: string; name: string; input: Record<string, unknown> }[] = [];
          async function* texts(): AsyncIterable<string> {
            for await (const ev of model.stream({
              cachedSystem: cachedSystem(lang, deps.client, tx.reply),
              system,
              messages: history,
              ...(ctx ? { tools: toolDefsFor(deps.client) } : {}),
              maxTokens: MAX_TOKENS,
            })) {
              if (ev.type === "text") { said += ev.text; yield ev.text; }
              else if (ev.type === "tool_use") calls.push(ev);
              else if (ev.type === "stop") { stop = ev.reason; blocks = ev.blocks ?? []; }
              else if (ev.type === "raw") raw = ev.content;
              else if (ev.type === "usage") {
                roundOut += ev.usage.output;
                usage.input += ev.usage.input; usage.output += ev.usage.output;
                usage.cacheRead += ev.usage.cacheRead; usage.cacheWrite += ev.usage.cacheWrite;
              }
            }
            diag.push({ round, stop, chars: said.length, calls: calls.map((c) => c.name), output: roundOut, blocks });
          }
          if (!ctx) {
            // Help mode: one round, streamed a sentence at a time. Cut by the
            // token cap: no half sentence, the pointer to Help instead (cf).
            let tail = "";
            for await (const t of filterMarkers(texts(), seen)) {
              tail += t;
              const end = sentenceEnd(tail, req.locale);
              if (end > 0) { answered = true; yield { kind: "delta", text: tail.slice(0, end) }; tail = tail.slice(end); }
            }
            if (stop === "max_tokens") {
              if (answered) yield { kind: "delta", text: `\n\n${tx.seeFullArticle}` };
            } else if (tail.trim()) {
              answered = true;
              yield { kind: "delta", text: tail };
            }
            break;
          }
          // Actions mode (UX, the round-1 tests): a round that calls tools is
          // the model working ("deixa eu conferir…"), and its text is never
          // shown, so no reasoning leaks and no two rounds' texts run
          // together. The last round's text is shown; but once a card or a
          // list to choose from is on screen, that block is the single source
          // of truth and the text is a fixed pointer to it, never the model
          // restating (or contradicting) a patient, date or time.
          let roundText = "";
          for await (const t of filterMarkers(texts(), seen)) roundText += t;
          if (calls.length === 0) {
            // A slot choice carries its own question and buttons: no text at
            // all after it (UX: never "Escolha uma opção acima" over a lone
            // "Outro horário").
            // A list or a time choice carries its own question ("Qual
            // paciente?"): no text after it (3e: never a second "Escolha uma
            // opção" line). A card gets the one pointer line, naming the card's
            // real button in the user's language.
            // The last round empty with nothing on screen (53: the model
            // wrote its answer while calling a tool, then nothing): a fixed
            // line, never an outage message (UX, 5 Oct). A tool round's text
            // is never shown: it was written before the tools' results (c6).
            // Before that line, once: the model is asked to answer now, from
            // the results it has (a text block after the tool results), so
            // what's shown is still written after the results.
            const last = history[history.length - 1];
            if (!shown && !roundText.trim() && !nudged && round < MAX_ROUNDS - 1 && last?.role === "user" && Array.isArray(last.content)) {
              nudged = true;
              history[history.length - 1] = { role: "user", content: [...last.content, { type: "text", text: ANSWER_NOW }] };
              continue;
            }
            const full = stop === "max_tokens" ? cutToSentence(roundText, req.locale, tx.seeFullArticle) : roundText;
            const text = shown === "card" ? tx.pointerCard : shown ? "" : full.trim() || tx.couldntAnswer;
            if (text) { answered = true; yield { kind: "delta", text }; }
            break;
          }
          // The tools, as the user; their blocks (a card, a list to choose
          // from, time chips) go straight to the user, the text to the model.
          // One question at a time (UX): once a list or time choice is on
          // screen, a second one, or a card (the model choosing from its own
          // list; d7, th cancel), waits for the answer to the first.
          const results: ContentBlock[] = [];
          for (const call of calls) {
            const out = await runTool(ctx, call.name, call.input);
            let forModel = out.forModel;
            for (const b of [...(out.block ? [out.block] : []), ...(out.blocks ?? [])]) {
              const waits = b.type === "pick" || b.type === "slot_choice" || b.type === "card";
              if (waits && (shown === "choice" || shown === "slot")) {
                forModel = "Not shown: the user must first answer the list already on screen. Don't choose for them; ask nothing else now.";
                continue;
              }
              answered = true;
              if (b.type === "card") shown = "card";
              else if (b.type === "pick" && shown !== "card") shown = "choice";
              else if (b.type === "slot_choice" && shown !== "card") shown = "slot";
              yield { kind: "block", block: b };
            }
            results.push({ type: "tool_result", tool_use_id: call.id, content: forModel, ...(out.isError ? { is_error: true } : {}) });
          }
          history.push({ role: "assistant", content: raw ?? [...(said ? [{ type: "text" as const, text: said }] : []), ...calls.map((t) => ({ type: "tool_use" as const, ...t }))] });
          history.push({ role: "user", content: results });
          // Out of rounds with nothing shown: a plain line, not an error
          // (the model did answer; its usage is recorded).
          if (round === MAX_ROUNDS - 1 && !answered) {
            answered = true;
            yield { kind: "delta", text: tx.couldntFinish };
          }
        }
        yield { kind: "block", block: { type: "text", text: "" } };
      } catch {
        // The model failed: the message isn't spent (fair to the doctor).
        await refund();
        yield* debug();
        yield { kind: "error", code: "model_failed" };
        return;
      }
      if (!answered) {
        await refund();
        yield* debug();
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
      // One button: "Abrir tela". Several (a broad question): each named
      // after its article, so they can be told apart (53).
      const ids = [...new Set(seen)].slice(0, 3);
      for (const id of ids) {
        const article = ids.length > 1 ? HELP.flatMap((c) => c.articles).find((x) => x.id === id) : null;
        const open = openBlock(id, req.locale, deps.client, article ? articleTitle(article, lang, deps.client === "app") : tx.openScreen);
        if (open) yield open;
      }
      yield { kind: "block", block: { type: "feedback" } };
      yield { kind: "usage", used: c.used ?? 0, limit: c.limit ?? 0, extra: 0, resetsAt: c.resets_at ?? "" };
      yield* debug();
      yield { kind: "done" };
    } finally {
      await refund();
    }
  }
  return { status: 200, stream: stream(), settle: refund };
}
