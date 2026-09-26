import { describe, it, expect } from "vitest";
import { isWellFormedSecretaryCode, normalizeSecretaryCode } from "@/lib/secretary";

describe("normalizeSecretaryCode", () => {
  it("accepts the code with or without S-, spaces and any case", () => {
    expect(normalizeSecretaryCode("S-ABCD2345")).toBe("S-ABCD2345");
    expect(normalizeSecretaryCode("s-abcd 2345")).toBe("S-ABCD2345");
    expect(normalizeSecretaryCode("ABCD2345")).toBe("S-ABCD2345");
    expect(normalizeSecretaryCode("SABCD2345")).toBe("S-ABCD2345");
  });

  it("keeps an 8-character body that starts with S", () => {
    expect(normalizeSecretaryCode("SBCD2345")).toBe("S-SBCD2345");
  });

  it("returns empty when nothing usable is left", () => {
    expect(normalizeSecretaryCode("--- ")).toBe("");
  });
});

describe("isWellFormedSecretaryCode", () => {
  it("accepts exactly S- plus 8 letters/digits", () => {
    expect(isWellFormedSecretaryCode("S-ABCD2345")).toBe(true);
  });

  it("rejects anything else, so junk never spends the RPC rate limit", () => {
    for (const c of ["", "S-", "S-ABC", "S-ABCD23456", "ABCD2345", "S-abcd2345", "not-a-code"]) {
      expect(isWellFormedSecretaryCode(c)).toBe(false);
    }
  });
});
