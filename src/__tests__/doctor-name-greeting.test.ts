import { describe, expect, it } from "vitest";
import { doctorDisplayName, greetingFirstName, greetingName, shortDoctorName } from "@/lib/doctorName";

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
  // The Founders e-mail's greeting (th "เรียน {title}{name}"): the same rule.
  it("greetingName: the Thai title with its dot, however typed; Latin unchanged", () => {
    for (const typed of ["นพ.สมชาย ใจดี", "นพ. สมชาย ใจดี", "นพ สมชาย ใจดี"]) {
      expect(greetingName(typed)).toEqual({ title: "นพ.", first: "สมชาย" });
    }
    expect(greetingName("ทพญ. มาลี สมใจ")).toEqual({ title: "ทพญ.", first: "มาลี" });
    expect(greetingName("นพดล ใจดี")).toEqual({ title: "", first: "นพดล" });
    expect(greetingName("Dra. Ana Souza")).toEqual({ title: "Dra.", first: "Ana" });
    expect(greetingName("Prof. Dr. Carlos Melo")).toEqual({ title: "Prof. Dr.", first: "Carlos" });
  });
  // Two Thai titles: only the last one is against the name (b9; the app's
  // #517 line 88: "ดร. นพ.สมชาย").
  it("stacked Thai titles stay space-separated", () => {
    expect(doctorDisplayName("ดร. นพ. สมชาย ดี")).toBe("ดร. นพ.สมชาย ดี");
    expect(doctorDisplayName("ดร.นพ.สมชาย ดี", { firstOnly: true })).toBe("ดร. นพ.สมชาย");
    expect(shortDoctorName("ดร. นพ. สมชาย ใจ ดี")).toBe("ดร. นพ.สมชาย ดี");
    expect(greetingName("ดร. นพ. สมชาย ดี")).toEqual({ title: "ดร. นพ.", first: "สมชาย" });
    expect(greetingFirstName("ดร นพ สมชาย ดี", "x@y.com")).toBe("ดร. นพ.สมชาย");
  });
  it("none when empty or the email's local part", () => {
    expect(greetingFirstName("", "a@b.com")).toBe("");
    expect(greetingFirstName(null, "a@b.com")).toBe("");
    expect(greetingFirstName("Here66443", "here66443@gmail.com")).toBe("");
    expect(greetingFirstName(" HERE66443 ", "here66443@gmail.com")).toBe("");
  });
});
