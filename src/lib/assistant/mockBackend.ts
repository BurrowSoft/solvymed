import { HELP, webScreen, type HelpArticle, type HelpLang } from "@/lib/help";
import type { AnswerBlock, AnswerChunk, AssistantBackend, AssistantRequest, AssistantUsage, CardAction, CardWarning, ConfirmationCard, TargetScreen } from "./types";
import { webPath } from "./targets";

// A stand-in for the /api/assistant route (specs/assistant.md §4) so
// the panel can be built and tested before the backend exists. It follows
// the spec's rules visibly: help answers come from the real Help articles;
// actions come back as confirmation cards (never saved: Confirmar is
// simulated); a missing time is asked for, an ambiguous name gets a pick
// list, clinical and off-topic questions get the fixed replies. Its sample
// patients and appointments are fictional.

const STOP = new Set(["como", "para", "uma", "que", "com", "meu", "minha", "the", "how", "can", "what", "does", "and", "you", "your", "sobre", "fazer", "posso"]);

const plain = (s: string) => s.replace(/\*\*/g, "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

function words(q: string): string[] {
  return plain(q).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w));
}

function articleText(a: HelpArticle, lang: HelpLang): string {
  return plain([a.title[lang], ...a.body[lang].flatMap((b) => (b.type === "ol" ? b.items : [b.text])), a.web?.[lang] ?? ""].join(" "));
}

// The Help article that best matches the question (most words in common;
// the title counts double). Null when nothing matches well enough.
export function bestArticle(question: string, lang: HelpLang): HelpArticle | null {
  const ws = words(question);
  if (!ws.length) return null;
  let best: HelpArticle | null = null;
  let bestScore = 0;
  for (const a of HELP.flatMap((c) => c.articles)) {
    const text = articleText(a, lang);
    const title = plain(a.title[lang]);
    // Stems: "bloquear"/"bloqueio" share "bloq".
    const score = ws.reduce((s, w) => {
      const stem = w.slice(0, Math.max(4, w.length - 3));
      return s + (text.includes(stem) ? 1 : 0) + (title.includes(stem) ? 1 : 0);
    }, 0);
    if (score > bestScore) { best = a; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}

const T = {
  pt: {
    offTopic: "Só posso ajudar com o SolvyMed.",
    clinical: "Não posso ajudar com questões clínicas.",
    notFound: "Não encontrei isso na Ajuda. Quer falar com o suporte?",
    howTo: "Veja como fazer:",
    onWeb: "No site:",
    open: "Abrir tela",
    askTime: "Para que horário?",
    whichMaria: "Qual Maria?",
    tomorrow: "Amanhã (terça, 29/09) você tem 2 consultas: 09:00 Ana Souza (retorno) e 14:30 Carlos Lima (consulta).",
    toReceive: "Esta semana você tem R$ 450,00 a receber em 3 consultas.",
    newAppt: "Nova consulta",
    block: "Bloquear horário",
    patient: "Paciente", when: "Quando", duration: "Duração", procedure: "Procedimento", value: "Valor", where: "Onde",
    inPerson: "Presencial", period: "Período",
    blockedWarn: "⚠ Horário bloqueado (12:00–13:00)",
    outsideWarn: "⚠ Fora do horário de atendimento (08:00–18:00)",
    blockedAsk: "Este horário está bloqueado (12:00–13:00).",
    outsideAsk: "Este horário está fora do horário de atendimento (08:00–18:00).",
    bookAnyway: "Agendar mesmo assim?",
    bookLabel: "Agendar",
    conflict: "Terça, 29/09/2026 às 10:00 já tem Ana Souza (10:00–10:30). Qual destes horários?",
    slotTaken: "Esse horário acabou de ser ocupado. Nada foi salvo. Qual destes horários?",
    hereIs: "Confira os detalhes e confirme:",
  },
  en: {
    offTopic: "I can only help with SolvyMed.",
    clinical: "I can't help with clinical questions.",
    notFound: "I couldn't find that in the Help Center. Would you like to contact support?",
    howTo: "Here's how:",
    onWeb: "On the website:",
    open: "Open screen",
    askTime: "What time?",
    whichMaria: "Which Maria?",
    tomorrow: "Tomorrow (Tuesday, 09/29) you have 2 appointments: 09:00 Ana Souza (follow-up) and 14:30 Carlos Lima (consultation).",
    toReceive: "This week you have R$ 450.00 to receive from 3 appointments.",
    newAppt: "New appointment",
    block: "Block time",
    patient: "Patient", when: "When", duration: "Duration", procedure: "Procedure", value: "Value", where: "Where",
    inPerson: "In person", period: "Period",
    blockedWarn: "⚠ Blocked time (12:00–13:00)",
    outsideWarn: "⚠ Outside the working hours (08:00–18:00)",
    blockedAsk: "This time is blocked (12:00–13:00).",
    outsideAsk: "This time is outside the working hours (08:00–18:00).",
    bookAnyway: "Book anyway?",
    bookLabel: "Book",
    conflict: "Tuesday, 09/29/2026 at 10:00 already has Ana Souza (10:00–10:30). Which of these times?",
    slotTaken: "That time was just taken. Nothing was saved. Which of these times?",
    hereIs: "Check the details and confirm:",
  },
};

// The mock's fictional "tomorrow".
const MOCK_DATE = "2026-09-29";

// "14:45" + 30 → "15:15" (the hour carries).
export function plusMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// A Help article's web screen path → its screen name, for the app.
function targetOf(path: string): TargetScreen {
  const m = path.match(/^\/dashboard\/(schedule|patients|payments|settings)/);
  return (m?.[1] as TargetScreen | undefined) ?? "home";
}

function mariaOptions(lang: HelpLang) {
  return [
    { id: "p1", title: "Maria Silva", detail: lang === "pt" ? "nasc. 12/03/1985 · última consulta 02/09" : "born 03/12/1985 · last visit 09/02" },
    { id: "p2", title: "Maria Souza", detail: lang === "pt" ? "nasc. 07/11/1990 · última consulta 15/08" : "born 11/07/1990 · last visit 08/15" },
  ];
}

// What the (mock) assistant answers, as blocks. Pure, so it can be tested.
export function mockAnswer(question: string, lang: HelpLang, prefix: string): AnswerBlock[] {
  const t = T[lang];
  const q = plain(question);
  if (/diagnost|remedio|medicament|dose\b|tratamento|sintoma|diagnos|medication|treatment|symptom/.test(q)) {
    return [{ type: "text", text: t.clinical }];
  }
  const booking = /\b(marca|marcar|agenda|agendar|book)\b/.test(q);
  const blocking = /\b(bloque|bloquear|bloqueia|block)\b/.test(q);
  if (booking && !/\b(como|how)\b/.test(q)) {
    // §2.3a rule 4: ambiguity is resolved by the doctor.
    if (/\bmaria\b/.test(q) && !/silva|souza/.test(q)) {
      return [{ type: "pick", question: t.whichMaria, options: mariaOptions(lang) }];
    }
    // Rule 3: a missing time is asked for, never picked.
    const time = q.match(/\b(\d{1,2})(?:h|:(\d{2}))/);
    if (!time) return [{ type: "text", text: t.askTime }];
    const hour = Number(time[1]);
    const start = `${String(hour).padStart(2, "0")}:${time[2] ?? "00"}`;
    const end = plusMinutes(start, 30);
    // §2.3: the schedule is checked before proposing. 10:00 is taken in
    // the mock: no card, the nearest free times, the doctor picks.
    if (start === "10:00") {
      return [{
        type: "slot_choice",
        reason: "conflict",
        text: t.conflict,
        conflicts: [{ date: MOCK_DATE, start: "10:00", end: "10:30", what: "Ana Souza" }],
        alternatives: [{ date: MOCK_DATE, start: "09:30" }, { date: MOCK_DATE, start: "10:30" }, { date: MOCK_DATE, start: "11:00" }],
        other: true,
      }];
    }
    const warnings: CardWarning[] = [];
    if (hour === 12) warnings.push({ code: "blocked", text: t.blockedWarn });
    if (hour < 8 || hour >= 18) warnings.push({ code: "outside_hours", text: t.outsideWarn });
    const ask = warnings.map((w) => (w.code === "blocked" ? t.blockedAsk : t.outsideAsk));
    const view = { screen: "schedule" as const, date: MOCK_DATE };
    const edit = { screen: "schedule" as const, date: MOCK_DATE, params: { new: "1", start } };
    const card: ConfirmationCard = {
      id: `appt-${start.replace(":", "")}`,
      icon: "📅",
      title: t.newAppt,
      fields: [
        { label: t.patient, value: /souza/.test(q) ? "Maria Souza · 07/11/1990" : "Maria Silva · 12/03/1985" },
        { label: t.when, value: lang === "pt" ? `terça, 29/09/2026 · ${start}–${end}` : `Tuesday, 09/29/2026 · ${start}–${end}` },
        { label: t.duration, value: "30 min", isDefault: true },
        { label: t.procedure, value: lang === "pt" ? "Consulta" : "Consultation", isDefault: true },
        { label: t.value, value: "R$ 150,00", isDefault: true },
        { label: t.where, value: t.inPerson, isDefault: true },
      ],
      warnings,
      ...(ask.length ? { secondConfirm: { question: `${ask.join(" ")} ${t.bookAnyway}`, confirmLabel: t.bookLabel } } : {}),
      hardStop: false,
      editHref: webPath(prefix, edit)!,
      viewHref: webPath(prefix, view)!,
      editTarget: edit,
      viewTarget: view,
      after: { screen: "schedule", date: MOCK_DATE, highlight: { kind: "appointment" } },
      action: { kind: "book_appointment", args: { patientId: /souza/.test(q) ? "p2" : "p1", date: MOCK_DATE, start, durationMin: 30 } },
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    return [{ type: "text", text: t.hereIs }, { type: "card", card }];
  }
  if (blocking && !/\b(como|how)\b/.test(q)) {
    const target = { screen: "schedule" as const, date: "2026-10-02" };
    const card: ConfirmationCard = {
      id: "block-fri",
      icon: "⛔",
      title: t.block,
      fields: [{ label: t.period, value: lang === "pt" ? "sexta, 02/10/2026 · 13:00–18:00" : "Friday, 10/02/2026 · 13:00–18:00" }],
      warnings: [],
      hardStop: false,
      editHref: webPath(prefix, target)!,
      viewHref: webPath(prefix, target)!,
      editTarget: target,
      viewTarget: target,
      after: { screen: "schedule", date: "2026-10-02", highlight: { kind: "block" } },
      action: { kind: "block_time", args: { date: "2026-10-02", start: "13:00", end: "18:00" } },
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    return [{ type: "text", text: t.hereIs }, { type: "card", card }];
  }
  if (/amanha|tomorrow/.test(q) && /tenho|have|agenda/.test(q)) return [{ type: "text", text: t.tomorrow }];
  if (/receber|to receive/.test(q)) return [{ type: "text", text: t.toReceive }];

  const article = bestArticle(question, lang);
  if (!article) {
    // Nothing about using SolvyMed: the fixed reply, no model answer.
    const aboutApp = /solvymed|paciente|patient|consulta|appointment|agenda|schedule|pagamento|payment|pix|secretar|config|setting|senha|password|conta|account/.test(q);
    return aboutApp ? [{ type: "text", text: t.notFound }, { type: "feedback" }] : [{ type: "text", text: t.offTopic }];
  }
  const blocks: AnswerBlock[] = [{ type: "text", text: `${article.title[lang]}. ${t.howTo}` }];
  for (const b of article.body[lang]) blocks.push(b.type === "ol" ? { type: "steps", items: b.items } : { type: "text", text: b.text });
  if (article.web) blocks.push({ type: "text", text: `${t.onWeb} ${article.web[lang]}` });
  const screen = article.webUnavailable ? null : webScreen(article.open);
  if (screen) blocks.push({ type: "open", label: t.open, href: `${prefix}${screen}`, target: { screen: targetOf(screen) } });
  blocks.push({ type: "feedback" });
  return blocks;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The mock backend: streams mockAnswer word by word in the contract's
// shape (meta, deltas, blocks, usage, done); counts today's messages;
// Confirmar/Desfazer are simulated (nothing is written). A booking at 16:00
// "was just taken" when confirmed, to show the confirm_failed path.
export function createMockBackend(opts: { lang: HelpLang; prefix: string; limit: number; delayMs?: number }): AssistantBackend {
  let used = 0;
  const delay = opts.delayMs ?? 25;
  const usage = (): AssistantUsage => {
    const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
    return { used, limit: opts.limit, extra: 0, resetsAt: midnight.toISOString() };
  };
  async function* stream(blocks: AnswerBlock[]): AsyncIterable<AnswerChunk> {
    for (const block of blocks) {
      if (block.type === "text") {
        for (const w of block.text.split(/(\s+)/)) {
          yield { kind: "delta", text: w };
          if (delay) await sleep(delay);
        }
        yield { kind: "block", block: { type: "text", text: "" } };
      } else {
        yield { kind: "block", block };
      }
    }
  }
  return {
    async *ask(req: AssistantRequest): AsyncIterable<AnswerChunk> {
      used++;
      yield { kind: "meta", mode: "actions" };
      const last = req.messages[req.messages.length - 1]?.text ?? "";
      await sleep(delay * 20); // "SolvyAI está pensando…"
      yield* stream(mockAnswer(last, opts.lang, opts.prefix));
      yield { kind: "usage", ...usage() };
      yield { kind: "done" };
    },
    async usage() {
      return usage();
    },
    async execute(action: CardAction) {
      await sleep(delay * 12);
      if (action.kind === "book_appointment" && action.args.start === "16:00") return { ok: false as const, code: "slot_taken" };
      return { ok: true as const, id: "demo-1", demo: true };
    },
    async *reportConfirmFailed(_code: string, action: CardAction): AsyncIterable<AnswerChunk> {
      // No model call and not counted (docs/assistant-api.md §5a).
      const date = typeof action.args.date === "string" ? action.args.date : MOCK_DATE;
      const start = typeof action.args.start === "string" ? action.args.start : "16:00";
      yield { kind: "meta", mode: "actions" };
      yield {
        kind: "block",
        block: {
          type: "slot_choice",
          reason: "confirm_failed",
          text: T[opts.lang].slotTaken,
          conflicts: [{ date, start, end: plusMinutes(start, 30), what: "—" }],
          alternatives: [{ date, start: plusMinutes(start, 30) }, { date, start: plusMinutes(start, 60) }],
          other: true,
        },
      };
      yield { kind: "done" };
    },
    async undo() {
      await sleep(delay * 6);
    },
  };
}
