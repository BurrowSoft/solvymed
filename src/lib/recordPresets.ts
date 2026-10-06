// Record templates: the specialty presets (1.8.0 D; cf-approved
// specs/sprint-1.8.0-B-D-draft.md). A doctor copies a preset into their own
// template (record_templates) and edits it there; the presets themselves are
// fixed. The app keeps the same list (lib/record-presets.ts): change both
// together. Titles in pt-BR / en / th; any other UI language uses en.

export type PresetLang = "pt-BR" | "en" | "th";
type Text = Record<PresetLang, string>;
export type PresetSection = { title: Text; hint?: Text };
export type RecordPreset = { id: string; name: Text; sections: PresetSection[] };

const s = (pt: string, en: string, th: string, hint?: Text): PresetSection => ({ title: { "pt-BR": pt, en, th }, ...(hint ? { hint } : {}) });

const HDA = s("HDA (história da doença atual)", "History of present illness", "ประวัติการเจ็บป่วยปัจจุบัน", {
  "pt-BR": "Início, evolução, fatores de piora e melhora, tratamentos prévios.",
  en: "Onset, course, what makes it worse or better, previous treatments.",
  th: "เริ่มเมื่อใด การดำเนินโรค ปัจจัยที่ทำให้แย่ลงหรือดีขึ้น การรักษาที่ผ่านมา",
});
const CHIEF = s("Queixa principal", "Chief complaint", "อาการสำคัญ");
const MEDS = s("Medicações em uso", "Current medications", "ยาที่ใช้อยู่");
const DIAG = s("Hipótese diagnóstica (CID)", "Diagnostic hypothesis (ICD)", "การวินิจฉัยเบื้องต้น (ICD)");
const PLAN = s("Conduta", "Plan", "แผนการรักษา");

export const RECORD_PRESETS: readonly RecordPreset[] = [
  {
    id: "psychiatry",
    name: { "pt-BR": "Psiquiatria", en: "Psychiatry", th: "จิตเวช" },
    sections: [
      s("Identificação", "Identification", "ข้อมูลทั่วไป"),
      CHIEF,
      HDA,
      s("HPP (história patológica pregressa)", "Past medical history", "ประวัติการเจ็บป่วยในอดีต"),
      s("História familiar", "Family history", "ประวัติครอบครัว"),
      s("Uso de substâncias", "Substance use", "การใช้สารเสพติด"),
      MEDS,
      s("Exame do estado mental", "Mental status examination", "การตรวจสภาพจิต", {
        "pt-BR": "Aparência, atitude, consciência, orientação, atenção, memória, humor/afeto, pensamento, sensopercepção, juízo e crítica.",
        en: "Appearance, attitude, consciousness, orientation, attention, memory, mood/affect, thought, perception, judgement and insight.",
        th: "ลักษณะทั่วไป ท่าที ระดับความรู้สึกตัว การรับรู้วันเวลาสถานที่ สมาธิ ความจำ อารมณ์ ความคิด การรับรู้ การตัดสินใจและการหยั่งรู้",
      }),
      s("Avaliação de risco (suicídio / heteroagressividade)", "Risk assessment (suicide / harm to others)", "การประเมินความเสี่ยง (ฆ่าตัวตาย / ทำร้ายผู้อื่น)"),
      DIAG,
      PLAN,
    ],
  },
  {
    id: "general",
    name: { "pt-BR": "Clínica geral", en: "General practice", th: "เวชปฏิบัติทั่วไป" },
    sections: [
      CHIEF,
      s("HDA", "History of present illness", "ประวัติการเจ็บป่วยปัจจุบัน", HDA.hint),
      s("Antecedentes", "Past history", "ประวัติในอดีต"),
      MEDS,
      s("Alergias", "Allergies", "ประวัติแพ้ยา"),
      s("Exame físico", "Physical examination", "การตรวจร่างกาย"),
      DIAG,
      PLAN,
    ],
  },
  {
    id: "cardiology",
    name: { "pt-BR": "Cardiologia", en: "Cardiology", th: "อายุรศาสตร์โรคหัวใจ" },
    sections: [
      CHIEF,
      s("HDA", "History of present illness", "ประวัติการเจ็บป่วยปัจจุบัน", HDA.hint),
      s("Fatores de risco cardiovascular", "Cardiovascular risk factors", "ปัจจัยเสี่ยงโรคหัวใจและหลอดเลือด"),
      MEDS,
      s("Exame físico", "Physical examination", "การตรวจร่างกาย"),
      s("Ausculta cardíaca", "Heart auscultation", "การฟังเสียงหัวใจ"),
      s("Sinais vitais (PA, FC)", "Vital signs (BP, HR)", "สัญญาณชีพ (ความดันโลหิต ชีพจร)"),
      s("Exames complementares", "Test results", "ผลการตรวจเพิ่มเติม"),
      DIAG,
      PLAN,
    ],
  },
  {
    id: "psychology",
    name: { "pt-BR": "Psicologia", en: "Psychology", th: "จิตวิทยา" },
    sections: [
      s("Demanda", "Presenting concern", "ปัญหาที่มาปรึกษา"),
      s("História de vida", "Life history", "ประวัติชีวิต"),
      s("Relato da sessão", "Session notes", "บันทึกการบำบัด"),
      s("Observações clínicas", "Clinical observations", "ข้อสังเกตทางคลินิก"),
      s("Plano terapêutico", "Treatment plan", "แผนการบำบัด"),
    ],
  },
  {
    id: "dentistry",
    name: { "pt-BR": "Odontologia", en: "Dentistry", th: "ทันตกรรม" },
    sections: [
      CHIEF,
      s("Anamnese", "Medical history", "ประวัติทางการแพทย์"),
      s("Exame clínico intraoral", "Intraoral examination", "การตรวจในช่องปาก"),
      s("Odontograma (descrição)", "Tooth chart (notes)", "บันทึกผังฟัน"),
      s("Diagnóstico", "Diagnosis", "การวินิจฉัย"),
      s("Plano de tratamento", "Treatment plan", "แผนการรักษา"),
      s("Procedimento realizado", "Procedure performed", "หัตถการที่ทำ"),
    ],
  },
  {
    id: "nutrition",
    name: { "pt-BR": "Nutrição", en: "Nutrition", th: "โภชนาการ" },
    sections: [
      s("Objetivo", "Goal", "เป้าหมาย"),
      s("Anamnese alimentar", "Dietary history", "ประวัติการรับประทานอาหาร"),
      s("Medidas antropométricas", "Body measurements", "การวัดสัดส่วนร่างกาย"),
      s("Exames", "Test results", "ผลการตรวจ"),
      s("Diagnóstico nutricional", "Nutritional diagnosis", "การวินิจฉัยทางโภชนาการ"),
      s("Plano alimentar", "Meal plan", "แผนการรับประทานอาหาร"),
      s("Metas", "Targets", "เป้าหมายที่ตั้งไว้"),
    ],
  },
  {
    id: "physiotherapy",
    name: { "pt-BR": "Fisioterapia", en: "Physiotherapy", th: "กายภาพบำบัด" },
    sections: [
      CHIEF,
      s("Avaliação funcional", "Functional assessment", "การประเมินการทำงานของร่างกาย"),
      s("Escala de dor", "Pain scale", "ระดับความปวด"),
      s("Testes específicos", "Special tests", "การทดสอบเฉพาะ"),
      s("Diagnóstico cinético-funcional", "Functional diagnosis", "การวินิจฉัยทางกายภาพบำบัด"),
      s("Plano de tratamento", "Treatment plan", "แผนการรักษา"),
      s("Evolução", "Progress", "ความก้าวหน้า"),
    ],
  },
  {
    id: "paediatrics",
    name: { "pt-BR": "Pediatria", en: "Paediatrics", th: "กุมารเวชศาสตร์" },
    sections: [
      CHIEF,
      s("HDA", "History of present illness", "ประวัติการเจ็บป่วยปัจจุบัน", HDA.hint),
      s("Antecedentes gestacionais e de nascimento", "Pregnancy and birth history", "ประวัติการตั้งครรภ์และการคลอด"),
      s("Vacinação", "Vaccinations", "การได้รับวัคซีน"),
      s("Desenvolvimento", "Development", "พัฒนาการ"),
      s("Alimentação", "Feeding", "การให้อาหาร"),
      s("Exame físico (peso, altura, PC)", "Physical exam (weight, height, head circumference)", "การตรวจร่างกาย (น้ำหนัก ส่วนสูง เส้นรอบศีรษะ)"),
      DIAG,
      PLAN,
    ],
  },
];

export function presetLang(uiLocale: string): PresetLang {
  return uiLocale === "pt-BR" || uiLocale === "th" ? uiLocale : "en";
}

// A preset as a doctor's new template, in their UI language.
export function presetToTemplate(preset: RecordPreset, uiLocale: string): { name: string; sections: { title: string; hint?: string }[] } {
  const l = presetLang(uiLocale);
  return {
    name: preset.name[l],
    sections: preset.sections.map((x) => ({ title: x.title[l], ...(x.hint ? { hint: x.hint[l] } : {}) })),
  };
}

// A record written with sections, as the plain text older clients read
// (medical_records.content): "Title:\ntext" blocks; empty sections left out.
export function composeRecordContent(sections: { title: string; text: string }[]): string {
  return sections
    .filter((x) => x.text.trim())
    .map((x) => `${x.title}:\n${x.text.trim()}`)
    .join("\n\n");
}
