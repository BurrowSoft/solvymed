import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { YES_NO, answerText, detailLineLabel } from "@/lib/patientChannel/inbox";
import { lineLabel } from "@/app/[locale]/(site)/dashboard/settings/patient-channel/PatientChannelTest";
import type { AnswerKey, ChannelConfig, ScoreLine } from "@/lib/patientChannel/score";

// 01's general yes/no rule (Vitor's TH review, 10-28): an answer shown out of its question
// never ends in a bare yes/no ("· Sim"); it gets the question's short label
// ("· Ainda toma o remédio: Sim"). For every question, every answer and every locale.

const DIR = join(process.cwd(), "src/messages");
const LOCALES = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
const KEYS = Object.keys(YES_NO) as AnswerKey[];
// Yes/no words in the 15 languages (and the English the fallback locales show).
const BARE = new Set(["yes", "no", "sim", "não", "ใช่", "ไม่ใช่", "ไม่", "نعم", "لا", "ya", "tidak", "はい", "いいえ", "예", "네", "아니요", "да", "нет", "có", "không", "是", "否", "sí", "oui", "non", "ja", "nein", "sì"]);
const bare = (s: string) => BARE.has(s.trim().replace(/[.!。]$/, "").toLowerCase());
const endsBare = (s: string) => bare(s.split("·").pop() ?? "");

function messages(locale: string): Record<string, string> {
  // pt-BR.json starts with a BOM (trimStart drops it).
  return JSON.parse(readFileSync(join(DIR, `${locale}.json`), "utf8").trimStart()).patientChannel.answers;
}
function indexes(m: Record<string, string>, key: AnswerKey): number[] {
  const out: number[] = [];
  for (let i = 0; `${key}${i}` in m; i++) out.push(i);
  return out;
}

describe.each(LOCALES)("yes/no answer labels, %s", (locale) => {
  const m = messages(locale);
  const t = (k: string) => {
    const v = m[k.replace(/^answers\./, "")];
    if (typeof v !== "string") throw new Error(`${locale}: missing ${k}`);
    return v;
  };

  it("every bare yes/no answer is listed in YES_NO, and its question has a short label", () => {
    for (const key of KEYS) {
      expect(indexes(m, key).length, `${locale} ${key}`).toBeGreaterThan(0);
      for (const i of indexes(m, key)) {
        if (bare(m[`${key}${i}`])) expect(YES_NO[key], `${locale} ${key}${i} "${m[`${key}${i}`]}"`).toContain(i);
      }
      if (YES_NO[key].length) expect(m[`${key}Short`]?.trim(), `${locale} ${key}Short`).toBeTruthy();
    }
  });

  it("no rule summary or breakdown line ends in a bare yes/no", () => {
    const rules = { symptoms: [{ id: "s1", name: "Tontura" }], combinations: [] } as unknown as ChannelConfig;
    const names = { symptoms: { s1: "Tontura" }, combos: {}, warnings: [] };
    for (const key of KEYS) {
      for (const i of indexes(m, key)) {
        const line = { label: { symptomId: "s1", answerKey: key, answerIndex: i }, points: 1, source: "box" } as ScoreLine;
        for (const shown of [answerText(t, key, i), detailLineLabel(names, line, t), lineLabel(rules, line, t)]) {
          expect(endsBare(shown), `${locale} ${key}${i}: "${shown}"`).toBe(false);
        }
      }
    }
  });
});

it("the approved labels (en/pt-BR/th)", () => {
  const shown = (l: string) => answerText((k) => messages(l)[k.replace(/^answers\./, "")], "stillTaking", 0);
  expect(shown("en")).toBe("Still taking the medicine: Yes");
  expect(shown("pt-BR")).toBe("Ainda toma o remédio: Sim");
  expect(shown("th")).toBe("ยังใช้ยาอยู่: ใช่");
  expect(answerText((k) => messages("pt-BR")[k.replace(/^answers\./, "")], "stillTaking", 1)).toBe("Parei por conta própria");
});
