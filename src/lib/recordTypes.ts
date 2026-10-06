// medical_records.record_type has two vocabularies on production: the
// website's keys and the app's English labels (before 1.8.0 it saved those).
// The keys are canonical (cf, 2026-10-07): both clients read both forms and
// write keys; no data migration (locked clinical rows). The app maps the
// same way (lib/record-types.ts).

export const RECORD_TYPE_KEYS = ["free_text", "soap", "follow_up", "surgical", "referral"] as const;
export type RecordTypeKey = (typeof RECORD_TYPE_KEYS)[number];

const FROM_LABEL: Record<string, RecordTypeKey> = {
  "free text": "free_text",
  "soap note": "soap",
  "follow-up": "follow_up",
  "surgical report": "surgical",
  referral: "referral",
  // The seed data's type: nothing to show.
  consultation: "free_text",
};

// Any stored value → its key; unknown or empty → free text.
export function recordTypeKey(v: string | null | undefined): RecordTypeKey {
  const s = (v ?? "").trim();
  if ((RECORD_TYPE_KEYS as readonly string[]).includes(s)) return s as RecordTypeKey;
  return FROM_LABEL[s.toLowerCase()] ?? "free_text";
}

// The patientDetail label key for a type.
export function recordTypeLabelKey(k: RecordTypeKey): "freeText" | "soapNote" | "followUp" | "surgical" | "referral" {
  return k === "soap" ? "soapNote" : k === "follow_up" ? "followUp" : k === "surgical" ? "surgical" : k === "referral" ? "referral" : "freeText";
}
