import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("@/components/CookieSettingsButton", () => ({ CookieSettingsButton: () => null }));

import { PrivacyEn } from "@/app/[locale]/(site)/privacy/PrivacyEn";
import { PrivacyPtBR } from "@/app/[locale]/(site)/privacy/PrivacyPtBR";
import { PrivacyTh } from "@/app/[locale]/(site)/privacy/PrivacyTh";

// Retention A (Vitor, 10-28): §9's 20 years cites Lei 13.787 for clinics in Brazil only;
// for clinics in Thailand the basis is the clinic's own responsibility for its records.
// The pt-BR page says the same (one version, every language).

const text = (C: typeof PrivacyEn) => renderToStaticMarkup(createElement(C, { turnstile: false })).replace(/\s+/g, " ");

describe("privacy §9: the 20-year retention per country", () => {
  it("en: Lei 13.787 is scoped to Brazil, then the Thailand sentence", () => {
    const en = text(PrivacyEn);
    expect(en).toContain("(for clinics in Brazil, the period Brazilian law sets for patient records, Lei n.º 13.787/2018)");
    expect(en).toContain("For clinics in Thailand, the same 20-year period applies: the clinic is responsible for its patients’ records, and we keep them on the clinic’s behalf for that period.");
  });

  it("th: the same, and never Brazilian law as the plain reason", () => {
    const th = text(PrivacyTh);
    expect(th).toContain("(สำหรับคลินิกในประเทศบราซิล เป็นระยะเวลาที่กฎหมายบราซิลกำหนดสำหรับเวชระเบียน คือ Lei n.º 13.787/2018)");
    expect(th).toContain("สำหรับคลินิกในประเทศไทย ใช้ระยะเวลา 20 ปีเช่นเดียวกัน เนื่องจากคลินิกเป็นผู้รับผิดชอบเวชระเบียนของผู้ป่วย และเราจัดเก็บไว้แทนคลินิกตลอดระยะเวลาดังกล่าว");
    expect(th).not.toContain("ซึ่งเป็นระยะเวลาที่กฎหมายบราซิลกำหนด");
  });

  it("pt-BR says the same as en/th (the same version, every language; cf's R1, 01)", () => {
    const pt = text(PrivacyPtBR);
    expect(pt).toContain("(para clínicas no Brasil, o prazo que a lei brasileira estabelece para prontuários, Lei n.º 13.787/2018)");
    expect(pt).toContain("Para clínicas na Tailândia, vale o mesmo prazo de 20 anos: a clínica é responsável pelos prontuários dos seus pacientes, e nós os guardamos em nome da clínica durante esse prazo.");
    expect(pt).not.toContain("<strong>20 anos</strong>, o prazo que a lei brasileira");
  });

  it("the account strings say the retention period, not the law", () => {
    for (const loc of ["en", "pt-BR", "th"]) {
      const m = JSON.parse(readFileSync(`src/messages/${loc}.json`, "utf8").replace(/^﻿/, ""));
      const lines = JSON.stringify(m).match(/"(professionals|closeRecords)":"[^"]*20[^"]*"/g) ?? [];
      expect(lines.length, loc).toBe(2);
      for (const l of lines) expect(l, loc).not.toMatch(/law requires|legal retention|a lei exige|prazo legal|กฎหมายกำหนด/);
    }
  });
});
