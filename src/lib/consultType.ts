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
