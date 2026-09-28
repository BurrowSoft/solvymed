"use client";

import { useTranslations } from "next-intl";
import type { PatientIdKind } from "./patientIds";

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
  if (kind === "BR") {
    return [{ name: "cpf", label: t("cpf"), placeholder: "000.000.000-00", value: values.cpf ?? "", maxLength: 20 }];
  }
  const passport: PatientIdField = {
    name: "passport_number",
    label: kind === "TH" ? t("passport") : t("passportOrId"),
    placeholder: "",
    value: values.passport_number ?? "",
    maxLength: 30,
  };
  if (kind === "TH") {
    return [
      { name: "th_national_id", label: t("thaiId"), placeholder: "1-2345-67890-12-3", value: values.th_national_id ?? "", inputMode: "numeric", maxLength: 17 },
      passport,
    ];
  }
  return [passport];
}
