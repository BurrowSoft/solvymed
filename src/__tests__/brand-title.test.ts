import { describe, expect, it } from "vitest";
import shared from "@/lib/brand-title.cases.json";
import { withBrandTitle } from "@/lib/doctorName";

// e7 (both platforms): with a Título set, a title the name already starts
// with is dropped, then the Título is prefixed once. The cases are the
// SHARED file (byte-identical to the app's __tests__/fixtures/
// brand-title.cases.json, blob 582238b), so the two can't drift.
describe("withBrandTitle (shared cases)", () => {
  it.each(shared.cases)("$title + $name → $expected", ({ title, name, expected }) => {
    expect(withBrandTitle(title, name)).toBe(expected);
  });
});
