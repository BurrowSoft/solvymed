// "Baixar modelo de planilha": our own spreadsheet template (UX,
// integrations/generic-spreadsheet.md). Headers in the doctor's language
// (pt / en / th; others get en), the ID columns of the practice country, and
// one example row of invented data. Every header is one the generic preset
// recognises, so the columns map themselves. Built in the browser.

// Every cell quoted (our own fixed text: no formulas to neutralise).
export const csvCell = (v: string) => `"${v.replace(/"/g, "\"\"")}"`;

type Lang = "pt" | "en" | "th";
type Col = { key: string; h: Record<Lang, string>; ex: Record<Lang, string> };

const COLS: Col[] = [
  { key: "name", h: { pt: "Nome", en: "Name", th: "ชื่อ-นามสกุล" }, ex: { pt: "Maria Silva", en: "Maria Silva", th: "สมศรี ใจดี" } },
  { key: "cpf", h: { pt: "CPF", en: "CPF", th: "CPF" }, ex: { pt: "123.456.789-09", en: "123.456.789-09", th: "123.456.789-09" } },
  { key: "thId", h: { pt: "Nº de identidade tailandês", en: "Thai ID", th: "เลขประจำตัวประชาชน" }, ex: { pt: "1234567890121", en: "1234567890121", th: "1234567890121" } },
  { key: "passport", h: { pt: "Passaporte", en: "Passport", th: "หนังสือเดินทาง" }, ex: { pt: "", en: "", th: "" } },
  { key: "birth", h: { pt: "Data de nascimento", en: "Birth date", th: "วันเกิด" }, ex: { pt: "25/12/1980", en: "25/12/1980", th: "25/12/2523" } },
  { key: "sex", h: { pt: "Sexo", en: "Sex", th: "เพศ" }, ex: { pt: "Feminino", en: "Female", th: "หญิง" } },
  { key: "phone", h: { pt: "Celular", en: "Phone", th: "เบอร์โทร" }, ex: { pt: "(11) 98765-4321", en: "+44 7700 900123", th: "081 234 5678" } },
  { key: "email", h: { pt: "E-mail", en: "Email", th: "อีเมล" }, ex: { pt: "maria@exemplo.com", en: "maria@example.com", th: "somsri@example.com" } },
  { key: "rg", h: { pt: "RG", en: "RG", th: "RG" }, ex: { pt: "", en: "", th: "" } },
  { key: "profession", h: { pt: "Profissão", en: "Occupation", th: "อาชีพ" }, ex: { pt: "Professora", en: "Teacher", th: "ครู" } },
  { key: "tags", h: { pt: "Etiquetas", en: "Tags", th: "แท็ก" }, ex: { pt: "retorno", en: "follow-up", th: "นัดติดตาม" } },
  { key: "notes", h: { pt: "Observações", en: "Notes", th: "หมายเหตุ" }, ex: { pt: "", en: "", th: "" } },
];

// The practice country's IDs: CPF + RG in Brazil, Thai ID + passport in
// Thailand, a passport elsewhere.
const IDS: Record<string, string[]> = { BR: ["cpf", "rg"], TH: ["thId", "passport"] };

export function templateLang(locale: string): Lang {
  return locale === "pt-BR" ? "pt" : locale === "th" ? "th" : "en";
}

export function templateCsv(locale: string, country: string): { fileName: string; csv: string } {
  const lang = templateLang(locale);
  const ids = IDS[country] ?? ["passport"];
  const cols = COLS.filter((c) => !["cpf", "rg", "thId", "passport"].includes(c.key) || ids.includes(c.key));
  // ";" where Excel expects it (decimal-comma locales), "," in English.
  const sep = lang === "en" ? "," : ";";
  const line = (cells: string[]) => cells.map((c) => csvCell(c)).join(sep);
  const csv = "﻿" + [line(cols.map((c) => c.h[lang])), line(cols.map((c) => c.ex[lang]))].join("\r\n") + "\r\n";
  const fileName = { pt: "solvymed-pacientes-modelo.csv", en: "solvymed-patients-template.csv", th: "solvymed-patients-template.csv" }[lang];
  return { fileName, csv };
}
