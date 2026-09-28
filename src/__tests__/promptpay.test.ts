import { describe, expect, it } from "vitest";
import { crc16 } from "@/lib/emv";
import { generatePromptPayString, normalizePromptPayId } from "@/lib/promptpay";

// Known-good payloads, byte-identical to the MIT "promptpay-qr" library
// (0.5.0) for the same input. Shared verbatim with the app's tests so both
// clients produce the same QR.
const FIXTURES: [string, number | undefined, string][] = [
  ["0812345678", undefined, "00020101021129370016A000000677010111011300668123456785802TH530376463045D82"],
  ["0812345678", 500, "00020101021229370016A000000677010111011300668123456785802TH53037645406500.00630416BF"],
  ["0812345678", 1234.5, "00020101021229370016A000000677010111011300668123456785802TH530376454071234.50630414B2"],
  ["081-234-5678", 0.01, "00020101021229370016A000000677010111011300668123456785802TH530376454040.01630437B6"],
  ["1101700207030", undefined, "00020101021129370016A000000677010111021311017002070305802TH530376463048372"],
  ["1101700207030", 690, "00020101021229370016A000000677010111021311017002070305802TH53037645406690.0063044A89"],
  ["3100503389475", 99999.99, "00020101021229370016A000000677010111021331005033894755802TH5303764540899999.9963041120"],
];

describe("PromptPay payload (TH-4)", () => {
  it.each(FIXTURES)("%s, amount %s", (id, amount, expected) => {
    expect(generatePromptPayString(id, amount)).toBe(expected);
  });

  it("no amount (or zero) is a static QR without tag 54", () => {
    const s = generatePromptPayString("0812345678", 0);
    expect(s).toBe(FIXTURES[0][2]);
    expect(s).toContain("010211");
    expect(s).not.toContain("5802TH530376454");
  });

  it("ends with a CRC over everything before it", () => {
    for (const [, , payload] of FIXTURES) {
      expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
    }
  });

  it("the CRC is CRC-16/CCITT-FALSE (published check value)", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
});

describe("normalizePromptPayId (the migration 110 format)", () => {
  it("accepts a 10-digit mobile starting with 0 or a 13-digit ID, dropping separators", () => {
    expect(normalizePromptPayId("081-234-5678")).toBe("0812345678");
    expect(normalizePromptPayId(" 1 1017 00207 03 0 ")).toBe("1101700207030");
  });

  it("turns an international mobile into the local form (same QR)", () => {
    expect(normalizePromptPayId("+66 81 234 5678")).toBe("0812345678");
    expect(generatePromptPayString("+66812345678", 500)).toBe(FIXTURES[1][2]);
  });

  it.each(["", "812345678", "1812345678", "08123456789", "123456789012", "12345678901234", "66812345678", "+6681234567"])(
    "rejects %j",
    (raw) => {
      expect(normalizePromptPayId(raw)).toBeNull();
      if (raw) expect(() => generatePromptPayString(raw, 1)).toThrow();
    },
  );
});
