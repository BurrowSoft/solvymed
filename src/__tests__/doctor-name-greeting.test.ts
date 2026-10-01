import { describe, expect, it } from "vitest";
import { greetingFirstName } from "@/lib/doctorName";

// UX (Vitor's secretary test): greet with the user's own first name, or
// none when it's empty or just the email's local part.
describe("greetingFirstName", () => {
  it("the first name, the typed title kept", () => {
    expect(greetingFirstName("Ana Souza", "ana@x.com")).toBe("Ana");
    expect(greetingFirstName("Dra. Ana Souza", "x@y.com")).toBe("Dra. Ana");
  });
  it("none when empty or the email's local part", () => {
    expect(greetingFirstName("", "a@b.com")).toBe("");
    expect(greetingFirstName(null, "a@b.com")).toBe("");
    expect(greetingFirstName("Here66443", "here66443@gmail.com")).toBe("");
    expect(greetingFirstName(" HERE66443 ", "here66443@gmail.com")).toBe("");
  });
});
