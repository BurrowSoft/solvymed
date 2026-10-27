// How a Patient Channel request is scored and checked on the server (M4b): the ONE place
// both the submit route and the rules save's rescore use (cf, #620: the same scoring per
// reason kind, or a rules save would change the band of administrative requests).
// Pure (score.ts only); the routes hold the auth, the reads and the writes.

import { scoreRequest, type Answers, type ChannelConfig, type Chip, type ScoreResult } from "./score";

export type ReasonKind = "options" | "symptom_form" | "exam";

const NO_ANSWERS: Answers = { symptomIds: [], chips: [], when: 0, intensity: 0, stillTaking: 0, text: "" };

// Only the symptom form is scored; an options / exam request carries no symptom answers,
// so it scores as an empty form: 0, green, no floor, no warning. Always the same result,
// at submit and after any rules save.
export function scoreForRequest(config: ChannelConfig, kind: ReasonKind, answers: Answers): ScoreResult {
  return scoreRequest(config, kind === "symptom_form" ? answers : NO_ANSWERS);
}

// A stored request's answers back into the engine's shape (the rescore).
export function storedAnswers(raw: unknown, text: string | null): Answers {
  const a = (raw ?? {}) as Partial<Answers>;
  return {
    symptomIds: Array.isArray(a.symptomIds) ? a.symptomIds : [],
    chips: Array.isArray(a.chips) ? a.chips : [],
    when: typeof a.when === "number" ? a.when : 0,
    intensity: typeof a.intensity === "number" ? a.intensity : 0,
    stillTaking: typeof a.stillTaking === "number" ? a.stillTaking : 0,
    text: text ?? "",
  };
}

export const ANSWER_LIMITS = { text: 500, symptomIds: 80, chips: 40, chipText: 60, option: 80 } as const;

const intIn = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

// What the patient sent, checked against this practice's rules and the reason (cf, #613:
// an out-of-range index must be refused, not scored as 0). null = invalid_answers (422).
export function checkAnswers(
  config: ChannelConfig,
  reason: { kind: ReasonKind; options: string[] },
  raw: unknown,
): { answers: Answers; option: string | null } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (reason.kind !== "symptom_form") {
    const option = r.option;
    if (typeof option !== "string" || !reason.options.includes(option) || option.length > ANSWER_LIMITS.option) return null;
    return { answers: { ...NO_ANSWERS }, option };
  }
  const ids = new Set(config.symptoms.map((s) => s.id));
  const symptomIds = r.symptomIds;
  if (!Array.isArray(symptomIds) || symptomIds.length > ANSWER_LIMITS.symptomIds) return null;
  if (!symptomIds.every((id) => typeof id === "string" && ids.has(id)) || new Set(symptomIds).size !== symptomIds.length) return null;
  const chips = r.chips ?? [];
  if (!Array.isArray(chips) || chips.length > ANSWER_LIMITS.chips) return null;
  const okChip = (c: unknown): c is Chip => {
    if (!c || typeof c !== "object") return false;
    const x = c as Record<string, unknown>;
    if (typeof x.text !== "string" || x.text.length < 1 || x.text.length > ANSWER_LIMITS.chipText) return false;
    if (x.kind === "symptom") return typeof x.ref === "string" && ids.has(x.ref);
    return x.kind === "medicine";
  };
  if (!chips.every(okChip)) return null;
  // -1 = not answered (launch polish 15; 255's _pc_answers_valid accepts it): adds 0 points.
  if (!intIn(r.when, -1, 2) || !intIn(r.intensity, -1, 2) || !intIn(r.stillTaking, -1, 1)) return null;
  const text = r.text ?? "";
  if (typeof text !== "string" || [...text].length > ANSWER_LIMITS.text) return null;
  return {
    answers: {
      symptomIds: symptomIds as string[],
      chips: (chips as Chip[]).map((c) => (c.kind === "symptom" ? { kind: "symptom", ref: c.ref, text: c.text } : { kind: "medicine", text: c.text })),
      when: r.when,
      intensity: r.intensity,
      stillTaking: r.stillTaking,
      text,
    },
    option: null,
  };
}
