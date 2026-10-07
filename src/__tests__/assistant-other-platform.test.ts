import { describe, expect, it } from "vitest";
import { rules } from "@/lib/assistant/server/knowledge";

// ad, 8 Oct (b3's www question): full steps for the platform asked on, then
// ONE short line with the other platform's path when the feature is on both.

const say = { language: "English", onlySolvyMed: "", noClinical: "", buttons: [], labels: [], labelMap: new Map() };

describe("SolvyAI: the other platform's path, in one line", () => {
  it("on the website, the app's path as the example", () => {
    const prompt = rules("pt", "web", "home", "help", say);
    expect(prompt).toContain("end the steps with ONE short line naming its path");
    expect(prompt).toContain("No app: Pacientes → ⋯ → Mesclar.");
    expect(prompt).toContain("Never a second step-by-step");
  });

  it("in the app, the website's path as the example; in both modes", () => {
    for (const mode of ["help", "actions"] as const) {
      const prompt = rules("en", "app", "home", mode, say);
      expect(prompt).toContain("On the website: Patients → Information → Merge with another patient.");
      expect(prompt).toContain("skip it when the feature is on one platform only");
    }
  });
});
