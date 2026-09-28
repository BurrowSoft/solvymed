import { HELP, webScreen, type HelpArticle, type HelpLang } from "@/lib/help";
import type { AnswerBlock, AnswerChunk, AssistantBackend, AssistantRequest, AssistantUsage, ConfirmationCard } from "./types";

// A stand-in for the "assistant" edge function (specs/assistant.md §4) so
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
    hereIs: "Check the details and confirm:",
  },
};

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
    const hh = String(hour).padStart(2, "0");
    const mm = time[2] ?? "00";
    const end = `${String(hour).padStart(2, "0")}:${String(Number(mm) + 30).padStart(2, "0")}`;
    const card: ConfirmationCard = {
      id: `appt-${hh}${mm}`,
      icon: "📅",
      title: t.newAppt,
      fields: [
        { label: t.patient, value: /souza/.test(q) ? "Maria Souza · 07/11/1990" : "Maria Silva · 12/03/1985" },
        { label: t.when, value: lang === "pt" ? `terça, 29/09/2026 · ${hh}:${mm}–${end}` : `Tuesday, 09/29/2026 · ${hh}:${mm}–${end}` },
        { label: t.duration, value: "30 min", isDefault: true },
        { label: t.procedure, value: lang === "pt" ? "Consulta" : "Consultation", isDefault: true },
        { label: t.value, value: "R$ 150,00", isDefault: true },
        { label: t.where, value: t.inPerson, isDefault: true },
      ],
      warnings: hour === 12 ? [t.blockedWarn] : [],
      editHref: `${prefix}/dashboard/schedule`,
      viewHref: `${prefix}/dashboard/schedule`,
    };
    return [{ type: "text", text: t.hereIs }, { type: "card", card }];
  }
  if (blocking && !/\b(como|how)\b/.test(q)) {
    const card: ConfirmationCard = {
      id: "block-fri",
      icon: "⛔",
      title: t.block,
      fields: [{ label: t.period, value: lang === "pt" ? "sexta, 02/10/2026 · 13:00–18:00" : "Friday, 10/02/2026 · 13:00–18:00" }],
      warnings: [],
      editHref: `${prefix}/dashboard/schedule`,
      viewHref: `${prefix}/dashboard/schedule`,
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
  if (screen) blocks.push({ type: "open", label: t.open, href: `${prefix}${screen}` });
  blocks.push({ type: "feedback" });
  return blocks;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The mock backend: streams mockAnswer word by word; counts today's
// messages; Confirmar/Desfazer are simulated (nothing is written).
export function createMockBackend(opts: { lang: HelpLang; prefix: string; limit: number; delayMs?: number }): AssistantBackend {
  let used = 0;
  const delay = opts.delayMs ?? 25;
  return {
    async *ask(req: AssistantRequest): AsyncIterable<AnswerChunk> {
      used++;
      const last = req.messages[req.messages.length - 1]?.text ?? "";
      await sleep(delay * 20); // "SolvyAI está pensando…"
      for (const block of mockAnswer(last, opts.lang, opts.prefix)) {
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
      yield { kind: "done" };
    },
    async usage(): Promise<AssistantUsage> {
      const now = new Date();
      const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
      return { used, limit: opts.limit, extra: 0, resetsInHours: Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 3_600_000)) };
    },
    async confirm(cardId: string) {
      await sleep(delay * 12);
      return cardId.startsWith("appt-12") ? { ok: false as const, reason: "blocked" } : { ok: true as const };
    },
    async undo() {
      await sleep(delay * 6);
    },
  };
}
