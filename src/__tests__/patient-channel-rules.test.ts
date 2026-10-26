import { afterEach, describe, expect, it, vi } from "vitest";
import cases from "./fixtures/patient-channel-score-cases.json";
import type { ChannelConfig } from "@/lib/patientChannel/score";
import {
  EMPTY_RULES,
  LIMITS,
  addCombination,
  addMedicine,
  addSymptom,
  copyAdjustToAllSymptoms,
  parseWords,
  removeMedicine,
  removeSymptom,
  saveAutoMessage,
  setAdjust,
  validateRules,
} from "@/lib/patientChannel/rules";
import { patientChannelEnabled, patientChannelPreviewTest } from "@/lib/patientChannel/live";
import { countryProfile } from "@/lib/country";

const sample = cases.config as ChannelConfig;

describe("editing the Patient Channel rules", () => {
  it("the prototype's sample config is valid; the empty start is too", () => {
    expect(validateRules(sample)).toEqual([]);
    expect(validateRules(EMPTY_RULES)).toEqual([]);
  });

  it("a new symptom gets a fresh id, 2 points and the starting adjustments; no duplicates", () => {
    const r = addSymptom(EMPTY_RULES, "  Tontura ");
    expect(r.symptoms).toHaveLength(1);
    expect(r.symptoms[0]).toMatchObject({ name: "Tontura", words: [], points: 2, immediateWarning: false, adjust: { when: [0, 1, 2], intensity: [-1, 0, 2], stillTaking: [0, 1] } });
    expect(r.symptoms[0].id).toMatch(/^s[a-z0-9]+$/);
    expect(addSymptom(r, "tontúra")).toBe(r);
    expect(addSymptom(r, "  ")).toBe(r);
  });

  it("removing a symptom drops its combinations and its name from the messages", () => {
    const r = removeSymptom(sample, "s4");
    expect(r.symptoms.map((s) => s.id)).not.toContain("s4");
    expect(r.combinations.map((c) => c.id)).toEqual(["c1"]);
    // a5 (Tontura only) goes; the others stay.
    expect(r.autoMessages.map((a) => a.id)).toEqual(["a1", "a2", "a3", "a4"]);
    expect(validateRules(r)).toEqual([]);
    // a2 (Diarreia + Febre) never shrinks to "Diarreia" alone with fever advice.
    expect(removeSymptom(sample, "s9").autoMessages.map((a) => a.id)).toEqual(["a1", "a3", "a4", "a5"]);
  });

  it("removing a medicine drops it from the messages too", () => {
    const r = removeMedicine(sample, "metformina");
    expect(r.medicines).not.toContain("Metformina");
    expect(r.autoMessages.map((a) => a.id)).not.toContain("a3");
    expect(validateRules(r)).toEqual([]);
  });

  it("combinations need 2+ symptoms and can't repeat", () => {
    expect(addCombination(sample, ["s1"], 3)).toBe("pickTwo");
    expect(addCombination(sample, ["s2", "s1"], 3)).toBe("exists");
    const r = addCombination(sample, ["s8", "s9"], 99);
    expect(typeof r).toBe("object");
    const added = (r as ChannelConfig).combinations.at(-1)!;
    expect(added).toMatchObject({ symptomIds: ["s8", "s9"], points: LIMITS.points });
  });

  it("patient words: split on commas, trimmed, deduplicated without accents", () => {
    expect(parseWords(" sem fôlego, falta de ar,, sem folego ; tonto ")).toEqual(["sem fôlego", "falta de ar", "tonto"]);
  });

  it("adjustments are clamped to ±50 and copied to every symptom on request", () => {
    expect(setAdjust(sample.symptoms[0].adjust, "intensity", 2, 80).intensity).toEqual([-1, 0, 50]);
    const r = copyAdjustToAllSymptoms(sample, sample.symptoms[3].adjust);
    expect(new Set(r.symptoms.map((s) => JSON.stringify(s.adjust))).size).toBe(1);
  });

  it("automatic messages need a term and a text; editing keeps the id", () => {
    const draft = { terms: [], when: -1, intensity: -1, stillTaking: -1, tone: "info" as const, text: "x" };
    expect(saveAutoMessage(sample, draft, null)).toBe("pickTerm");
    expect(saveAutoMessage(sample, { ...draft, terms: ["Febre"], text: "  " }, null)).toBe("writeMessage");
    const r = saveAutoMessage(sample, { ...draft, terms: ["Febre"], text: "Meça a febre." }, "a2") as ChannelConfig;
    expect(r.autoMessages.find((a) => a.id === "a2")).toMatchObject({ terms: ["Febre"], text: "Meça a febre." });
    expect(r.autoMessages).toHaveLength(sample.autoMessages.length);
  });

  it("medicines: no duplicates, no 1-letter Thai term", () => {
    expect(addMedicine(sample, "dipirona")).toBe(sample);
    expect(addMedicine(sample, "ไ")).toBe(sample);
    expect(addMedicine(sample, "Paracetamol").medicines.at(-1)).toBe("Paracetamol");
  });

  it("validation names the field paths the database refuses", () => {
    const bad: ChannelConfig = {
      ...sample,
      thresholds: { attention: 10, urgent: 10, warnOnUrgent: true },
      symptoms: [{ ...sample.symptoms[0], points: 51, words: ["ไ"] }, ...sample.symptoms.slice(1)],
      combinations: [{ ...sample.combinations[0], symptomIds: ["s1", "nope"] }],
      autoMessages: [{ ...sample.autoMessages[0], terms: ["Unknown"], when: 3 }],
    };
    expect(validateRules(bad)).toEqual([
      { path: "symptoms.0.words.0", code: "thai_short" },
      { path: "symptoms.0.points", code: "range" },
      { path: "combinations.0.symptomIds", code: "unknown_ref" },
      { path: "thresholds", code: "range" },
      { path: "autoMessages.0.terms", code: "unknown_ref" },
      { path: "autoMessages.0", code: "range" },
    ]);
  });
});

describe("the Patient Channel gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("on only with the patient_channel flag row; any error or no row is off", async () => {
    const rpc = (data: unknown, error: unknown = null) => ({ rpc: () => Promise.resolve({ data, error }) });
    expect(await patientChannelEnabled(rpc([{ key: "patient_channel", enabled: true }]))).toBe(true);
    expect(await patientChannelEnabled(rpc([{ key: "patient_channel", enabled: false }]))).toBe(false);
    expect(await patientChannelEnabled(rpc([{ key: "document_studio", enabled: true }]))).toBe(false);
    expect(await patientChannelEnabled(rpc(null, { code: "PGRST202" }))).toBe(false);
  });

  it("?pc_test=1 counts only off Production", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(patientChannelPreviewTest("1")).toBe(true);
    expect(patientChannelPreviewTest(undefined)).toBe(false);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(patientChannelPreviewTest("1")).toBe(false);
  });

  it("the emergency number comes from the practice country", () => {
    expect(countryProfile("BR").emergencyNumber).toBe("192");
    expect(countryProfile("TH").emergencyNumber).toBe("1669");
    expect(countryProfile("US").emergencyNumber).toBeNull();
  });
});
