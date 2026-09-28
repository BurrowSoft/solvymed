import { describe, expect, it } from "vitest";
import { doctorDisplayName, nameInitial } from "@/lib/doctorName";

// Shared with the app (mobile #80): saved name → full / first name only.
const CASES: [string, string, string][] = [
  ["Ana Souza", "Ana Souza", "Ana"],
  ["Dra. Beatriz Lima", "Dra. Beatriz Lima", "Dra. Beatriz"],
  ["Dra Beatriz Lima", "Dra. Beatriz Lima", "Dra. Beatriz"],
  ["dr carlos", "Dr. carlos", "Dr. carlos"],
  ["DR. Carlos Melo", "Dr. Carlos Melo", "Dr. Carlos"],
  ["Prof. João", "Prof. João", "Prof. João"],
  ["Profa. Marta Reis", "Profa. Marta Reis", "Profa. Marta"],
  ["Draco Malfoy", "Draco Malfoy", "Draco"],
  ["Drummond Silva", "Drummond Silva", "Drummond"],
  ["Professor Silva", "Professor Silva", "Professor"],
  ["Dra. ", "Dra.", "Dra."],
  ["", "", ""],
  // fr / it titles (UX, both platforms)
  ["Pr Jean Dupont", "Pr. Jean Dupont", "Pr. Jean"],
  ["pr. Jean Dupont", "Pr. Jean Dupont", "Pr. Jean"],
  ["Dott. Mario Rossi", "Dott. Mario Rossi", "Dott. Mario"],
  ["dott Mario", "Dott. Mario", "Dott. Mario"],
  ["Dott.ssa Giulia Bianchi", "Dott.ssa Giulia Bianchi", "Dott.ssa Giulia"],
  ["DOTT.SSA giulia", "Dott.ssa giulia", "Dott.ssa giulia"],
  // not titles
  ["Dottie Smith", "Dottie Smith", "Dottie"],
  ["Prune Martin", "Prune Martin", "Prune"],
  ["Pradeep Kumar", "Pradeep Kumar", "Pradeep"],
];

describe("doctorDisplayName (the app's rule; we never add a title)", () => {
  it.each(CASES)("%j → full %j, first name %j", (saved, full, first) => {
    expect(doctorDisplayName(saved)).toBe(full);
    expect(doctorDisplayName(saved, { firstOnly: true })).toBe(first);
  });

  it("the avatar initial is the name's, not the title's", () => {
    expect(nameInitial("Dra. Beatriz")).toBe("B");
    expect(nameInitial("Dott.ssa Giulia")).toBe("G");
    expect(nameInitial("ana")).toBe("A");
    expect(nameInitial("Dra.")).toBe("D");
    expect(nameInitial("")).toBe("");
  });

  it("never adds a title", () => {
    expect(doctorDisplayName("Beatriz Lima", { firstOnly: true })).toBe("Beatriz");
    expect(doctorDisplayName(null)).toBe("");
  });
});
