import { describe, expect, it } from "vitest";
import { buildPixPayload, generatePixString, sanitizePixText } from "@/lib/pix";

// Independent CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as EMV/Pix use.
function crc16(data: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(data, "ascii")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Parses an EMV TLV string into [id, value] pairs; throws on a malformed one.
function parseTlv(s: string): [string, string][] {
  const out: [string, string][] = [];
  let i = 0;
  while (i < s.length) {
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(s.slice(i + 2, i + 4))) throw new Error(`bad TLV header at ${i}`);
    const value = s.slice(i + 4, i + 4 + len);
    if (value.length !== len) throw new Error(`field ${id} truncated`);
    out.push([id, value]);
    i += 4 + len;
  }
  return out;
}

function fields(code: string) {
  const top = parseTlv(code);
  const map = new Map(top);
  // The CRC field (63) is last and covers everything up to and including "6304".
  expect(top.at(-1)?.[0]).toBe("63");
  expect(map.get("63")).toBe(crc16(code.slice(0, -4)));
  const account = new Map(parseTlv(map.get("26")!));
  const extra = new Map(parseTlv(map.get("62")!));
  return { top: top.map(([id]) => id), map, account, extra };
}

describe("Pix BR Code", () => {
  it("matches the BCB manual's static example byte for byte (CRC 1D3D)", () => {
    const bcb = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";
    expect(buildPixPayload({ key: "123e4567-e12b-12d1-a456-426655440000", name: "Fulano de Tal", city: "BRASILIA" })).toBe(bcb);
    expect(fields(bcb).account.get("00")).toBe("br.gov.bcb.pix");
  });

  it("parses field by field: GUI and key in 26, then 52/53/54/58/59/60/62/63 in order", () => {
    const code = generatePixString("dra.maria@example.com", "Clínica São José", "São Paulo", 89.5);
    const { top, map, account, extra } = fields(code);
    expect(top).toEqual(["00", "26", "52", "53", "54", "58", "59", "60", "62", "63"]);
    expect(map.get("00")).toBe("01");
    expect([...account]).toEqual([["00", "br.gov.bcb.pix"], ["01", "dra.maria@example.com"]]);
    expect(map.get("52")).toBe("0000");
    expect(map.get("53")).toBe("986");
    expect(map.get("54")).toBe("89.50");
    expect(map.get("58")).toBe("BR");
    expect(map.get("59")).toBe("CLINICA SAO JOSE");
    expect(map.get("60")).toBe("SAO PAULO");
    expect(extra.get("05")).toBe("***");
  });

  it("omits the amount when there is none", () => {
    const { top } = fields(generatePixString("+5511999998888", "Consultório", "Rio de Janeiro"));
    expect(top).not.toContain("54");
  });

  it("truncates the name to 25 and the city to 15 characters, ASCII only", () => {
    const { map } = fields(generatePixString("k", "Clínica Médica Integrada São Sebastião", "São José dos Campos"));
    expect(map.get("59")).toBe("CLINICA MEDICA INTEGRADA");
    expect(map.get("59")!.length).toBeLessThanOrEqual(25);
    expect(map.get("60")).toBe("SAO JOSE DOS CA");
    expect(map.get("60")!.length).toBeLessThanOrEqual(15);
    for (const v of [map.get("59")!, map.get("60")!]) expect(v).toMatch(/^[A-Z0-9 ]+$/);
  });

  it("sanitizes symbols and repeated spaces", () => {
    expect(sanitizePixText("Dr.  João & Cia.", 25)).toBe("DR JOAO CIA");
    expect(sanitizePixText("   ", 25)).toBe("");
    const { map } = fields(generatePixString("k", "", ""));
    expect(map.get("59")).toBe("SOLVYMED");
    expect(map.get("60")).toBe("BRASIL");
  });
});
