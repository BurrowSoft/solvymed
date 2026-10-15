import { describe, expect, it } from "vitest";
import { greetingFirstName } from "@/lib/doctorName";

// UX (Vitor's secretary test): greet with the user's own first name, or
// none when it's empty or just the email's local part.
describe("greetingFirstName", () => {
  it("the first name, the typed title kept", () => {
    expect(greetingFirstName("Ana Souza", "ana@x.com")).toBe("Ana");
    expect(greetingFirstName("Dra. Ana Souza", "x@y.com")).toBe("Dra. Ana");
  });
  // A Thai title was read as the first name ("สวัสดีตอนเย็น, นพ."; 1c, the TH
  // demo). It's written against the first name, with or without the typed
  // space (01, both platforms).
  it.each(["นพ.", "พญ.", "ทพ.", "ทญ.", "ทพญ.", "ภก.", "ภญ.", "ดร."])("the Thai title %s against the first name", (title) => {
    expect(greetingFirstName(`${title} ธีรวัฒน์ สุขใจ`, "x@y.com")).toBe(`${title}ธีรวัฒน์`);
    expect(greetingFirstName(`${title}ธีรวัฒน์ สุขใจ`, "x@y.com")).toBe(`${title}ธีรวัฒน์`);
    expect(greetingFirstName(`  ${title}   ธีรวัฒน์   สุขใจ `, "x@y.com")).toBe(`${title}ธีรวัฒน์`);
    // Typed without the dot (then a space): the dot is added (b9; the app's #517).
    expect(greetingFirstName(`${title.slice(0, -1)} ธีรวัฒน์ สุขใจ`, "x@y.com")).toBe(`${title}ธีรวัฒน์`);
  });
  it("ทพญ. is one title, not ทพ. + ญ.", () => {
    expect(greetingFirstName("ทพญ. สุดา ใจดี", "x@y.com")).toBe("ทพญ.สุดา");
  });
  it("a Thai name without a title, or one that merely starts with a title's letters", () => {
    expect(greetingFirstName("ธีรวัฒน์ สุขใจ", "x@y.com")).toBe("ธีรวัฒน์");
    expect(greetingFirstName("ดรุณี ใจดี", "x@y.com")).toBe("ดรุณี");
    expect(greetingFirstName("นพดล ใจดี", "x@y.com")).toBe("นพดล");
  });
  it("a bare Thai title stays as it is", () => {
    expect(greetingFirstName("นพ.", "x@y.com")).toBe("นพ.");
  });
  it("Latin titles unchanged (BR / IT)", () => {
    expect(greetingFirstName("Dra. Helena Costa", "x@y.com")).toBe("Dra. Helena");
    expect(greetingFirstName("Prof. Dr. Carlos Melo", "x@y.com")).toBe("Prof. Dr. Carlos");
    expect(greetingFirstName("dott.ssa Giulia Rossi", "x@y.com")).toBe("Dott.ssa Giulia");
  });
  it("none when empty or the email's local part", () => {
    expect(greetingFirstName("", "a@b.com")).toBe("");
    expect(greetingFirstName(null, "a@b.com")).toBe("");
    expect(greetingFirstName("Here66443", "here66443@gmail.com")).toBe("");
    expect(greetingFirstName(" HERE66443 ", "here66443@gmail.com")).toBe("");
  });
});
