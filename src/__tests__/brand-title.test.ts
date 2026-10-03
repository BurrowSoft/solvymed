import { describe, expect, it } from "vitest";
import { withBrandTitle } from "@/lib/doctorName";

// e7 (both platforms): with a Título set, a title the name already starts
// with is dropped, then the Título is prefixed once.
describe("withBrandTitle", () => {
  it.each([
    ["Dra.", "Dra Ana Lima", "Dra. Ana Lima"],
    ["Dra.", "dra. Ana Lima", "Dra. Ana Lima"],
    ["Dra.", "Drª Ana Lima", "Dra. Ana Lima"],
    ["Dr.", "Dra. Ana Lima", "Dr. Ana Lima"],
    ["Dr.", "Prof. Dr. Carlos Melo", "Dr. Carlos Melo"],
    ["Prof. Dr.", "Carlos Melo", "Prof. Dr. Carlos Melo"],
    ["Dra.", "Ana Lima", "Dra. Ana Lima"],
    ["Dra.", "Drauzio Varella", "Dra. Drauzio Varella"], // "Dra" inside a name isn't a title
    ["นพ.", "นพ.สมชาย ใจดี", "นพ.สมชาย ใจดี"],
    ["นพ.", "นพ สมชาย ใจดี", "นพ.สมชาย ใจดี"],
    ["พญ.", "Dra. Ana", "พญ.Ana"],
    ["ดร.", "ดรุณี ศรีสุข", "ดร.ดรุณี ศรีสุข"], // "ดร" inside a Thai name isn't a title
    ["Dra.", "", "Dra."],
  ])("%s + %s → %s", (title, name, expected) => {
    expect(withBrandTitle(title, name)).toBe(expected);
  });

  it("no Título: the name exactly as it is", () => {
    expect(withBrandTitle("", "Dra Ana Lima")).toBe("Dra Ana Lima");
    expect(withBrandTitle(null, "  Ana   Lima ")).toBe("Ana Lima");
  });
});
