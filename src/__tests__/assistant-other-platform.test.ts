import { describe, expect, it } from "vitest";
import { rules } from "@/lib/assistant/server/knowledge";

// ad, 8 Oct (b3's www question): full steps for the platform asked on, then
// ONE short line with the other platform's path when the feature is on both.

const say = { language: "English", onlySolvyMed: "", noClinical: "", buttons: [], labels: [], labelMap: new Map() };

describe("SolvyAI: the other platform's path, in one line", () => {
  it("on the website, the app's path as the example", () => {
    const prompt = rules("pt", "web", "home", "help", say);
    expect(prompt).toContain("end the steps with ONE short line naming its path");
    expect(prompt).toContain("No app: Pacientes → menu (⋯) do paciente → Mesclar com outro paciente…");
    expect(prompt).toContain("Never a second step-by-step");
  });

  it("required in every reply language, with a Thai example in the real Thai labels (b3's Thai answer dropped it)", () => {
    const web = rules("en", "web", "home", "help", say);
    expect(web).toContain("in every reply language, Thai included");
    // Web reader: the app's labels (patients.title, merge.action in the app's th).
    expect(web).toContain("ในแอป: ผู้ป่วย → เมนู (⋯) ของผู้ป่วย → รวมกับผู้ป่วยอีกคน…");
    // App reader: the website's (nav.patients, patientDetail.tabInfo, patientMerge.action).
    expect(rules("en", "app", "home", "help", say)).toContain("บนเว็บไซต์: ผู้ป่วย → แท็บ ข้อมูล → รวมกับผู้ป่วยอีกคน…");
  });

  it("in the app, the website's path as the example; in both modes", () => {
    for (const mode of ["help", "actions"] as const) {
      const prompt = rules("en", "app", "home", mode, say);
      expect(prompt).toContain("On the website: Patients → Info tab → Merge with another patient…");
      expect(prompt).toContain("skip it when the feature is on one platform only");
    }
  });
});
