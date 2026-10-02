// Appointment types are stored as the app's canonical English keys
// ("Consultation", "Follow-up", …; legacy "Consulta" too; 38). Shown in the
// reader's language; anything else (a procedure's own name) as written.
export const CONSULT_TYPE_KEYS = {
  Consultation: "consultation",
  Consulta: "consultation",
  "Follow-up": "followUp",
  "Exam Review": "examReview",
  Procedure: "procedure",
  Emergency: "emergency",
} as const;

export type ConsultTypeKey = (typeof CONSULT_TYPE_KEYS)[keyof typeof CONSULT_TYPE_KEYS];

export function consultTypeKey(value: string | null | undefined): ConsultTypeKey | null {
  return (CONSULT_TYPE_KEYS as Record<string, ConsultTypeKey>)[value ?? ""] ?? null;
}

// A plain consultation with no procedure (item 6.2): what both platforms store.
export const PLAIN_CONSULTATION = "Consultation";

// A clinic procedure that IS one of the booking list's fixed items, by its
// name in any shipped language, ignoring case, accents and spaces (app
// #292's set + Thai): it takes that item's slot (e7: replace, keeping the
// position) with its own length and price, instead of a second "Consulta".
const FIXED_NAMES: Record<"consultation" | "followUp", string[]> = {
  consultation: ["consultation", "consulta", "ตรวจทั่วไป"],
  followUp: ["follow-up", "followup", "follow up", "retorno", "นัดติดตามผล", "ติดตามอาการ"],
};
const normName = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
export function fixedBookingItem(name: string | null | undefined): "consultation" | "followUp" | null {
  const n = normName(name ?? "");
  if (!n) return null;
  for (const key of ["consultation", "followUp"] as const) {
    if (FIXED_NAMES[key].some((w) => normName(w) === n)) return key;
  }
  return null;
}
