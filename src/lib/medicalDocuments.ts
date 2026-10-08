// 1.8.0 B: the documents a doctor writes besides prescriptions (migration
// 189's medical_documents, behind the server flag 'clinical_documents';
// cf-approved specs/sprint-1.8.0-B-D-draft.md). One model for the website
// and the app (lib/medical-documents.ts, the same code): the types each
// practice country offers, each type's fields (stored as JSON), the printed
// words in the document's own language, and the prefilled sentences.
//
// The document's language changes only the fixed labels, the prefilled
// sentences and the date line (Thai: the Buddhist era). The doctor writes
// the body in that language. The controlled prescription is Portuguese only.

import { dateLocale } from "@/lib/dateLabels";
import { countryProfile } from "@/lib/country";

export const DOC_LANGS = ["pt-BR", "en", "th", "es", "de", "fr", "it"] as const;
export type DocLang = (typeof DOC_LANGS)[number];

// The picker's order (cf, 6 Oct): the practice country's language and English
// first, then the rest (all 7 kept: a certificate for travel abroad).
export function docLangsFor(country: string | null | undefined): DocLang[] {
  const first = [countryProfile(country).fallbackLocale, "en"] as DocLang[];
  return [...new Set<DocLang>([...first, ...DOC_LANGS])];
}

// The languages a type offers (ad, 7 Oct): the Thai medical certificate's
// form exists in Thai and English only; every other type keeps the full
// list. A document already saved in another language keeps it (it's added
// at the end), never forced to change.
export function docLangsForType(type: MedicalDocType | null, langs: readonly DocLang[], current?: DocLang | null): DocLang[] {
  const out = type === "th_certificate" ? langs.filter((l) => l === "th" || l === "en") : [...langs];
  return current && !out.includes(current) ? [...out, current] : out;
}

// A CPF as printed: 000.000.000-00 (11 digits), else as stored.
export function formatCpfDigits(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf;
}

export type MedicalDocType = "certificate" | "declaration" | "exam_request" | "controlled_prescription" | "th_certificate";

// Per practice country (the registry's documentTypes): an explicit default,
// never "if Brazil" (UX 36).
const TYPES_BY_COUNTRY: Record<string, readonly MedicalDocType[]> = {
  BR: ["certificate", "declaration", "exam_request", "controlled_prescription"],
  TH: ["th_certificate", "declaration", "exam_request"],
};
const DEFAULT_TYPES: readonly MedicalDocType[] = ["certificate", "declaration", "exam_request"];
export function documentTypesFor(country: string | null | undefined): readonly MedicalDocType[] {
  return (country && TYPES_BY_COUNTRY[country]) || DEFAULT_TYPES;
}

// The controlled prescription has fixed Portuguese labels (Anvisa's model).
export function fixedLanguage(t: MedicalDocType): DocLang | null {
  return t === "controlled_prescription" ? "pt-BR" : null;
}

// ── Fields (medical_documents.fields) ────────────────────────────────────────

export type CertificateFields = {
  variant: "absence" | "attendance";
  date: string; // YYYY-MM-DD, the visit
  days?: number; // absence
  start?: string; // absence, YYYY-MM-DD
  from?: string; // attendance, HH:MM
  to?: string; // attendance, HH:MM
  includeCid: boolean;
  cid?: string;
};
export type DeclarationFields = { date: string; from: string; to: string; companion?: string };
export type ExamRequestFields = { exams: string[]; indication?: string; cid?: string };
export type ControlledFields = { items: { name: string; dose: string; quantity: string; posology: string }[] };
export type ThCertificateFields = { examDate: string; rest?: { days: number; start: string; end: string } };
export type DocFields = CertificateFields | DeclarationFields | ExamRequestFields | ControlledFields | ThCertificateFields;

export type DocFieldError = "date" | "days" | "time" | "cid" | "exams" | "items" | "body";

const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const isTime = (s: unknown) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const text = (s: unknown, max: number) => typeof s === "string" && s.trim().length > 0 && s.length <= max;

// What's required per type, before the document is saved (the database keeps
// the JSON's size in check; these keep it meaningful).
export function validateFields(type: MedicalDocType, f: DocFields, body: string): DocFieldError | null {
  switch (type) {
    case "certificate": {
      const c = f as CertificateFields;
      if (!isDate(c.date)) return "date";
      if (c.variant === "absence" && (!Number.isInteger(c.days) || (c.days ?? 0) < 1 || (c.days ?? 0) > 365 || !isDate(c.start))) return "days";
      if (c.variant === "attendance" && (!isTime(c.from) || !isTime(c.to) || (c.from ?? "") >= (c.to ?? ""))) return "time";
      if (c.includeCid && !text(c.cid, 20)) return "cid";
      return body.trim() ? null : "body";
    }
    case "declaration": {
      const d = f as DeclarationFields;
      if (!isDate(d.date)) return "date";
      if (!isTime(d.from) || !isTime(d.to) || d.from >= d.to) return "time";
      return body.trim() ? null : "body";
    }
    case "exam_request": {
      const e = f as ExamRequestFields;
      if (!Array.isArray(e.exams) || e.exams.filter((x) => x.trim()).length === 0 || e.exams.length > 60) return "exams";
      if (e.cid !== undefined && e.cid !== "" && !text(e.cid, 20)) return "cid";
      return null;
    }
    case "controlled_prescription": {
      const c = f as ControlledFields;
      if (!Array.isArray(c.items) || c.items.filter((i) => i.name.trim()).length === 0 || c.items.length > 10) return "items";
      return null;
    }
    case "th_certificate": {
      const t = f as ThCertificateFields;
      if (!isDate(t.examDate)) return "date";
      if (t.rest && (!Number.isInteger(t.rest.days) || t.rest.days < 1 || !isDate(t.rest.start) || !isDate(t.rest.end) || t.rest.end < t.rest.start)) return "days";
      return body.trim() ? null : "body";
    }
  }
}

// ── Printed words per document language ──────────────────────────────────────

type Words = {
  title: Record<"certificate" | "declaration" | "exam_request" | "prescription", string>;
  patient: string; idCpf: string; idTh: string; passport: string;
  request: string; indication: string; cid: string; signature: string;
  certAbsence: string; certAttendance: string; declaration: string; companion: string;
  dateLine: string; // {city}, {date}
  // The PDF footer, in the document's language (cf, 6 Oct: never the UI's).
  footer: string;
};

// en / pt-BR / th: cf-approved (B.6). es / de / fr / it: titles and labels
// from B.6's drafts; the sentences are drafts too (native check pending).
export const PRINT: Record<DocLang, Words> = {
  en: {
    title: { certificate: "MEDICAL CERTIFICATE", declaration: "MEDICAL DECLARATION", exam_request: "EXAM REQUEST", prescription: "PRESCRIPTION" },
    patient: "Patient", idCpf: "CPF", idTh: "Thai ID", passport: "Passport",
    request: "I request:", indication: "Clinical indication", cid: "ICD", signature: "Signature",
    certAbsence: "I certify that {patient} was under my care on {date} and needs {days} day(s) away from their activities, from {start}.",
    certAttendance: "I certify that {patient} was under my care on {date}, from {from} to {to}.",
    declaration: "I declare that {patient} attended a medical appointment at this practice on {date}, from {from} to {to}.",
    companion: "Accompanied by {companion}.",
    dateLine: "{city}, {date}",
    footer: "SolvyMed — Clinic management",
  },
  "pt-BR": {
    title: { certificate: "ATESTADO MÉDICO", declaration: "DECLARAÇÃO MÉDICA", exam_request: "SOLICITAÇÃO DE EXAMES", prescription: "RECEITA" },
    patient: "Paciente", idCpf: "CPF", idTh: "Documento tailandês", passport: "Passaporte",
    request: "Solicito:", indication: "Indicação clínica", cid: "CID", signature: "Assinatura",
    certAbsence: "Atesto, para os devidos fins, que {patient} esteve sob meus cuidados em {date} e necessita de {days} dia(s) de afastamento de suas atividades, a partir de {start}.",
    certAttendance: "Atesto, para os devidos fins, que {patient} esteve sob meus cuidados em {date}, das {from} às {to}.",
    declaration: "Declaro que {patient} compareceu a consulta médica neste consultório em {date}, das {from} às {to}.",
    companion: "Acompanhado(a) por {companion}.",
    dateLine: "{city}, {date}",
    footer: "SolvyMed — Gestão de clínicas",
  },
  th: {
    title: { certificate: "ใบรับรองแพทย์", declaration: "ใบรับรองการมาพบแพทย์", exam_request: "ใบส่งตรวจ", prescription: "ใบสั่งยา" },
    patient: "ผู้ป่วย", idCpf: "เลขประจำตัวประชาชน", idTh: "เลขประจำตัวประชาชน", passport: "หนังสือเดินทาง",
    request: "ขอส่งตรวจ:", indication: "ข้อบ่งชี้ทางคลินิก", cid: "รหัสโรค (ICD)", signature: "ลงชื่อ",
    certAbsence: "ขอรับรองว่า {patient} ได้มารับการตรวจรักษาเมื่อวันที่ {date} สมควรพักรักษาตัวเป็นเวลา {days} วัน ตั้งแต่วันที่ {start}",
    certAttendance: "ขอรับรองว่า {patient} ได้มารับการตรวจรักษาเมื่อวันที่ {date} เวลา {from} ถึง {to} น.",
    declaration: "ขอรับรองว่า {patient} ได้มาพบแพทย์ที่สถานพยาบาลแห่งนี้เมื่อวันที่ {date} เวลา {from} ถึง {to} น.",
    companion: "โดยมี {companion} เป็นผู้ติดตาม",
    dateLine: "{city} วันที่ {date}",
    footer: "SolvyMed — ระบบบริหารคลินิก",
  },
  es: {
    title: { certificate: "CERTIFICADO MÉDICO", declaration: "DECLARACIÓN MÉDICA", exam_request: "SOLICITUD DE EXÁMENES", prescription: "RECETA" },
    patient: "Paciente", idCpf: "CPF", idTh: "Documento tailandés", passport: "Pasaporte",
    request: "Solicito:", indication: "Indicación clínica", cid: "CIE", signature: "Firma",
    certAbsence: "Certifico que {patient} estuvo bajo mi atención el {date} y necesita {days} día(s) de reposo de sus actividades, a partir del {start}.",
    certAttendance: "Certifico que {patient} estuvo bajo mi atención el {date}, de {from} a {to}.",
    declaration: "Declaro que {patient} asistió a una consulta médica en este consultorio el {date}, de {from} a {to}.",
    companion: "Acompañado(a) por {companion}.",
    dateLine: "{city}, {date}",
    footer: "SolvyMed — Gestión de consultas",
  },
  de: {
    title: { certificate: "ÄRZTLICHES ATTEST", declaration: "ÄRZTLICHE BESCHEINIGUNG", exam_request: "UNTERSUCHUNGSANFORDERUNG", prescription: "REZEPT" },
    patient: "Patient(in)", idCpf: "CPF", idTh: "Thailändischer Ausweis", passport: "Reisepass",
    request: "Ich bitte um:", indication: "Klinische Indikation", cid: "ICD", signature: "Unterschrift",
    certAbsence: "Hiermit bescheinige ich, dass {patient} am {date} in meiner Behandlung war und {days} Tag(e) von seinen/ihren Tätigkeiten freigestellt werden muss, ab dem {start}.",
    certAttendance: "Hiermit bescheinige ich, dass {patient} am {date} von {from} bis {to} Uhr in meiner Behandlung war.",
    declaration: "Hiermit erkläre ich, dass {patient} am {date} von {from} bis {to} Uhr einen Arzttermin in dieser Praxis wahrgenommen hat.",
    companion: "In Begleitung von {companion}.",
    dateLine: "{city}, {date}",
    footer: "SolvyMed — Praxisverwaltung",
  },
  fr: {
    title: { certificate: "CERTIFICAT MÉDICAL", declaration: "DÉCLARATION MÉDICALE", exam_request: "DEMANDE D'EXAMENS", prescription: "ORDONNANCE" },
    patient: "Patient(e)", idCpf: "CPF", idTh: "Pièce d'identité thaïlandaise", passport: "Passeport",
    request: "Je demande :", indication: "Indication clinique", cid: "CIM", signature: "Signature",
    certAbsence: "Je certifie que {patient} a été sous mes soins le {date} et nécessite {days} jour(s) d'arrêt de ses activités, à partir du {start}.",
    certAttendance: "Je certifie que {patient} a été sous mes soins le {date}, de {from} à {to}.",
    declaration: "Je déclare que {patient} s'est présenté(e) à une consultation médicale dans ce cabinet le {date}, de {from} à {to}.",
    companion: "Accompagné(e) de {companion}.",
    dateLine: "{city}, le {date}",
    footer: "SolvyMed — Gestion de cabinet",
  },
  it: {
    title: { certificate: "CERTIFICATO MEDICO", declaration: "DICHIARAZIONE MEDICA", exam_request: "RICHIESTA DI ESAMI", prescription: "RICETTA" },
    patient: "Paziente", idCpf: "CPF", idTh: "Documento thailandese", passport: "Passaporto",
    request: "Si richiede:", indication: "Indicazione clinica", cid: "ICD", signature: "Firma",
    certAbsence: "Certifico che {patient} è stato/a in cura da me il {date} e necessita di {days} giorno/i di assenza dalle sue attività, a partire dal {start}.",
    certAttendance: "Certifico che {patient} è stato/a in cura da me il {date}, dalle {from} alle {to}.",
    declaration: "Dichiaro che {patient} si è presentato/a a una visita medica in questo studio il {date}, dalle {from} alle {to}.",
    companion: "Accompagnato/a da {companion}.",
    dateLine: "{city}, {date}",
    footer: "SolvyMed — Gestione dello studio",
  },
};

export function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// A date in the document's language, long form; Thai in the Buddhist era.
export function longDate(lang: DocLang, iso: string): string {
  if (!isDate(iso)) return iso;
  return new Intl.DateTimeFormat(dateLocale(lang), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

// The prefilled body the doctor can edit, in the document's language.
export function prefilledBody(type: MedicalDocType, f: DocFields, lang: DocLang, patient: string): string {
  const w = PRINT[lang];
  if (type === "certificate") {
    const c = f as CertificateFields;
    return c.variant === "absence"
      ? fill(w.certAbsence, { patient, date: longDate(lang, c.date), days: c.days ?? "", start: longDate(lang, c.start ?? "") })
      : fill(w.certAttendance, { patient, date: longDate(lang, c.date), from: c.from ?? "", to: c.to ?? "" });
  }
  if (type === "declaration") {
    const d = f as DeclarationFields;
    const s = fill(w.declaration, { patient, date: longDate(lang, d.date), from: d.from, to: d.to });
    return d.companion?.trim() ? `${s} ${fill(w.companion, { companion: d.companion.trim() })}` : s;
  }
  return "";
}

// B.5: the Thai medical certificate's own lines (Thai, with the English twin
// the spec gives; any other document language uses the English).
export type ThCertWords = {
  place: string; iDoctor: string; licence: string; examined: string; idLabel: string; on: string;
  findings: string; rest: string; signedBy: string; examiner: string;
};
export const TH_CERT: Record<"th" | "en", ThCertWords> = {
  th: {
    place: "สถานที่ตรวจ", iDoctor: "ข้าพเจ้า", licence: "ใบอนุญาตประกอบวิชาชีพเวชกรรมเลขที่", examined: "ได้ตรวจร่างกาย",
    idLabel: "เลขประจำตัวประชาชน", on: "เมื่อวันที่", findings: "ผลการตรวจ / ความเห็นของแพทย์",
    rest: "สมควรพักรักษาตัวเป็นเวลา {days} วัน ตั้งแต่วันที่ {start} ถึงวันที่ {end}", signedBy: "ลงชื่อ", examiner: "แพทย์ผู้ตรวจ",
  },
  en: {
    place: "Place of examination", iDoctor: "I", licence: "Medical licence no.", examined: "examined",
    idLabel: "ID", on: "on", findings: "Findings / opinion",
    rest: "Should rest for {days} day(s), from {start} to {end}.", signedBy: "Signature", examiner: "Examining physician",
  },
};
export const thCertWords = (lang: DocLang): ThCertWords => (lang === "th" ? TH_CERT.th : TH_CERT.en);

// The registration line under the signer's name (cf, 76's #413 row; app and
// web identical).  Only a registration of digits is formatted: Brazil
// "CRM {no.}/{UF}" (no UF saved → "CRM {no.}"); Thailand the medical licence in
// the document's language.  Anything with a letter is printed as typed; none → null.
const TH_LICENCE: Record<DocLang, string> = {
  th: "ใบอนุญาตประกอบวิชาชีพเวชกรรม เลขที่ ว.{no}",
  en: "Medical licence no. {no}",
  "pt-BR": "Licença médica nº {no}",
  es: "Licencia médica n.º {no}",
  fr: "Licence médicale n° {no}",
  de: "Ärztliche Approbation Nr. {no}",
  it: "Licenza medica n. {no}",
};
export function registrationLine(
  country: string | null | undefined, lang: DocLang, registration: string | null | undefined, uf?: string | null,
): string | null {
  const r = (registration ?? "").trim();
  if (!r) return null;
  if (/\p{L}/u.test(r)) return r;
  if (country === "BR") return uf?.trim() ? `CRM ${r}/${uf.trim().toUpperCase()}` : `CRM ${r}`;
  if (country === "TH") return fill(TH_LICENCE[lang], { no: r });
  return r;
}

// The patient's ID line for the printed document, by the practice's ID kind.
// ── The copy shared with the patient (1.8.0 B2; ad, both platforms) ─────────
// A document made in SolvyMed goes to the patient's folder as a PDF snapshot:
// its folder by type (ad), its title as printed in the document's own
// language with its date in that document's calendar, and the unsigned-copy
// line (the website has no drawn signature). The controlled prescription is
// print-only: never shared. en / pt-BR / th: the app's pdf.unsignedCopy;
// es / fr / de / it: drafts for UX review.
export type SharedDocType = Exclude<MedicalDocType, "controlled_prescription">;
export const SNAPSHOT_FOLDER: Record<SharedDocType, "certificates" | "exams"> = {
  certificate: "certificates", declaration: "certificates", th_certificate: "certificates", exam_request: "exams",
};
export function sharesSnapshot(type: MedicalDocType): type is SharedDocType {
  return type !== "controlled_prescription";
}
const SNAPSHOT_WORDS: Record<DocLang, { unsignedCopy: string; title: Record<SharedDocType, string> }> = {
  en: { unsignedCopy: "Unsigned copy, for the patient's reference.",
    title: { certificate: "Medical certificate", declaration: "Medical declaration", exam_request: "Exam request", th_certificate: "Medical certificate" } },
  "pt-BR": { unsignedCopy: "Cópia sem assinatura, para consulta do paciente.",
    title: { certificate: "Atestado médico", declaration: "Declaração médica", exam_request: "Solicitação de exames", th_certificate: "Atestado médico" } },
  th: { unsignedCopy: "สำเนาไม่มีลายมือชื่อ สำหรับผู้ป่วยใช้อ้างอิง",
    title: { certificate: "ใบรับรองแพทย์", declaration: "ใบรับรองการมาพบแพทย์", exam_request: "ใบส่งตรวจ", th_certificate: "ใบรับรองแพทย์" } },
  es: { unsignedCopy: "Copia sin firma, para consulta del paciente.",
    title: { certificate: "Certificado médico", declaration: "Declaración médica", exam_request: "Solicitud de exámenes", th_certificate: "Certificado médico" } },
  fr: { unsignedCopy: "Copie non signée, pour information du patient.",
    title: { certificate: "Certificat médical", declaration: "Déclaration médicale", exam_request: "Demande d'examens", th_certificate: "Certificat médical" } },
  de: { unsignedCopy: "Unsignierte Kopie, zur Information des Patienten.",
    title: { certificate: "Ärztliches Attest", declaration: "Ärztliche Bescheinigung", exam_request: "Untersuchungsanforderung", th_certificate: "Ärztliches Attest" } },
  it: { unsignedCopy: "Copia non firmata, per consultazione del paziente.",
    title: { certificate: "Certificato medico", declaration: "Dichiarazione medica", exam_request: "Richiesta di esami", th_certificate: "Certificato medico" } },
};
export function snapshotUnsignedLine(lang: DocLang): string {
  return SNAPSHOT_WORDS[lang].unsignedCopy;
}
// "Atestado médico 08/10/2026", "ใบรับรองแพทย์ 08/10/2569" (the Buddhist era in Thai).
export function snapshotTitle(type: SharedDocType, lang: DocLang, iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const date = m ? `${m[3]}/${m[2]}/${lang === "th" ? Number(m[1]) + 543 : m[1]}` : iso;
  return `${SNAPSHOT_WORDS[lang].title[type]} ${date}`;
}

export function idLabel(lang: DocLang, kind: "cpf" | "thai_id" | "passport"): string {
  const w = PRINT[lang];
  return kind === "cpf" ? w.idCpf : kind === "thai_id" ? w.idTh : w.passport;
}
