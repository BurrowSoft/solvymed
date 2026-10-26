// Editing the Patient Channel rules (the doctor's settings, M3a): pure helpers on the
// engine's ChannelConfig (lib/patientChannel/score), plus the limits migration 237's
// _pc_rules_valid enforces (specs/patient-contact-tech.md §1.1), so the editor and the
// PUT /config route refuse the same things the database does.

import { normalize, termAllowed, type Adjust, type AutoMessage, type Band, type ChannelConfig, type Combination, type Symptom } from "./score";

export const LIMITS = {
  symptoms: 80,
  wordsPerSymptom: 40,
  termLength: 40,
  nameLength: 60,
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
  if (!n || rules.symptoms.length >= LIMITS.symptoms) return rules;
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
export type AutoError = "pickTerm" | "writeMessage" | "full";
export function saveAutoMessage(rules: ChannelConfig, draft: AutoDraft, editId: string | null): ChannelConfig | AutoError {
  const terms = draft.terms.filter((t) => t.trim());
  const text = draft.text.trim().slice(0, LIMITS.autoMessageText);
  if (terms.length === 0) return "pickTerm";
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
  if (!m || !termAllowed(m) || rules.medicines.length >= LIMITS.medicines) return rules;
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
// the editor's messages). Mirrors _pc_rules_valid; the database stays the gate.
export type RulesProblem =
  | { path: string; code: "required" | "too_long" | "too_many" | "range" | "thai_short" | "unknown_ref" | "duplicate" };

export function validateRules(r: ChannelConfig): RulesProblem[] {
  const out: RulesProblem[] = [];
  const intOk = (n: unknown) => Number.isInteger(n) && Math.abs(n as number) <= LIMITS.points;
  const adjustOk = (a: Adjust | undefined) =>
    !!a && a.when?.length === 3 && a.intensity?.length === 3 && a.stillTaking?.length === 2 &&
    [...a.when, ...a.intensity, ...a.stillTaking].every(intOk);
  if (r.symptoms.length > LIMITS.symptoms) out.push({ path: "symptoms", code: "too_many" });
  const ids = new Set<string>();
  r.symptoms.forEach((s, i) => {
    const p = `symptoms.${i}`;
    if (!s.id || ids.has(s.id)) out.push({ path: `${p}.id`, code: "duplicate" });
    ids.add(s.id);
    if (!s.name.trim()) out.push({ path: `${p}.name`, code: "required" });
    else if (s.name.length > LIMITS.nameLength) out.push({ path: `${p}.name`, code: "too_long" });
    else if (!termAllowed(s.name)) out.push({ path: `${p}.name`, code: "thai_short" });
    if (s.words.length > LIMITS.wordsPerSymptom) out.push({ path: `${p}.words`, code: "too_many" });
    s.words.forEach((w, j) => {
      if (w.length > LIMITS.termLength) out.push({ path: `${p}.words.${j}`, code: "too_long" });
      else if (!termAllowed(w)) out.push({ path: `${p}.words.${j}`, code: "thai_short" });
    });
    if (!intOk(s.points)) out.push({ path: `${p}.points`, code: "range" });
    if (!adjustOk(s.adjust)) out.push({ path: `${p}.adjust`, code: "range" });
  });
  if (r.combinations.length > LIMITS.combinations) out.push({ path: "combinations", code: "too_many" });
  r.combinations.forEach((c, i) => {
    const p = `combinations.${i}`;
    if (c.symptomIds.length < 2 || !c.symptomIds.every((id) => ids.has(id))) out.push({ path: `${p}.symptomIds`, code: "unknown_ref" });
    if (!intOk(c.points)) out.push({ path: `${p}.points`, code: "range" });
    if (!adjustOk(c.adjust)) out.push({ path: `${p}.adjust`, code: "range" });
  });
  const { attention, urgent } = r.thresholds;
  if (!Number.isInteger(attention) || !Number.isInteger(urgent) || attention < 0 || urgent <= attention) {
    out.push({ path: "thresholds", code: "range" });
  }
  if (r.medicines.length > LIMITS.medicines) out.push({ path: "medicines", code: "too_many" });
  r.medicines.forEach((m, i) => {
    if (m.length > LIMITS.termLength) out.push({ path: `medicines.${i}`, code: "too_long" });
    else if (!termAllowed(m)) out.push({ path: `medicines.${i}`, code: "thai_short" });
  });
  if (r.autoMessages.length > LIMITS.autoMessages) out.push({ path: "autoMessages", code: "too_many" });
  const known = new Set([...r.symptoms.map((s) => normalize(s.name)), ...r.medicines.map(normalize)]);
  r.autoMessages.forEach((a, i) => {
    const p = `autoMessages.${i}`;
    if (!a.text.trim()) out.push({ path: `${p}.text`, code: "required" });
    else if (a.text.length > LIMITS.autoMessageText) out.push({ path: `${p}.text`, code: "too_long" });
    if (a.terms.length === 0 || !a.terms.every((t) => known.has(normalize(t)))) out.push({ path: `${p}.terms`, code: "unknown_ref" });
    const cond = (v: number, max: number) => Number.isInteger(v) && v >= -1 && v <= max;
    if (!cond(a.when, 2) || !cond(a.intensity, 2) || !cond(a.stillTaking, 1)) out.push({ path: p, code: "range" });
  });
  return out;
}
