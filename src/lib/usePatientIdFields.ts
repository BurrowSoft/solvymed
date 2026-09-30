"use client";

import { useTranslations } from "next-intl";
import type { PatientIdKind } from "./patientIds";
import { profileOfKind } from "./country";

export type PatientIdValues = { cpf?: string | null; th_national_id?: string | null; passport_number?: string | null };

export type PatientIdField = {
  name: "cpf" | "th_national_id" | "passport_number";
  label: string;
  placeholder: string;
  value: string;
  inputMode?: "numeric";
  maxLength: number;
};

// The identifier fields of the practice's country (lib/patientIds), for the
// patient forms and the patient info view. Each form renders them with its
// own label/input components.
export function usePatientIdFields(kind: PatientIdKind, values: PatientIdValues = {}): PatientIdField[] {
  const t = useTranslations("patientIds");
  // The practice country's fields, from the registry (lib/country idFields).
  return profileOfKind(kind).idFields.map((f) => ({
    name: f.name,
    label: t(f.label),
    placeholder: f.placeholder,
    value: values[f.name] ?? "",
    ...(f.numeric ? { inputMode: "numeric" as const } : {}),
    maxLength: f.maxLength,
  }));
}
