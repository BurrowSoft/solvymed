import { describe, expect, it } from "vitest";
import cases from "./fixtures/patient-channel-score-cases.json";
import {
  findTerms,
  immediateWarning,
  immediateWarningTerms,
  scoreRequest,
  suggestTerms,
  termAllowed,
  toVocabulary,
  type Answers,
  type ChannelConfig,
  type ScoreLine,
} from "@/lib/patientChannel/score";

// The shared vectors (specs/patient-channel-score-cases.json, byte-identical in both
// repos): 14 generated from the prototype + 5 hand-written (Thai, whole word, accents).
type Case = {
  id: string;
  answers: Answers;
  aiSymptomIds?: string[];
  expected: {
    total: number;
    band: string;
    warning: boolean;
    floorApplied: boolean;
    autoMessages?: string[];
    canSkipSend?: boolean;
    effectiveSymptomIds?: string[];
    lines?: { points: number; source: string; labelPt: string }[];
  };
};

const config = cases.config as ChannelConfig;
const thConfig = cases.handWritten.config as ChannelConfig;

// The prototype's pt-BR breakdown wording, only to compare with labelPt.
const ANSWER_PT = {
  when: ["Hoje", "Há 1 a 3 dias", "Há mais de 3 dias"],
  intensity: ["Leve", "Moderada", "Forte"],
  stillTaking: ["Sim", "Parei por conta própria"],
};
function labelPt(cfg: ChannelConfig, line: ScoreLine): string {
  const name = "symptomId" in line.label
    ? cfg.symptoms.find((s) => s.id === (line.label as { symptomId: string }).symptomId)!.name
    : (line.label as { comboId: string }).comboId;
  const base = line.source === "text" ? `${name} (texto)` : name;
  const { answerKey, answerIndex } = line.label;
  return answerKey ? `${base} · ${ANSWER_PT[answerKey][answerIndex!]}` : base;
}

function check(cfg: ChannelConfig, c: Case) {
  const r = scoreRequest(cfg, c.answers, { aiSymptomIds: c.aiSymptomIds });
  expect(r.total, "total").toBe(c.expected.total);
  expect(r.band, "band").toBe(c.expected.band);
  expect(r.warning, "warning").toBe(c.expected.warning);
  expect(r.floorApplied, "floorApplied").toBe(c.expected.floorApplied);
  if (c.expected.autoMessages) expect(r.autoMessages, "autoMessages").toEqual(c.expected.autoMessages);
  if (c.expected.canSkipSend !== undefined) expect(r.canSkipSend, "canSkipSend").toBe(c.expected.canSkipSend);
  if (c.expected.effectiveSymptomIds) expect(r.effectiveSymptomIds).toEqual(c.expected.effectiveSymptomIds);
  if (c.expected.lines) {
    expect(r.lines.map((l) => [l.points, l.source]), "lines").toEqual(c.expected.lines.map((l) => [l.points, l.source]));
    r.lines.forEach((l, i) => {
      const want = c.expected.lines![i].labelPt;
      // An AI line's label carries the patient's phrase in the prototype: ("sem folego").
      if (l.source === "ai") expect(want.startsWith(labelPt(cfg, l))).toBe(true);
      else expect(labelPt(cfg, l)).toBe(want);
    });
  }
}

describe("the Patient Channel score: the prototype's vectors", () => {
  it("has all 19 cases", () => {
    expect(cases.cases.length + cases.handWritten.cases.length).toBe(19);
  });
  for (const c of cases.cases as Case[]) it(c.id, () => check(config, c));
});

describe("the Patient Channel score: Thai, whole words, accents", () => {
  for (const c of cases.handWritten.cases as Case[]) it(c.id, () => check(thConfig, c));
});

describe("the Patient Channel score's rules", () => {
  const base: Answers = { symptomIds: [], chips: [], when: 0, intensity: 0, stillTaking: 0, text: "" };

  it("never offers skip for a warning or a red request, even when a message fires", () => {
    const red = scoreRequest(config, { ...base, symptomIds: ["s6", "s4"], intensity: 2 });
    expect(red.autoMessages).toEqual(["a5"]);
    expect(red.canSkipSend).toBe(false);
    // Red without an immediate-warning symptom, warnOnUrgent off: still no skip.
    const noWarn = { ...config, thresholds: { ...config.thresholds, warnOnUrgent: false, urgent: 5 } };
    const r = scoreRequest(noWarn, { ...base, symptomIds: ["s4"], intensity: 2 });
    expect([r.band, r.warning, r.autoMessages, r.canSkipSend]).toEqual(["red", false, ["a5"], false]);
  });

  it("the AI is ignored when the practice has it off, and only ever adds", () => {
    const off = { ...config, aiMapping: false };
    expect(scoreRequest(off, base, { aiSymptomIds: ["s6"] }).total).toBe(0);
    // Roberto's light headache (2 − 1) mapped again by the AI: already effective, no second line.
    const r = scoreRequest(config, { ...base, symptomIds: ["s5"] }, { aiSymptomIds: ["s5"] });
    expect(r.total).toBe(1);
    // An AI symptom whose adjustments go negative adds 0, never less.
    const neg = { ...config, symptoms: config.symptoms.map((s) => (s.id === "s4" ? { ...s, points: 1 } : s)) };
    expect(scoreRequest(neg, { ...base, text: "x" }, { aiSymptomIds: ["s4"] }).total).toBe(0);
  });

  it("a combination completed thanks to the AI adds its points as an AI line", () => {
    const r = scoreRequest(config, { ...base, symptomIds: ["s3", "s4"], when: 2 }, { aiSymptomIds: ["s5"] });
    expect(r.lines.filter((l) => l.source === "ai")).toEqual([
      // Dor de cabeça at 3+ days, light: 2 + 1 − 1.
      { label: { symptomId: "s5" }, points: 2, source: "ai" },
      { label: { comboId: "c2" }, points: 5, source: "ai" },
    ]);
  });

  it("a complete combination adds its points and adjustments", () => {
    const r = scoreRequest(config, { ...base, symptomIds: ["s3", "s4", "s5"], when: 1 });
    expect(r.lines.filter((l) => l.source === "combo")).toEqual([
      { label: { comboId: "c2" }, points: 3, source: "combo" },
      { label: { comboId: "c2", answerKey: "when", answerIndex: 1 }, points: 1, source: "combo" },
    ]);
  });

  it("auto messages need a medicine in the text or a medicine chip", () => {
    const withText = scoreRequest(config, { ...base, symptomIds: ["s3"], text: "tomo metformina de manhã" });
    expect(withText.autoMessages).toEqual(["a3"]);
    const noMed = scoreRequest(config, { ...base, symptomIds: ["s3"] });
    expect(noMed.autoMessages).toEqual([]);
  });

  it("the warning ignores the AI but counts the text-only floor when it is red", () => {
    const redFloor = { ...config, minBandForTextOnly: "red" as const };
    const r = scoreRequest(redFloor, { ...base, text: "não sei explicar" });
    expect([r.band, r.floorApplied, r.warning]).toEqual(["red", true, true]);
  });
});

describe("the Patient Channel matcher", () => {
  const vocab = toVocabulary(config);

  it("the patient's vocabulary carries no weights", () => {
    expect(JSON.stringify(vocab)).not.toMatch(/points|adjust|thresholds|autoMessages|combinations/);
    expect(immediateWarningTerms(vocab).map((s) => s.id)).toEqual(["s6", "s7"]);
  });

  it("the instant warning works from the vocabulary alone", () => {
    const base: Answers = { symptomIds: [], chips: [], when: 0, intensity: 0, stillTaking: 0, text: "" };
    expect(immediateWarning(vocab, { ...base, text: "Acordei com FALTA DE AR" })).toBe(true);
    expect(immediateWarning(vocab, { ...base, symptomIds: ["s7"] })).toBe(true);
    expect(immediateWarning(vocab, { ...base, text: "dor de cabeça" })).toBe(false);
  });

  it("highlights index the original text, accents and all; the longest match wins", () => {
    const text = "Muita coçando e pele verde";
    const m = findTerms(vocab, text);
    expect(m.map((x) => text.slice(x.start, x.end))).toEqual(["coçando", "pele verde"]);
    const over = { ...vocab, symptoms: [...vocab.symptoms, { id: "x", name: "pele", words: [], immediateWarning: false }] };
    expect(findTerms(over, text).map((x) => x.ref)).toEqual(["s2", "s1"]);
  });

  it("Thai terms shorter than 2 characters are refused", () => {
    expect(termAllowed("ไ")).toBe(false);
    expect(termAllowed("ไอ")).toBe(true);
    expect(termAllowed("  ")).toBe(false);
  });

  it("suggestions: Latin from 2 letters, the last words longest first, up to 6", () => {
    expect(suggestTerms(vocab, "estou com f")).toEqual([]);
    expect(suggestTerms(vocab, "estou com fa").map((s) => s.ref)).toEqual(["s6"]);
    const s = suggestTerms(vocab, "tenho falta de")[0];
    expect(s).toMatchObject({ kind: "symptom", ref: "s6", term: "Falta de ar ou inchaço no rosto", replaceFrom: 6 });
    expect(suggestTerms(vocab, "rosto inch")[0]).toMatchObject({ ref: "s6", term: "rosto inchado", display: "Falta de ar ou inchaço no rosto" });
    expect(suggestTerms(vocab, "tomei metf")[0]).toMatchObject({ kind: "medicine", ref: "Metformina", replaceFrom: 6 });
    expect(suggestTerms(vocab, "coceira ")).toEqual([]);
    expect(suggestTerms(vocab, "d", 6).length).toBe(0);
    expect(suggestTerms(vocab, "do", 2).length).toBe(2);
  });

  it("suggestions: Thai from the longest suffix of the run that starts a term", () => {
    const th = toVocabulary(thConfig);
    expect(suggestTerms(th, "วันนี้เวีย")).toEqual([{ kind: "symptom", ref: "t1", display: "เวียนหัว", term: "เวียนหัว", replaceFrom: 6 }]);
    expect(suggestTerms(th, "ตั้งแต่เมื่อวานมึ")[0]).toMatchObject({ ref: "t1", term: "มึนหัว", display: "เวียนหัว" });
  });
});
