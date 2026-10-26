// Editing the Patient Channel rules (the doctor's settings, M3a): pure helpers on the
// engine's ChannelConfig (lib/patientChannel/score), plus the limits migration 237's
// _pc_rules_valid enforces (specs/patient-contact-tech.md §1.1), so the editor and the
// PUT /config route refuse the same things the database does.

import { normalize, termAllowed, type Adjust, type AutoMessage, type Band, type ChannelConfig, type Combination, type Symptom } from "./score";

export const LIMITS = {
  symptoms: 80,
  wordsPerSymptom: 40,
  // Every term (names, patient words, medicines, message terms), in any script: 2+
  // characters after trimming (237's _pc_texts_ok; Thai terms match as substrings).
  termMin: 2,
  termLength: 40,
  nameLength: 60,
  autoTermLength: 60,
  autoTerms: 10,
  combinations: 40,
  autoMessages: 60,
  autoMessageText: 300,
  medicines: 100,
  points: 50,
} as const;

// A new symptom or combination's adjustments (the prototype's starting values).
export const NEW_ADJUST: Adjust = { when: [0, 1, 2], intensity: [-1, 0, 2], stillTaking: [0, 1] };

export const EMPTY_RULES: ChannelConfig = {
  symptoms: [],
  combinations: [],
  thresholds: { attention: 6, urgent: 10, warnOnUrgent: true },
  minBandForTextOnly: "amber",
  medicines: [],
  autoMessages: [],
  aiMapping: false,
};

// The length 237 checks: characters after trimming, as written (not normalised).
export function termLengthOk(term: string, max: number = LIMITS.termLength): boolean {
  const n = [...term.trim()].length;
  return n >= LIMITS.termMin && n <= max;
}

// The stored document is exactly the engine's six keys (237's _pc_rules_valid): the AI
// mapping is pc_settings.ai_mapping and the country is the practice's.
export type StoredRules = Pick<ChannelConfig, "symptoms" | "combinations" | "thresholds" | "minBandForTextOnly" | "medicines" | "autoMessages">;
export function toStoredRules(r: ChannelConfig): StoredRules {
  const { symptoms, combinations, thresholds, minBandForTextOnly, medicines, autoMessages } = r;
  return JSON.parse(JSON.stringify({ symptoms, combinations, thresholds, minBandForTextOnly, medicines, autoMessages }));
}
export function fromStoredRules(raw: unknown, country: string | undefined, aiMapping = false): ChannelConfig {
  const r = (raw ?? {}) as Partial<StoredRules>;
  return {
    symptoms: Array.isArray(r.symptoms) ? r.symptoms : [],
    combinations: Array.isArray(r.combinations) ? r.combinations : [],
    thresholds: r.thresholds ?? EMPTY_RULES.thresholds,
    minBandForTextOnly: r.minBandForTextOnly ?? EMPTY_RULES.minBandForTextOnly,
    medicines: Array.isArray(r.medicines) ? r.medicines : [],
    autoMessages: Array.isArray(r.autoMessages) ? r.autoMessages : [],
    aiMapping,
    country,
  };
}

const copy = (a: Adjust): Adjust => ({ when: [...a.when], intensity: [...a.intensity], stillTaking: [...a.stillTaking] });
export const clampPoints = (n: number) => (Number.isFinite(n) ? Math.max(-LIMITS.points, Math.min(LIMITS.points, Math.trunc(n))) : 0);

// Ids are stable and never reused (§1.1): past requests point at them.
export function newId(prefix: "s" | "c" | "a", taken: Iterable<string>): string {
  const used = new Set(taken);
  for (;;) {
    const id = `${prefix}${Math.random().toString(36).slice(2, 10)}`;
    if (!used.has(id)) return id;
  }
}

// "sem fôlego, falta de ar" → the words, trimmed, deduplicated (accent-insensitive),
// each cut to the length limit.
export function parseWords(input: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.split(/[,;\n]/)) {
    const w = raw.trim().slice(0, LIMITS.termLength);
    const key = normalize(w);
    if (!w || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out.slice(0, LIMITS.wordsPerSymptom);
}

export function addSymptom(rules: ChannelConfig, name: string): ChannelConfig {
  const n = name.trim().slice(0, LIMITS.nameLength);
  if (!termLengthOk(n, LIMITS.nameLength) || !termAllowed(n) || rules.symptoms.length >= LIMITS.symptoms) return rules;
  if (rules.symptoms.some((s) => normalize(s.name) === normalize(n))) return rules;
  const s: Symptom = { id: newId("s", rules.symptoms.map((x) => x.id)), name: n, words: [], points: 2, immediateWarning: false, adjust: copy(NEW_ADJUST) };
  return { ...rules, symptoms: [...rules.symptoms, s] };
}

// Removing a symptom also removes its combinations and every automatic message that
// names it: a message is written for ALL its terms, so it must never fire on fewer.
export function removeSymptom(rules: ChannelConfig, id: string): ChannelConfig {
  const gone = rules.symptoms.find((s) => s.id === id);
  if (!gone) return rules;
  const name = normalize(gone.name);
  return {
    ...rules,
    symptoms: rules.symptoms.filter((s) => s.id !== id),
    combinations: rules.combinations.filter((c) => !c.symptomIds.includes(id)),
    autoMessages: rules.autoMessages.filter((a) => !a.terms.some((t) => normalize(t) === name)),
  };
}

// A renamed symptom keeps its id; the automatic messages that named it follow (they
// reference symptoms by name: cf, #614).
export type RenameError = "short" | "exists";
export function renameSymptom(rules: ChannelConfig, id: string, name: string): ChannelConfig | RenameError {
  const n = name.trim().slice(0, LIMITS.nameLength);
  const gone = rules.symptoms.find((s) => s.id === id);
  if (!gone) return rules;
  if (!termLengthOk(n, LIMITS.nameLength) || !termAllowed(n)) return "short";
  if (rules.symptoms.some((s) => s.id !== id && normalize(s.name) === normalize(n))) return "exists";
  const old = normalize(gone.name);
  return {
    ...rules,
    symptoms: rules.symptoms.map((s) => (s.id === id ? { ...s, name: n } : s)),
    autoMessages: rules.autoMessages.map((a) => ({ ...a, terms: a.terms.map((t) => (normalize(t) === old ? n : t)) })),
  };
}

export function updateSymptom(rules: ChannelConfig, id: string, patch: Partial<Omit<Symptom, "id">>): ChannelConfig {
  return { ...rules, symptoms: rules.symptoms.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

export type ComboError = "pickTwo" | "exists" | "full";
export function addCombination(rules: ChannelConfig, symptomIds: string[], points: number): ChannelConfig | ComboError {
  const ids = [...new Set(symptomIds)].filter((id) => rules.symptoms.some((s) => s.id === id));
  if (ids.length < 2) return "pickTwo";
  if (rules.combinations.length >= LIMITS.combinations) return "full";
  const key = [...ids].sort().join("|");
  if (rules.combinations.some((c) => [...c.symptomIds].sort().join("|") === key)) return "exists";
  const c: Combination = { id: newId("c", rules.combinations.map((x) => x.id)), symptomIds: ids, points: clampPoints(points), adjust: copy(NEW_ADJUST) };
  return { ...rules, combinations: [...rules.combinations, c] };
}

export function updateCombination(rules: ChannelConfig, id: string, patch: Partial<Omit<Combination, "id">>): ChannelConfig {
  return { ...rules, combinations: rules.combinations.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

export function removeCombination(rules: ChannelConfig, id: string): ChannelConfig {
  return { ...rules, combinations: rules.combinations.filter((c) => c.id !== id) };
}

// "Copy these adjustments to all symptoms" (the prototype's button).
export function copyAdjustToAllSymptoms(rules: ChannelConfig, adjust: Adjust): ChannelConfig {
  return { ...rules, symptoms: rules.symptoms.map((s) => ({ ...s, adjust: copy(adjust) })) };
}

export function setAdjust(adjust: Adjust, key: keyof Adjust, index: number, value: number): Adjust {
  const next = copy(adjust);
  next[key][index] = clampPoints(value);
  return next;
}

export type AutoDraft = Omit<AutoMessage, "id">;
export type AutoError = "pickTerm" | "tooManyTerms" | "writeMessage" | "full";
export function saveAutoMessage(rules: ChannelConfig, draft: AutoDraft, editId: string | null): ChannelConfig | AutoError {
  const terms = draft.terms.filter((t) => t.trim());
  const text = draft.text.trim().slice(0, LIMITS.autoMessageText);
  if (terms.length === 0) return "pickTerm";
  if (terms.length > LIMITS.autoTerms) return "tooManyTerms";
  if (!text) return "writeMessage";
  if (editId) {
    return { ...rules, autoMessages: rules.autoMessages.map((a) => (a.id === editId ? { ...draft, terms, text, id: editId } : a)) };
  }
  if (rules.autoMessages.length >= LIMITS.autoMessages) return "full";
  const id = newId("a", rules.autoMessages.map((a) => a.id));
  return { ...rules, autoMessages: [...rules.autoMessages, { ...draft, terms, text, id }] };
}

export function removeAutoMessage(rules: ChannelConfig, id: string): ChannelConfig {
  return { ...rules, autoMessages: rules.autoMessages.filter((a) => a.id !== id) };
}

export function addMedicine(rules: ChannelConfig, name: string): ChannelConfig {
  const m = name.trim().slice(0, LIMITS.termLength);
  if (!termLengthOk(m) || !termAllowed(m) || rules.medicines.length >= LIMITS.medicines) return rules;
  if (rules.medicines.some((x) => normalize(x) === normalize(m))) return rules;
  return { ...rules, medicines: [...rules.medicines, m] };
}

// Removing a medicine also removes every automatic message that names it (as for a
// symptom: the message's text assumes all its terms).
export function removeMedicine(rules: ChannelConfig, name: string): ChannelConfig {
  const key = normalize(name);
  return {
    ...rules,
    medicines: rules.medicines.filter((m) => normalize(m) !== key),
    autoMessages: rules.autoMessages.filter((a) => !a.terms.some((t) => normalize(t) === key)),
  };
}

export function setThresholds(rules: ChannelConfig, patch: Partial<ChannelConfig["thresholds"]>): ChannelConfig {
  return { ...rules, thresholds: { ...rules.thresholds, ...patch } };
}

export function setMinBand(rules: ChannelConfig, band: Band): ChannelConfig {
  return { ...rules, minBandForTextOnly: band };
}

// What's wrong with a rules document, as field paths (the 422 `invalid_rules` body and
// the editor's messages). Mirrors 237's _pc_rules_valid exactly; the database stays the gate.
export type RulesProblem =
  | { path: string; code: "required" | "short" | "too_long" | "too_many" | "range" | "unknown_ref" | "duplicate" };

export function validateRules(r: ChannelConfig): RulesProblem[] {
  const out: RulesProblem[] = [];
  const intOk = (n: unknown, min: number = -LIMITS.points, max: number = LIMITS.points) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
  const idOk = (id: unknown) => typeof id === "string" && id.length >= 1 && id.length <= 40;
  const adjustOk = (a: Adjust | undefined) =>
    !!a && a.when?.length === 3 && a.intensity?.length === 3 && a.stillTaking?.length === 2 &&
    [...a.when, ...a.intensity, ...a.stillTaking].every((v) => intOk(v));
  const term = (path: string, t: string, max: number) => {
    const n = [...t.trim()].length;
    if (n < LIMITS.termMin) out.push({ path, code: n === 0 ? "required" : "short" });
    else if (n > max) out.push({ path, code: "too_long" });
  };
  if (r.symptoms.length > LIMITS.symptoms) out.push({ path: "symptoms", code: "too_many" });
  const ids = new Set<string>();
  r.symptoms.forEach((s, i) => {
    const p = `symptoms.${i}`;
    if (!idOk(s.id) || ids.has(s.id)) out.push({ path: `${p}.id`, code: "duplicate" });
    ids.add(s.id);
    term(`${p}.name`, s.name, LIMITS.nameLength);
    if (s.words.length > LIMITS.wordsPerSymptom) out.push({ path: `${p}.words`, code: "too_many" });
    s.words.forEach((w, j) => term(`${p}.words.${j}`, w, LIMITS.termLength));
    if (!intOk(s.points)) out.push({ path: `${p}.points`, code: "range" });
    if (!adjustOk(s.adjust)) out.push({ path: `${p}.adjust`, code: "range" });
  });
  if (r.combinations.length > LIMITS.combinations) out.push({ path: "combinations", code: "too_many" });
  const comboIds = new Set<string>();
  r.combinations.forEach((c, i) => {
    const p = `combinations.${i}`;
    if (!idOk(c.id) || comboIds.has(c.id)) out.push({ path: `${p}.id`, code: "duplicate" });
    comboIds.add(c.id);
    if (c.symptomIds.length < 2 || new Set(c.symptomIds).size !== c.symptomIds.length || !c.symptomIds.every((id) => ids.has(id))) {
      out.push({ path: `${p}.symptomIds`, code: "unknown_ref" });
    }
    if (!intOk(c.points)) out.push({ path: `${p}.points`, code: "range" });
    if (!adjustOk(c.adjust)) out.push({ path: `${p}.adjust`, code: "range" });
  });
  const { attention, urgent, warnOnUrgent } = r.thresholds;
  if (!intOk(attention, 0, 999) || !intOk(urgent, 1, 1000) || urgent <= attention || typeof warnOnUrgent !== "boolean") {
    out.push({ path: "thresholds", code: "range" });
  }
  if (!["green", "amber", "red"].includes(r.minBandForTextOnly)) out.push({ path: "minBandForTextOnly", code: "range" });
  if (r.medicines.length > LIMITS.medicines) out.push({ path: "medicines", code: "too_many" });
  r.medicines.forEach((m, i) => term(`medicines.${i}`, m, LIMITS.termLength));
  if (r.autoMessages.length > LIMITS.autoMessages) out.push({ path: "autoMessages", code: "too_many" });
  const known = new Set([...r.symptoms.map((s) => normalize(s.name)), ...r.medicines.map(normalize)]);
  r.autoMessages.forEach((a, i) => {
    const p = `autoMessages.${i}`;
    if (!idOk(a.id)) out.push({ path: `${p}.id`, code: "duplicate" });
    const text = [...a.text.trim()].length;
    if (text === 0) out.push({ path: `${p}.text`, code: "required" });
    else if (text > LIMITS.autoMessageText) out.push({ path: `${p}.text`, code: "too_long" });
    if (a.terms.length > LIMITS.autoTerms) out.push({ path: `${p}.terms`, code: "too_many" });
    a.terms.forEach((t, j) => term(`${p}.terms.${j}`, t, LIMITS.autoTermLength));
    if (a.terms.length === 0 || !a.terms.every((t) => known.has(normalize(t)))) out.push({ path: `${p}.terms`, code: "unknown_ref" });
    if (!intOk(a.when, -1, 2) || !intOk(a.intensity, -1, 2) || !intOk(a.stillTaking, -1, 1)) out.push({ path: p, code: "range" });
  });
  return out;
}
