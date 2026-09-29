"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createMockBackend } from "@/lib/assistant/mockBackend";
import { maskPersonalData, MAX_MESSAGE_CHARS, MAX_TURNS, MIN_SECONDS_BETWEEN } from "@/lib/assistant/mask";
import type { AnswerBlock, AnswerChunk, AssistantBackend, AssistantScreen, AssistantUsage, ConfirmationCard, SlotChoice } from "@/lib/assistant/types";
import { isInternalHref, webPath } from "@/lib/assistant/targets";
import { formatDateLabel } from "@/lib/dateLabels";
import { BUTTON_EVENT, readButtonHidden } from "./SolvyAiSettings";
import { helpLang, inlineSegments } from "@/lib/help";
import { liveFeatures } from "@/lib/liveFeatures";
import { track } from "@/lib/track";

// SolvyAI on the web (specs/assistant.md §2): doctors only, on every
// dashboard page. A floating ✦ button bottom-right opens a 400 px panel on
// the right that pushes the content (a full-height sheet on narrow
// screens). The backend is a mock until the /api/assistant route exists
// (docs/assistant-api.md): it answers from the Help articles and proposes
// actions as confirmation cards in the contract's shapes; Confirmar is
// simulated and writes nothing. After a save the panel minimises and the
// page goes to the item, ringed (?highlight=, HighlightFromQuery).

type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; blocks: AnswerBlock[]; streaming: boolean };

export function screenOf(pathname: string, prefix: string): AssistantScreen {
  const p = pathname.slice(prefix.length);
  if (p === "/dashboard" || p === "/dashboard/") return "home";
  const m = p.match(/^\/dashboard\/(schedule|patients|payments|settings)/);
  return (m?.[1] as AssistantScreen) ?? "other";
}

const HINT_KEY = "solvyai_hint_seen";

// Blocked time and times outside the working hours always ask a second
// question (§2.3); a card with either warning but no secondConfirm is
// malformed and dropped (the same rule as the app).
export function cardIsSafe(card: ConfirmationCard): boolean {
  const asksTwice = card.warnings.some((w) => w.code === "blocked" || w.code === "outside_hours");
  return !asksTwice || !!card.secondConfirm?.question;
}

// "Renova em N h": whole hours until the reset, at least 1.
export function hoursUntil(resetsAt: string, now = Date.now()): number {
  const t = Date.parse(resetsAt);
  return Number.isNaN(t) ? 1 : Math.max(1, Math.ceil((t - now) / 3_600_000));
}

export function SolvyAi({ locale, prefix, dailyLimit }: { locale: string; prefix: string; dailyLimit: number }) {
  const t = useTranslations("assistant");
  const router = useRouter();
  const pathname = usePathname();
  const lang = helpLang(locale);
  const backend: AssistantBackend = useMemo(() => createMockBackend({ lang, prefix, limit: dailyLimit }), [lang, prefix, dailyLimit]);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [hint, setHint] = useState(false);
  // Configurações › SolvyAI › "Mostrar botão do assistente" (this browser).
  const [buttonHidden, setButtonHidden] = useState(false);
  useEffect(() => {
    setButtonHidden(readButtonHidden());
    const on = (e: Event) => setButtonHidden((e as CustomEvent<{ hidden: boolean }>).detail.hidden);
    window.addEventListener(BUTTON_EVENT, on);
    return () => window.removeEventListener(BUTTON_EVENT, on);
  }, []);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<AssistantUsage | null>(null);
  const [tooFast, setTooFast] = useState(false);
  const lastSent = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const screen = screenOf(pathname, prefix);

  // First time only: "Posso ajudar?" next to the button, for 5 s.
  useEffect(() => {
    try {
      if (localStorage.getItem(HINT_KEY)) return;
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      return;
    }
    setHint(true);
    const id = setTimeout(() => setHint(false), 5000);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => { void backend.usage().then(setUsage); }, [backend]);
  // Keep the latest answer in view.
  useEffect(() => {
    const el = listRef.current;
    if (el && typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight });
  }, [turns]);

  const userTurns = turns.filter((x) => x.role === "user").length;
  const atLimit = !!usage && usage.used >= usage.limit + usage.extra;
  const outOfTurns = userTurns >= MAX_TURNS;

  const send = useCallback(async (raw: string) => {
    const text = maskPersonalData(raw.trim()).slice(0, MAX_MESSAGE_CHARS);
    if (!text || busy || atLimit || outOfTurns) return;
    // Anti-spam: one message every 3 seconds.
    if (Date.now() - lastSent.current < MIN_SECONDS_BETWEEN * 1000) { setTooFast(true); return; }
    setTooFast(false);
    lastSent.current = Date.now();
    setInput("");
    setBusy(true);
    const history = [...turns, { role: "user" as const, text }];
    setTurns([...history, { role: "assistant", blocks: [], streaming: true }]);
    track("solvyai_message", { screen });
    const messages = history.slice(-6).map((x) =>
      x.role === "user" ? { role: "user" as const, text: x.text } : { role: "assistant" as const, text: x.blocks.map((b) => (b.type === "text" ? b.text : "")).join(" ") },
    );
    await play(history, backend.ask({ messages, screen, locale }));
  }, [busy, atLimit, outOfTurns, turns, backend, screen, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  // Streams an answer into a new assistant turn after `history`: text in
  // pieces, whole blocks, the updated usage; an error ends it with a line.
  async function play(history: Turn[], chunks: AsyncIterable<AnswerChunk>) {
    let blocks: AnswerBlock[] = [];
    let current = "";
    let gotUsage = false;
    try {
      for await (const chunk of chunks) {
        if (chunk.kind === "delta") {
          current += chunk.text;
          const live = [...blocks, { type: "text" as const, text: current }];
          setTurns([...history, { role: "assistant", blocks: live, streaming: true }]);
        } else if (chunk.kind === "block") {
          // A text block closes the streamed text; other blocks come whole.
          if (chunk.block.type === "text") { blocks = [...blocks, { type: "text", text: current }]; current = ""; }
          // Fail closed: a card that must ask twice but carries no second
          // question is never shown, so it can't be confirmed without asking.
          else if (chunk.block.type === "card" && !cardIsSafe(chunk.block.card)) blocks = [...blocks, { type: "text", text: t("unavailable") }];
          else blocks = [...blocks, chunk.block];
          setTurns([...history, { role: "assistant", blocks, streaming: true }]);
        } else if (chunk.kind === "usage") {
          gotUsage = true;
          setUsage({ used: chunk.used, limit: chunk.limit, extra: chunk.extra, resetsAt: chunk.resetsAt });
        } else if (chunk.kind === "error") {
          blocks = [...blocks, { type: "text", text: t("unavailable") }];
          break;
        }
      }
    } catch {
      blocks = [...blocks, { type: "text", text: t("unavailable") }];
    }
    setTurns([...history, { role: "assistant", blocks, streaming: false }]);
    setBusy(false);
    if (!gotUsage) setUsage(await backend.usage());
  }

  // After a confirmed save (§2.3 "After saving"): minimise to the pill, go
  // to the action's screen with the item highlighted, and show "✓ … +
  // Desfazer" for 10 s.
  const afterSave = (card: ConfirmationCard, id: string | undefined, demo: boolean) => {
    const a = card.after;
    const hl = a.highlight?.id ?? id;
    const path = webPath(prefix, { screen: a.screen === "whatsapp" ? a.then?.screen ?? "payments" : a.screen, date: a.date, id: a.screen === "patient" ? hl : undefined }, hl);
    setMinimized(true);
    if (path && isInternalHref(path)) router.push(path);
    setCardDone((d) => ({ ...d, [card.id]: "saved" }));
    setToast({ card, id, demo, left: 10, undone: false });
    track("solvyai_confirmed", { kind: card.action.kind });
  };

  // A save the normal path refused (the slot was just taken, …): the
  // server explains and offers fresh times, in the conversation.
  const confirmFailed = (card: ConfirmationCard, code: string) => {
    setCardDone((d) => ({ ...d, [card.id]: "failed" }));
    setBusy(true);
    void play(turns, backend.reportConfirmFailed(code, card.action, locale));
  };

  const [toast, setToast] = useState<{ card: ConfirmationCard; id?: string; demo: boolean; left: number; undone: boolean } | null>(null);
  // Each card is confirmed at most once: its outcome lives here, not in the
  // card (the panel unmounts when minimised), and a claim is taken
  // synchronously before anything runs.
  const [cardDone, setCardDone] = useState<Record<string, "saved" | "failed">>({});
  const claimed = useRef(new Set<string>());
  const claim = (id: string) => { if (claimed.current.has(id)) return false; claimed.current.add(id); return true; };
  useEffect(() => {
    if (!toast || toast.left <= 0) return;
    const id = setTimeout(() => setToast((x) => (x ? { ...x, left: x.left - 1 } : x)), 1000);
    return () => clearTimeout(id);
  }, [toast]);

  const newConversation = () => { setTurns([]); setInput(""); setTooFast(false); };

  const openScreen = (href: string) => { if (!isInternalHref(href)) return; setMinimized(true); router.push(href); };

  const chips = [t(`chips.${screen}.a`), t(`chips.${screen}.b`), t(`chips.${screen}.c`)];

  return (
    <>
      {/* The panel: beside the content on wide screens (it pushes it), a
          full-height sheet on narrow ones. */}
      {open && !minimized && (
        <aside
          aria-label="SolvyAI"
          className="fixed inset-0 z-40 flex flex-col bg-white lg:static lg:inset-auto lg:z-auto lg:h-screen lg:w-[400px] lg:shrink-0 lg:border-l lg:border-slate-100"
        >
          <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <span className="text-lg text-teal-600" aria-hidden="true">✦</span>
            <h2 className="font-bold text-slate-900">SolvyAI</h2>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">{t("preview")}</span>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={newConversation} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50">{t("newConversation")}</button>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("close")} className="rounded-lg px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-50">✕</button>
            </div>
          </header>

          {usage && <UsageBar usage={usage} />}

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {turns.length === 0 && (
              <div className="pt-6 text-center">
                <p className="text-sm text-slate-500">{t("emptyTitle")}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {chips.map((c) => (
                    <button key={c} type="button" onClick={() => void send(c)} className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100">
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((turn, i) =>
              turn.role === "user" ? (
                <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-teal-600 px-3 py-2 text-sm text-white">{turn.text}</div>
              ) : (
                <div key={i} className="mr-4 space-y-2 text-sm text-slate-800">
                  {turn.streaming && turn.blocks.length === 0 && (
                    <p className="animate-pulse text-slate-400 motion-reduce:animate-none" aria-live="polite">{t("thinking")}</p>
                  )}
                  {turn.blocks.map((b, j) => (
                    <Block key={j} block={b} locale={locale} onPick={(v) => void send(v)} onOpen={openScreen} backend={backend} onSaved={afterSave} onFailed={confirmFailed} done={cardDone} claim={claim} />
                  ))}
                </div>
              ),
            )}
          </div>

          <footer className="border-t border-slate-100 p-3">
            {atLimit ? (
              <p className="text-sm text-slate-600">
                {t("limitReached", { hours: usage ? hoursUntil(usage.resetsAt) : 0 })}
                {liveFeatures.helpCenter && (
                  <> <a href={`${prefix}/help`} className="font-semibold text-teal-700 underline">{t("help")}</a></>
                )}
              </p>
            ) : outOfTurns ? (
              <button type="button" onClick={newConversation} className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700">
                {t("startNew")}
              </button>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="space-y-1.5">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value.slice(0, MAX_MESSAGE_CHARS))}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
                    placeholder={t("placeholder")}
                    aria-label={t("placeholder")}
                    rows={2}
                    className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                  <MicButton lang={locale} onText={(s) => setInput((v) => `${v}${v ? " " : ""}${s}`.slice(0, MAX_MESSAGE_CHARS))} label={t("mic")} />
                  <button type="submit" disabled={busy || !input.trim()} className="rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                    {t("send")}
                  </button>
                </div>
                <p className="flex justify-between text-[11px] text-slate-400">
                  <span>{tooFast ? t("tooFast") : t("noPatientData")}</span>
                  <span>{input.length}/{MAX_MESSAGE_CHARS}</span>
                </p>
              </form>
            )}
          </footer>
        </aside>
      )}

      {/* The floating button (or the minimised pill after "Abrir tela"). */}
      {!(open && !minimized) && !buttonHidden && (
        <div className="fixed bottom-5 right-5 z-30 flex items-center gap-2">
          {/* After a save: "✓ … + Desfazer" for 10 s (§2.3). */}
          {toast && toast.left > 0 && (
            <p role="status" className="flex items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
              <span>{toast.undone ? t("undone") : t("saved")}{toast.demo && ` (${t("simulated")})`}</span>
              {!toast.undone && (
                <button
                  type="button"
                  onClick={async () => { await backend.undo(toast.card.action, toast.id); setToast({ ...toast, undone: true, left: 4 }); }}
                  className="rounded-lg px-2 py-0.5 font-semibold text-teal-300 hover:bg-white/10"
                >
                  {t("undo", { s: toast.left })}
                </button>
              )}
            </p>
          )}
          {hint && !minimized && (
            <p role="status" className="max-w-[14rem] rounded-2xl bg-white px-3 py-2 text-xs text-slate-700 shadow-lg ring-1 ring-slate-100">{t("hint")}</p>
          )}
          {minimized ? (
            <button type="button" onClick={() => setMinimized(false)} className="rounded-full bg-teal-600 px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-teal-700">
              SolvyAI ✦
            </button>
          ) : (
            <button
              type="button"
              data-tour="solvyai"
              onClick={() => { setOpen(true); setHint(false); track("solvyai_opened", { screen }); }}
              aria-label={t("open")}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-2xl text-white shadow-lg transition hover:bg-teal-700"
            >
              ✦
            </button>
          )}
        </div>
      )}
    </>
  );
}

function UsageBar({ usage }: { usage: AssistantUsage }) {
  const t = useTranslations("assistant");
  const pct = Math.min(100, Math.round((usage.used / Math.max(1, usage.limit)) * 100));
  return (
    <div className="border-b border-slate-100 px-4 py-2">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{t("usageToday")}</span>
        <span>{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("usageToday")}>
        <div className={`h-full rounded-full ${pct >= 80 ? "bg-amber-500" : "bg-teal-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">{t("resetsIn", { hours: hoursUntil(usage.resetsAt) })}</p>
      {usage.extra > 0 && <p className="text-[11px] text-slate-500">{t("extra", { n: usage.extra })}</p>}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  return <>{inlineSegments(text).map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>))}</>;
}

type Saved = (card: ConfirmationCard, id: string | undefined, demo: boolean) => void;
type Failed = (card: ConfirmationCard, code: string) => void;

function Block({ block, locale, onPick, onOpen, backend, onSaved, onFailed, done, claim }: {
  block: AnswerBlock; locale: string; onPick: (v: string) => void; onOpen: (href: string) => void;
  backend: AssistantBackend; onSaved: Saved; onFailed: Failed;
  done: Record<string, "saved" | "failed">; claim: (id: string) => boolean;
}) {
  const t = useTranslations("assistant");
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  switch (block.type) {
    case "text":
      return block.text ? <p className="leading-relaxed"><Inline text={block.text} /></p> : null;
    case "steps":
      return <ol className="list-decimal space-y-1 pl-5">{block.items.map((s, i) => <li key={i}><Inline text={s} /></li>)}</ol>;
    case "open":
      return (
        <button type="button" onClick={() => onOpen(block.href)} className="rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-bold text-teal-700 hover:bg-teal-50">
          {block.label} →
        </button>
      );
    case "pick":
      return (
        <div>
          <p className="mb-1.5 font-semibold">{block.question}</p>
          <div className="space-y-1.5">
            {block.options.map((o) => (
              <button key={o.id} type="button" onClick={() => onPick(o.title)} className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-left hover:border-teal-300">
                <span className="font-semibold">{o.title}</span>
                <span className="block text-xs text-slate-500">{o.detail}</span>
              </button>
            ))}
          </div>
        </div>
      );
    case "card":
      return <CardView card={block.card} backend={backend} onSaved={onSaved} onFailed={onFailed} done={done[block.card.id]} claim={claim} />;
    case "slot_choice":
      return <SlotChoiceView block={block} locale={locale} onPick={onPick} />;
    case "feedback":
      return (
        <div className="flex items-center gap-2 pt-1 text-xs text-slate-500">
          <button type="button" aria-label={t("helpful")} aria-pressed={vote === "up"} onClick={() => { setVote("up"); track("solvyai_feedback", { vote: "up" }); }} className={`rounded-lg px-2 py-1 ${vote === "up" ? "bg-teal-50" : "hover:bg-slate-50"}`}>👍</button>
          <button type="button" aria-label={t("notHelpful")} aria-pressed={vote === "down"} onClick={() => { setVote("down"); track("solvyai_feedback", { vote: "down" }); }} className={`rounded-lg px-2 py-1 ${vote === "down" ? "bg-slate-100" : "hover:bg-slate-50"}`}>👎</button>
          <a href="mailto:support@solvymed.com" className="ml-auto font-semibold text-teal-700 hover:underline">{t("support")}</a>
        </div>
      );
  }
}

// A confirmation card (§2.3): nothing happens until Confirmar on THIS card.
// Blocked / outside hours ask the card's second question first; a hard-
// stopped or expired card can't be confirmed. The save goes through the
// normal path; then the panel hands over to "after saving".
function CardView({ card, backend, onSaved, onFailed, done, claim }: {
  card: ConfirmationCard; backend: AssistantBackend; onSaved: Saved; onFailed: Failed;
  done?: "saved" | "failed"; claim: (id: string) => boolean;
}) {
  const t = useTranslations("assistant");
  // A card saved or refused before (e.g. before the panel was minimised)
  // comes back as it ended, never with Confirmar again.
  const [local, setState] = useState<"idle" | "asking" | "saving" | "saved" | "failed">("idle");
  const state = done ?? local;
  // A malformed expiry counts as expired (never "not expired").
  const expired = () => { const at = Date.parse(card.expiresAt); return Number.isNaN(at) || Date.now() > at; };
  const [isExpired, setIsExpired] = useState(false);

  const run = async () => {
    if (expired()) { setIsExpired(true); setState("idle"); return; }
    // At most once per card, whatever the UI state.
    if (!claim(card.id)) return;
    setState("saving");
    const r = await backend.execute(card.action);
    if (r.ok) { setState("saved"); onSaved(card, r.id, r.demo === true); }
    else { setState("failed"); onFailed(card, r.code); }
  };
  const confirm = () => {
    if (expired()) { setIsExpired(true); return; }
    if (card.secondConfirm) setState("asking");
    else void run();
  };
  const blocked = card.hardStop || isExpired;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="font-bold text-slate-900">{card.icon} {card.title}</p>
      <dl className="mt-2 space-y-1 text-xs">
        {card.fields.map((f) => (
          <div key={f.label} className="flex gap-2">
            <dt className="w-24 shrink-0 text-slate-500">{f.label}</dt>
            <dd className="text-slate-800">{f.value}{f.isDefault && <span className="ml-1 text-slate-400">({t("default")})</span>}</dd>
          </div>
        ))}
      </dl>
      {card.warnings.map((w) => <p key={w.code} className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">{w.text}</p>)}
      {card.hardStop && card.stop && <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">{card.stop.text}</p>}
      {isExpired && <p className="mt-2 text-xs font-semibold text-slate-500">{t("expired")}</p>}
      <div className="mt-3">
        {state === "saved" ? (
          <p className="text-xs font-semibold text-green-700">{t("saved")}</p>
        ) : state === "asking" && card.secondConfirm ? (
          // The app's own second question, with the server's wording.
          <div role="alertdialog" aria-label={card.secondConfirm.question} className="rounded-xl bg-amber-50 p-2 text-xs">
            <p className="font-semibold text-amber-900">{card.secondConfirm.question}</p>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setState("idle")} className="rounded-lg px-3 py-1.5 font-semibold text-slate-600 hover:bg-white">{t("cancel")}</button>
              <button type="button" onClick={() => void run()} className="rounded-lg bg-teal-600 px-3 py-1.5 font-bold text-white hover:bg-teal-700">{card.secondConfirm.confirmLabel}</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            {isInternalHref(card.editHref) ? (
              <a href={card.editHref} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">{t("edit")}</a>
            ) : <span />}
            <button
              type="button"
              disabled={blocked || state === "saving"}
              onClick={confirm}
              className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {state === "saving" ? "…" : t("confirm")}
            </button>
          </div>
        )}
        {state === "failed" && <p className="mt-2 text-xs font-semibold text-red-600">{t("failed")}</p>}
      </div>
    </div>
  );
}

// No card: what's there, and the nearest free times as chips. Tapping one
// sends it as the doctor's next message ("terça, 29/09/2026 às 10:30"); the
// assistant never picks (§2.3).
function SlotChoiceView({ block, locale, onPick }: { block: SlotChoice; locale: string; onPick: (v: string) => void }) {
  const t = useTranslations("assistant");
  const label = (date: string, time: string) =>
    t("chipAt", { date: formatDateLabel(locale, date, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }), time });
  return (
    <div>
      <p className="mb-1.5 leading-relaxed">{block.text}</p>
      <div className="flex flex-wrap gap-2">
        {block.alternatives.map((a) => (
          <button key={`${a.date}${a.start}`} type="button" onClick={() => onPick(label(a.date, a.start))} className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100">
            {a.start}
          </button>
        ))}
        {block.other && (
          <button type="button" onClick={() => onPick(t("otherTime"))} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            {t("otherTime")}
          </button>
        )}
      </div>
    </div>
  );
}

// Dictation with the browser's own speech recognition: only the text is
// used (no audio reaches us). Hidden where the browser has none.
type Recognition = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void };
function MicButton({ lang, onText, label }: { lang: string; onText: (s: string) => void; label: string }): ReactNode {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  if (!supported) return null;
  const start = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = false;
    r.onresult = (e) => onText(e.results[0][0].transcript);
    r.onend = () => setListening(false);
    setListening(true);
    r.start();
  };
  return (
    <button type="button" onClick={start} aria-label={label} aria-pressed={listening} className={`rounded-xl border px-2.5 py-2 text-sm ${listening ? "border-red-300 bg-red-50" : "border-slate-200 hover:bg-slate-50"}`}>
      🎤
    </button>
  );
}
