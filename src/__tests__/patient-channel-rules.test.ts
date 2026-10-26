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
  fromStoredRules,
  renameSymptom,
  termLengthOk,
  toStoredRules,
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
      { path: "symptoms.0.words.0", code: "short" },
      { path: "symptoms.0.points", code: "range" },
      { path: "combinations.0.symptomIds", code: "unknown_ref" },
      { path: "thresholds", code: "range" },
      { path: "autoMessages.0.terms", code: "unknown_ref" },
      { path: "autoMessages.0", code: "range" },
    ]);
  });
});

describe("the database's exact limits (237's _pc_rules_valid)", () => {
  it("every term needs 2+ characters in ANY script; a message has at most 10 terms", () => {
    expect([termLengthOk("x"), termLengthOk(" ab "), termLengthOk("ไอ"), termLengthOk("a".repeat(41))]).toEqual([false, true, true, false]);
    const r = { ...sample, medicines: [...sample.medicines, "X"], symptoms: [{ ...sample.symptoms[0], words: ["v"] }, ...sample.symptoms.slice(1)] };
    expect(validateRules(r)).toEqual([
      { path: "symptoms.0.words.0", code: "short" },
      { path: `medicines.${sample.medicines.length}`, code: "short" },
    ]);
    const eleven = Array.from({ length: 11 }, () => "Febre");
    expect(validateRules({ ...sample, autoMessages: [{ ...sample.autoMessages[0], terms: eleven }] })).toContainEqual({ path: "autoMessages.0.terms", code: "too_many" });
    expect(addSymptom(EMPTY_RULES, "X")).toBe(EMPTY_RULES);
  });

  it("the thresholds follow the database: 0 ≤ attention < urgent ≤ 1000", () => {
    const at = (attention: number, urgent: number) => validateRules({ ...sample, thresholds: { attention, urgent, warnOnUrgent: true } }).length;
    expect([at(0, 1), at(999, 1000), at(-1, 5), at(5, 5), at(5, 1001)]).toEqual([0, 0, 1, 1, 1]);
  });

  it("the stored document is exactly the six engine keys; loading adds the AI switch and the country", () => {
    const stored = toStoredRules(sample);
    expect(Object.keys(stored).sort()).toEqual(["autoMessages", "combinations", "medicines", "minBandForTextOnly", "symptoms", "thresholds"]);
    expect(fromStoredRules(stored, "TH")).toMatchObject({ aiMapping: false, country: "TH", symptoms: sample.symptoms });
    expect(fromStoredRules(null, "BR")).toMatchObject({ symptoms: [], thresholds: EMPTY_RULES.thresholds });
  });

  it("a rename keeps the id and renames the term in the messages; short or duplicate names are refused", () => {
    const r = renameSymptom(sample, "s4", "Vertigem") as ChannelConfig;
    expect(r.symptoms.find((s) => s.id === "s4")?.name).toBe("Vertigem");
    expect(r.autoMessages.find((a) => a.id === "a5")?.terms).toEqual(["Vertigem"]);
    expect(validateRules(r)).toEqual([]);
    expect(renameSymptom(sample, "s4", "x")).toBe("short");
    expect(renameSymptom(sample, "s4", "febre")).toBe("exists");
  });
});

describe("the Patient Channel gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("on with the public patient_channel flag, or for a user on 237's testers allowlist; errors are off", async () => {
    const rpc = (data: unknown, error: unknown = null) => ({ rpc: () => Promise.resolve({ data, error }) });
    const notTester = async () => false;
    const tester = async (id: string) => id === "t1";
    expect(await patientChannelEnabled(rpc([{ key: "patient_channel", enabled: true }]), "u1", notTester)).toBe(true);
    expect(await patientChannelEnabled(rpc([{ key: "patient_channel", enabled: false }]), "u1", notTester)).toBe(false);
    expect(await patientChannelEnabled(rpc([{ key: "patient_channel", enabled: false }]), "t1", tester)).toBe(true);
    expect(await patientChannelEnabled(rpc([{ key: "document_studio", enabled: true }]), null, tester)).toBe(false);
    expect(await patientChannelEnabled(rpc(null, { code: "PGRST202" }), "u1", notTester)).toBe(false);
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
