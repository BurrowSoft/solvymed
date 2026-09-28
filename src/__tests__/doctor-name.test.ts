import { describe, expect, it } from "vitest";
import { doctorDisplayName } from "@/lib/doctorName";

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
];

describe("doctorDisplayName (the app's rule; we never add a title)", () => {
  it.each(CASES)("%j → full %j, first name %j", (saved, full, first) => {
    expect(doctorDisplayName(saved)).toBe(full);
    expect(doctorDisplayName(saved, { firstOnly: true })).toBe(first);
  });

  it("never adds a title", () => {
    expect(doctorDisplayName("Beatriz Lima", { firstOnly: true })).toBe("Beatriz");
    expect(doctorDisplayName(null)).toBe("");
  });
});
