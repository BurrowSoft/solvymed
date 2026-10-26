// Patient Channel ("Canal do Paciente") score engine: specs/patient-contact-tech.md §4.
// ONE pure module (no React, no Supabase, no Intl.Segmenter, no Date, no randomness).
// The mobile repo vendors a byte-identical copy (lib/patientChannel/score.ts), pinned by
// SHA-256 in both repos' CI: change it in BOTH repos, re-run the shared vectors
// (patient-channel-score-cases.json), then update the pinned hash in both.
//
// Who runs what (§4.4): the server runs scoreRequest() and stores only its result; the
// patient's device never receives the weights, so it runs only findTerms(),
// suggestTerms() and immediateWarning() on a Vocabulary (toVocabulary()). The doctor's
// test mode may run scoreRequest() with the doctor's own rules.

export type Band = "green" | "amber" | "red";
export type AnswerKey = "when" | "intensity" | "stillTaking";

// Points added per answer, indexed by the answer (spec §1's index table):
//   when        = [0 today, 1 1–3 days ago, 2 more than 3 days ago]
//   intensity   = [0 mild, 1 moderate, 2 strong]
//   stillTaking = [0 yes, still taking it, 1 stopped on their own]
export type Adjust = { when: number[]; intensity: number[]; stillTaking: number[] };

export type Symptom = {
  id: string;
  name: string;
  words: string[];
  points: number;
  immediateWarning: boolean;
  adjust: Adjust;
};

export type Combination = { id: string; symptomIds: string[]; points: number; adjust: Adjust };

export type AutoMessage = {
  id: string;
  // Symptom names and/or medicines; ALL must be present.
  terms: string[];
  // The answer index each condition needs; -1 = any.
  when: number;
  intensity: number;
  stillTaking: number;
  tone: "info" | "attention";
  text: string;
};

export type ChannelConfig = {
  country?: string;
  symptoms: Symptom[];
  combinations: Combination[];
  thresholds: { attention: number; urgent: number; warnOnUrgent: boolean };
  minBandForTextOnly: Band;
  medicines: string[];
  autoMessages: AutoMessage[];
  aiMapping: boolean;
};

// What a patient's device gets (pc_patient_page): every term, no points.
export type VocabularySymptom = Pick<Symptom, "id" | "name" | "words" | "immediateWarning">;
export type Vocabulary = { symptoms: VocabularySymptom[]; medicines: string[] };

export type Chip =
  | { kind: "symptom"; ref: string; text: string }
  | { kind: "medicine"; text: string };

export type Answers = {
  symptomIds: string[];
  chips: Chip[];
  when: number;
  intensity: number;
  stillTaking: number;
  text: string;
};

// Structured, so each platform renders it in the viewer's locale (§4.3).
export type LineLabel =
  | { symptomId: string; answerKey?: AnswerKey; answerIndex?: number }
  | { comboId: string; answerKey?: AnswerKey; answerIndex?: number };

// "text" also covers a locked chip: the chip's term is in the text (the prototype's
// "(texto)" lines).
export type ScoreLine = { label: LineLabel; points: number; source: "box" | "text" | "ai" | "combo" };

// start/end index the ORIGINAL text (for highlights).
export type Match = { start: number; end: number; kind: "symptom" | "medicine"; ref: string; term: string };

export type ScoreResult = {
  total: number;
  band: Band;
  lines: ScoreLine[];
  warning: boolean;
  floorApplied: boolean;
  effectiveSymptomIds: string[];
  textMatches: Match[];
  autoMessages: string[];
  canSkipSend: boolean;
};

export type Suggestion = {
  kind: "symptom" | "medicine";
  // The symptom's id, or the medicine as the doctor wrote it.
  ref: string;
  // What the chip shows: the symptom's name, or the medicine.
  display: string;
  // The term that matched, in the doctor's spelling (it replaces the typed tail).
  term: string;
  // Where the typed tail starts in textBeforeCaret (replace from here to the caret).
  replaceFrom: number;
};

const ANSWER_KEYS: AnswerKey[] = ["when", "intensity", "stillTaking"];
const BAND_RANK: Record<Band, number> = { green: 0, amber: 1, red: 2 };
const LATIN_MARKS = /[̀-ͯ]/g;
const THAI = /[฀-๿]/;
const THAI_CHAR = /^[฀-๿]$/;
// Built at run time: the repo's TS target (ES2017) can't parse \p{…} literals.
const WORD_CHAR = new RegExp("^[\\p{L}\\p{N}]$", "u");

// §4.2 rule 1: NFKD, lower-case, Latin combining marks removed.
export function normalize(s: string): string {
  return s.normalize("NFKD").toLowerCase().replace(LATIN_MARKS, "");
}

// The normalised text plus, per normalised char, where it came from in the original.
function normalizeWithMap(s: string): { text: string; from: number[]; to: number[] } {
  let text = "";
  const from: number[] = [];
  const to: number[] = [];
  let i = 0;
  for (const ch of s) {
    const n = normalize(ch);
    for (let k = 0; k < n.length; k++) {
      from.push(i);
      to.push(i + ch.length);
    }
    text += n;
    i += ch.length;
  }
  return { text, from, to };
}

function isThaiTerm(normTerm: string): boolean {
  return THAI.test(normTerm);
}

// §4.2 rule 2's guard: Thai terms shorter than 2 characters (normalised) are refused,
// in the settings UI and on the server; the engine ignores them too.
export function termAllowed(term: string): boolean {
  const n = normalize(term).trim();
  if (!n) return false;
  return !isThaiTerm(n) || n.length >= 2;
}

function lastCodePoint(s: string, end: number): string {
  if (end <= 0) return "";
  const lo = s.charCodeAt(end - 1);
  if (lo >= 0xdc00 && lo <= 0xdfff && end >= 2) return s.slice(end - 2, end);
  return s.charAt(end - 1);
}

function firstCodePoint(s: string, start: number): string {
  if (start >= s.length) return "";
  const cp = s.codePointAt(start);
  return cp === undefined ? "" : String.fromCodePoint(cp);
}

// Every occurrence of normTerm in normText: substring for Thai, whole word otherwise.
function occurrences(normText: string, normTerm: string): number[] {
  const found: number[] = [];
  if (!normTerm) return found;
  const thai = isThaiTerm(normTerm);
  for (let at = normText.indexOf(normTerm); at !== -1; at = normText.indexOf(normTerm, at + 1)) {
    if (thai) {
      found.push(at);
      continue;
    }
    const before = lastCodePoint(normText, at);
    const after = firstCodePoint(normText, at + normTerm.length);
    if ((!before || !WORD_CHAR.test(before)) && (!after || !WORD_CHAR.test(after))) found.push(at);
  }
  return found;
}

type Term = { kind: "symptom" | "medicine"; ref: string; display: string; term: string; norm: string };

function vocabularyTerms(vocab: Vocabulary): Term[] {
  const terms: Term[] = [];
  const add = (kind: Term["kind"], ref: string, display: string, term: string) => {
    if (!termAllowed(term)) return;
    terms.push({ kind, ref, display, term, norm: normalize(term).trim() });
  };
  for (const s of vocab.symptoms) {
    add("symptom", s.id, s.name, s.name);
    for (const w of s.words) add("symptom", s.id, s.name, w);
  }
  for (const m of vocab.medicines) add("medicine", m, m, m);
  return terms;
}

// Every match, overlaps included (the score counts any of them).
function allMatches(vocab: Vocabulary, text: string): Match[] {
  const { text: norm, from, to } = normalizeWithMap(text);
  const matches: Match[] = [];
  for (const t of vocabularyTerms(vocab)) {
    for (const at of occurrences(norm, t.norm)) {
      matches.push({ start: from[at], end: to[at + t.norm.length - 1], kind: t.kind, ref: t.ref, term: t.term });
    }
  }
  return matches;
}

// §4.2 rule 2 for highlights: on overlap the longest match wins (then the earliest).
export function findTerms(vocab: Vocabulary, text: string): Match[] {
  const sorted = allMatches(vocab, text).sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const kept: Match[] = [];
  for (const m of sorted) {
    if (kept.every((k) => m.end <= k.start || m.start >= k.end)) kept.push(m);
  }
  return kept.sort((a, b) => a.start - b.start);
}

// The weights stripped: what pc_patient_page may send to a patient.
export function toVocabulary(config: ChannelConfig): Vocabulary {
  return {
    symptoms: config.symptoms.map(({ id, name, words, immediateWarning }) => ({ id, name, words, immediateWarning })),
    medicines: [...config.medicines],
  };
}

// Only the immediate-warning symptoms' terms (ids + names + patient words, no weights).
export function immediateWarningTerms(vocab: Vocabulary): VocabularySymptom[] {
  return vocab.symptoms.filter((s) => s.immediateWarning);
}

// Boxes ∪ locked chips ∪ symptoms found in the text (§4.2 rule 3), in config order.
function effectiveSymptoms<S extends VocabularySymptom>(symptoms: S[], answers: Answers, matches: Match[]) {
  const boxes = new Set(answers.symptomIds);
  const fromText = new Set<string>();
  for (const c of answers.chips) if (c.kind === "symptom") fromText.add(c.ref);
  for (const m of matches) if (m.kind === "symptom") fromText.add(m.ref);
  return symptoms
    .filter((s) => boxes.has(s.id) || fromText.has(s.id))
    .map((s) => ({ symptom: s, source: (boxes.has(s.id) ? "box" : "text") as "box" | "text" }));
}

// The patient's instant 192/1669 warning from the vocabulary alone (§10.6): any
// effective symptom marked immediateWarning. The red-band warning comes from /preview.
export function immediateWarning(vocab: Vocabulary, answers: Answers): boolean {
  return effectiveSymptoms(vocab.symptoms, answers, allMatches(vocab, answers.text)).some((e) => e.symptom.immediateWarning);
}

function adjustment(adjust: Adjust, key: AnswerKey, index: number): number {
  const v = adjust[key]?.[index];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function bandFor(total: number, t: ChannelConfig["thresholds"]): Band {
  if (total >= t.urgent) return "red";
  if (total >= t.attention) return "amber";
  return "green";
}

function maxBand(a: Band, b: Band): Band {
  return BAND_RANK[a] >= BAND_RANK[b] ? a : b;
}

export function scoreRequest(config: ChannelConfig, answers: Answers, opts: { aiSymptomIds?: string[] } = {}): ScoreResult {
  const matches = allMatches(config, answers.text);
  const effective = effectiveSymptoms(config.symptoms, answers, matches);
  const effectiveIds = new Set(effective.map((e) => e.symptom.id));
  const bySymptomId = new Map(config.symptoms.map((s) => [s.id, s]));
  const lines: ScoreLine[] = [];

  // §4.2 rule 4: each effective symptom, then each complete combination; one line per
  // non-zero part. Safety floor (01, 10-26, TH-1): an immediate-warning symptom's answers
  // never take points away (its negative adjustments don't apply).
  const addParts = (label: { symptomId: string } | { comboId: string }, points: number, adjust: Adjust, source: ScoreLine["source"], noLoss = false) => {
    if (points !== 0) lines.push({ label, points, source });
    for (const key of ANSWER_KEYS) {
      const index = answers[key];
      const v = adjustment(adjust, key, index);
      if (v !== 0 && !(noLoss && v < 0)) lines.push({ label: { ...label, answerKey: key, answerIndex: index }, points: v, source });
    }
  };
  for (const { symptom, source } of effective) addParts({ symptomId: symptom.id }, symptom.points, symptom.adjust, source, symptom.immediateWarning);
  for (const c of config.combinations) {
    if (c.symptomIds.length > 0 && c.symptomIds.every((id) => effectiveIds.has(id))) {
      addParts({ comboId: c.id }, c.points, c.adjust, "combo");
    }
  }

  const sum = () => lines.reduce((n, l) => n + l.points, 0);
  const hasText = answers.text.trim().length > 0;

  // §4.2 rule 6: the warning the patient sees is decided BEFORE the AI (and the
  // text-only floor counts: a false alarm is safer than a miss).
  const bandBeforeAi = hasText && effective.length === 0
    ? maxBand(bandFor(sum(), config.thresholds), config.minBandForTextOnly)
    : bandFor(sum(), config.thresholds);
  const warning =
    effective.some((e) => e.symptom.immediateWarning) ||
    (config.thresholds.warnOnUrgent && bandBeforeAi === "red");

  // §4.2 rule 7: the AI only adds, never subtracts, and never drives the warning.
  const aiIds = new Set<string>();
  if (config.aiMapping) {
    for (const s of config.symptoms) {
      if (!effectiveIds.has(s.id) && (opts.aiSymptomIds ?? []).includes(s.id)) aiIds.add(s.id);
    }
    const value = (points: number, adjust: Adjust) =>
      Math.max(0, points + ANSWER_KEYS.reduce((n, key) => n + adjustment(adjust, key, answers[key]), 0));
    for (const id of aiIds) {
      const s = bySymptomId.get(id)!;
      const v = value(s.points, s.adjust);
      if (v > 0) lines.push({ label: { symptomId: id }, points: v, source: "ai" });
    }
    for (const c of config.combinations) {
      const complete = c.symptomIds.length > 0 && c.symptomIds.every((id) => effectiveIds.has(id) || aiIds.has(id));
      const onlyThanksToAi = c.symptomIds.some((id) => aiIds.has(id));
      if (complete && onlyThanksToAi) {
        const v = value(c.points, c.adjust);
        if (v > 0) lines.push({ label: { comboId: c.id }, points: v, source: "ai" });
      }
    }
  }

  const total = sum();
  let band = bandFor(total, config.thresholds);

  // Safety floor (01, 10-26, TH-1): an immediate-warning symptom (box, chip or text; not
  // the AI, which never drives the warning) puts the request in the top band, whatever
  // the points: the patient was shown the emergency number.
  if (effective.some((e) => e.symptom.immediateWarning)) band = "red";

  // §4.2 rule 8: text with nothing recognised (not even by the AI) is at least the floor.
  let floorApplied = false;
  if (hasText && effective.length === 0 && aiIds.size === 0 && BAND_RANK[config.minBandForTextOnly] > BAND_RANK[band]) {
    band = config.minBandForTextOnly;
    floorApplied = true;
  }

  // §4.2 rule 9: ALL terms present (an effective symptom's name, or a medicine found in
  // the text or locked as a chip) and every condition met.
  const present = new Set<string>();
  for (const { symptom } of effective) present.add(normalize(symptom.name).trim());
  for (const m of matches) if (m.kind === "medicine") present.add(normalize(m.ref).trim());
  for (const c of answers.chips) if (c.kind === "medicine") present.add(normalize(c.text).trim());
  const conditionMet = (want: number, got: number) => want === -1 || want === got;
  const autoMessages = config.autoMessages
    .filter((r) =>
      r.terms.length > 0 &&
      r.terms.every((t) => present.has(normalize(t).trim())) &&
      conditionMet(r.when, answers.when) &&
      conditionMet(r.intensity, answers.intensity) &&
      conditionMet(r.stillTaking, answers.stillTaking),
    )
    .map((r) => r.id);

  return {
    total,
    band,
    lines,
    warning,
    floorApplied,
    effectiveSymptomIds: effective.map((e) => e.symptom.id),
    textMatches: findTerms(config, answers.text),
    autoMessages,
    // §4.2 rule 10 (spec 16): never offered for a warning or a red request.
    canSkipSend: autoMessages.length > 0 && !warning && band !== "red",
  };
}

// §5: suggestions for the smart text box, from the text before the caret.
export function suggestTerms(vocab: Vocabulary, textBeforeCaret: string, max = 6): Suggestion[] {
  const terms = vocabularyTerms(vocab);
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const push = (t: Term, replaceFrom: number) => {
    const key = `${t.kind}:${t.ref}`;
    if (seen.has(key) || out.length >= max) return;
    seen.add(key);
    out.push({ kind: t.kind, ref: t.ref, display: t.display, term: t.term, replaceFrom });
  };

  // Thai: the run of Thai characters before the caret; the longest suffix (≥ 2) that
  // starts some term.
  let runStart = textBeforeCaret.length;
  while (runStart > 0 && THAI_CHAR.test(textBeforeCaret.charAt(runStart - 1))) runStart--;
  if (runStart < textBeforeCaret.length) {
    const run = textBeforeCaret.slice(runStart);
    for (let len = run.length; len >= 2; len--) {
      const suffix = normalize(run.slice(run.length - len));
      const hits = terms.filter((t) => isThaiTerm(t.norm) && t.norm.startsWith(suffix));
      if (hits.length > 0) {
        for (const t of hits) push(t, textBeforeCaret.length - len);
        return out;
      }
    }
    return out;
  }

  // Latin: the last 1–3 words before the caret, longest first; nothing right after a
  // space or punctuation (the word is finished). For each tail, terms that START with it
  // come first ("fe" → Febre), then terms with a later word starting with it ("garganta
  // fechando"), each group in the doctor's order (01, 10-26).
  if (!WORD_CHAR.test(lastCodePoint(textBeforeCaret, textBeforeCaret.length))) return out;
  const words: { start: number }[] = [];
  const wordRe = new RegExp("[\\p{L}\\p{N}\\p{M}]+", "gu");
  for (let m = wordRe.exec(textBeforeCaret); m; m = wordRe.exec(textBeforeCaret)) words.push({ start: m.index });
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const replaceFrom = words[words.length - n].start;
    const tail = normalize(textBeforeCaret.slice(replaceFrom)).replace(/\s+/g, " ");
    if (tail.length < 2) continue;
    const latin = terms.filter((t) => !isThaiTerm(t.norm));
    for (const t of latin) if (t.norm.startsWith(tail)) push(t, replaceFrom);
    if (n === 1) {
      for (const t of latin) if (t.norm.split(/\s+/).slice(1).some((w) => w.startsWith(tail))) push(t, replaceFrom);
    }
  }
  return out;
}
