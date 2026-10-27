// What the patient's Patient Channel page shows (specs/patient-contact-tech.md §2's
// pc_patient_page): the doctor's look and rules text, the reasons, the FAQ and the
// vocabulary (every term, NO weights). Plus the two server calls the flow makes: the
// live /preview check and the submit. Until migration 237 the page runs only as a
// preview test on sample data (M4a), with both calls stubbed in the browser.

import { scoreRequest, toVocabulary, type Answers, type ChannelConfig, type Chip, type Vocabulary } from "./score";
import type { PageLook } from "./pageLook";

export type PcReason = {
  id: string;
  title: string;
  subtitle: string;
  // options: pick one line; symptom_form: the boxes, the 3 questions and the text box;
  // exam: options + (M5) an attachment.
  kind: "options" | "symptom_form" | "exam";
  options: string[];
  destination: "doctor" | "secretary";
};

export type PcFaq = { id: string; question: string; answer: string };

export type PcPatientPage = {
  doctorName: string;
  practiceLine: string;
  emergencyNumber: string | null;
  slaBusinessDays: number;
  welcome: string;
  reasons: PcReason[];
  faq: PcFaq[];
  vocabulary: Vocabulary;
  // The practice's zone and country, for the dates in "Suas mensagens" (P-14: like the
  // doctor side, the practice's time and calendar). Missing: the browser's.
  timeZone?: string;
  country?: string | null;
  // The doctor's page look (prototype v17): the band / cover, the watermark, the brand colour.
  look?: PageLook | null;
};

// /preview's answer (§4.7): never the score or the band, only what the patient sees.
export type PcPreview = { warning: boolean; autoMessages: { id: string; text: string; tone: "info" | "attention" }[]; canSkip: boolean };
export type PcPreviewFn = (reasonId: string, answers: Answers) => Promise<PcPreview>;

// unavailable: the practice closed or the patient was archived meanwhile (237).
// rate_limited: too many sends in the last hour (the database's limit, cf #623).
// open_exists: the open request with the SAME destination (255), named in the replace prompt
// (launch polish 2); absent from an older server.
export type PcSubmitResult =
  | { status: "sent" }
  | { status: "open_exists"; open?: { reasonTitle: string; createdAt: string } }
  | { status: "unavailable" } | { status: "rate_limited" } | { status: "error" };
// The patient's requests with this practice (237's pc_my_requests: their own, newest first;
// never a score, a band or a breakdown): "Suas mensagens" (P-14) and the open one on the
// limit screen. null when they couldn't be read (the section just doesn't show).
// "other": a status this page doesn't know yet; still shown, as "Recebida" (01: never drop
// a request the patient sent), and reported (onUnknown).
export type PcMyRequestStatus = "open" | "answered" | "call_back" | "substituted" | "other";
export type PcMyRequest = {
  id: string;
  status: PcMyRequestStatus;
  reasonTitle: string;
  option: string | null;
  text: string;
  replyText: string | null;
  repliedAt: string | null;
  createdAt: string;
  // Who the request went to (migration 251); null from an older answer.
  destination?: "doctor" | "secretary" | null;
};
export type PcMyRequestsFn = () => Promise<PcMyRequest[] | null>;

const STATUSES: PcMyRequestStatus[] = ["open", "answered", "call_back", "substituted"];
const str = (v: unknown) => (typeof v === "string" ? v : "");
// pc_my_requests' rows, checked. A status the page doesn't know becomes "other" (never shown
// raw, never dropped) and is passed to onUnknown (the code only, never content).
export function toMyRequests(raw: unknown, onUnknown?: (status: string) => void): PcMyRequest[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const known = STATUSES.find((s) => s === o.status);
    if (!known) onUnknown?.(str(o.status).slice(0, 40) || "empty");
    const status: PcMyRequestStatus = known ?? "other";
    return [{
      id: str(o.id), status, reasonTitle: str(o.reasonTitle), option: str(o.option) || null, text: str(o.text),
      replyText: str(o.replyText).trim() || null, repliedAt: str(o.repliedAt) || null, createdAt: str(o.createdAt),
      destination: o.destination === "doctor" || o.destination === "secretary" ? o.destination : null,
    }];
  });
}
// shownIds: the automatic messages the patient saw (kept with the request, as shown).
export type PcSubmitFn = (reasonId: string, answers: Answers | { option: string }, replace: boolean, shownIds: string[]) => Promise<PcSubmitResult>;
export type PcSelfServeFn = (kind: "faq_resolved" | "auto_resolved") => void;

export const PC_TEXT_MAX = 500;

export type { Answers, Chip };

// The prototype v17's sample practice (pt-BR), for the preview test only.
const SAMPLE_RULES: ChannelConfig = {
  country: "BR",
  symptoms: [
    { id: "s1", name: "Pele esverdeada", words: ["pele verde", "esverdeada"], points: 3, immediateWarning: false, adjust: { when: [0, 1, 3], intensity: [-1, 0, 2], stillTaking: [0, 1] } },
    { id: "s2", name: "Coceira na pele", words: ["coceira", "coçando"], points: 3, immediateWarning: false, adjust: { when: [0, 0, 1], intensity: [-1, 0, 2], stillTaking: [0, 0] } },
    { id: "s3", name: "Náusea ou enjoo", words: ["enjoo", "enjoada", "enjoado", "náusea", "vômito"], points: 2, immediateWarning: false, adjust: { when: [0, 0, 2], intensity: [-1, 0, 2], stillTaking: [0, 1] } },
    { id: "s4", name: "Tontura", words: ["tonta", "tonto"], points: 3, immediateWarning: false, adjust: { when: [1, 0, 1], intensity: [-2, 0, 4], stillTaking: [0, 2] } },
    { id: "s5", name: "Dor de cabeça", words: ["cabeça doendo"], points: 2, immediateWarning: false, adjust: { when: [0, 0, 1], intensity: [-1, 0, 3], stillTaking: [0, 0] } },
    { id: "s6", name: "Falta de ar ou inchaço no rosto", words: ["falta de ar", "rosto inchado", "garganta fechando"], points: 10, immediateWarning: true, adjust: { when: [2, 1, 1], intensity: [0, 1, 3], stillTaking: [0, 0] } },
    { id: "s7", name: "Dor no peito ou desmaio", words: ["dor no peito", "desmaiei", "desmaio"], points: 12, immediateWarning: true, adjust: { when: [2, 1, 1], intensity: [0, 1, 3], stillTaking: [0, 0] } },
    { id: "s8", name: "Diarreia", words: ["intestino solto"], points: 2, immediateWarning: false, adjust: { when: [0, 1, 2], intensity: [-1, 0, 2], stillTaking: [0, 0] } },
    { id: "s9", name: "Febre", words: ["febril"], points: 3, immediateWarning: false, adjust: { when: [0, 1, 2], intensity: [0, 0, 2], stillTaking: [0, 0] } },
  ],
  combinations: [{ id: "c2", symptomIds: ["s3", "s4", "s5"], points: 3, adjust: { when: [0, 1, 2], intensity: [0, 0, 2], stillTaking: [0, 2] } }],
  thresholds: { attention: 6, urgent: 10, warnOnUrgent: true },
  minBandForTextOnly: "amber",
  medicines: ["Tylenol", "Dipirona", "Metformina", "Semaglutida", "Losartana"],
  autoMessages: [
    { id: "a1", terms: ["Coceira na pele"], when: 0, intensity: 0, stillTaking: -1, tone: "info", text: "Coceira leve que começou hoje costuma passar sozinha. Use um hidratante sem perfume e evite banho muito quente. Se espalhar ou aparecerem manchas, me avise por aqui." },
    { id: "a2", terms: ["Diarreia", "Febre"], when: -1, intensity: -1, stillTaking: -1, tone: "attention", text: "Diarreia com febre: beba bastante líquido (soro de reidratação) e meça a febre a cada 6 horas. Se aparecer sangue nas fezes ou febre acima de 39 °C, procure atendimento hoje." },
    { id: "a3", terms: ["Náusea ou enjoo", "Metformina"], when: -1, intensity: -1, stillTaking: -1, tone: "info", text: "Enjoo é comum nas primeiras semanas de metformina. Tome sempre junto com a refeição, nunca em jejum. Costuma melhorar em 2 a 3 semanas." },
    { id: "a5", terms: ["Tontura"], when: -1, intensity: 2, stillTaking: -1, tone: "attention", text: "Tontura forte: sente-se ou deite-se antes de levantar, beba água e não dirija hoje." },
  ],
  aiMapping: false,
};

export const SAMPLE_PAGE: PcPatientPage = {
  doctorName: "Dra. Ana Lima",
  practiceLine: "Clínica Vida Plena · Endocrinologia",
  emergencyNumber: "192",
  slaBusinessDays: 2,
  welcome: "Olá! Este é o canal para as suas dúvidas sobre o tratamento.\nEle substitui o WhatsApp do consultório.",
  reasons: [
    { id: "adm", title: "Administrativo", subtitle: "Agendamento, recibo, convênio", kind: "options", options: ["Preciso de um recibo", "Preciso de uma nova receita", "Quero remarcar a consulta", "Dúvida sobre convênio / reembolso"], destination: "secretary" },
    { id: "med", title: "Dúvida sobre a medicação", subtitle: "Dose, horário, esquecimento", kind: "options", options: ["Esqueci uma dose", "Dúvida sobre o horário", "Posso tomar junto com outro remédio?", "Quero parar ou trocar o remédio"], destination: "doctor" },
    { id: "efe", title: "Possível efeito colateral", subtitle: "Algo diferente depois de começar o remédio", kind: "symptom_form", options: [], destination: "doctor" },
  ],
  faq: [
    { id: "f1", question: "Esqueci de tomar o remédio. E agora?", answer: "Tome assim que lembrar, a menos que esteja perto do próximo horário. Nunca tome duas doses juntas." },
    { id: "f2", question: "Posso tomar com café ou leite?", answer: "Sim, exceto se a receita disser \"em jejum\". Nesse caso, espere 30 minutos." },
    { id: "f3", question: "Como peço uma nova receita?", answer: "Escolha \"Administrativo\" no próximo passo. A secretaria prepara para a Dra. assinar." },
  ],
  vocabulary: toVocabulary(SAMPLE_RULES),
};

// The preview test's stand-ins for /preview and the submit: the sample rules scored in
// the browser (sample data only: a real practice's weights never reach a patient, §4.4),
// and a submit that writes nothing (the first one "sends", the next asks to replace).
export function samplePreview(): PcPreviewFn {
  return async (_reasonId, answers) => {
    const r = scoreRequest(SAMPLE_RULES, answers);
    return {
      warning: r.warning,
      autoMessages: SAMPLE_RULES.autoMessages.filter((a) => r.autoMessages.includes(a.id)).map(({ id, text, tone }) => ({ id, text, tone })),
      canSkip: r.canSkipSend,
    };
  };
}

// One open request per DESTINATION (255): an administrative request never replaces a clinical one.
export function sampleSubmit(now: () => Date = () => new Date()): PcSubmitFn {
  const open = new Map<string, { reasonTitle: string; createdAt: string }>();
  return async (reasonId, _answers, replace) => {
    const reason = SAMPLE_PAGE.reasons.find((r) => r.id === reasonId);
    const dest = reason?.destination ?? "doctor";
    const current = open.get(dest);
    if (current && !replace) return { status: "open_exists", open: current };
    open.set(dest, { reasonTitle: reason?.title ?? "", createdAt: now().toISOString() });
    return { status: "sent" };
  };
}

// The practices where the patient has their own requests but no connection any more
// (migration 251's pc_my_past_practices, as the patient; [] while the channel is paused):
// "Ver mensagens anteriores com {doctor}", read-only. state picks the screen's line: a
// closed practice or an archived record says the channel isn't available.
export type PastPracticeState = "closed" | "archived" | "disconnected";
export type PastPractice = { id: string; displayName: string; state: PastPracticeState };
const PAST_STATES: PastPracticeState[] = ["closed", "archived", "disconnected"];
export function toPastPractices(raw: unknown): PastPractice[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const id = str(o.id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return [];
    const state = PAST_STATES.find((s) => s === o.state) ?? "disconnected";
    return [{ id, displayName: str(o.displayName).trim(), state }];
  });
}
