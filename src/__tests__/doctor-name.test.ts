import { describe, expect, it } from "vitest";
import { doctorDisplayName as webName, nameInitial } from "@/lib/doctorName";

// The shared table, copied verbatim from the app (mobile
// __tests__/lib/doctor-name.test.ts at f79767b) so both stay pinned. The
// only adapter: the web takes { firstOnly } where the app takes a boolean.
const doctorDisplayName = (name: string, firstNameOnly = false) => webName(name, { firstOnly: firstNameOnly });

describe('doctorDisplayName()', () => {
  it('never adds a title to a plain name (no gender guess)', () => {
    expect(doctorDisplayName('Ana Souza')).toBe('Ana Souza');
    expect(doctorDisplayName('Beatriz Lima', true)).toBe('Beatriz');
  });

  it("keeps the doctor's own title spelling, tidying only its case", () => {
    expect(doctorDisplayName('Dra. Beatriz Lima')).toBe('Dra. Beatriz Lima');
    expect(doctorDisplayName('Dra. Beatriz Lima', true)).toBe('Dra. Beatriz');
    expect(doctorDisplayName('dra. ana')).toBe('Dra. ana');
    expect(doctorDisplayName('dr carlos', true)).toBe('Dr carlos');
    expect(doctorDisplayName('DR. Carlos Melo')).toBe('Dr. Carlos Melo');
    expect(doctorDisplayName('Dra.Beatriz Lima', true)).toBe('Dra. Beatriz');
    expect(doctorDisplayName('Prof. João', true)).toBe('Prof. João');
    expect(doctorDisplayName('Profa. Marta Reis', true)).toBe('Profa. Marta');
  });

  it('knows the French and Italian titles the hint suggests', () => {
    expect(doctorDisplayName('Pr Jean Dupont', true)).toBe('Pr Jean');
    expect(doctorDisplayName('pr. Jean Dupont')).toBe('Pr. Jean Dupont');
    expect(doctorDisplayName('Dott. Mario Rossi', true)).toBe('Dott. Mario');
    expect(doctorDisplayName('dott Mario', true)).toBe('Dott Mario');
    expect(doctorDisplayName('Dott.ssa Giulia Bianchi', true)).toBe('Dott.ssa Giulia');
    expect(doctorDisplayName('DOTT.SSA giulia')).toBe('Dott.ssa giulia');
  });

  it('knows the Brazilian ordinal forms', () => {
    expect(doctorDisplayName('Drª Ana Souza', true)).toBe('Drª Ana');
    expect(doctorDisplayName('Dr.ª Ana Souza', true)).toBe('Dr.ª Ana');
    expect(doctorDisplayName('Prof.ª Marta Reis')).toBe('Prof.ª Marta Reis');
    expect(doctorDisplayName('profª marta', true)).toBe('Profª marta');
    expect(doctorDisplayName('Drª. Ana Souza', true)).toBe('Drª. Ana');
    expect(doctorDisplayName('Drª. Ana Souza')).toBe('Drª. Ana Souza');
    expect(doctorDisplayName('Prof.ª. Marta', true)).toBe('Prof.ª. Marta');
    expect(nameInitial('Drª. Ana Souza')).toBe('A');
    expect(doctorDisplayName('Dra Ana', true)).toBe('Dra Ana');
    expect(doctorDisplayName('Profa Marta', true)).toBe('Profa Marta');
  });

  it('keeps every leading title (stacked), then the first name', () => {
    expect(doctorDisplayName('Prof. Dr. Carlos Melo', true)).toBe('Prof. Dr. Carlos');
    expect(doctorDisplayName('Prof. Dr. Carlos Melo')).toBe('Prof. Dr. Carlos Melo');
    expect(doctorDisplayName('prof dra ana lima', true)).toBe('Prof Dra ana');
    expect(doctorDisplayName('Profª Drª Ana', true)).toBe('Profª Drª Ana');
    expect(doctorDisplayName('Prof. Dr.', true)).toBe('Prof. Dr.');
  });

  it("doesn't treat names that merely start with the letters as titles", () => {
    expect(doctorDisplayName('Draco Malfoy', true)).toBe('Draco');
    expect(doctorDisplayName('Drummond Silva', true)).toBe('Drummond');
    expect(doctorDisplayName('Professor Silva', true)).toBe('Professor');
    expect(doctorDisplayName('Dottie Smith', true)).toBe('Dottie');
    expect(doctorDisplayName('Prune Martin', true)).toBe('Prune');
    expect(doctorDisplayName('Pradeep Kumar', true)).toBe('Pradeep');
  });

  it('copes with a bare title or blank name', () => {
    expect(doctorDisplayName('Dra. ')).toBe('Dra.');
    expect(doctorDisplayName('dr')).toBe('Dr');
    expect(doctorDisplayName('  ')).toBe('');
    expect(doctorDisplayName('  Ana  ', true)).toBe('Ana');
  });
});

describe('nameInitial()', () => {
  it("is the name's first letter, never the title's", () => {
    expect(nameInitial('Dra. Beatriz Lima')).toBe('B');
    expect(nameInitial('Prof. Dr. carlos')).toBe('C');
    expect(nameInitial('Drª Ana')).toBe('A');
    expect(nameInitial('Draco Malfoy')).toBe('D');
    expect(nameInitial('Dra.')).toBe('D');
    expect(nameInitial('  ')).toBe('');
  });
});

// Web only: internal double spaces collapse (the app keeps them).
describe("web extras", () => {
  it("collapses internal whitespace", () => {
    expect(webName("Dra.   Beatriz   Lima")).toBe("Dra. Beatriz Lima");
    expect(webName(null)).toBe("");
  });
});
